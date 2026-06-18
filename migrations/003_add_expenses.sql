-- Migration: Expense page (items 14 "Types add option", 15 "Quantity NOS")
-- Run on existing databases:  psql -U gps_user -d gps_tracker -f migrations/003_add_expenses.sql

-- 1. Expense types (user-extendable — item 14 "Types add option")
CREATE TABLE IF NOT EXISTS expense_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(80) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed the default types (idempotent)
INSERT INTO expense_types (name) VALUES
    ('Fuel'),
    ('Oil'),
    ('Tyres'),
    ('Maintenance / Repair'),
    ('Driver Bata')
ON CONFLICT (name) DO NOTHING;

-- 2. Expenses
CREATE TABLE IF NOT EXISTS expenses (
    id SERIAL PRIMARY KEY,
    expense_category VARCHAR(20) NOT NULL DEFAULT 'vehicle', -- 'vehicle' | 'others'
    vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
    vehicle_number VARCHAR(20),            -- denormalized for display / 'others'
    name VARCHAR(120),                     -- driver name (vehicle) or label (others)
    expense_type_id INTEGER REFERENCES expense_types(id) ON DELETE SET NULL,
    quantity NUMERIC(12,2),                -- Quantity in NOS / units (item 15 — e.g. tyres count)
    amount NUMERIC(12,2) NOT NULL,
    payment_mode VARCHAR(20),              -- 'Cash' | 'UPI' | 'Bank Transfer'
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_vehicle ON expenses(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_expenses_type ON expenses(expense_type_id);

-- Permissions (consistent with schema.sql)
GRANT ALL PRIVILEGES ON expense_types, expenses TO gps_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO gps_user;

COMMENT ON TABLE expense_types IS 'User-extendable expense type list';
COMMENT ON TABLE expenses IS 'Vehicle and other expenses';
COMMENT ON COLUMN expenses.quantity IS 'Quantity in NOS / units (e.g. number of tyres)';
