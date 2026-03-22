// this server used for the aarov vechile management project

const net = require('net');
const express = require('express');
const { WebSocketServer } = require('ws');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

// PostgreSQL connection pool
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'gps_tracker',
    user: process.env.DB_USER || 'gps_user',
    password: process.env.DB_PASSWORD,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// In-memory cache for live locations
const liveLocations = new Map();
const liveVehicleStatus = new Map();

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        log(`Database connection failed: ${err.message}`, 'ERROR');
        process.exit(1);
    }
    log(`Database connected successfully at ${res.rows[0].now}`, 'DB');
});

// Logger function
function log(message, type = 'INFO') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${type}] ${message}`;
    console.log(logMessage);
    fs.appendFileSync(process.env.LOG_FILE || 'server.log', logMessage + '\n');
}

// CRC-16/X-25 calculation
function getCRC(buffer) {
    let crc = 0xFFFF;
    for (let i = 0; i < buffer.length; i++) {
        crc ^= buffer[i];
        for (let j = 0; j < 8; j++) {
            if (crc & 1) crc = (crc >> 1) ^ 0x8408;
            else crc >>= 1;
        }
    }
    crc ^= 0xFFFF;
    const res = Buffer.alloc(2);
    res.writeUInt16BE(crc);
    return res;
}

// Extract IMEI from login packet
function extractIMEI(data) {
    if (data.length >= 13 && data[3] === 0x01) {
        const imeiBytes = data.slice(4, 12);
        return imeiBytes.toString('hex');
    }
    return null;
}

// Get or create vehicle by IMEI
async function getVehicleByIMEI(imei) {
    try {
        const result = await pool.query(
            'SELECT id, vehicle_number, is_active FROM vehicles WHERE imei = $1',
            [imei]
        );
        
        if (result.rows.length > 0) {
            return result.rows[0];
        }
        
        const insertResult = await pool.query(
            `INSERT INTO vehicles (imei, vehicle_number, is_active) 
             VALUES ($1, $2, true) 
             RETURNING id, vehicle_number`,
            [imei, `UNKNOWN-${imei.slice(-6)}`]
        );
        
        log(`New vehicle auto-registered: IMEI=${imei}`, 'DB');
        return insertResult.rows[0];
    } catch (err) {
        log(`Error getting vehicle: ${err.message}`, 'ERROR');
        return null;
    }
}

// Fuel level calculation
function getFuelLevel(voltage) {
    const minVolts = 0;
    const maxVolts = 5;
    let percentage = ((voltage - minVolts) / (maxVolts - minVolts)) * 100;
    return Math.max(0, Math.min(100, percentage)).toFixed(1);
}

// Broadcast to all WebSocket clients
function broadcastToClients(message) {
    wss.clients.forEach(client => {
        if (client.readyState === 1) {
            client.send(JSON.stringify(message));
        }
    });
}

// Process location data (0x12)
async function processLocationData(data, imei, vehicle) {
    try {
        const date = {
            year: 2000 + data[4],
            month: data[5],
            day: data[6],
            hour: data[7],
            minute: data[8],
            second: data[9],
        };
        
        const timestamp = `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')} ${String(date.hour).padStart(2, '0')}:${String(date.minute).padStart(2, '0')}:${String(date.second).padStart(2, '0')}`;
        
        const satByte = data[10];
        const satellites = satByte & 0x0f;
        const latitude = data.readUInt32BE(11) / 1800000;
        const longitude = data.readUInt32BE(15) / 1800000;
        const speed = data[19];
        const courseStatus = data.readUInt16BE(20);
        const course = courseStatus & 0x03ff;
        const hex = data.toString('hex');
        
        await pool.query(
            `INSERT INTO location_data 
             (vehicle_id, imei, timestamp, location, latitude, longitude, speed, course, satellites, raw_hex)
             VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography, $5, $4, $6, $7, $8, $9)`,
            [vehicle.id, imei, timestamp, longitude, latitude, speed, course, satellites, hex]
        );
        
        log(`Location stored: Vehicle=${vehicle.vehicle_number}, Lat=${latitude}, Lon=${longitude}, Speed=${speed}km/h`, 'DB');
        
        const locationData = {
            vehicleId: vehicle.id,
            vehicleNumber: vehicle.vehicle_number,
            imei,
            latitude,
            longitude,
            speed,
            course,
            satellites,
            timestamp,
            receivedAt: new Date().toISOString()
        };
        
        liveLocations.set(vehicle.id, locationData);
        
        broadcastToClients({
            type: 'location_update',
            data: locationData
        });
        
        checkGeofences(vehicle.id, latitude, longitude).catch(err => 
            log(`Geofence check error: ${err.message}`, 'ERROR')
        );
        
    } catch (err) {
        log(`Error processing location: ${err.message}`, 'ERROR');
    }
}

// Process fuel data (0x94)
async function processFuelData(data, imei, vehicle) {
    try {
        const rawValue = data.readUInt16BE(4);
        const voltage = rawValue / 100;
        const fuelLevel = getFuelLevel(rawValue / 100);
        const hex = data.toString('hex');
        
        await pool.query(
            `INSERT INTO fuel_data (vehicle_id, imei, raw_value, voltage, fuel_level, raw_hex)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [vehicle.id, imei, rawValue, voltage, parseFloat(fuelLevel), hex]
        );
        
        log(`Fuel stored: Vehicle=${vehicle.vehicle_number}, Voltage=${voltage}V, Level=${fuelLevel}%`, 'DB');
        
        broadcastToClients({
            type: 'fuel_update',
            data: {
                vehicleId: vehicle.id,
                vehicleNumber: vehicle.vehicle_number,
                voltage,
                fuelLevel: parseFloat(fuelLevel),
                receivedAt: new Date().toISOString()
            }
        });
    } catch (err) {
        log(`Error processing fuel: ${err.message}`, 'ERROR');
    }
}

// Check if vehicle is in any geofence
async function checkGeofences(vehicleId, latitude, longitude) {
    try {
        const result = await pool.query(
            `SELECT id, name, 
                    check_geofence($1, $2, id) as is_inside
             FROM geofences 
             WHERE is_active = true`,
            [latitude, longitude]
        );
        
        for (const fence of result.rows) {
            if (fence.is_inside) {
                await pool.query(
                    `INSERT INTO geofence_events (vehicle_id, geofence_id, event_type, location)
                     VALUES ($1, $2, 'inside', ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography)`,
                    [vehicleId, fence.id, longitude, latitude]
                );
                
                broadcastToClients({
                    type: 'geofence_alert',
                    data: {
                        vehicleId,
                        geofenceName: fence.name,
                        geofenceId: fence.id,
                        eventType: 'inside',
                        latitude,
                        longitude,
                        timestamp: new Date().toISOString()
                    }
                });
                
                log(`Vehicle ${vehicleId} inside geofence: ${fence.name}`, 'GEOFENCE');
            }
        }
    } catch (err) {
        log(`Geofence check error: ${err.message}`, 'ERROR');
    }
}

// Log connection event
async function logConnection(eventType, imei, vehicleId, message) {
    try {
        await pool.query(
            `INSERT INTO connection_logs (event_type, imei, vehicle_id, message)
             VALUES ($1, $2, $3, $4)`,
            [eventType, imei, vehicleId, message]
        );
        
        liveVehicleStatus.set(vehicleId, {
            status: eventType === 'LOGIN' ? 'online' : eventType === 'DISCONNECT' ? 'offline' : 'online',
            lastSeen: new Date().toISOString()
        });
        
        broadcastToClients({
            type: 'vehicle_status',
            data: {
                vehicleId,
                status: liveVehicleStatus.get(vehicleId).status,
                lastSeen: liveVehicleStatus.get(vehicleId).lastSeen
            }
        });
    } catch (err) {
        log(`Error logging connection: ${err.message}`, 'ERROR');
    }
}

// ============================================
// GPS TCP SERVER (Port 5050)
// ============================================

const GPS_SERVER_PORT = process.env.GPS_SERVER_PORT || 5050;
const GPS_SERVER_HOST = process.env.GPS_SERVER_HOST || '0.0.0.0';

const gpsServer = net.createServer((socket) => {
    let clientIMEI = null;
    let clientVehicle = null;
    
    log(`GPS device connected from: ${socket.remoteAddress}:${socket.remotePort}`, 'CONNECT');

    socket.on('data', async (data) => {
        const hexData = data.toString('hex').toUpperCase();
        log(`RAW DATA: ${hexData}`, 'DATA');

        if (data.length >= 4 && data[0] === 0x78 && data[1] === 0x78) {
            const protocol = data[3];
            const serialNo = data.slice(data.length - 6, data.length - 4);
            const serialNumber = serialNo.readUInt16BE(0);

            if (protocol === 0x01) {
                clientIMEI = extractIMEI(data);
                
                if (clientIMEI) {
                    clientVehicle = await getVehicleByIMEI(clientIMEI);
                    
                    if (clientVehicle) {
                        log(`LOGIN: IMEI=${clientIMEI}, Vehicle=${clientVehicle.vehicle_number}`, 'LOGIN');
                        await logConnection('LOGIN', clientIMEI, clientVehicle.id, 'Device connected');
                    }
                }
                
                const payload = Buffer.concat([Buffer.from([0x05, protocol]), serialNo]);
                const crc = getCRC(payload);
                const response = Buffer.concat([
                    Buffer.from([0x78, 0x78]),
                    payload,
                    crc,
                    Buffer.from([0x0D, 0x0A])
                ]);
                socket.write(response);
                log(`LOGIN response sent to IMEI: ${clientIMEI}`, 'RESPONSE');
            }
            else if (protocol === 0x13) {
                log(`HEARTBEAT from IMEI: ${clientIMEI || 'Unknown'}`, 'HEARTBEAT');
                
                if (clientIMEI && clientVehicle) {
                    await logConnection('HEARTBEAT', clientIMEI, clientVehicle.id, 'Heartbeat received');
                }
                
                const payload = Buffer.concat([Buffer.from([0x05, protocol]), serialNo]);
                const crc = getCRC(payload);
                const response = Buffer.concat([
                    Buffer.from([0x78, 0x78]),
                    payload,
                    crc,
                    Buffer.from([0x0D, 0x0A])
                ]);
                socket.write(response);
            }
            else if (protocol === 0x12) {
                if (clientIMEI && clientVehicle) {
                    await processLocationData(data, clientIMEI, clientVehicle);
                } else {
                    log('Location data received but no IMEI registered', 'WARN');
                }
            }
            else if (protocol === 0x94) {
                if (clientIMEI && clientVehicle) {
                    await processFuelData(data, clientIMEI, clientVehicle);
                } else {
                    log('Fuel data received but no IMEI registered', 'WARN');
                }
            }
        }
    });

    socket.on('error', (err) => {
        log(`Socket Error: ${err.message}`, 'ERROR');
    });

    socket.on('close', () => {
        if (clientIMEI && clientVehicle) {
            logConnection('DISCONNECT', clientIMEI, clientVehicle.id, 'Device disconnected')
                .catch(err => log(`Error logging disconnect: ${err.message}`, 'ERROR'));
        }
        log(`GPS connection closed from: ${socket.remoteAddress}`, 'DISCONNECT');
    });
});

// ============================================
// EXPRESS API SERVER (Port 3000)
// ============================================

const app = express();
app.use(cors());
app.use(express.json());

// Base path for all routes
const BASE_PATH = process.env.BASE_PATH || '';

// Serve static files at base path
app.use(BASE_PATH, express.static('public'));

// Make pool and cache available to routes
app.locals.pool = pool;
app.locals.liveLocations = liveLocations;
app.locals.liveVehicleStatus = liveVehicleStatus;

// Import routes
const vehiclesRouter = require('./routes/vehicles');
const locationsRouter = require('./routes/locations');
const fuelRouter = require('./routes/fuel');
const geofencesRouter = require('./routes/geofences');
const analyticsRouter = require('./routes/analytics');

// Use routes with base path
app.use(`${BASE_PATH}/api/vehicles`, vehiclesRouter);
app.use(`${BASE_PATH}/api/locations`, locationsRouter);
app.use(`${BASE_PATH}/api/fuel`, fuelRouter);
app.use(`${BASE_PATH}/api/geofences`, geofencesRouter);
app.use(`${BASE_PATH}/api/analytics`, analyticsRouter);

// API: Health check
app.get(`${BASE_PATH}/api/health`, (req, res) => {
    res.json({
        status: 'ok',
        gpsServer: 'running',
        websocket: 'running',
        liveVehicles: liveLocations.size,
        timestamp: new Date().toISOString()
    });
});

const API_PORT = process.env.API_PORT || 3000;
const apiServer = app.listen(API_PORT, () => {
    log(`API Server listening on port ${API_PORT}`, 'SERVER');
    log(`Public API URL: http://31.97.229.169/api/gps`, 'SERVER');
    log(`Public WebSocket URL: ws://31.97.229.169/gps`, 'SERVER');
});

// ============================================
// WEBSOCKET SERVER (Port 3000 - same as API)
// ============================================

const wss = new WebSocketServer({ 
    server: apiServer,
    path: `${BASE_PATH}/`
});

wss.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    log(`WebSocket client connected from: ${clientIp}`, 'WS');
    
    ws.send(JSON.stringify({
        type: 'initial_data',
        data: {
            locations: Array.from(liveLocations.values()),
            vehicleStatus: Array.from(liveVehicleStatus.entries()).map(([id, status]) => ({
                vehicleId: id,
                ...status
            }))
        }
    }));
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            log(`WebSocket message from ${clientIp}: ${data.type}`, 'WS');
            
            if (data.type === 'ping') {
                ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
            }
        } catch (err) {
            log(`WebSocket message error: ${err.message}`, 'ERROR');
        }
    });
    
    ws.on('close', () => {
        log(`WebSocket client disconnected: ${clientIp}`, 'WS');
    });
    
    ws.on('error', (err) => {
        log(`WebSocket error: ${err.message}`, 'ERROR');
    });
});

// ============================================
// START SERVERS
// ============================================

gpsServer.listen(GPS_SERVER_PORT, GPS_SERVER_HOST, () => {
    log(`GPS Tracker Server listening on ${GPS_SERVER_HOST}:${GPS_SERVER_PORT}`, 'SERVER');
    log(`Database: ${process.env.DB_NAME}@${process.env.DB_HOST}`, 'SERVER');
    log(`Log file: ${process.env.LOG_FILE || 'server.log'}`, 'SERVER');
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

process.on('SIGINT', async () => {
    log('Shutting down servers...', 'SERVER');
    
    gpsServer.close(() => log('GPS server closed', 'SERVER'));
    apiServer.close(() => log('API server closed', 'SERVER'));
    wss.close(() => log('WebSocket server closed', 'SERVER'));
    
    await pool.end();
    log('Database connection closed', 'SERVER');
    process.exit(0);
});

process.on('unhandledRejection', (err) => {
    log(`Unhandled rejection: ${err.message}`, 'ERROR');
});
