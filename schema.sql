-- PostgreSQL + PostGIS + TimescaleDB Schema for GPS Tracker
-- Run this after creating the database and enabling extensions

-- 1. Vehicles table (master data)
CREATE TABLE IF NOT EXISTS vehicles (
    id SERIAL PRIMARY KEY,
    imei VARCHAR(20) UNIQUE NOT NULL,
    vehicle_number VARCHAR(20) UNIQUE NOT NULL,
    vehicle_type VARCHAR(50),
    driver_name VARCHAR(100),
    driver_phone VARCHAR(15),
    fuel_tank_capacity INTEGER, -- Fuel tank capacity in liters
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast IMEI lookup
CREATE INDEX idx_vehicles_imei ON vehicles(imei);
CREATE INDEX idx_vehicles_number ON vehicles(vehicle_number);

-- 2. Location data with PostGIS geometry
CREATE TABLE IF NOT EXISTS location_data (
    id BIGSERIAL,
    vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE CASCADE,
    imei VARCHAR(20) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    location GEOGRAPHY(POINT, 4326),  -- PostGIS geography type
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    speed INTEGER,
    course INTEGER,
    satellites INTEGER,
    raw_hex TEXT,
    received_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id, received_at)
);

-- Convert to TimescaleDB hypertable for time-series optimization
SELECT create_hypertable('location_data', 'received_at', 
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- Indexes for location queries
CREATE INDEX idx_location_vehicle_time ON location_data(vehicle_id, received_at DESC);
CREATE INDEX idx_location_imei_time ON location_data(imei, received_at DESC);
CREATE INDEX idx_location_timestamp ON location_data(timestamp DESC);

-- PostGIS spatial index
CREATE INDEX idx_location_geography ON location_data USING GIST(location);

-- 3. Fuel/Analog data
CREATE TABLE IF NOT EXISTS fuel_data (
    id BIGSERIAL,
    vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE CASCADE,
    imei VARCHAR(20) NOT NULL,
    raw_value INTEGER,
    voltage DOUBLE PRECISION,
    fuel_level NUMERIC(5,2),
    raw_hex TEXT,
    received_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id, received_at)
);

-- Convert to hypertable
SELECT create_hypertable('fuel_data', 'received_at',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- Indexes
CREATE INDEX idx_fuel_vehicle_time ON fuel_data(vehicle_id, received_at DESC);
CREATE INDEX idx_fuel_imei_time ON fuel_data(imei, received_at DESC);

-- 4. Connection logs
CREATE TABLE IF NOT EXISTS connection_logs (
    id BIGSERIAL,
    event_type VARCHAR(20),
    imei VARCHAR(20),
    vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
    serial_number INTEGER,
    message TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id, timestamp)
);

-- Convert to hypertable
SELECT create_hypertable('connection_logs', 'timestamp',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists => TRUE
);

-- Index
CREATE INDEX idx_logs_imei_time ON connection_logs(imei, timestamp DESC);

-- 5. Geofences table
CREATE TABLE IF NOT EXISTS geofences (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    fence_type VARCHAR(20) DEFAULT 'circle', -- circle, polygon
    center_lat DOUBLE PRECISION,
    center_lon DOUBLE PRECISION,
    radius_meters INTEGER, -- for circle type
    geometry GEOGRAPHY(POLYGON, 4326), -- for polygon type
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Spatial index for geofences
CREATE INDEX idx_geofence_geometry ON geofences USING GIST(geometry);

-- 6. Geofence events (when vehicle enters/exits)
CREATE TABLE IF NOT EXISTS geofence_events (
    id BIGSERIAL,
    vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE CASCADE,
    geofence_id INTEGER REFERENCES geofences(id) ON DELETE CASCADE,
    event_type VARCHAR(10), -- 'enter' or 'exit'
    location GEOGRAPHY(POINT, 4326),
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id, timestamp)
);

-- Convert to hypertable
SELECT create_hypertable('geofence_events', 'timestamp',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists => TRUE
);

-- Index
CREATE INDEX idx_geofence_events_vehicle ON geofence_events(vehicle_id, timestamp DESC);

-- 7. Continuous aggregate for hourly statistics
CREATE MATERIALIZED VIEW location_hourly
WITH (timescaledb.continuous) AS
SELECT 
    vehicle_id,
    time_bucket('1 hour', received_at) AS hour,
    COUNT(*) as data_points,
    AVG(speed) as avg_speed,
    MAX(speed) as max_speed,
    MIN(satellites) as min_satellites,
    AVG(satellites) as avg_satellites
FROM location_data
GROUP BY vehicle_id, hour
WITH NO DATA;

-- Refresh policy (auto-update every hour)
SELECT add_continuous_aggregate_policy('location_hourly',
    start_offset => INTERVAL '3 hours',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => TRUE
);

-- 8. Data retention policy (optional - keep data for 1 year)
-- Uncomment if you want automatic data cleanup
-- SELECT add_retention_policy('location_data', INTERVAL '1 year', if_not_exists => TRUE);
-- SELECT add_retention_policy('fuel_data', INTERVAL '1 year', if_not_exists => TRUE);
-- SELECT add_retention_policy('connection_logs', INTERVAL '6 months', if_not_exists => TRUE);

-- 9. Useful functions

-- Function to get latest location for a vehicle
CREATE OR REPLACE FUNCTION get_latest_location(p_vehicle_id INTEGER)
RETURNS TABLE (
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    speed INTEGER,
    timestamp TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT l.latitude, l.longitude, l.speed, l.timestamp
    FROM location_data l
    WHERE l.vehicle_id = p_vehicle_id
    ORDER BY l.received_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function to check if point is in geofence
CREATE OR REPLACE FUNCTION check_geofence(
    p_lat DOUBLE PRECISION,
    p_lon DOUBLE PRECISION,
    p_geofence_id INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
    point_geog GEOGRAPHY;
    fence_geog GEOGRAPHY;
    fence_type VARCHAR(20);
    radius INTEGER;
BEGIN
    -- Create point
    point_geog := ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::GEOGRAPHY;
    
    -- Get geofence details
    SELECT g.fence_type, g.geometry, g.radius_meters
    INTO fence_type, fence_geog, radius
    FROM geofences g
    WHERE g.id = p_geofence_id AND g.is_active = true;
    
    IF fence_type = 'circle' THEN
        -- Check circle geofence
        RETURN ST_DWithin(
            ST_SetSRID(ST_MakePoint(
                (SELECT center_lon FROM geofences WHERE id = p_geofence_id),
                (SELECT center_lat FROM geofences WHERE id = p_geofence_id)
            ), 4326)::GEOGRAPHY,
            point_geog,
            radius
        );
    ELSE
        -- Check polygon geofence
        RETURN ST_Covers(fence_geog, point_geog);
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Sample data insert for testing
-- Register your device
INSERT INTO vehicles (imei, vehicle_number, vehicle_type, fuel_tank_capacity) 
VALUES ('0352672100341866', 'TN 12 BK 6023', 'Truck', 200);

-- Grant permissions to gps_user
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO gps_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO gps_user;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO gps_user;

-- Comments for documentation
COMMENT ON TABLE vehicles IS 'Master vehicle registry with IMEI to vehicle number mapping';
COMMENT ON TABLE location_data IS 'GPS location data - TimescaleDB hypertable optimized for time-series queries';
COMMENT ON TABLE fuel_data IS 'Fuel/analog sensor data - TimescaleDB hypertable';
COMMENT ON TABLE geofences IS 'Geofence definitions with PostGIS geometry support';
COMMENT ON COLUMN location_data.location IS 'PostGIS geography point for spatial queries';
