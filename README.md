# GPS Tracker Backend - Complete Solution

A production-ready GPS tracking backend with PostgreSQL + PostGIS + TimescaleDB, supporting real-time vehicle tracking, fuel monitoring, and geofencing.

## 🚀 Quick Start

```bash
# 1. Run database migration
psql -U gps_user -d gps_tracker -f migrations/001_add_missing_features.sql

# 2. Switch to new server
mv server.js server_old.js && mv server_new.js server.js

# 3. Start server
npm start

# 4. Test
node test_api.js
```

## ✨ Features

### Core Functionality
- ✅ Real-time GPS tracking (GT06/RV08 protocol)
- ✅ Live fuel monitoring
- ✅ Vehicle management (CRUD operations)
- ✅ Auto-registration of new devices
- ✅ Geofence creation (circle & polygon)
- ✅ Entry/exit tracking with timestamps
- ✅ Comprehensive analytics
- ✅ WebSocket real-time updates

### API Endpoints (30+)
- **Vehicles:** CRUD, IMEI updates, status
- **Locations:** Live tracking, history, routes, time-based queries
- **Fuel:** Live levels, history, consumption analysis
- **Geofences:** Create, manage, events, statistics
- **Analytics:** Dashboard, distance, speed violations, hourly stats

## 📁 Project Structure

```
├── server_new.js                    # Main server (use this)
├── server.js                        # Old server (backup)
├── routes/
│   ├── vehicles.js                  # Vehicle management
│   ├── locations.js                 # Location tracking
│   ├── fuel.js                      # Fuel monitoring
│   ├── geofences.js                 # Geofence management
│   └── analytics.js                 # Analytics & reporting
├── migrations/
│   └── 001_add_missing_features.sql # Database migration
├── API_DOCUMENTATION.md             # Complete API reference
├── BACKEND_SETUP.md                 # Detailed setup guide
├── QUICK_START.md                   # Quick start guide
├── REQUIREMENTS_CHECKLIST.md        # Requirements verification
├── CHANGES_SUMMARY.md               # What changed
├── ARCHITECTURE.md                  # System architecture
└── test_api.js                      # API test script
```

## 🎯 Requirements Met

| # | Requirement | Status | Endpoint |
|---|-------------|--------|----------|
| 1 | Locations at time + fuel | ✅ | `/api/locations/at-time` |
| 2 | Live tracking | ✅ | `/api/locations/live`, WebSocket |
| 3 | Update vehicle/IMEI | ✅ | `PUT /api/vehicles/:id` |
| 4 | Create geofences | ✅ | `POST /api/geofences` |
| 5 | Entry/exit tracking | ✅ | `/api/geofences/:id/events` |
| 6 | Vehicle count | ✅ | `/api/analytics/dashboard` |
| 7 | Analytics | ✅ | `/api/analytics/*` |

## 📖 Documentation

### Quick References
- **[QUICK_START.md](QUICK_START.md)** - Get running in 3 steps
- **[API_DOCUMENTATION.md](API_DOCUMENTATION.md)** - Complete API reference
- **[REQUIREMENTS_CHECKLIST.md](REQUIREMENTS_CHECKLIST.md)** - Verify all features

### Detailed Guides
- **[BACKEND_SETUP.md](BACKEND_SETUP.md)** - Installation & configuration
- **[CHANGES_SUMMARY.md](CHANGES_SUMMARY.md)** - What's new
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - System design & architecture

## 🔧 API Examples

### Get All Vehicles
```bash
curl http://localhost:3000/api/vehicles
```

### Get Live Locations
```bash
curl http://localhost:3000/api/locations/live
```

### Create Circle Geofence
```bash
curl -X POST http://localhost:3000/api/geofences \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Warehouse A",
    "fence_type": "circle",
    "center_lat": 13.0827,
    "center_lon": 80.2707,
    "radius_meters": 500
  }'
```

### Get Geofence Statistics
```bash
curl "http://localhost:3000/api/geofences/1/stats?from=2026-02-28T00:00:00Z&to=2026-02-28T23:59:59Z"
```

### Update Vehicle
```bash
curl -X PUT http://localhost:3000/api/vehicles/1 \
  -H "Content-Type: application/json" \
  -d '{
    "vehicle_number": "TN 12 BK 6023",
    "driver_name": "John Doe",
    "fuel_tank_capacity": 200
  }'
```

## 🌐 WebSocket API

Connect to `ws://localhost:3000` for real-time updates:

```javascript
const ws = new WebSocket('ws://localhost:3000');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  switch(data.type) {
    case 'location_update':
      console.log('Vehicle moved:', data.data);
      break;
    case 'fuel_update':
      console.log('Fuel changed:', data.data);
      break;
    case 'geofence_alert':
      console.log('Geofence event:', data.data);
      break;
  }
};
```

## 🗄️ Database

### Schema
- **vehicles** - Vehicle registry with IMEI mapping
- **location_data** - GPS coordinates (TimescaleDB hypertable)
- **fuel_data** - Fuel levels (TimescaleDB hypertable)
- **geofences** - Geofence definitions (PostGIS geometry)
- **geofence_events** - Entry/exit events (TimescaleDB hypertable)
- **connection_logs** - Device connection history

### Views
- **vehicle_status_view** - Real-time vehicle status
- **geofence_activity_view** - Geofence activity summary
- **location_hourly** - Hourly statistics (continuous aggregate)

### Functions
- **check_geofence()** - Check if point is in geofence
- **get_vehicle_stats()** - Calculate vehicle statistics
- **get_vehicles_in_geofence()** - Find vehicles in geofence

## 🧪 Testing

Run the automated test suite:
```bash
node test_api.js
```

Expected output:
```
🧪 Testing GPS Tracker API...

1️⃣  Testing Health Check...
✅ Health: { status: 'ok', ... }

2️⃣  Testing Get Vehicles...
✅ Found X vehicles

...

✨ All tests completed!
```

## 🔒 Security

### Current
- CORS enabled
- SQL injection prevention (parameterized queries)
- Environment variables for secrets
- Input validation

### Recommended
- Add JWT authentication
- Implement rate limiting
- Enable HTTPS/TLS
- Add API key management
- Set up request logging

## 📊 Performance

### Optimizations
- In-memory caching for live data
- Database connection pooling (max 20)
- TimescaleDB hypertables for time-series data
- PostGIS spatial indexes
- Continuous aggregates for pre-computed stats

### Scalability
- Horizontal scaling ready (stateless API)
- PostgreSQL replication support
- WebSocket clustering possible
- Redis caching can be added

## 🚀 Deployment

### Production Checklist
```bash
# Set environment
export NODE_ENV=production

# Start with PM2
npm run prod

# Check status
npm run status

# View logs
npm run logs
```

### Environment Variables
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

## 🆘 Troubleshooting

### Server won't start
```bash
# Check routes folder exists
ls routes/

# Should show: analytics.js fuel.js geofences.js locations.js vehicles.js
```

### Database errors
```bash
# Re-run migration
psql -U gps_user -d gps_tracker -f migrations/001_add_missing_features.sql
```

### Port already in use
```bash
# Stop old server
npm run stop

# Or kill process on port 3000
netstat -ano | findstr :3000
```

## 📈 Monitoring

### Recommended Tools
- **PM2** - Process management
- **pgAdmin** - Database monitoring
- **Grafana** - Metrics visualization
- **Sentry** - Error tracking

### Key Metrics
- API response times
- Database query performance
- WebSocket connections
- GPS device connections
- Memory/CPU usage

## 🎨 Frontend Integration

The backend is ready for frontend integration. Build your UI with:

### Map Display
- Use `/api/locations/live` for current positions
- Connect WebSocket for real-time updates
- Display routes with `/api/locations/route/:id`

### Geofence Management
- Draw geofences on map
- POST to `/api/geofences` to create
- Show alerts from WebSocket `geofence_alert` events

### Analytics Dashboard
- Use `/api/analytics/dashboard` for overview
- Display charts with `/api/analytics/hourly/:id`
- Show violations with `/api/analytics/speed-violations`

## 🤝 Contributing

### Code Structure
- Each route file handles one domain
- Use async/await for database queries
- Add error handling in try/catch blocks
- Log important events

### Adding New Endpoints
1. Create route in appropriate file
2. Add to API_DOCUMENTATION.md
3. Add test in test_api.js
4. Update REQUIREMENTS_CHECKLIST.md

## 📝 License

ISC

## 👥 Support

For issues or questions:
1. Check documentation files
2. Run `node test_api.js` to verify setup
3. Check `server.log` for errors
4. Review database logs

## 🎉 What's Next?

1. ✅ Backend complete
2. 🎨 Build frontend UI
3. 🔒 Add authentication
4. 📱 Create mobile app
5. 🚀 Deploy to production

---

**Built with:** Node.js, Express, PostgreSQL, PostGIS, TimescaleDB, WebSocket

**Protocol Support:** GT06, RV08 GPS trackers

**Ready for production!** 🚀
