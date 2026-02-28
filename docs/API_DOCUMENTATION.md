# GPS Tracker API Documentation

Base URL: `http://31.97.229.169/api/gps`

## Table of Contents
1. [Vehicles](#vehicles)
2. [Locations](#locations)
3. [Fuel](#fuel)
4. [Geofences](#geofences)
5. [Analytics](#analytics)

---

## Vehicles

### Get All Vehicles
```
GET /vehicles
```
Returns all vehicles with their last known location.

**Response:**
```json
[
  {
    "id": 1,
    "imei": "0352672100341866",
    "vehicle_number": "TN 12 BK 6023",
    "vehicle_type": "Truck",
    "driver_name": "John Doe",
    "driver_phone": "1234567890",
    "fuel_tank_capacity": 200,
    "is_active": true,
    "last_lat": 13.0827,
    "last_lon": 80.2707,
    "last_speed": 45,
    "last_seen": "2026-02-28T10:30:00Z"
  }
]
```

### Get Vehicle by ID
```
GET /vehicles/:id
```

### Update Vehicle Details
```
PUT /vehicles/:id
```

**Request Body:**
```json
{
  "vehicle_number": "TN 12 BK 6023",
  "vehicle_type": "Truck",
  "driver_name": "John Doe",
  "driver_phone": "1234567890",
  "fuel_tank_capacity": 200,
  "is_active": true
}
```

### Update Vehicle IMEI
```
PUT /vehicles/:id/imei
```

**Request Body:**
```json
{
  "imei": "0352672100341866"
}
```

### Delete Vehicle
```
DELETE /vehicles/:id
```

---

## Locations

### Get Live Locations
```
GET /locations/live
```
Returns current locations of all active vehicles (from in-memory cache).

**Response:**
```json
[
  {
    "vehicleId": 1,
    "vehicleNumber": "TN 12 BK 6023",
    "imei": "0352672100341866",
    "latitude": 13.0827,
    "longitude": 80.2707,
    "speed": 45,
    "course": 180,
    "satellites": 8,
    "timestamp": "2026-02-28 10:30:00",
    "receivedAt": "2026-02-28T10:30:05Z"
  }
]
```

### Get Locations at Specific Time
```
GET /locations/at-time?timestamp=2026-02-28T10:00:00Z&vehicle_id=1
```

**Query Parameters:**
- `timestamp` (required): ISO 8601 timestamp
- `vehicle_id` (optional): Filter by specific vehicle

**Response:**
```json
[
  {
    "vehicle_id": 1,
    "vehicle_number": "TN 12 BK 6023",
    "imei": "0352672100341866",
    "fuel_tank_capacity": 200,
    "latitude": 13.0827,
    "longitude": 80.2707,
    "speed": 45,
    "course": 180,
    "satellites": 8,
    "timestamp": "2026-02-28 10:00:00",
    "fuel_level": 75.5
  }
]
```

### Get Vehicle Location History
```
GET /locations/history/:vehicleId?from=2026-02-28T00:00:00Z&to=2026-02-28T23:59:59Z&limit=1000
```

**Query Parameters:**
- `from` (optional): Start timestamp
- `to` (optional): End timestamp
- `limit` (optional): Max records (default: 1000)

### Get Vehicle Route
```
GET /locations/route/:vehicleId?from=2026-02-28T08:00:00Z&to=2026-02-28T18:00:00Z
```
Returns ordered location points for route visualization.

**Query Parameters:**
- `from` (required): Start timestamp
- `to` (required): End timestamp

---

## Fuel

### Get Live Fuel Levels
```
GET /fuel/live
```
Returns current fuel levels for all active vehicles.

**Response:**
```json
[
  {
    "vehicle_id": 1,
    "vehicle_number": "TN 12 BK 6023",
    "imei": "0352672100341866",
    "fuel_tank_capacity": 200,
    "fuel_level": 75.5,
    "voltage": 7.55,
    "raw_value": 755,
    "received_at": "2026-02-28T10:30:00Z"
  }
]
```

### Get Fuel History
```
GET /fuel/history/:vehicleId?from=2026-02-28T00:00:00Z&to=2026-02-28T23:59:59Z&limit=1000
```

### Get Fuel Consumption Analysis
```
GET /fuel/consumption/:vehicleId?from=2026-02-28T00:00:00Z&to=2026-02-28T23:59:59Z
```

**Response:**
```json
{
  "min_fuel": 45.2,
  "max_fuel": 95.8,
  "avg_fuel": 70.5,
  "fuel_consumed": 50.6,
  "data_points": 1440
}
```

---

## Geofences

### Get All Geofences
```
GET /geofences?active_only=true
```

**Query Parameters:**
- `active_only` (optional): Filter active geofences only

**Response:**
```json
[
  {
    "id": 1,
    "name": "Warehouse A",
    "description": "Main warehouse location",
    "fence_type": "circle",
    "center_lat": 13.0827,
    "center_lon": 80.2707,
    "radius_meters": 500,
    "geometry": null,
    "is_active": true,
    "created_at": "2026-02-01T00:00:00Z"
  }
]
```

### Get Geofence by ID
```
GET /geofences/:id
```

### Create Geofence (Circle)
```
POST /geofences
```

**Request Body:**
```json
{
  "name": "Warehouse A",
  "description": "Main warehouse location",
  "fence_type": "circle",
  "center_lat": 13.0827,
  "center_lon": 80.2707,
  "radius_meters": 500
}
```

### Create Geofence (Polygon)
```
POST /geofences
```

**Request Body:**
```json
{
  "name": "Delivery Zone",
  "description": "Downtown delivery area",
  "fence_type": "polygon",
  "polygon_coords": [
    [80.2707, 13.0827],
    [80.2800, 13.0827],
    [80.2800, 13.0900],
    [80.2707, 13.0900]
  ]
}
```

### Update Geofence
```
PUT /geofences/:id
```

**Request Body:**
```json
{
  "name": "Updated Name",
  "description": "Updated description",
  "is_active": false
}
```

### Delete Geofence
```
DELETE /geofences/:id
```

### Get Geofence Events
```
GET /geofences/:id/events?from=2026-02-28T00:00:00Z&to=2026-02-28T23:59:59Z&vehicle_id=1&limit=100
```

**Query Parameters:**
- `from` (optional): Start timestamp
- `to` (optional): End timestamp
- `vehicle_id` (optional): Filter by vehicle
- `limit` (optional): Max records (default: 100)

**Response:**
```json
[
  {
    "id": 1,
    "vehicle_id": 1,
    "vehicle_number": "TN 12 BK 6023",
    "event_type": "inside",
    "latitude": 13.0827,
    "longitude": 80.2707,
    "timestamp": "2026-02-28T10:30:00Z"
  }
]
```

### Get Geofence Statistics
```
GET /geofences/:id/stats?from=2026-02-28T00:00:00Z&to=2026-02-28T23:59:59Z
```

**Response:**
```json
[
  {
    "vehicle_id": 1,
    "vehicle_number": "TN 12 BK 6023",
    "total_events": 24,
    "entries": 12,
    "exits": 12,
    "first_event": "2026-02-28T08:00:00Z",
    "last_event": "2026-02-28T18:00:00Z"
  }
]
```

---

## Analytics

### Dashboard Overview
```
GET /analytics/dashboard
```

**Response:**
```json
{
  "total_vehicles": 10,
  "active_vehicles": 8,
  "vehicles_tracked_today": 7,
  "active_geofences": 5
}
```

### Vehicle Activity Summary
```
GET /analytics/vehicle-activity?from=2026-02-28T00:00:00Z&to=2026-02-28T23:59:59Z
```

**Response:**
```json
[
  {
    "id": 1,
    "vehicle_number": "TN 12 BK 6023",
    "data_points": 1440,
    "avg_speed": 45.5,
    "max_speed": 80,
    "first_seen": "2026-02-28T00:00:00Z",
    "last_seen": "2026-02-28T23:59:59Z"
  }
]
```

### Distance Traveled
```
GET /analytics/distance/:vehicleId?from=2026-02-28T00:00:00Z&to=2026-02-28T23:59:59Z
```

**Response:**
```json
{
  "vehicle_id": "1",
  "from": "2026-02-28T00:00:00Z",
  "to": "2026-02-28T23:59:59Z",
  "distance_km": "245.67"
}
```

### Hourly Statistics
```
GET /analytics/hourly/:vehicleId?from=2026-02-28T00:00:00Z&to=2026-02-28T23:59:59Z
```

**Response:**
```json
[
  {
    "hour": "2026-02-28T10:00:00Z",
    "data_points": 60,
    "avg_speed": 45.5,
    "max_speed": 65,
    "min_satellites": 6,
    "avg_satellites": 8.2
  }
]
```

### Geofence Summary
```
GET /analytics/geofence-summary?from=2026-02-28T00:00:00Z&to=2026-02-28T23:59:59Z
```

**Response:**
```json
[
  {
    "geofence_id": 1,
    "geofence_name": "Warehouse A",
    "unique_vehicles": 5,
    "total_events": 48,
    "entries": 24,
    "exits": 24
  }
]
```

### Speed Violations
```
GET /analytics/speed-violations?speed_limit=80&from=2026-02-28T00:00:00Z&to=2026-02-28T23:59:59Z
```

**Query Parameters:**
- `speed_limit` (optional): Speed threshold (default: 80)
- `from` (optional): Start timestamp
- `to` (optional): End timestamp

**Response:**
```json
[
  {
    "vehicle_id": 1,
    "vehicle_number": "TN 12 BK 6023",
    "speed": 95,
    "latitude": 13.0827,
    "longitude": 80.2707,
    "timestamp": "2026-02-28 10:30:00",
    "received_at": "2026-02-28T10:30:05Z"
  }
]
```

---

## WebSocket API

Connect to: `ws://31.97.229.169/gps/`

### Messages from Server

**Initial Data:**
```json
{
  "type": "initial_data",
  "data": {
    "locations": [...],
    "vehicleStatus": [...]
  }
}
```

**Location Update:**
```json
{
  "type": "location_update",
  "data": {
    "vehicleId": 1,
    "vehicleNumber": "TN 12 BK 6023",
    "latitude": 13.0827,
    "longitude": 80.2707,
    "speed": 45,
    "receivedAt": "2026-02-28T10:30:00Z"
  }
}
```

**Fuel Update:**
```json
{
  "type": "fuel_update",
  "data": {
    "vehicleId": 1,
    "vehicleNumber": "TN 12 BK 6023",
    "voltage": 7.55,
    "fuelLevel": 75.5,
    "receivedAt": "2026-02-28T10:30:00Z"
  }
}
```

**Geofence Alert:**
```json
{
  "type": "geofence_alert",
  "data": {
    "vehicleId": 1,
    "geofenceName": "Warehouse A",
    "geofenceId": 1,
    "eventType": "inside",
    "latitude": 13.0827,
    "longitude": 80.2707,
    "timestamp": "2026-02-28T10:30:00Z"
  }
}
```

**Vehicle Status:**
```json
{
  "type": "vehicle_status",
  "data": {
    "vehicleId": 1,
    "status": "online",
    "lastSeen": "2026-02-28T10:30:00Z"
  }
}
```

### Messages to Server

**Ping:**
```json
{
  "type": "ping"
}
```

**Response:**
```json
{
  "type": "pong",
  "timestamp": "2026-02-28T10:30:00Z"
}
```
