-- Migration: add vehicle finance, insurance, and road tax fields
-- Run this on existing databases

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'vehicles' AND column_name = 'wheels_count'
    ) THEN
        ALTER TABLE vehicles ADD COLUMN wheels_count INTEGER;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'vehicles' AND column_name = 'emi_per_month'
    ) THEN
        ALTER TABLE vehicles ADD COLUMN emi_per_month NUMERIC(12,2);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'vehicles' AND column_name = 'emi_end_date'
    ) THEN
        ALTER TABLE vehicles ADD COLUMN emi_end_date DATE;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'vehicles' AND column_name = 'insurance_due_date'
    ) THEN
        ALTER TABLE vehicles ADD COLUMN insurance_due_date DATE;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'vehicles' AND column_name = 'insurance_amount'
    ) THEN
        ALTER TABLE vehicles ADD COLUMN insurance_amount NUMERIC(12,2);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'vehicles' AND column_name = 'road_tax_due_date'
    ) THEN
        ALTER TABLE vehicles ADD COLUMN road_tax_due_date DATE;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'vehicles' AND column_name = 'road_tax_amount'
    ) THEN
        ALTER TABLE vehicles ADD COLUMN road_tax_amount NUMERIC(12,2);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_vehicles_insurance_due_date ON vehicles(insurance_due_date);
CREATE INDEX IF NOT EXISTS idx_vehicles_road_tax_due_date ON vehicles(road_tax_due_date);
CREATE INDEX IF NOT EXISTS idx_vehicles_emi_end_date ON vehicles(emi_end_date);
