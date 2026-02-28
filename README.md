# GPS Tracker with Live Dashboard

Real-time GPS tracking system with PostgreSQL + PostGIS + TimescaleDB backend and WebSocket-powered live dashboard.

## Features

- ✅ Real-time location tracking via WebSocket
- ✅ PostgreSQL + PostGIS for spatial queries
- ✅ TimescaleDB for time-series optimization
- ✅ IMEI to vehicle number mapping
- ✅ Live dashboard with interactive map
- ✅ Geofencing with alerts
- ✅ Fuel/analog sensor data
- ✅ Vehicle route history
- ✅ Connection logging

## Architecture

```
GPS Trackers (TCP:5050) → Node.js Server → PostgreSQL + PostGIS + TimescaleDB
                              ↓
                         In-Memory Cache
                              ↓
                         WebSocket (Port 3000)
                              ↓
                         Live Dashboard (Browser)
```

## Quick Start

### 1. Install PostgreSQL + Extensions

Follow `POSTGRES_SETUP.md` for detailed instructions.

```bash
# Quick install on Ubuntu 24.04
sudo apt update
sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh
sudo apt install -y postgresql-16 postgresql-16-postgis-3 timescaledb-2-postgresql-16
sudo timescaledb-tune --quiet --yes
sudo systemctl restart postgresql
```

### 2. Setup Database

```bash
# Create database and user
sudo -u postgres psql
```

```sql
CREATE DATABASE gps_tracker;
CREATE USER gps_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE gps_tracker TO gps_user;
\c gps_tracker
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS timescaledb;
GRANT ALL ON SCHEMA public TO gps_user;
\q
```

```bash
# Run schema
psql -U gps_user -d gps_tracker -f schema.sql
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Configure Environment

```bash
cp .env.example .env
nano .env
```

Update with your database password:
```env
DB_PASSWORD=your_actual_password
```

### 5. Register Vehicles

```bash
psql -U gps_user -d gps_tracker
```

```sql
INSERT INTO vehicles (imei, vehicle_number, vehicle_type, driver_name) 
VALUES ('035267210034186', 'TN 12 BK 6023', 'Truck', 'Driver Name');
```

### 6. Start Server

```bash
# Development
npm start

# Production with PM2
npm run prod
```

### 7. Open Dashboard

Open browser: `http://your-server-ip:3000`

## API Endpoints

- `GET /api/vehicles` - List all vehicles
- `GET /api/locations/live` - Get live locations (cached)
- `GET /api/vehicles/:id/history` - Get vehicle route history
- `GET /api/geofences` - List geofences
- `GET /api/health` - Server health check

## WebSocket Events

### Server → Client

```javascript
// Initial data on connection
{
  type: 'initial_data',
  data: {
    locations: [...],
    vehicleStatus: [...]
  }
}

// Real-time location update
{
  type: 'location_update',
  data: {
    vehicleId: 1,
    vehicleNumber: 'TN 12 BK 6023',
    latitude: 11.0168,
    longitude: 76.9558,
    speed: 45,
    course: 180,
    satellites: 8,
    timestamp: '2024-02-28T10:30:00Z'
  }
}

// Fuel update
{
  type: 'fuel_update',
  data: {
    vehicleId: 1,
    voltage: 12.5,
    fuelLevel: 75.5
  }
}

// Geofence alert
{
  type: 'geofence_alert',
  data: {
    vehicleId: 1,
    geofenceName: 'Warehouse Zone',
    eventType: 'inside'
  }
}
```

### Client → Server

```javascript
// Ping (keep-alive)
{ type: 'ping' }
```

## Geofencing

### Create Circular Geofence

```sql
INSERT INTO geofences (name, fence_type, center_lat, center_lon, radius_meters)
VALUES ('Warehouse', 'circle', 11.0168, 76.9558, 5000);
```

### Create Polygon Geofence

```sql
INSERT INTO geofences (name, fence_type, geometry)
VALUES (
  'City Center',
  'polygon',
  ST_GeogFromText('POLYGON((76.95 11.01, 76.96 11.01, 76.96 11.02, 76.95 11.02, 76.95 11.01))')
);
```

## Useful Queries

### Latest position for all vehicles

```sql
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

### Vehicle route for today

```sql
SELECT latitude, longitude, speed, timestamp
FROM location_data
WHERE vehicle_id = 1
  AND DATE(received_at) = CURRENT_DATE
ORDER BY received_at;
```

### Hourly statistics

```sql
SELECT * FROM location_hourly
WHERE vehicle_id = 1
ORDER BY hour DESC
LIMIT 24;
```

## Ports

- `5050` - GPS tracker TCP server
- `3000` - HTTP API + WebSocket server

## Files

- `combined_server.js` - Main server (GPS + API + WebSocket)
- `schema.sql` - Database schema
- `public/index.html` - Dashboard UI
- `public/app.js` - Dashboard JavaScript
- `.env` - Configuration

## Monitoring

```bash
# View logs
tail -f server.log

# PM2 logs
pm2 logs gps-tracker

# Database stats
psql -U gps_user -d gps_tracker -c "SELECT COUNT(*) FROM location_data;"
```

## Troubleshooting

### WebSocket not connecting

Check firewall:
```bash
sudo ufw allow 3000/tcp
sudo ufw allow 5050/tcp
```

### No vehicles showing

1. Check if GPS devices are connected
2. Verify IMEI is registered in `vehicles` table
3. Check server logs: `tail -f server.log`

### Database connection failed

```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Test connection
psql -U gps_user -d gps_tracker -h localhost
```

## License

ISC
