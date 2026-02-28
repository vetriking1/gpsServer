# GPS Tracker Backend Setup Guide

## New Backend Structure

The backend has been reorganized with separate route files for better maintainability:

```
├── server_new.js           # Main server file (updated)
├── routes/
│   ├── vehicles.js         # Vehicle management routes
│   ├── locations.js        # Location tracking routes
│   ├── fuel.js            # Fuel monitoring routes
│   ├── geofences.js       # Geofence management routes
│   └── analytics.js       # Analytics and reporting routes
├── migrations/
│   └── 001_add_missing_features.sql  # Database migration
└── API_DOCUMENTATION.md   # Complete API reference
```

## Features Implemented

### 1. Vehicle Management (`/api/vehicles`)
- ✅ Get all vehicles with last known location
- ✅ Get vehicle by ID
- ✅ Update vehicle details (number plate, driver, type)
- ✅ Update IMEI for vehicle (auto-registration on new IMEI)
- ✅ Delete vehicle
- ✅ Shows fuel tank capacity

### 2. Live Tracking (`/api/locations`)
- ✅ Live location tracking (WebSocket + REST)
- ✅ Get locations at specific time with fuel data
- ✅ Vehicle location history
- ✅ Route visualization between timestamps

### 3. Fuel Monitoring (`/api/fuel`)
- ✅ Live fuel levels for all vehicles
- ✅ Fuel history for specific vehicle
- ✅ Fuel consumption analysis

### 4. Geofence Management (`/api/geofences`)
- ✅ Create circle geofences (center + radius)
- ✅ Create polygon geofences (custom shapes)
- ✅ List all geofences
- ✅ Update geofence (name, description, active status)
- ✅ Delete geofence
- ✅ Get geofence entry/exit events with timestamps
- ✅ Get statistics (how many times vehicles entered/exited)

### 5. Analytics (`/api/analytics`)
- ✅ Dashboard overview (total vehicles, active count, etc.)
- ✅ Vehicle activity summary
- ✅ Distance traveled calculation
- ✅ Hourly statistics (using TimescaleDB)
- ✅ Geofence summary analytics
- ✅ Speed violation detection

## Installation Steps

### 1. Run Database Migration

First, apply the migration to add missing features:

```bash
psql -U gps_user -d gps_tracker -f migrations/001_add_missing_features.sql
```

This will:
- Add missing columns to existing tables
- Create helpful views (vehicle_status_view, geofence_activity_view)
- Add utility functions for statistics
- Create indexes for better performance

### 2. Backup Current Server

```bash
# Your current server.js is already backed up as server_sqlite_backup.js
# Let's backup the current PostgreSQL version too
cp server.js server_old.js
```

### 3. Replace Server File

```bash
# Replace the old server with the new one
cp server_new.js server.js
```

Or manually rename:
- `server.js` → `server_old.js`
- `server_new.js` → `server.js`

### 4. Install Dependencies (if needed)

All required dependencies are already in your package.json:
```bash
npm install
```

### 5. Start the Server

```bash
npm start
```

Or with PM2:
```bash
npm run prod
```

## Testing the API

### 1. Health Check
```bash
curl http://localhost:3000/api/health
```

### 2. Get All Vehicles
```bash
curl http://localhost:3000/api/vehicles
```

### 3. Get Live Locations
```bash
curl http://localhost:3000/api/locations/live
```

### 4. Create a Circle Geofence
```bash
curl -X POST http://localhost:3000/api/geofences \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Warehouse A",
    "description": "Main warehouse",
    "fence_type": "circle",
    "center_lat": 13.0827,
    "center_lon": 80.2707,
    "radius_meters": 500
  }'
```

### 5. Create a Polygon Geofence
```bash
curl -X POST http://localhost:3000/api/geofences \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Delivery Zone",
    "description": "Downtown area",
    "fence_type": "polygon",
    "polygon_coords": [
      [80.2707, 13.0827],
      [80.2800, 13.0827],
      [80.2800, 13.0900],
      [80.2707, 13.0900]
    ]
  }'
```

### 6. Update Vehicle Details
```bash
curl -X PUT http://localhost:3000/api/vehicles/1 \
  -H "Content-Type: application/json" \
  -d '{
    "vehicle_number": "TN 12 BK 6023",
    "driver_name": "John Doe",
    "driver_phone": "9876543210",
    "fuel_tank_capacity": 200
  }'
```

### 7. Get Geofence Statistics
```bash
curl "http://localhost:3000/api/geofences/1/stats?from=2026-02-28T00:00:00Z&to=2026-02-28T23:59:59Z"
```

### 8. Get Analytics Dashboard
```bash
curl http://localhost:3000/api/analytics/dashboard
```

## WebSocket Testing

Use the existing `test_websocket.js` or connect from browser:

```javascript
const ws = new WebSocket('ws://localhost:3000');

ws.onopen = () => {
  console.log('Connected');
  ws.send(JSON.stringify({ type: 'ping' }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received:', data);
};
```

## API Endpoints Summary

| Category | Method | Endpoint | Description |
|----------|--------|----------|-------------|
| **Vehicles** | GET | `/api/vehicles` | Get all vehicles |
| | GET | `/api/vehicles/:id` | Get vehicle by ID |
| | PUT | `/api/vehicles/:id` | Update vehicle details |
| | PUT | `/api/vehicles/:id/imei` | Update IMEI |
| | DELETE | `/api/vehicles/:id` | Delete vehicle |
| **Locations** | GET | `/api/locations/live` | Live locations |
| | GET | `/api/locations/at-time` | Locations at specific time |
| | GET | `/api/locations/history/:id` | Location history |
| | GET | `/api/locations/route/:id` | Route between times |
| **Fuel** | GET | `/api/fuel/live` | Live fuel levels |
| | GET | `/api/fuel/history/:id` | Fuel history |
| | GET | `/api/fuel/consumption/:id` | Fuel consumption |
| **Geofences** | GET | `/api/geofences` | List geofences |
| | GET | `/api/geofences/:id` | Get geofence |
| | POST | `/api/geofences` | Create geofence |
| | PUT | `/api/geofences/:id` | Update geofence |
| | DELETE | `/api/geofences/:id` | Delete geofence |
| | GET | `/api/geofences/:id/events` | Geofence events |
| | GET | `/api/geofences/:id/stats` | Geofence statistics |
| **Analytics** | GET | `/api/analytics/dashboard` | Dashboard overview |
| | GET | `/api/analytics/vehicle-activity` | Vehicle activity |
| | GET | `/api/analytics/distance/:id` | Distance traveled |
| | GET | `/api/analytics/hourly/:id` | Hourly statistics |
| | GET | `/api/analytics/geofence-summary` | Geofence summary |
| | GET | `/api/analytics/speed-violations` | Speed violations |

## Environment Variables

Make sure your `.env` file has:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=gps_tracker
DB_USER=gps_user
DB_PASSWORD=your_password

GPS_SERVER_PORT=5050
GPS_SERVER_HOST=0.0.0.0
API_PORT=3000

LOG_FILE=server.log
```

## Troubleshooting

### Routes not found (404)
- Make sure the `routes/` folder exists
- Check that all route files are created
- Verify `require()` paths in server.js

### Database errors
- Run the migration script first
- Check PostgreSQL connection
- Verify PostGIS and TimescaleDB extensions are enabled

### WebSocket not connecting
- Check if port 3000 is available
- Verify firewall settings
- Test with the provided test_websocket.js

## Next Steps

1. ✅ Database migration completed
2. ✅ All routes implemented
3. 📝 Test each endpoint
4. 🎨 Build frontend to consume these APIs
5. 🔒 Add authentication/authorization
6. 📊 Add more analytics features

## Complete API Documentation

See [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) for detailed API reference with request/response examples.
