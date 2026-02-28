const express = require('express');
const router = express.Router();

// Get all geofences
router.get('/', async (req, res) => {
    try {
        const { pool } = req.app.locals;
        const { active_only } = req.query;
        
        let query = `
            SELECT 
                id, 
                name, 
                description, 
                fence_type, 
                center_lat, 
                center_lon, 
                radius_meters, 
                ST_AsGeoJSON(geometry) as geometry, 
                is_active,
                created_at
            FROM geofences
        `;
        
        if (active_only === 'true') {
            query += ' WHERE is_active = true';
        }
        
        query += ' ORDER BY name';
        
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching geofences:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get geofence by ID
router.get('/:id', async (req, res) => {
    try {
        const { pool } = req.app.locals;
        const { id } = req.params;
        
        const result = await pool.query(`
            SELECT 
                id, 
                name, 
                description, 
                fence_type, 
                center_lat, 
                center_lon, 
                radius_meters, 
                ST_AsGeoJSON(geometry) as geometry, 
                is_active,
                created_at
            FROM geofences
            WHERE id = $1
        `, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Geofence not found' });
        }
        
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error fetching geofence:', err);
        res.status(500).json({ error: err.message });
    }
});

// Create new geofence
router.post('/', async (req, res) => {
    try {
        const { pool } = req.app.locals;
        const { name, description, fence_type, center_lat, center_lon, radius_meters, polygon_coords } = req.body;
        
        if (!name || !fence_type) {
            return res.status(400).json({ error: 'name and fence_type are required' });
        }
        
        let result;
        
        if (fence_type === 'circle') {
            if (!center_lat || !center_lon || !radius_meters) {
                return res.status(400).json({ error: 'center_lat, center_lon, and radius_meters are required for circle geofence' });
            }
            
            result = await pool.query(`
                INSERT INTO geofences (name, description, fence_type, center_lat, center_lon, radius_meters)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING id, name, description, fence_type, center_lat, center_lon, radius_meters, is_active, created_at
            `, [name, description, fence_type, center_lat, center_lon, radius_meters]);
        } else if (fence_type === 'polygon') {
            if (!polygon_coords || !Array.isArray(polygon_coords) || polygon_coords.length < 3) {
                return res.status(400).json({ error: 'polygon_coords must be an array of at least 3 [lon, lat] pairs' });
            }
            
            // Close the polygon if not already closed
            const coords = [...polygon_coords];
            if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
                coords.push(coords[0]);
            }
            
            const wkt = `POLYGON((${coords.map(c => `${c[0]} ${c[1]}`).join(', ')}))`;
            
            result = await pool.query(`
                INSERT INTO geofences (name, description, fence_type, geometry)
                VALUES ($1, $2, $3, ST_GeogFromText($4))
                RETURNING id, name, description, fence_type, ST_AsGeoJSON(geometry) as geometry, is_active, created_at
            `, [name, description, fence_type, wkt]);
        } else {
            return res.status(400).json({ error: 'fence_type must be either "circle" or "polygon"' });
        }
        
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating geofence:', err);
        res.status(500).json({ error: err.message });
    }
});

// Update geofence
router.put('/:id', async (req, res) => {
    try {
        const { pool } = req.app.locals;
        const { id } = req.params;
        const { name, description, is_active } = req.body;
        
        const result = await pool.query(`
            UPDATE geofences 
            SET 
                name = COALESCE($1, name),
                description = COALESCE($2, description),
                is_active = COALESCE($3, is_active)
            WHERE id = $4
            RETURNING id, name, description, fence_type, center_lat, center_lon, radius_meters, 
                      ST_AsGeoJSON(geometry) as geometry, is_active, created_at
        `, [name, description, is_active, id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Geofence not found' });
        }
        
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating geofence:', err);
        res.status(500).json({ error: err.message });
    }
});

// Delete geofence
router.delete('/:id', async (req, res) => {
    try {
        const { pool } = req.app.locals;
        const { id } = req.params;
        
        const result = await pool.query('DELETE FROM geofences WHERE id = $1 RETURNING *', [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Geofence not found' });
        }
        
        res.json({ message: 'Geofence deleted successfully' });
    } catch (err) {
        console.error('Error deleting geofence:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get geofence events (entries/exits)
router.get('/:id/events', async (req, res) => {
    try {
        const { pool } = req.app.locals;
        const { id } = req.params;
        const { from, to, vehicle_id, limit = 100 } = req.query;
        
        let query = `
            SELECT 
                ge.id,
                ge.vehicle_id,
                v.vehicle_number,
                ge.event_type,
                ST_Y(ge.location::geometry) as latitude,
                ST_X(ge.location::geometry) as longitude,
                ge.timestamp
            FROM geofence_events ge
            JOIN vehicles v ON ge.vehicle_id = v.id
            WHERE ge.geofence_id = $1
        `;
        const params = [id];
        
        if (from) {
            params.push(from);
            query += ` AND ge.timestamp >= $${params.length}`;
        }
        if (to) {
            params.push(to);
            query += ` AND ge.timestamp <= $${params.length}`;
        }
        if (vehicle_id) {
            params.push(vehicle_id);
            query += ` AND ge.vehicle_id = $${params.length}`;
        }
        
        query += ` ORDER BY ge.timestamp DESC LIMIT $${params.length + 1}`;
        params.push(limit);
        
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching geofence events:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get geofence statistics
router.get('/:id/stats', async (req, res) => {
    try {
        const { pool } = req.app.locals;
        const { id } = req.params;
        const { from, to } = req.query;
        
        let query = `
            SELECT 
                vehicle_id,
                v.vehicle_number,
                COUNT(*) as total_events,
                COUNT(*) FILTER (WHERE event_type = 'inside') as entries,
                COUNT(*) FILTER (WHERE event_type = 'exit') as exits,
                MIN(timestamp) as first_event,
                MAX(timestamp) as last_event
            FROM geofence_events ge
            JOIN vehicles v ON ge.vehicle_id = v.id
            WHERE ge.geofence_id = $1
        `;
        const params = [id];
        
        if (from) {
            params.push(from);
            query += ` AND ge.timestamp >= $${params.length}`;
        }
        if (to) {
            params.push(to);
            query += ` AND ge.timestamp <= $${params.length}`;
        }
        
        query += ` GROUP BY vehicle_id, v.vehicle_number ORDER BY total_events DESC`;
        
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching geofence stats:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
