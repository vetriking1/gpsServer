const express = require('express');
const router = express.Router();

// ---- Expense types (item 14: add option) ----

// List expense types
router.get('/types', async (req, res) => {
    try {
        const { pool } = req.app.locals;
        const { active_only } = req.query;
        let query = 'SELECT id, name, is_active FROM expense_types';
        if (active_only === 'true') query += ' WHERE is_active = true';
        query += ' ORDER BY name';
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching expense types:', err);
        res.status(500).json({ error: err.message });
    }
});

// Add a new expense type
router.post('/types', async (req, res) => {
    try {
        const { pool } = req.app.locals;
        const name = (req.body.name || '').trim();
        if (!name) return res.status(400).json({ error: 'name is required' });

        const result = await pool.query(
            `INSERT INTO expense_types (name) VALUES ($1)
             ON CONFLICT (name) DO UPDATE SET is_active = true
             RETURNING id, name, is_active`,
            [name]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating expense type:', err);
        res.status(500).json({ error: err.message });
    }
});

// ---- Expenses ----

// List expenses (filter by date range / vehicle / type)
router.get('/', async (req, res) => {
    try {
        const { pool } = req.app.locals;
        const { from, to, vehicle_id, type_id, limit = 500 } = req.query;

        let query = `
            SELECT
                e.id,
                e.expense_category,
                e.vehicle_id,
                e.vehicle_number,
                e.name,
                e.expense_type_id,
                t.name AS expense_type,
                e.quantity,
                e.amount,
                e.payment_mode,
                e.expense_date,
                e.notes,
                e.created_at
            FROM expenses e
            LEFT JOIN expense_types t ON e.expense_type_id = t.id
        `;
        const params = [];
        const conditions = [];

        if (from) { params.push(from); conditions.push(`e.expense_date >= $${params.length}`); }
        if (to) { params.push(to); conditions.push(`e.expense_date <= $${params.length}`); }
        if (vehicle_id) { params.push(vehicle_id); conditions.push(`e.vehicle_id = $${params.length}`); }
        if (type_id) { params.push(type_id); conditions.push(`e.expense_type_id = $${params.length}`); }

        if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
        params.push(limit);
        query += ` ORDER BY e.expense_date DESC, e.id DESC LIMIT $${params.length}`;

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching expenses:', err);
        res.status(500).json({ error: err.message });
    }
});

// Create an expense
router.post('/', async (req, res) => {
    try {
        const { pool } = req.app.locals;
        const {
            expense_category = 'vehicle',
            vehicle_id = null,
            vehicle_number = null,
            name = null,
            expense_type_id = null,
            quantity = null,
            amount,
            payment_mode = null,
            expense_date = null,
            notes = null,
        } = req.body;

        if (amount == null || isNaN(Number(amount))) {
            return res.status(400).json({ error: 'amount is required' });
        }

        const result = await pool.query(
            `INSERT INTO expenses
                (expense_category, vehicle_id, vehicle_number, name, expense_type_id,
                 quantity, amount, payment_mode, expense_date, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, CURRENT_DATE), $10)
             RETURNING id`,
            [
                expense_category, vehicle_id, vehicle_number, name, expense_type_id,
                quantity, amount, payment_mode, expense_date, notes,
            ]
        );
        res.status(201).json({ id: result.rows[0].id });
    } catch (err) {
        console.error('Error creating expense:', err);
        res.status(500).json({ error: err.message });
    }
});

// Delete an expense
router.delete('/:id', async (req, res) => {
    try {
        const { pool } = req.app.locals;
        const result = await pool.query('DELETE FROM expenses WHERE id = $1 RETURNING id', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Expense not found' });
        res.json({ message: 'Expense deleted' });
    } catch (err) {
        console.error('Error deleting expense:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
