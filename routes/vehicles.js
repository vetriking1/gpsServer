const express = require('express');
const router = express.Router();

function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
}

function normalizeString(value) {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const trimmed = String(value).trim();
    return trimmed === '' ? null : trimmed;
}

function normalizeInteger(value) {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
}

function normalizeDecimal(value) {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
}

function normalizeBoolean(value) {
    if (value === undefined) return undefined;
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
}

function normalizeDate(value) {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10);
}

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
                v.wheels_count,
                v.emi_per_month,
                v.emi_end_date,
                v.insurance_due_date,
                v.insurance_amount,
                v.road_tax_due_date,
                v.road_tax_amount,
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

// Create vehicle
router.post('/', async (req, res) => {
    try {
        const { pool } = req.app.locals;
        const imei = normalizeString(req.body.imei);
        const vehicleNumber = normalizeString(req.body.vehicle_number);
        const vehicleType = normalizeString(req.body.vehicle_type);
        const driverName = normalizeString(req.body.driver_name);
        const driverPhone = normalizeString(req.body.driver_phone);
        const fuelTankCapacity = normalizeInteger(req.body.fuel_tank_capacity);
        const wheelsCount = normalizeInteger(req.body.wheels_count);
        const emiPerMonth = normalizeDecimal(req.body.emi_per_month);
        const emiEndDate = normalizeDate(req.body.emi_end_date);
        const insuranceDueDate = normalizeDate(req.body.insurance_due_date);
        const insuranceAmount = normalizeDecimal(req.body.insurance_amount);
        const roadTaxDueDate = normalizeDate(req.body.road_tax_due_date);
        const roadTaxAmount = normalizeDecimal(req.body.road_tax_amount);
        const isActive = normalizeBoolean(req.body.is_active);

        if (!imei || !vehicleNumber) {
            return res.status(400).json({ error: 'imei and vehicle_number are required' });
        }

        const result = await pool.query(`
            INSERT INTO vehicles (
                imei,
                vehicle_number,
                vehicle_type,
                driver_name,
                driver_phone,
                fuel_tank_capacity,
                wheels_count,
                emi_per_month,
                emi_end_date,
                insurance_due_date,
                insurance_amount,
                road_tax_due_date,
                road_tax_amount,
                is_active
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, COALESCE($14, true))
            RETURNING *
        `, [
            imei,
            vehicleNumber,
            vehicleType,
            driverName,
            driverPhone,
            fuelTankCapacity,
            wheelsCount,
            emiPerMonth,
            emiEndDate,
            insuranceDueDate,
            insuranceAmount,
            roadTaxDueDate,
            roadTaxAmount,
            isActive
        ]);

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating vehicle:', err);
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
        const body = req.body || {};
        const vehicleNumber = normalizeString(body.vehicle_number);
        const vehicleType = normalizeString(body.vehicle_type);
        const driverName = normalizeString(body.driver_name);
        const driverPhone = normalizeString(body.driver_phone);
        const fuelTankCapacity = normalizeInteger(body.fuel_tank_capacity);
        const wheelsCount = normalizeInteger(body.wheels_count);
        const emiPerMonth = normalizeDecimal(body.emi_per_month);
        const emiEndDate = normalizeDate(body.emi_end_date);
        const insuranceDueDate = normalizeDate(body.insurance_due_date);
        const insuranceAmount = normalizeDecimal(body.insurance_amount);
        const roadTaxDueDate = normalizeDate(body.road_tax_due_date);
        const roadTaxAmount = normalizeDecimal(body.road_tax_amount);
        const isActive = normalizeBoolean(body.is_active);
        
        const result = await pool.query(`
            UPDATE vehicles 
            SET 
                vehicle_number = CASE WHEN $1 THEN $2 ELSE vehicle_number END,
                vehicle_type = CASE WHEN $3 THEN $4 ELSE vehicle_type END,
                driver_name = CASE WHEN $5 THEN $6 ELSE driver_name END,
                driver_phone = CASE WHEN $7 THEN $8 ELSE driver_phone END,
                fuel_tank_capacity = CASE WHEN $9 THEN $10 ELSE fuel_tank_capacity END,
                wheels_count = CASE WHEN $11 THEN $12 ELSE wheels_count END,
                emi_per_month = CASE WHEN $13 THEN $14 ELSE emi_per_month END,
                emi_end_date = CASE WHEN $15 THEN $16 ELSE emi_end_date END,
                insurance_due_date = CASE WHEN $17 THEN $18 ELSE insurance_due_date END,
                insurance_amount = CASE WHEN $19 THEN $20 ELSE insurance_amount END,
                road_tax_due_date = CASE WHEN $21 THEN $22 ELSE road_tax_due_date END,
                road_tax_amount = CASE WHEN $23 THEN $24 ELSE road_tax_amount END,
                is_active = CASE WHEN $25 THEN $26 ELSE is_active END,
                updated_at = NOW()
            WHERE id = $27
            RETURNING *
        `, [
            hasOwn(body, 'vehicle_number'), vehicleNumber,
            hasOwn(body, 'vehicle_type'), vehicleType,
            hasOwn(body, 'driver_name'), driverName,
            hasOwn(body, 'driver_phone'), driverPhone,
            hasOwn(body, 'fuel_tank_capacity'), fuelTankCapacity,
            hasOwn(body, 'wheels_count'), wheelsCount,
            hasOwn(body, 'emi_per_month'), emiPerMonth,
            hasOwn(body, 'emi_end_date'), emiEndDate,
            hasOwn(body, 'insurance_due_date'), insuranceDueDate,
            hasOwn(body, 'insurance_amount'), insuranceAmount,
            hasOwn(body, 'road_tax_due_date'), roadTaxDueDate,
            hasOwn(body, 'road_tax_amount'), roadTaxAmount,
            hasOwn(body, 'is_active'), isActive,
            id
        ]);
        
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
