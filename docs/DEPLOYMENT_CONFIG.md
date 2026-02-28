# Deployment Configuration

## Your Production URLs

### Base API URL
```
http://31.97.229.169/api/gps
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
BASE_PATH=

# Logging
LOG_FILE=server.log
LOG_LEVEL=INFO
```

## Nginx/Reverse Proxy Configuration

Your nginx configuration rewrites `/api/gps` to `/api` for the Express app:

```nginx
upstream gps_dashboard {
    server localhost:3000;
}

server {
    listen 80;
    server_name 31.97.229.169;

    # API endpoints - rewrites /api/gps/* to /api/*
    location /api/gps {
        rewrite ^/api/gps(/.*)$ /api$1 break;
        proxy_pass http://gps_dashboard;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto http;
        
        add_header X-Content-Type-Options nosniff;
        add_header X-Frame-Options DENY;
        add_header X-XSS-Protection "1; mode=block";
    }

    # WebSocket and static files
    location /gps/ {
        proxy_pass http://gps_dashboard/;
        proxy_http_version 1.1;
        
        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts for WebSocket
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;
    }
}
```

## API Endpoints

All endpoints are prefixed with `/api/gps`:

### Vehicles
- `GET http://31.97.229.169/api/gps/vehicles`
- `GET http://31.97.229.169/api/gps/vehicles/:id`
- `PUT http://31.97.229.169/api/gps/vehicles/:id`
- `PUT http://31.97.229.169/api/gps/vehicles/:id/imei`
- `DELETE http://31.97.229.169/api/gps/vehicles/:id`

### Locations
- `GET http://31.97.229.169/api/gps/locations/live`
- `GET http://31.97.229.169/api/gps/locations/at-time`
- `GET http://31.97.229.169/api/gps/locations/history/:id`
- `GET http://31.97.229.169/api/gps/locations/route/:id`

### Fuel
- `GET http://31.97.229.169/api/gps/fuel/live`
- `GET http://31.97.229.169/api/gps/fuel/history/:id`
- `GET http://31.97.229.169/api/gps/fuel/consumption/:id`

### Geofences
- `GET http://31.97.229.169/api/gps/geofences`
- `POST http://31.97.229.169/api/gps/geofences`
- `PUT http://31.97.229.169/api/gps/geofences/:id`
- `DELETE http://31.97.229.169/api/gps/geofences/:id`
- `GET http://31.97.229.169/api/gps/geofences/:id/events`
- `GET http://31.97.229.169/api/gps/geofences/:id/stats`

### Analytics
- `GET http://31.97.229.169/api/gps/analytics/dashboard`
- `GET http://31.97.229.169/api/gps/analytics/vehicle-activity`
- `GET http://31.97.229.169/api/gps/analytics/distance/:id`
- `GET http://31.97.229.169/api/gps/analytics/hourly/:id`
- `GET http://31.97.229.169/api/gps/analytics/geofence-summary`
- `GET http://31.97.229.169/api/gps/analytics/speed-violations`

### Health Check
- `GET http://31.97.229.169/api/gps/health`

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
curl http://31.97.229.169/api/gps/health
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
curl http://31.97.229.169/api/gps/vehicles
```

### 3. Test Live Locations
```bash
curl http://31.97.229.169/api/gps/locations/live
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
2. Verify BASE_PATH in .env is empty (or not set)
3. Test direct connection: `wscat -c ws://localhost:3000/`

### API returns 404
1. Verify BASE_PATH is empty in .env
2. Check nginx rewrite rule: `/api/gps` → `/api`
3. Restart server: `pm2 restart gps-tracker`

### No live updates
1. Check if GPS devices are connected: `netstat -an | grep 5050`
2. Verify data in database: `SELECT * FROM location_data ORDER BY received_at DESC LIMIT 10;`
3. Check WebSocket clients: Look for "WebSocket client connected" in logs

## Production Checklist

- [x] BASE_PATH set to empty in .env (or removed)
- [x] Nginx configured with rewrite rule
- [ ] Firewall rules configured
- [ ] SSL certificate installed (recommended)
- [ ] PM2 configured for auto-restart
- [ ] Database backups configured
- [ ] Monitoring set up
- [ ] GPS devices configured with correct IP:Port
- [ ] WebSocket tested from frontend
- [ ] All API endpoints tested

## Next Steps

1. Update your `.env` file: Remove `BASE_PATH` or set it to empty string
2. Restart the server: `pm2 restart gps-tracker`
3. Test the health endpoint: `curl http://31.97.229.169/api/gps/health`
4. Connect your frontend to the WebSocket: `ws://31.97.229.169/gps`
5. Configure GPS devices to connect to 31.97.229.169:5050
