BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE sales_final_invoices
    ADD COLUMN IF NOT EXISTS e_invoice_number VARCHAR(120),
    ADD COLUMN IF NOT EXISTS gst_invoice_number VARCHAR(120),
    ADD COLUMN IF NOT EXISTS eway_bill_number VARCHAR(120);

ALTER TABLE sales_final_invoices
    ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(40) DEFAULT 'pending';

CREATE TABLE IF NOT EXISTS invoice_assignment_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id UUID NOT NULL REFERENCES warehouses(id),
    batch_code VARCHAR(120) NOT NULL UNIQUE,
    created_by_user_id UUID NULL REFERENCES users(id),
    status VARCHAR(40) NOT NULL DEFAULT 'PACKERS_ASSIGNED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoice_assignment_batch_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES invoice_assignment_batches(id) ON DELETE CASCADE,
    sales_final_invoice_id UUID NOT NULL REFERENCES sales_final_invoices(id),
    assigned_packer_id UUID NOT NULL REFERENCES employees(id),
    assigned_supervisor_id UUID NOT NULL REFERENCES employees(id),
    status VARCHAR(40) NOT NULL DEFAULT 'PACKERS_ASSIGNED',
    requested_verification_at TIMESTAMPTZ NULL,
    verified_at TIMESTAMPTZ NULL,
    verified_by UUID NULL REFERENCES users(id),
    rejected_at TIMESTAMPTZ NULL,
    rejected_by UUID NULL REFERENCES users(id),
    rejection_note TEXT NULL,
    ready_for_dispatch_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_batch_invoice UNIQUE (batch_id, sales_final_invoice_id)
);

CREATE TABLE IF NOT EXISTS invoice_execution_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_invoice_id UUID NOT NULL REFERENCES invoice_assignment_batch_invoices(id) ON DELETE CASCADE,
    sales_final_invoice_item_id UUID NOT NULL REFERENCES sales_final_invoice_items(id),
    product_id UUID NOT NULL REFERENCES products(id),
    original_quantity NUMERIC(18,4) NOT NULL,
    actual_quantity NUMERIC(18,4) NOT NULL,
    shortfall_quantity NUMERIC(18,4) NOT NULL DEFAULT 0,
    shortfall_reason VARCHAR(60) NULL,
    supervisor_decision VARCHAR(40) NULL,
    supervisor_note TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_invoice_execution_item UNIQUE (batch_invoice_id, sales_final_invoice_item_id)
);

CREATE TABLE IF NOT EXISTS invoice_packing_outputs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_invoice_id UUID NOT NULL REFERENCES invoice_assignment_batch_invoices(id) ON DELETE CASCADE,
    total_boxes_or_bags INTEGER NOT NULL DEFAULT 0,
    loose_cases INTEGER NOT NULL DEFAULT 0,
    full_cases INTEGER NOT NULL DEFAULT 0,
    packing_note TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_invoice_packing_output UNIQUE (batch_invoice_id)
);

CREATE TABLE IF NOT EXISTS user_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(60) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    entity_type VARCHAR(80) NULL,
    entity_id UUID NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    read_at TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS invoice_shortfall_returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_invoice_id UUID NOT NULL REFERENCES invoice_assignment_batch_invoices(id) ON DELETE CASCADE,
    sales_final_invoice_item_id UUID NOT NULL REFERENCES sales_final_invoice_items(id),
    returned_sales_order_id UUID NOT NULL REFERENCES sales_orders(id),
    returned_sales_order_item_id UUID NULL REFERENCES sales_order_items(id),
    product_id UUID NOT NULL REFERENCES products(id),
    quantity NUMERIC(18,4) NOT NULL,
    reason VARCHAR(60) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_final_invoices_delivery_status
    ON sales_final_invoices (delivery_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoice_assignment_batches_wh_status
    ON invoice_assignment_batches (warehouse_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoice_assignment_batch_invoices_status
    ON invoice_assignment_batch_invoices (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoice_assignment_batch_invoices_packer
    ON invoice_assignment_batch_invoices (assigned_packer_id, status);
CREATE INDEX IF NOT EXISTS idx_invoice_assignment_batch_invoices_supervisor
    ON invoice_assignment_batch_invoices (assigned_supervisor_id, status);
CREATE INDEX IF NOT EXISTS idx_invoice_assignment_batch_invoices_invoice
    ON invoice_assignment_batch_invoices (sales_final_invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_execution_items_batch_invoice
    ON invoice_execution_items (batch_invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_shortfall_returns_batch_invoice
    ON invoice_shortfall_returns (batch_invoice_id);
CREATE INDEX IF NOT EXISTS idx_user_notifications_user_unread
    ON user_notifications (user_id, is_read, created_at DESC);

COMMIT;
