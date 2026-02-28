# Quick Start Guide

## 🚀 Get Your New Backend Running in 3 Steps

### Step 1: Run Database Migration (1 minute)

```bash
psql -U gps_user -d gps_tracker -f migrations/001_add_missing_features.sql
```

This adds:
- Missing database columns
- Helpful views and functions
- Performance indexes

### Step 2: Switch to New Server (30 seconds)

**Option A: Rename files**
```bash
mv server.js server_old.js
mv server_new.js server.js
```

**Option B: Update package.json**
Change `"main": "server.js"` to `"main": "server_new.js"`

### Step 3: Start Server (10 seconds)

```bash
npm start
```

Or with PM2:
```bash
npm run restart
```

## ✅ Verify Installation

Run the test script:
```bash
node test_api.js
```

You should see:
```
🧪 Testing GPS Tracker API...

1️⃣  Testing Health Check...
✅ Health: { status: 'ok', ... }

2️⃣  Testing Get Vehicles...
✅ Found X vehicles

...

✨ All tests completed!
```

## 🎯 Quick API Examples

### Get All Vehicles
```bash
curl http://localhost:3000/api/vehicles
```

### Get Live Locations
```bash
curl http://localhost:3000/api/locations/live
```

### Create a Geofence
```bash
curl -X POST http://localhost:3000/api/geofences \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Warehouse",
    "fence_type": "circle",
    "center_lat": 13.0827,
    "center_lon": 80.2707,
    "radius_meters": 500
  }'
```

### Get Dashboard Analytics
```bash
curl http://localhost:3000/api/analytics/dashboard
```

### Update Vehicle Details
```bash
curl -X PUT http://localhost:3000/api/vehicles/1 \
  -H "Content-Type: application/json" \
  -d '{
    "vehicle_number": "TN 12 BK 6023",
    "driver_name": "John Doe",
    "fuel_tank_capacity": 200
  }'
```

### Get Geofence Statistics
```bash
curl "http://localhost:3000/api/geofences/1/stats?from=2026-02-28T00:00:00Z&to=2026-02-28T23:59:59Z"
```

## 📚 Full Documentation

- **API Reference:** See `API_DOCUMENTATION.md`
- **Setup Guide:** See `BACKEND_SETUP.md`
- **Changes:** See `CHANGES_SUMMARY.md`

## 🆘 Troubleshooting

### Server won't start
```bash
# Check if routes folder exists
ls routes/

# Should show:
# analytics.js  fuel.js  geofences.js  locations.js  vehicles.js
```

### Database errors
```bash
# Re-run migration
psql -U gps_user -d gps_tracker -f migrations/001_add_missing_features.sql
```

### Port already in use
```bash
# Check what's using port 3000
netstat -ano | findstr :3000

# Stop old server
npm run stop
```

## 🎉 You're Ready!

Your backend now has:
- ✅ Modular route structure
- ✅ Vehicle management with IMEI updates
- ✅ Live tracking (location + fuel)
- ✅ Geofence creation (circle + polygon)
- ✅ Entry/exit tracking with timestamps
- ✅ Comprehensive analytics
- ✅ WebSocket real-time updates

Build your frontend and start tracking! 🚛📍
