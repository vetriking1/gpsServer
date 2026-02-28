const net = require('net');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// Initialize SQLite Database
const db = new Database('gps_tracker.db');

// Create tables if they don't exist
db.exec(`
    CREATE TABLE IF NOT EXISTS location_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        serial_number INTEGER,
        timestamp TEXT,
        latitude REAL,
        longitude REAL,
        speed INTEGER,
        course INTEGER,
        satellites INTEGER,
        raw_hex TEXT,
        received_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS fuel_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        serial_number INTEGER,
        raw_value INTEGER,
        voltage REAL,
        fuel_level TEXT,
        raw_hex TEXT,
        received_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS connection_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT,
        serial_number INTEGER,
        message TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);

// Prepare statements for better performance
const insertLocation = db.prepare(`
    INSERT INTO location_data (serial_number, timestamp, latitude, longitude, speed, course, satellites, raw_hex)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertFuel = db.prepare(`
    INSERT INTO fuel_data (serial_number, raw_value, voltage, fuel_level, raw_hex)
    VALUES (?, ?, ?, ?, ?)
`);

const insertLog = db.prepare(`
    INSERT INTO connection_logs (event_type, serial_number, message)
    VALUES (?, ?, ?)
`);

// Logger function with timestamp
function log(message, type = 'INFO') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${type}] ${message}`;
    console.log(logMessage);
    
    // Append to log file
    fs.appendFileSync('server.log', logMessage + '\n');
}

// CRC-16/X-25 (CRC-ITU) calculation for the GT06/RV08 protocol
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

// Fuel level calculation
function getFuelLevel(voltage) {
    const minVolts = 0;
    const maxVolts = 10;
    let percentage = ((voltage - minVolts) / (maxVolts - minVolts)) * 100;
    return Math.max(0, Math.min(100, percentage)).toFixed(1) + "%";
}

// Process raw data from tracker
function processRawData(data) {
    const hex = data.toString('hex');
    
    if (data[0] !== 0x78 || data[1] !== 0x78) {
        return { error: "Invalid Start Bit" };
    }

    const protocol = data[3];
    const result = {
        protocol: `0x${protocol.toString(16).toUpperCase()}`,
        serialNumber: data.readUInt16BE(data.length - 6),
        rawHex: hex
    };

    switch (protocol) {
        case 0x94: // ANALOG / FUEL DATA
            const rawValue = data.readUInt16BE(4);
            result.type = "Fuel/Analog";
            result.rawData = rawValue;
            result.voltage = rawValue / 100;
            result.fuelLevel = getFuelLevel(rawValue / 1000);
            
            // Store in database
            try {
                insertFuel.run(
                    result.serialNumber,
                    rawValue,
                    result.voltage,
                    result.fuelLevel,
                    hex
                );
                log(`Fuel data stored: Serial=${result.serialNumber}, Voltage=${result.voltage}V, Level=${result.fuelLevel}`, 'DB');
            } catch (err) {
                log(`Database error: ${err.message}`, 'ERROR');
            }
            break;

        case 0x12: // LOCATION DATA
            result.type = "Location";

            const date = {
                year: 2000 + data[4],
                month: data[5],
                day: data[6],
                hour: data[7],
                minute: data[8],
                second: data[9],
            };
            result.timestamp = `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')} ${String(date.hour).padStart(2, '0')}:${String(date.minute).padStart(2, '0')}:${String(date.second).padStart(2, '0')}`;

            const satByte = data[10];
            result.satellites = satByte & 0x0f;
            result.latitude = data.readUInt32BE(11) / 1800000;
            result.longitude = data.readUInt32BE(15) / 1800000;
            result.speed = data[19];
            
            const courseStatus = data.readUInt16BE(20);
            result.course = courseStatus & 0x03ff;

            // Store in database
            try {
                insertLocation.run(
                    result.serialNumber,
                    result.timestamp,
                    result.latitude,
                    result.longitude,
                    result.speed,
                    result.course,
                    result.satellites,
                    hex
                );
                log(`Location data stored: Serial=${result.serialNumber}, Lat=${result.latitude}, Lon=${result.longitude}, Speed=${result.speed}km/h`, 'DB');
            } catch (err) {
                log(`Database error: ${err.message}`, 'ERROR');
            }
            break;

        default:
            result.type = "Unknown";
            log(`Unknown protocol: ${result.protocol}`, 'WARN');
    }

    return result;
}

const SERVER_PORT = 5050;

const server = net.createServer((socket) => {
    log(`Sensor connected from: ${socket.remoteAddress}:${socket.remotePort}`, 'CONNECT');

    socket.on('data', (data) => {
        const hexData = data.toString('hex').toUpperCase();
        log(`RAW DATA: ${hexData}`, 'DATA');

        if (data.length >= 4 && data[0] === 0x78 && data[1] === 0x78) {
            const protocol = data[3];
            const serialNo = data.slice(data.length - 6, data.length - 4);
            const serialNumber = serialNo.readUInt16BE(0);

            if (protocol === 0x01 || protocol === 0x13) {
                const type = protocol === 0x01 ? 'LOGIN' : 'HEARTBEAT';
                log(`Received ${type} from Serial: ${serialNumber}`, type);

                // Log to database
                insertLog.run(type, serialNumber, `${type} received`);

                // Response: Start(2) + Length(1) + Protocol(1) + Serial(2) + CRC(2) + Stop(2)
                const payload = Buffer.concat([Buffer.from([0x05, protocol]), serialNo]);
                const crc = getCRC(payload);
                const response = Buffer.concat([
                    Buffer.from([0x78, 0x78]),
                    payload,
                    crc,
                    Buffer.from([0x0D, 0x0A])
                ]);
                socket.write(response);
                log(`Sent ${type} response to Serial: ${serialNumber}`, 'RESPONSE');
            }
            else if (protocol === 0x12 || protocol === 0x94) {
                // Process and store location or fuel data
                const processedData = processRawData(data);
                log(`Processed ${processedData.type} data: ${JSON.stringify(processedData)}`, 'PROCESS');
            }
        }
    });

    socket.on('error', (err) => {
        log(`Socket Error: ${err.message}`, 'ERROR');
    });

    socket.on('close', () => {
        log(`Connection closed from: ${socket.remoteAddress}`, 'DISCONNECT');
    });
});

server.listen(SERVER_PORT, '0.0.0.0', () => {
    log(`GPS Tracker Server listening on port ${SERVER_PORT}`, 'SERVER');
    log(`Database: gps_tracker.db`, 'SERVER');
    log(`Log file: server.log`, 'SERVER');
});

// Graceful shutdown
process.on('SIGINT', () => {
    log('Shutting down server...', 'SERVER');
    db.close();
    server.close(() => {
        log('Server closed', 'SERVER');
        process.exit(0);
    });
});
