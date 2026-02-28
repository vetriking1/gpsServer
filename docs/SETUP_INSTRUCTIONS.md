# Setup Instructions - PostgreSQL GPS Tracker

## 1. Install Dependencies

```bash
npm install
```

## 2. Create .env File

```bash
cp .env.example .env
nano .env
```

Update with your PostgreSQL password:
```
DB_PASSWORD=your_actual_password
```

## 3. Run Database Schema

```bash
# Connect to PostgreSQL and run schema
psql -U gps_user -d gps_tracker -f schema.sql
```

Or use npm script:
```bash
npm run setup-db
```

## 4. Register Your Vehicles

Connect to database:
```bash
psql -U gps_user -d gps_tracker
```

Insert vehicle data:
```sql
INSERT INTO vehicles (imei, vehicle_number, vehicle_type, driver_name, driver_phone) 
VALUES 
('035267210034186', 'TN 12 BK 6023', 'Truck', 'Driver Name', '9876543210'),
('imei_number_2', 'TN 12 BK 6024', 'Van', 'Driver Name 2', '9876543211');

-- View registered vehicles
SELECT * FROM vehicles;
```

## 5. Start the Server

Development:
```bash
node server_postgres.js
```

Production with PM2:
```bash
pm2 start server_postgres.js --name gps-tracker
pm2 save
pm2 startup
```

## 6. Test Connection

From another terminal:
```bash
node test_server.js
```

## 7. Monitor Logs

```bash
# Real-time logs
tail -f server.log

# PM2 logs
pm2 logs gps-tracker
```

## 8. Verify Data

```bash
psql -U gps_user -d gps_tracker
```

```sql
-- Check latest locations
SELECT 
    v.vehicle_number,
    l.latitude,
    l.longitude,
    l.speed,
    l.timestamp,
    l.received_at
FROM location_data l
JOIN vehicles v ON l.vehicle_id = v.id
ORDER BY l.received_at DESC
LIMIT 10;

-- Check fuel data
SELECT 
    v.vehicle_number,
    f.voltage,
    f.fuel_level,
    f.received_at
FROM fuel_data f
JOIN vehicles v ON f.vehicle_id = v.id
ORDER BY f.received_at DESC
LIMIT 10;

-- Check connection logs
SELECT 
    v.vehicle_number,
    c.event_type,
    c.message,
    c.timestamp
FROM connection_logs c
LEFT JOIN vehicles v ON c.vehicle_id = v.id
ORDER BY c.timestamp DESC
LIMIT 20;

-- Get latest position for each vehicle
SELECT DISTINCT ON (v.id)
    v.vehicle_number,
    l.latitude,
    l.longitude,
    l.speed,
    l.timestamp
FROM vehicles v
LEFT JOIN location_data l ON v.id = l.vehicle_id
ORDER BY v.id, l.received_at DESC;
```

## 9. Create Sample Geofence

```sql
-- Circular geofence (5km radius around a point)
INSERT INTO geofences (name, description, fence_type, center_lat, center_lon, radius_meters)
VALUES ('Warehouse Zone', 'Main warehouse area', 'circle', 11.0168, 76.9558, 5000);

-- Polygon geofence (define area with coordinates)
INSERT INTO geofences (name, description, fence_type, geometry)
VALUES (
    'City Center',
    'Downtown delivery zone',
    'polygon',
    ST_GeogFromText('POLYGON((76.95 11.01, 76.96 11.01, 76.96 11.02, 76.95 11.02, 76.95 11.01))')
);
```

## 10. Useful Queries

```sql
-- Vehicle route for today
SELECT 
    latitude,
    longitude,
    speed,
    timestamp
FROM location_data
WHERE vehicle_id = 1
  AND DATE(received_at) = CURRENT_DATE
ORDER BY received_at;

-- Hourly statistics
SELECT * FROM location_hourly
WHERE vehicle_id = 1
ORDER BY hour DESC
LIMIT 24;

-- Geofence events
SELECT 
    v.vehicle_number,
    g.name as geofence_name,
    ge.event_type,
    ge.timestamp
FROM geofence_events ge
JOIN vehicles v ON ge.vehicle_id = v.id
JOIN geofences g ON ge.geofence_id = g.id
ORDER BY ge.timestamp DESC;
```

## Troubleshooting

### Connection refused
```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Check if port is listening
sudo netstat -tlnp | grep 5432
```

### Permission denied
```bash
# Grant permissions again
psql -U postgres -d gps_tracker -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO gps_user;"
psql -U postgres -d gps_tracker -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO gps_user;"
```

### IMEI not extracting
- Check your device's login packet format
- Verify IMEI bytes position in the packet
- Update `extractIMEI()` function if needed
