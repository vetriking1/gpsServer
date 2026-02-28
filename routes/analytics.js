const express = require('express');
const router = express.Router();

// Dashboard overview
router.get('/dashboard', async (req, res) => {
    try {
        const { pool } = req.app.locals;
        
        const [vehicles, activeVehicles, todayData, geofences] = await Promise.all([
            pool.query('SELECT COUNT(*) as total FROM vehicles'),
            pool.query('SELECT COUNT(*) as active FROM vehicles WHERE is_active = true'),
            pool.query(`
                SELECT COUNT(DISTINCT vehicle_id) as vehicles_tracked_today
                FROM location_data
                WHERE received_at >= CURRENT_DATE
            `),
            pool.query('SELECT COUNT(*) as total FROM geofences WHERE is_active = true')
        ]);
        
        res.json({
            total_vehicles: parseInt(vehicles.rows[0].total),
            active_vehicles: parseInt(activeVehicles.rows[0].active),
            vehicles_tracked_today: parseInt(todayData.rows[0].vehicles_tracked_today),
            active_geofences: parseInt(geofences.rows[0].total)
        });
    } catch (err) {
        console.error('Error fetching dashboard data:', err);
        res.status(500).json({ error: err.message });
    }
});

// Vehicle activity summary
router.get('/vehicle-activity', async (req, res) => {
    try {
        const { pool } = req.app.locals;
        const { from, to } = req.query;
        
        let query = `
            SELECT 
                v.id,
                v.vehicle_number,
                COUNT(l.id) as data_points,
                AVG(l.speed) as avg_speed,
                MAX(l.speed) as max_speed,
                MIN(l.received_at) as first_seen,
                MAX(l.received_at) as last_seen
            FROM vehicles v
            LEFT JOIN location_data l ON v.id = l.vehicle_id
        `;
        
        const params = [];
        const conditions = [];
        
        if (from) {
            params.push(from);
            conditions.push(`l.received_at >= $${params.length}`);
        }
        if (to) {
            params.push(to);
            conditions.push(`l.received_at <= $${params.length}`);
        }
        
        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }
        
        query += ' GROUP BY v.id, v.vehicle_number ORDER BY v.vehicle_number';
        
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching vehicle activity:', err);
        res.status(500).json({ error: err.message });
    }
});

// Distance traveled
router.get('/distance/:vehicleId', async (req, res) => {
    try {
        const { pool } = req.app.locals;
        const { vehicleId } = req.params;
        const { from, to } = req.query;
        
        if (!from || !to) {
            return res.status(400).json({ error: 'from and to timestamps are required' });
        }
        
        const result = await pool.query(`
            SELECT 
                SUM(
                    ST_Distance(
                        location,
                        LAG(location) OVER (ORDER BY received_at)
                    )
                ) / 1000 as distance_km
            FROM location_data
            WHERE vehicle_id = $1
            AND received_at BETWEEN $2 AND $3
        `, [vehicleId, from, to]);
        
        res.json({
            vehicle_id: vehicleId,
            from,
            to,
            distance_km: parseFloat(result.rows[0].distance_km || 0).toFixed(2)
        });
    } catch (err) {
        console.error('Error calculating distance:', err);
        res.status(500).json({ error: err.message });
    }
});

// Hourly statistics (using TimescaleDB continuous aggregate)
router.get('/hourly/:vehicleId', async (req, res) => {
    try {
        const { pool } = req.app.locals;
        const { vehicleId } = req.params;
        const { from, to } = req.query;
        
        let query = `
            SELECT 
                hour,
                data_points,
                avg_speed,
                max_speed,
                min_satellites,
                avg_satellites
            FROM location_hourly
            WHERE vehicle_id = $1
        `;
        const params = [vehicleId];
        
        if (from) {
            params.push(from);
            query += ` AND hour >= $${params.length}`;
        }
        if (to) {
            params.push(to);
            query += ` AND hour <= $${params.length}`;
        }
        
        query += ' ORDER BY hour DESC';
        
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching hourly stats:', err);
        res.status(500).json({ error: err.message });
    }
});

// Geofence analytics
router.get('/geofence-summary', async (req, res) => {
    try {
        const { pool } = req.app.locals;
        const { from, to } = req.query;
        
        let query = `
            SELECT 
                g.id as geofence_id,
                g.name as geofence_name,
                COUNT(DISTINCT ge.vehicle_id) as unique_vehicles,
                COUNT(*) as total_events,
                COUNT(*) FILTER (WHERE ge.event_type = 'inside') as entries,
                COUNT(*) FILTER (WHERE ge.event_type = 'exit') as exits
            FROM geofences g
            LEFT JOIN geofence_events ge ON g.id = ge.geofence_id
        `;
        
        const params = [];
        const conditions = ['g.is_active = true'];
        
        if (from) {
            params.push(from);
            conditions.push(`ge.timestamp >= $${params.length}`);
        }
        if (to) {
            params.push(to);
            conditions.push(`ge.timestamp <= $${params.length}`);
        }
        
        query += ' WHERE ' + conditions.join(' AND ');
        query += ' GROUP BY g.id, g.name ORDER BY total_events DESC';
        
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching geofence summary:', err);
        res.status(500).json({ error: err.message });
    }
});

// Speed violations
router.get('/speed-violations', async (req, res) => {
    try {
        const { pool } = req.app.locals;
        const { speed_limit = 80, from, to } = req.query;
        
        let query = `
            SELECT 
                v.id as vehicle_id,
                v.vehicle_number,
                l.speed,
                l.latitude,
                l.longitude,
                l.timestamp,
                l.received_at
            FROM location_data l
            JOIN vehicles v ON l.vehicle_id = v.id
            WHERE l.speed > $1
        `;
        const params = [speed_limit];
        
        if (from) {
            params.push(from);
            query += ` AND l.received_at >= $${params.length}`;
        }
        if (to) {
            params.push(to);
            query += ` AND l.received_at <= $${params.length}`;
        }
        
        query += ' ORDER BY l.received_at DESC LIMIT 500';
        
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching speed violations:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
