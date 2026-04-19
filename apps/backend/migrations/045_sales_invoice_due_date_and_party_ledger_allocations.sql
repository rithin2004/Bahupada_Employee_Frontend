-- Sales invoice due date (credit terms) + party-ledger payment links to invoices (mirrors purchase_bill_payment_allocations).

ALTER TABLE sales_final_invoices ADD COLUMN IF NOT EXISTS due_date DATE;

UPDATE sales_final_invoices SET due_date = invoice_date WHERE due_date IS NULL;

ALTER TABLE sales_final_invoices ALTER COLUMN due_date SET NOT NULL;

CREATE TABLE IF NOT EXISTS sales_final_invoice_party_ledger_payment_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    party_ledger_payment_id UUID NOT NULL REFERENCES party_ledger_payments(id) ON DELETE CASCADE,
    sales_final_invoice_id UUID NOT NULL REFERENCES sales_final_invoices(id),
    allocated_amount NUMERIC(18,4) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_sf_invoice_party_ledger_payment UNIQUE (party_ledger_payment_id, sales_final_invoice_id)
);

CREATE INDEX IF NOT EXISTS idx_sf_inv_party_ledger_alloc_payment
    ON sales_final_invoice_party_ledger_payment_allocations (party_ledger_payment_id);
CREATE INDEX IF NOT EXISTS idx_sf_inv_party_ledger_alloc_invoice
    ON sales_final_invoice_party_ledger_payment_allocations (sales_final_invoice_id);
