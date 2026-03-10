BEGIN;

ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7),
    ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7);

ALTER TABLE delivery_runs
    ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES vehicles(id),
    ADD COLUMN IF NOT EXISTS driver_id UUID REFERENCES employees(id),
    ADD COLUMN IF NOT EXISTS in_vehicle_employee_id UUID REFERENCES employees(id),
    ADD COLUMN IF NOT EXISTS bill_manager_id UUID REFERENCES employees(id),
    ADD COLUMN IF NOT EXISTS loader_id UUID REFERENCES employees(id),
    ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS status VARCHAR(40) NOT NULL DEFAULT 'VEHICLE_ALLOCATED',
    ADD COLUMN IF NOT EXISTS total_weight_grams NUMERIC(18, 4) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS optimized_route_payload TEXT,
    ADD COLUMN IF NOT EXISTS route_provider VARCHAR(60),
    ADD COLUMN IF NOT EXISTS route_generated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS loading_completed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS delivery_started_at TIMESTAMPTZ;

ALTER TABLE delivery_run_stops
    ALTER COLUMN sales_order_id DROP NOT NULL;

ALTER TABLE delivery_run_stops
    ADD COLUMN IF NOT EXISTS sales_final_invoice_id UUID REFERENCES sales_final_invoices(id),
    ADD COLUMN IF NOT EXISTS sequence_no INTEGER,
    ADD COLUMN IF NOT EXISTS loading_sequence_no INTEGER,
    ADD COLUMN IF NOT EXISTS distance_meters NUMERIC(18, 2),
    ADD COLUMN IF NOT EXISTS duration_seconds INTEGER,
    ADD COLUMN IF NOT EXISTS status VARCHAR(40) NOT NULL DEFAULT 'VEHICLE_ALLOCATED',
    ADD COLUMN IF NOT EXISTS loaded_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS failure_reason TEXT,
    ADD COLUMN IF NOT EXISTS customer_latitude NUMERIC(10, 7),
    ADD COLUMN IF NOT EXISTS customer_longitude NUMERIC(10, 7);

CREATE TABLE IF NOT EXISTS delivery_run_source_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_run_id UUID NOT NULL REFERENCES delivery_runs(id) ON DELETE CASCADE,
    invoice_assignment_batch_id UUID NOT NULL REFERENCES invoice_assignment_batches(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_delivery_run_source_batch UNIQUE (delivery_run_id, invoice_assignment_batch_id)
);

CREATE INDEX IF NOT EXISTS idx_delivery_runs_wh_date_status
    ON delivery_runs (warehouse_id, run_date, status);
CREATE INDEX IF NOT EXISTS idx_delivery_run_stops_invoice
    ON delivery_run_stops (sales_final_invoice_id);
CREATE INDEX IF NOT EXISTS idx_delivery_run_stops_status
    ON delivery_run_stops (status);
CREATE INDEX IF NOT EXISTS idx_delivery_run_stops_sequence
    ON delivery_run_stops (sequence_no);
CREATE INDEX IF NOT EXISTS idx_delivery_run_stops_loading_sequence
    ON delivery_run_stops (loading_sequence_no);

COMMIT;
