-- Migration: Add missing features to existing schema
-- Run this to update your existing database

-- Check if tables exist before creating
DO $$ 
BEGIN
    -- Ensure all required columns exist in vehicles table
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='vehicles' AND column_name='fuel_tank_capacity') THEN
        ALTER TABLE vehicles ADD COLUMN fuel_tank_capacity INTEGER;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='vehicles' AND column_name='driver_phone') THEN
        ALTER TABLE vehicles ADD COLUMN driver_phone VARCHAR(15);
    END IF;
    
    -- Ensure geofence_events has correct event_type values
    -- Update old 'enter'/'exit' to 'inside'/'outside' if needed
    UPDATE geofence_events SET event_type = 'inside' WHERE event_type = 'enter';
    UPDATE geofence_events SET event_type = 'exit' WHERE event_type = 'outside';
    
END $$;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_vehicles_active ON vehicles(is_active);
CREATE INDEX IF NOT EXISTS idx_geofences_active ON geofences(is_active);
CREATE INDEX IF NOT EXISTS idx_location_speed ON location_data(speed) WHERE speed > 0;

-- Add helpful views

-- View: Current vehicle status with latest location and fuel
CREATE OR REPLACE VIEW vehicle_status_view AS
SELECT 
    v.id,
    v.imei,
    v.vehicle_number,
    v.vehicle_type,
    v.driver_name,
    v.driver_phone,
    v.fuel_tank_capacity,
    v.is_active,
    l.latitude as last_latitude,
    l.longitude as last_longitude,
    l.speed as last_speed,
    l.satellites as last_satellites,
    l.received_at as last_location_time,
    f.fuel_level as current_fuel_level,
    f.voltage as current_voltage,
    f.received_at as last_fuel_time,
    CASE 
        WHEN l.received_at > NOW() - INTERVAL '5 minutes' THEN 'online'
        WHEN l.received_at > NOW() - INTERVAL '1 hour' THEN 'idle'
        ELSE 'offline'
    END as connection_status
FROM vehicles v
LEFT JOIN LATERAL (
    SELECT latitude, longitude, speed, satellites, received_at
    FROM location_data
    WHERE vehicle_id = v.id
    ORDER BY received_at DESC
    LIMIT 1
) l ON true
LEFT JOIN LATERAL (
    SELECT fuel_level, voltage, received_at
    FROM fuel_data
    WHERE vehicle_id = v.id
    ORDER BY received_at DESC
    LIMIT 1
) f ON true;

-- View: Geofence activity summary
CREATE OR REPLACE VIEW geofence_activity_view AS
SELECT 
    g.id as geofence_id,
    g.name as geofence_name,
    g.fence_type,
    g.is_active,
    COUNT(DISTINCT ge.vehicle_id) as unique_vehicles,
    COUNT(*) as total_events,
    COUNT(*) FILTER (WHERE ge.event_type = 'inside') as total_entries,
    COUNT(*) FILTER (WHERE ge.event_type = 'exit') as total_exits,
    MAX(ge.timestamp) as last_event_time
FROM geofences g
LEFT JOIN geofence_events ge ON g.id = ge.geofence_id
GROUP BY g.id, g.name, g.fence_type, g.is_active;

-- Function: Get vehicle statistics for a time period
CREATE OR REPLACE FUNCTION get_vehicle_stats(
    p_vehicle_id INTEGER,
    p_from TIMESTAMPTZ,
    p_to TIMESTAMPTZ
)
RETURNS TABLE (
    total_distance_km NUMERIC,
    avg_speed NUMERIC,
    max_speed INTEGER,
    total_data_points BIGINT,
    fuel_consumed NUMERIC,
    geofence_visits BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(
            SUM(
                ST_Distance(
                    l.location,
                    LAG(l.location) OVER (ORDER BY l.received_at)
                )
            ) / 1000, 0
        )::NUMERIC(10,2) as total_distance_km,
        COALESCE(AVG(l.speed), 0)::NUMERIC(5,2) as avg_speed,
        COALESCE(MAX(l.speed), 0) as max_speed,
        COUNT(l.id) as total_data_points,
        COALESCE(
            (SELECT MAX(fuel_level) - MIN(fuel_level) 
             FROM fuel_data 
             WHERE vehicle_id = p_vehicle_id 
             AND received_at BETWEEN p_from AND p_to), 0
        )::NUMERIC(5,2) as fuel_consumed,
        (SELECT COUNT(*) 
         FROM geofence_events 
         WHERE vehicle_id = p_vehicle_id 
         AND timestamp BETWEEN p_from AND p_to) as geofence_visits
    FROM location_data l
    WHERE l.vehicle_id = p_vehicle_id
    AND l.received_at BETWEEN p_from AND p_to;
END;
$$ LANGUAGE plpgsql;

-- Function: Get vehicles in geofence at specific time
CREATE OR REPLACE FUNCTION get_vehicles_in_geofence(
    p_geofence_id INTEGER,
    p_timestamp TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
    vehicle_id INTEGER,
    vehicle_number VARCHAR,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        v.id,
        v.vehicle_number,
        l.latitude,
        l.longitude
    FROM vehicles v
    JOIN LATERAL (
        SELECT latitude, longitude
        FROM location_data
        WHERE vehicle_id = v.id
        AND received_at <= p_timestamp
        ORDER BY received_at DESC
        LIMIT 1
    ) l ON true
    WHERE check_geofence(l.latitude, l.longitude, p_geofence_id) = true
    AND v.is_active = true;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT SELECT ON vehicle_status_view TO gps_user;
GRANT SELECT ON geofence_activity_view TO gps_user;
GRANT EXECUTE ON FUNCTION get_vehicle_stats TO gps_user;
GRANT EXECUTE ON FUNCTION get_vehicles_in_geofence TO gps_user;

-- Add comments
COMMENT ON VIEW vehicle_status_view IS 'Real-time view of all vehicles with their latest location, fuel, and connection status';
COMMENT ON VIEW geofence_activity_view IS 'Summary of geofence activity including visit counts';
COMMENT ON FUNCTION get_vehicle_stats IS 'Calculate comprehensive statistics for a vehicle over a time period';
COMMENT ON FUNCTION get_vehicles_in_geofence IS 'Find all vehicles currently inside a specific geofence';

-- Success message
DO $$ 
BEGIN
    RAISE NOTICE 'Migration completed successfully!';
END $$;
