const WS_URL =  `ws://${window.location.hostname}/gps`

const API_URL = `http://${window.location.hostname}/api/gps`

// State
let ws = null;
let map = null;
let markers = {};
let vehicles = {};
let selectedVehicleId = null;

// Initialize map
function initMap() {
    map = L.map('map').setView([11.0168, 76.9558], 13); // Default: Coimbatore, India
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(map);
}

// Create custom marker icon
function createMarkerIcon(vehicleNumber, speed) {
    const color = speed > 0 ? '#2ecc71' : '#e74c3c';
    const initial = vehicleNumber.charAt(0);
    
    return L.divIcon({
        className: 'custom-marker',
        html: `<div class="vehicle-marker ${speed > 0 ? 'moving' : 'stopped'}" style="background: ${color};">${initial}</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
    });
}

// Update or create marker
function updateMarker(data) {
    const { vehicleId, vehicleNumber, latitude, longitude, speed, course, satellites, timestamp } = data;
    
    if (!latitude || !longitude) return;
    
    const position = [latitude, longitude];
    
    if (markers[vehicleId]) {
        // Update existing marker
        markers[vehicleId].setLatLng(position);
        markers[vehicleId].setIcon(createMarkerIcon(vehicleNumber, speed));
        markers[vehicleId].setRotationAngle(course || 0);
    } else {
        // Create new marker
        const marker = L.marker(position, {
            icon: createMarkerIcon(vehicleNumber, speed),
            rotationAngle: course || 0,
            rotationOrigin: 'center'
        }).addTo(map);
        
        marker.bindPopup(`
            <div style="min-width: 200px;">
                <h3 style="margin: 0 0 10px 0;">${vehicleNumber}</h3>
                <div><strong>Speed:</strong> ${speed} km/h</div>
                <div><strong>Course:</strong> ${course}°</div>
                <div><strong>Satellites:</strong> ${satellites}</div>
                <div><strong>Time:</strong> ${new Date(timestamp).toLocaleString()}</div>
                <div style="margin-top: 10px;">
                    <a href="https://www.google.com/maps?q=${latitude},${longitude}" target="_blank">Open in Google Maps</a>
                </div>
            </div>
        `);
        
        marker.on('click', () => {
            selectVehicle(vehicleId);
        });
        
        markers[vehicleId] = marker;
    }
    
    // Store vehicle data
    vehicles[vehicleId] = data;
    
    // Update sidebar
    updateVehicleCard(data);
    
    // If this is the first vehicle, center map on it
    if (Object.keys(markers).length === 1) {
        map.setView(position, 15);
    }
}

// Update vehicle card in sidebar
function updateVehicleCard(data) {
    const { vehicleId, vehicleNumber, latitude, longitude, speed, satellites, timestamp, receivedAt } = data;
    
    let card = document.getElementById(`vehicle-${vehicleId}`);
    
    if (!card) {
        card = document.createElement('div');
        card.id = `vehicle-${vehicleId}`;
        card.className = 'vehicle-card';
        card.onclick = () => selectVehicle(vehicleId);
        document.getElementById('vehicleList').appendChild(card);
    }
    
    const status = speed !== undefined ? 'online' : 'offline';
    const lastUpdate = receivedAt ? new Date(receivedAt).toLocaleTimeString() : 'N/A';
    
    card.innerHTML = `
        <div class="vehicle-header">
            <div class="vehicle-number">${vehicleNumber}</div>
            <div class="vehicle-status ${status}">${status.toUpperCase()}</div>
        </div>
        <div class="vehicle-info">
            <div><span class="label">Speed:</span> <span class="value">${speed || 0} km/h</span></div>
            <div><span class="label">Satellites:</span> <span class="value">${satellites || 0}</span></div>
            <div><span class="label">Last Update:</span> <span class="value">${lastUpdate}</span></div>
            ${latitude && longitude ? `<div><span class="label">Position:</span> <span class="value">${latitude.toFixed(5)}, ${longitude.toFixed(5)}</span></div>` : ''}
        </div>
    `;
    
    if (selectedVehicleId === vehicleId) {
        card.classList.add('active');
    } else {
        card.classList.remove('active');
    }
}

// Select vehicle
function selectVehicle(vehicleId) {
    selectedVehicleId = vehicleId;
    
    // Update card styles
    document.querySelectorAll('.vehicle-card').forEach(card => {
        card.classList.remove('active');
    });
    document.getElementById(`vehicle-${vehicleId}`)?.classList.add('active');
    
    // Center map on vehicle
    if (markers[vehicleId]) {
        const position = markers[vehicleId].getLatLng();
        map.setView(position, 16);
        markers[vehicleId].openPopup();
    }
}

// WebSocket connection
function connectWebSocket() {
    ws = new WebSocket(WS_URL);
    
    ws.onopen = () => {
        console.log('WebSocket connected');
        updateStatus(true);
    };
    
    ws.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            
            switch (message.type) {
                case 'initial_data':
                    // Load initial locations
                    message.data.locations.forEach(location => {
                        updateMarker(location);
                    });
                    
                    if (message.data.locations.length === 0) {
                        showNoData();
                    }
                    break;
                
                case 'location_update':
                    // Real-time location update
                    updateMarker(message.data);
                    console.log('Location update:', message.data.vehicleNumber);
                    break;
                
                case 'fuel_update':
                    console.log('Fuel update:', message.data);
                    // You can add fuel display logic here
                    break;
                
                case 'geofence_alert':
                    console.log('Geofence alert:', message.data);
                    showGeofenceAlert(message.data);
                    break;
                
                case 'vehicle_status':
                    console.log('Vehicle status:', message.data);
                    break;
            }
        } catch (err) {
            console.error('WebSocket message error:', err);
        }
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        updateStatus(false);
    };
    
    ws.onclose = () => {
        console.log('WebSocket disconnected');
        updateStatus(false);
        
        // Reconnect after 3 seconds
        setTimeout(connectWebSocket, 3000);
    };
    
    // Send ping every 30 seconds to keep connection alive
    setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
        }
    }, 30000);
}

// Update connection status
function updateStatus(connected) {
    const indicator = document.getElementById('statusIndicator');
    const text = document.getElementById('statusText');
    
    if (connected) {
        indicator.classList.add('connected');
        text.textContent = 'Connected';
    } else {
        indicator.classList.remove('connected');
        text.textContent = 'Disconnected';
    }
}

// Show no data message
function showNoData() {
    const vehicleList = document.getElementById('vehicleList');
    if (vehicleList.children.length === 0) {
        vehicleList.innerHTML = '<div class="no-data">No vehicles online<br>Waiting for GPS data...</div>';
    }
}

// Show geofence alert
function showGeofenceAlert(data) {
    const { vehicleId, geofenceName, eventType } = data;
    const vehicle = vehicles[vehicleId];
    
    if (vehicle && markers[vehicleId]) {
        const marker = markers[vehicleId];
        marker.bindPopup(`
            <div style="min-width: 200px;">
                <h3 style="margin: 0 0 10px 0; color: #e74c3c;">⚠️ Geofence Alert</h3>
                <div><strong>Vehicle:</strong> ${vehicle.vehicleNumber}</div>
                <div><strong>Geofence:</strong> ${geofenceName}</div>
                <div><strong>Event:</strong> ${eventType}</div>
            </div>
        `).openPopup();
    }
}

// Load vehicle history (optional feature)
async function loadVehicleHistory(vehicleId, hours = 24) {
    try {
        const from = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
        const response = await fetch(`${API_URL}/vehicles/${vehicleId}/history?from=${from}&limit=1000`);
        const history = await response.json();
        
        // Draw route on map
        if (history.length > 0) {
            const coordinates = history.map(point => [point.latitude, point.longitude]).reverse();
            const polyline = L.polyline(coordinates, {
                color: '#3498db',
                weight: 3,
                opacity: 0.7
            }).addTo(map);
            
            map.fitBounds(polyline.getBounds());
        }
    } catch (err) {
        console.error('Error loading history:', err);
    }
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    connectWebSocket();
    
    // Optional: Add button to show vehicle routes
    // You can add UI controls for this feature
});
