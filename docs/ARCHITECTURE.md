# System Architecture

## Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         GPS TRACKER SYSTEM                       │
└─────────────────────────────────────────────────────────────────┘

┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│  GPS Device  │────────▶│  TCP Server  │────────▶│  PostgreSQL  │
│  (GT06/RV08) │  5050   │   (Node.js)  │         │  + PostGIS   │
└──────────────┘         └──────────────┘         │  + TimescaleDB│
                                │                  └──────────────┘
                                │                         ▲
                                ▼                         │
                         ┌──────────────┐                │
                         │   Express    │                │
                         │  API Server  │────────────────┘
                         │   (Port 3000)│
                         └──────────────┘
                                │
                    ┌───────────┼───────────┐
                    ▼           ▼           ▼
              ┌─────────┐ ┌─────────┐ ┌─────────┐
              │   REST  │ │WebSocket│ │ Static  │
              │   API   │ │  Server │ │  Files  │
              └─────────┘ └─────────┘ └─────────┘
                    │           │           │
                    └───────────┴───────────┘
                                │
                                ▼
                         ┌──────────────┐
                         │   Frontend   │
                         │  (Browser)   │
                         └──────────────┘
```

## Component Details

### 1. GPS Device Layer
```
┌─────────────────────────────────────┐
│         GPS Device (GT06/RV08)      │
├─────────────────────────────────────┤
│ • Sends location data (0x12)        │
│ • Sends fuel data (0x94)            │
│ • Sends heartbeat (0x13)            │
│ • Login with IMEI (0x01)            │
└─────────────────────────────────────┘
         │
         │ TCP Connection (Port 5050)
         ▼
```

### 2. TCP Server Layer
```
┌─────────────────────────────────────┐
│         GPS TCP Server              │
├─────────────────────────────────────┤
│ • Accepts device connections        │
│ • Parses binary protocol            │
│ • Validates CRC checksums           │
│ • Extracts IMEI from login          │
│ • Auto-registers new devices        │
│ • Processes location packets        │
│ • Processes fuel packets            │
│ • Sends acknowledgments             │
└─────────────────────────────────────┘
         │
         │ Async Processing
         ▼
```

### 3. Database Layer
```
┌─────────────────────────────────────┐
│    PostgreSQL + PostGIS + TimescaleDB│
├─────────────────────────────────────┤
│ Tables:                             │
│ • vehicles                          │
│ • location_data (hypertable)        │
│ • fuel_data (hypertable)            │
│ • geofences                         │
│ • geofence_events (hypertable)      │
│ • connection_logs (hypertable)      │
│                                     │
│ Views:                              │
│ • vehicle_status_view               │
│ • geofence_activity_view            │
│ • location_hourly (continuous agg)  │
│                                     │
│ Functions:                          │
│ • check_geofence()                  │
│ • get_vehicle_stats()               │
│ • get_vehicles_in_geofence()        │
└─────────────────────────────────────┘
         │
         │ SQL Queries
         ▼
```

### 4. API Server Layer
```
┌─────────────────────────────────────────────────────────┐
│                    Express API Server                    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   Vehicles   │  │  Locations   │  │     Fuel     │ │
│  │   Routes     │  │   Routes     │  │   Routes     │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐                    │
│  │  Geofences   │  │  Analytics   │                    │
│  │   Routes     │  │   Routes     │                    │
│  └──────────────┘  └──────────────┘                    │
│                                                          │
│  Middleware:                                            │
│  • CORS                                                 │
│  • JSON Parser                                          │
│  • Static Files                                         │
└─────────────────────────────────────────────────────────┘
         │
         │ HTTP/WebSocket
         ▼
```

## Data Flow

### Location Update Flow
```
GPS Device
    │
    │ 1. Send location packet (0x12)
    ▼
TCP Server
    │
    │ 2. Parse packet
    │ 3. Extract coordinates, speed, etc.
    ▼
Database
    │
    │ 4. INSERT INTO location_data
    │ 5. Check geofences
    ▼
In-Memory Cache
    │
    │ 6. Update liveLocations Map
    ▼
WebSocket
    │
    │ 7. Broadcast to all clients
    ▼
Frontend
    │
    │ 8. Update map marker
    └─▶ Display updated position
```

### Geofence Check Flow
```
New Location Received
    │
    ▼
Check Active Geofences
    │
    ├─▶ Circle Geofence
    │   └─▶ ST_DWithin(point, center, radius)
    │
    └─▶ Polygon Geofence
        └─▶ ST_Covers(polygon, point)
    │
    ▼
Is Inside?
    │
    ├─▶ YES: INSERT geofence_event
    │         Broadcast alert via WebSocket
    │
    └─▶ NO: Continue
```

### API Request Flow
```
Frontend
    │
    │ HTTP GET /api/vehicles
    ▼
Express Router
    │
    │ Route to vehicles.js
    ▼
Route Handler
    │
    │ Execute SQL query
    ▼
PostgreSQL
    │
    │ Return results
    ▼
Route Handler
    │
    │ Format JSON response
    ▼
Frontend
    │
    └─▶ Display data
```

## Route Structure

```
server.js (Main)
│
├─▶ routes/vehicles.js
│   ├─ GET    /api/vehicles
│   ├─ GET    /api/vehicles/:id
│   ├─ PUT    /api/vehicles/:id
│   ├─ PUT    /api/vehicles/:id/imei
│   └─ DELETE /api/vehicles/:id
│
├─▶ routes/locations.js
│   ├─ GET /api/locations/live
│   ├─ GET /api/locations/at-time
│   ├─ GET /api/locations/history/:id
│   └─ GET /api/locations/route/:id
│
├─▶ routes/fuel.js
│   ├─ GET /api/fuel/live
│   ├─ GET /api/fuel/history/:id
│   └─ GET /api/fuel/consumption/:id
│
├─▶ routes/geofences.js
│   ├─ GET    /api/geofences
│   ├─ GET    /api/geofences/:id
│   ├─ POST   /api/geofences
│   ├─ PUT    /api/geofences/:id
│   ├─ DELETE /api/geofences/:id
│   ├─ GET    /api/geofences/:id/events
│   └─ GET    /api/geofences/:id/stats
│
└─▶ routes/analytics.js
    ├─ GET /api/analytics/dashboard
    ├─ GET /api/analytics/vehicle-activity
    ├─ GET /api/analytics/distance/:id
    ├─ GET /api/analytics/hourly/:id
    ├─ GET /api/analytics/geofence-summary
    └─ GET /api/analytics/speed-violations
```

## Real-time Communication

### WebSocket Events

**Server → Client:**
```javascript
// Initial connection
{
  type: 'initial_data',
  data: {
    locations: [...],
    vehicleStatus: [...]
  }
}

// Location update
{
  type: 'location_update',
  data: {
    vehicleId: 1,
    latitude: 13.0827,
    longitude: 80.2707,
    speed: 45
  }
}

// Fuel update
{
  type: 'fuel_update',
  data: {
    vehicleId: 1,
    fuelLevel: 75.5
  }
}

// Geofence alert
{
  type: 'geofence_alert',
  data: {
    vehicleId: 1,
    geofenceName: 'Warehouse A',
    eventType: 'inside'
  }
}

// Vehicle status
{
  type: 'vehicle_status',
  data: {
    vehicleId: 1,
    status: 'online'
  }
}
```

**Client → Server:**
```javascript
// Ping
{
  type: 'ping'
}

// Response: pong
{
  type: 'pong',
  timestamp: '2026-02-28T10:30:00Z'
}
```

## Performance Optimizations

### 1. In-Memory Caching
```javascript
// Live data cached in memory
liveLocations = Map<vehicleId, locationData>
liveVehicleStatus = Map<vehicleId, statusData>

// Reduces database queries for live data
// WebSocket broadcasts use cached data
```

### 2. Database Indexes
```sql
-- Fast IMEI lookups
CREATE INDEX idx_vehicles_imei ON vehicles(imei);

-- Fast time-series queries
CREATE INDEX idx_location_vehicle_time 
  ON location_data(vehicle_id, received_at DESC);

-- Spatial queries
CREATE INDEX idx_location_geography 
  ON location_data USING GIST(location);
```

### 3. TimescaleDB Hypertables
```sql
-- Automatic partitioning by time
SELECT create_hypertable('location_data', 'received_at');

-- Continuous aggregates for pre-computed stats
CREATE MATERIALIZED VIEW location_hourly ...
```

### 4. Connection Pooling
```javascript
const pool = new Pool({
  max: 20,  // Max 20 concurrent connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});
```

## Security Considerations

### Current Implementation
- CORS enabled for cross-origin requests
- Environment variables for sensitive data
- SQL parameterized queries (prevents injection)
- Input validation in route handlers

### Recommended Additions
- JWT authentication
- API rate limiting
- HTTPS/TLS encryption
- Role-based access control
- API key management
- Request logging and monitoring

## Scalability

### Horizontal Scaling
```
                    ┌─────────────┐
                    │ Load Balancer│
                    └─────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
   ┌─────────┐        ┌─────────┐        ┌─────────┐
   │ Server 1│        │ Server 2│        │ Server 3│
   └─────────┘        └─────────┘        └─────────┘
        │                  │                  │
        └──────────────────┴──────────────────┘
                           │
                    ┌─────────────┐
                    │  PostgreSQL │
                    │   (Primary) │
                    └─────────────┘
                           │
                    ┌─────────────┐
                    │  PostgreSQL │
                    │  (Replicas) │
                    └─────────────┘
```

### Vertical Scaling
- Increase PostgreSQL resources
- Add more connection pool connections
- Optimize queries with EXPLAIN ANALYZE
- Use Redis for caching

## Monitoring

### Recommended Tools
- **Application:** PM2 for process management
- **Database:** pgAdmin, pg_stat_statements
- **Logs:** Winston, Morgan
- **Metrics:** Prometheus + Grafana
- **Errors:** Sentry

### Key Metrics to Track
- API response times
- Database query performance
- WebSocket connection count
- GPS device connection count
- Memory usage
- CPU usage
- Disk I/O

## Deployment

### Production Checklist
- [ ] Set NODE_ENV=production
- [ ] Configure proper logging
- [ ] Set up database backups
- [ ] Configure firewall rules
- [ ] Set up SSL/TLS certificates
- [ ] Configure reverse proxy (nginx)
- [ ] Set up monitoring
- [ ] Configure auto-restart (PM2)
- [ ] Set up log rotation
- [ ] Document deployment process
