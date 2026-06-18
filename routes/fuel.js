const express = require('express');
const router = express.Router();

// Valid fuel-sensor voltage range. Readings of 0V (no signal) and ~28V (sensor disconnect/error)
// are skipped; the real measurement range is 0-5V (a little headroom for near-full noise).
const VALID_VOLTAGE = 'voltage > 0 AND voltage <= 5.5';

// Get live fuel levels for all vehicles
router.get('/live', async (req, res) => {
    try {
        const { pool } = req.app.locals;
        
        const result = await pool.query(`
            SELECT 
                v.id as vehicle_id,
                v.vehicle_number,
                v.imei,
                v.fuel_tank_capacity,
                f.fuel_level,
                f.voltage,
                f.raw_value,
                f.received_at
            FROM vehicles v
            LEFT JOIN LATERAL (
                SELECT fuel_level, voltage, raw_value, received_at
                FROM fuel_data
                WHERE vehicle_id = v.id AND ${VALID_VOLTAGE}
                ORDER BY received_at DESC
                LIMIT 1
            ) f ON true
            WHERE v.is_active = true
            ORDER BY v.vehicle_number
        `);
        
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching live fuel data:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get fuel history for a vehicle
router.get('/history/:vehicleId', async (req, res) => {
    try {
        const { pool } = req.app.locals;
        const { vehicleId } = req.params;
        const { from, to, limit = 1000 } = req.query;
        
        let query = `
            SELECT
                fuel_level,
                voltage,
                raw_value,
                received_at
            FROM fuel_data
            WHERE vehicle_id = $1 AND ${VALID_VOLTAGE}
        `;
        const params = [vehicleId];
        
        if (from) {
            params.push(from);
            query += ` AND received_at >= $${params.length}`;
        }
        if (to) {
            params.push(to);
            query += ` AND received_at <= $${params.length}`;
        }
        
        query += ` ORDER BY received_at DESC LIMIT $${params.length + 1}`;
        params.push(limit);
        
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching fuel history:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get fuel consumption analysis
router.get('/consumption/:vehicleId', async (req, res) => {
    try {
        const { pool } = req.app.locals;
        const { vehicleId } = req.params;
        const { from, to } = req.query;
        
        if (!from || !to) {
            return res.status(400).json({ error: 'from and to timestamps are required' });
        }
        
        const result = await pool.query(`
            SELECT 
                MIN(fuel_level) as min_fuel,
                MAX(fuel_level) as max_fuel,
                AVG(fuel_level) as avg_fuel,
                MAX(fuel_level) - MIN(fuel_level) as fuel_consumed,
                COUNT(*) as data_points
            FROM fuel_data
            WHERE vehicle_id = $1
            AND received_at BETWEEN $2 AND $3
            AND ${VALID_VOLTAGE}
        `, [vehicleId, from, to]);
        
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error calculating fuel consumption:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
