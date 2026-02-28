# Deployment Configuration

## Your Production URLs

### Base API URL
```
http://31.97.229.169/gps/api
```

### WebSocket URL
```
ws://31.97.229.169/gps
```

### GPS Device Connection
```
TCP: 31.97.229.169:5050
```

## Environment Configuration

Your `.env` file should have:

```env
# PostgreSQL Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=gps_tracker
DB_USER=gps_user
DB_PASSWORD=your_password

# Server Configuration
GPS_SERVER_PORT=5050
GPS_SERVER_HOST=0.0.0.0
API_PORT=3000
BASE_PATH=/gps

# Logging
LOG_FILE=server.log
LOG_LEVEL=INFO
```

## Nginx/Reverse Proxy Configuration

Since you're using a `/gps` path, you likely have nginx or another reverse proxy. Here's a sample nginx config:

```nginx
server {
    listen 80;
    server_name 31.97.229.169;

    # API and static files
    location /gps {
        proxy_pass http://localhost:3000/gps;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket specific configuration
    location /gps/ {
        proxy_pass http://localhost:3000/gps/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 86400;
    }
}
```

## API Endpoints

All endpoints are prefixed with `/gps/api`:

### Vehicles
- `GET http://31.97.229.169/gps/api/vehicles`
- `GET http://31.97.229.169/gps/api/vehicles/:id`
- `PUT http://31.97.229.169/gps/api/vehicles/:id`
- `PUT http://31.97.229.169/gps/api/vehicles/:id/imei`
- `DELETE http://31.97.229.169/gps/api/vehicles/:id`

### Locations
- `GET http://31.97.229.169/gps/api/locations/live`
- `GET http://31.97.229.169/gps/api/locations/at-time`
- `GET http://31.97.229.169/gps/api/locations/history/:id`
- `GET http://31.97.229.169/gps/api/locations/route/:id`

### Fuel
- `GET http://31.97.229.169/gps/api/fuel/live`
- `GET http://31.97.229.169/gps/api/fuel/history/:id`
- `GET http://31.97.229.169/gps/api/fuel/consumption/:id`

### Geofences
- `GET http://31.97.229.169/gps/api/geofences`
- `POST http://31.97.229.169/gps/api/geofences`
- `PUT http://31.97.229.169/gps/api/geofences/:id`
- `DELETE http://31.97.229.169/gps/api/geofences/:id`
- `GET http://31.97.229.169/gps/api/geofences/:id/events`
- `GET http://31.97.229.169/gps/api/geofences/:id/stats`

### Analytics
- `GET http://31.97.229.169/gps/api/analytics/dashboard`
- `GET http://31.97.229.169/gps/api/analytics/vehicle-activity`
- `GET http://31.97.229.169/gps/api/analytics/distance/:id`
- `GET http://31.97.229.169/gps/api/analytics/hourly/:id`
- `GET http://31.97.229.169/gps/api/analytics/geofence-summary`
- `GET http://31.97.229.169/gps/api/analytics/speed-violations`

### Health Check
- `GET http://31.97.229.169/gps/api/health`

## WebSocket Connection

### JavaScript Example
```javascript
const ws = new WebSocket('ws://31.97.229.169/gps');

ws.onopen = () => {
    console.log('Connected to GPS Tracker');
    ws.send(JSON.stringify({ type: 'ping' }));
};

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    switch(data.type) {
        case 'initial_data':
            console.log('Initial data:', data.data);
            break;
        case 'location_update':
            console.log('Vehicle moved:', data.data);
            // Update map marker
            break;
        case 'fuel_update':
            console.log('Fuel changed:', data.data);
            // Update fuel gauge
            break;
        case 'geofence_alert':
            console.log('Geofence event:', data.data);
            // Show alert
            break;
        case 'vehicle_status':
            console.log('Status changed:', data.data);
            // Update vehicle status indicator
            break;
    }
};

ws.onerror = (error) => {
    console.error('WebSocket error:', error);
};

ws.onclose = () => {
    console.log('Disconnected from GPS Tracker');
    // Attempt reconnection
    setTimeout(() => {
        // Reconnect logic
    }, 5000);
};
```

### React Example
```javascript
import { useEffect, useState } from 'react';

function useGPSWebSocket() {
    const [locations, setLocations] = useState([]);
    const [connected, setConnected] = useState(false);

    useEffect(() => {
        const ws = new WebSocket('ws://31.97.229.169/gps');

        ws.onopen = () => {
            setConnected(true);
            console.log('Connected to GPS Tracker');
        };

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            if (data.type === 'initial_data') {
                setLocations(data.data.locations);
            } else if (data.type === 'location_update') {
                setLocations(prev => {
                    const index = prev.findIndex(l => l.vehicleId === data.data.vehicleId);
                    if (index >= 0) {
                        const updated = [...prev];
                        updated[index] = data.data;
                        return updated;
                    }
                    return [...prev, data.data];
                });
            }
        };

        ws.onclose = () => {
            setConnected(false);
            console.log('Disconnected');
        };

        return () => ws.close();
    }, []);

    return { locations, connected };
}
```

## Testing Your Deployment

### 1. Test Health Endpoint
```bash
curl http://31.97.229.169/gps/api/health
```

Expected response:
```json
{
  "status": "ok",
  "gpsServer": "running",
  "websocket": "running",
  "liveVehicles": 0,
  "timestamp": "2026-02-28T10:30:00Z"
}
```

### 2. Test Get Vehicles
```bash
curl http://31.97.229.169/gps/api/vehicles
```

### 3. Test Live Locations
```bash
curl http://31.97.229.169/gps/api/locations/live
```

### 4. Test WebSocket (using wscat)
```bash
# Install wscat if needed
npm install -g wscat

# Connect
wscat -c ws://31.97.229.169/gps/

# Send ping
> {"type":"ping"}

# You should receive pong
< {"type":"pong","timestamp":"2026-02-28T10:30:00Z"}
```

### 5. Run Automated Tests
```bash
node test_api.js
```

## In-Memory Store for Live Updates

Yes, the system uses an in-memory Map for live vehicle tracking:

```javascript
// In server_new.js
const liveLocations = new Map();
const liveVehicleStatus = new Map();
```

### How it works:

1. **GPS Device sends data** → TCP Server receives
2. **Data is saved to PostgreSQL** → Permanent storage
3. **Data is cached in memory** → `liveLocations.set(vehicleId, data)`
4. **WebSocket broadcasts** → All connected clients receive update
5. **REST API serves from cache** → `/api/locations/live` reads from Map

### Benefits:
- ⚡ Fast access (no database query for live data)
- 🔄 Real-time updates via WebSocket
- 💾 Historical data still in database
- 🚀 Scalable (can add Redis later if needed)

### Memory Usage:
- Each vehicle location: ~200 bytes
- 1000 vehicles: ~200 KB
- Very efficient for real-time tracking

## Firewall Configuration

Make sure these ports are open:

```bash
# GPS Device Connection
sudo ufw allow 5050/tcp

# API Server (if not behind nginx)
sudo ufw allow 3000/tcp

# HTTP (nginx)
sudo ufw allow 80/tcp

# HTTPS (if using SSL)
sudo ufw allow 443/tcp
```

## GPS Device Configuration

Configure your GT06/RV08 devices to connect to:

```
Server IP: 31.97.229.169
Server Port: 5050
Protocol: TCP
```

## Monitoring

Check if services are running:

```bash
# Check Node.js server
pm2 status

# Check nginx
sudo systemctl status nginx

# Check PostgreSQL
sudo systemctl status postgresql

# View logs
pm2 logs gps-tracker
tail -f server.log
```

## Troubleshooting

### WebSocket not connecting
1. Check nginx WebSocket configuration
2. Verify BASE_PATH in .env is `/gps`
3. Test direct connection: `wscat -c ws://localhost:3000/gps`

### API returns 404
1. Verify BASE_PATH is set correctly
2. Check nginx proxy_pass configuration
3. Restart server: `pm2 restart gps-tracker`

### No live updates
1. Check if GPS devices are connected: `netstat -an | grep 5050`
2. Verify data in database: `SELECT * FROM location_data ORDER BY received_at DESC LIMIT 10;`
3. Check WebSocket clients: Look for "WebSocket client connected" in logs

## Production Checklist

- [x] BASE_PATH set to `/gps` in .env
- [ ] Nginx configured for reverse proxy
- [ ] Firewall rules configured
- [ ] SSL certificate installed (recommended)
- [ ] PM2 configured for auto-restart
- [ ] Database backups configured
- [ ] Monitoring set up
- [ ] GPS devices configured with correct IP:Port
- [ ] WebSocket tested from frontend
- [ ] All API endpoints tested

## Next Steps

1. Update your `.env` file with `BASE_PATH=/gps`
2. Restart the server: `pm2 restart gps-tracker`
3. Test the health endpoint
4. Connect your frontend to the WebSocket
5. Configure GPS devices to connect to 31.97.229.169:5050
