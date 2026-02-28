const express = require('express');
const router = express.Router();

// Get all vehicles with their current status
router.get('/', async (req, res) => {
    try {
        const { pool } = req.app.locals;
        const result = await pool.query(`
            SELECT 
                v.id, 
                v.imei, 
                v.vehicle_number, 
                v.vehicle_type, 
                v.driver_name,
                v.driver_phone,
                v.fuel_tank_capacity,
                v.is_active,
                v.created_at,
                v.updated_at,
                l.latitude as last_lat,
                l.longitude as last_lon,
                l.speed as last_speed,
                l.received_at as last_seen
            FROM vehicles v
            LEFT JOIN LATERAL (
                SELECT latitude, longitude, speed, received_at
                FROM location_data
                WHERE vehicle_id = v.id
                ORDER BY received_at DESC
                LIMIT 1
            ) l ON true
            ORDER BY v.vehicle_number
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching vehicles:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get vehicle by ID
router.get('/:id', async (req, res) => {
    try {
        const { pool } = req.app.locals;
        const { id } = req.params;
        
        const result = await pool.query(`
            SELECT 
                v.*,
                l.latitude as last_lat,
                l.longitude as last_lon,
                l.speed as last_speed,
                l.received_at as last_seen
            FROM vehicles v
            LEFT JOIN LATERAL (
                SELECT latitude, longitude, speed, received_at
                FROM location_data
                WHERE vehicle_id = v.id
                ORDER BY received_at DESC
                LIMIT 1
            ) l ON true
            WHERE v.id = $1
        `, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Vehicle not found' });
        }
        
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error fetching vehicle:', err);
        res.status(500).json({ error: err.message });
    }
});

// Update vehicle details (vehicle number, driver, etc.)
router.put('/:id', async (req, res) => {
    try {
        const { pool } = req.app.locals;
        const { id } = req.params;
        const { vehicle_number, vehicle_type, driver_name, driver_phone, fuel_tank_capacity, is_active } = req.body;
        
        const result = await pool.query(`
            UPDATE vehicles 
            SET 
                vehicle_number = COALESCE($1, vehicle_number),
                vehicle_type = COALESCE($2, vehicle_type),
                driver_name = COALESCE($3, driver_name),
                driver_phone = COALESCE($4, driver_phone),
                fuel_tank_capacity = COALESCE($5, fuel_tank_capacity),
                is_active = COALESCE($6, is_active),
                updated_at = NOW()
            WHERE id = $7
            RETURNING *
        `, [vehicle_number, vehicle_type, driver_name, driver_phone, fuel_tank_capacity, is_active, id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Vehicle not found' });
        }
        
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating vehicle:', err);
        res.status(500).json({ error: err.message });
    }
});

// Update IMEI for a vehicle
router.put('/:id/imei', async (req, res) => {
    try {
        const { pool } = req.app.locals;
        const { id } = req.params;
        const { imei } = req.body;
        
        if (!imei) {
            return res.status(400).json({ error: 'IMEI is required' });
        }
        
        const result = await pool.query(`
            UPDATE vehicles 
            SET imei = $1, updated_at = NOW()
            WHERE id = $2
            RETURNING *
        `, [imei, id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Vehicle not found' });
        }
        
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating IMEI:', err);
        res.status(500).json({ error: err.message });
    }
});

// Delete vehicle
router.delete('/:id', async (req, res) => {
    try {
        const { pool } = req.app.locals;
        const { id } = req.params;
        
        const result = await pool.query('DELETE FROM vehicles WHERE id = $1 RETURNING *', [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Vehicle not found' });
        }
        
        res.json({ message: 'Vehicle deleted successfully', vehicle: result.rows[0] });
    } catch (err) {
        console.error('Error deleting vehicle:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
