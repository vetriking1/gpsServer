const express = require('express');
const { cleanGpsRoute } = require('../services/gpsCleaning');

const router = express.Router();

// TTL cache for cleaned (map-matched) routes — map-matching is the expensive part. Historical days
// don't change, so cache for a few hours; the in-memory map is cheap (a few arrays per vehicle-day).
const cleanCache = new Map(); // key -> { at, data }
const CLEAN_TTL_MS = 6 * 60 * 60 * 1000;
function cleanCacheGet(key) {
    const e = cleanCache.get(key);
    if (e && Date.now() - e.at < CLEAN_TTL_MS) return e.data;
    if (e) cleanCache.delete(key);
    return null;
}

// Get live locations (from cache)
router.get('/live', (req, res) => {
    const { liveLocations } = req.app.locals;
    const locations = Array.from(liveLocations.values());
    res.json(locations);
});

// Get vehicle location at specific time
router.get('/at-time', async (req, res) => {
    try {
        const { pool } = req.app.locals;
        const { timestamp, vehicle_id } = req.query;
        
        if (!timestamp) {
            return res.status(400).json({ error: 'timestamp parameter is required' });
        }
        
        let query = `
            SELECT 
                v.id as vehicle_id,
                v.vehicle_number,
                v.imei,
                v.fuel_tank_capacity,
                l.latitude,
                l.longitude,
                l.speed,
                l.course,
                l.satellites,
                l.timestamp,
                l.received_at,
                f.fuel_level
            FROM vehicles v
            LEFT JOIN LATERAL (
                SELECT latitude, longitude, speed, course, satellites, timestamp, received_at
                FROM location_data
                WHERE vehicle_id = v.id 
                AND received_at <= $1
                ORDER BY received_at DESC
                LIMIT 1
            ) l ON true
            LEFT JOIN LATERAL (
                SELECT fuel_level
                FROM fuel_data
                WHERE vehicle_id = v.id
                AND received_at <= $1
                ORDER BY received_at DESC
                LIMIT 1
            ) f ON true
            WHERE v.is_active = true
        `;
        
        const params = [timestamp];
        
        if (vehicle_id) {
            query += ' AND v.id = $2';
            params.push(vehicle_id);
        }
        
        query += ' ORDER BY v.vehicle_number';
        
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching locations at time:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get vehicle history
router.get('/history/:vehicleId', async (req, res) => {
    try {
        const { pool } = req.app.locals;
        const { vehicleId } = req.params;
        const { from, to, limit = 1000 } = req.query;
        
        let query = `
            SELECT 
                latitude, 
                longitude, 
                speed, 
                course, 
                satellites, 
                timestamp, 
                received_at
            FROM location_data
            WHERE vehicle_id = $1
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
        console.error('Error fetching location history:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get route between two timestamps
router.get('/route/:vehicleId', async (req, res) => {
    try {
        const { pool } = req.app.locals;
        const { vehicleId } = req.params;
        const { from, to } = req.query;
        
        if (!from || !to) {
            return res.status(400).json({ error: 'from and to timestamps are required' });
        }
        
        const result = await pool.query(`
            SELECT 
                latitude, 
                longitude, 
                speed, 
                course, 
                satellites, 
                timestamp, 
                received_at
            FROM location_data
            WHERE vehicle_id = $1
            AND received_at BETWEEN $2 AND $3
            ORDER BY received_at ASC
        `, [vehicleId, from, to]);

        const raw = result.rows;
        if (req.query.raw === 'true') {
            return res.json(raw);
        }

        // Cache cleaned (map-matched) results so repeated day views don't re-hit Valhalla.
        const cacheKey = `${vehicleId}|${from}|${to}`;
        const hit = cleanCacheGet(cacheKey);
        if (hit) {
            return res.json(hit);
        }
        const cleaned = await cleanGpsRoute(raw);
        cleanCache.set(cacheKey, { at: Date.now(), data: cleaned });
        res.json(cleaned);
    } catch (err) {
        console.error('Error fetching route:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
