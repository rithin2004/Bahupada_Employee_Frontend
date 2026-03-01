CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'party_type') THEN
        CREATE TYPE party_type AS ENUM ('CUSTOMER', 'VENDOR');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'party_ledger_entry_kind') THEN
        CREATE TYPE party_ledger_entry_kind AS ENUM (
            'OPENING_BALANCE',
            'PURCHASE_BILL',
            'SALES_FINAL_INVOICE',
            'PAYMENT',
            'CREDIT_NOTE',
            'DEBIT_NOTE',
            'MANUAL_ADJUSTMENT'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_flow_direction') THEN
        CREATE TYPE payment_flow_direction AS ENUM ('INCOMING', 'OUTGOING');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS party_ledger_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    party_type party_type NOT NULL,
    party_id UUID NOT NULL,
    party_name_snapshot VARCHAR(200),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_party_ledger_account_party UNIQUE (party_type, party_id)
);

CREATE TABLE IF NOT EXISTS party_ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES party_ledger_accounts(id),
    entry_kind party_ledger_entry_kind NOT NULL,
    entry_date DATE NOT NULL,
    description VARCHAR(255) NOT NULL,
    reference_type VARCHAR(40) NOT NULL,
    reference_id UUID,
    admin_debit NUMERIC(18,4) NOT NULL DEFAULT 0,
    admin_credit NUMERIC(18,4) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_party_ledger_entry_reference UNIQUE (account_id, entry_kind, reference_type, reference_id)
);

CREATE TABLE IF NOT EXISTS party_ledger_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES party_ledger_accounts(id),
    direction payment_flow_direction NOT NULL,
    amount NUMERIC(18,4) NOT NULL,
    payment_mode VARCHAR(30),
    payment_date DATE NOT NULL,
    reference_no VARCHAR(120),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_party_ledger_accounts_party
    ON party_ledger_accounts (party_type, party_id);
CREATE INDEX IF NOT EXISTS idx_party_ledger_entries_account_date
    ON party_ledger_entries (account_id, entry_date ASC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_party_ledger_entries_reference
    ON party_ledger_entries (reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_party_ledger_payments_account_date
    ON party_ledger_payments (account_id, payment_date DESC);

INSERT INTO party_ledger_accounts (party_type, party_id, party_name_snapshot)
SELECT 'VENDOR'::party_type, v.id, v.name
FROM vendors v
WHERE EXISTS (
    SELECT 1 FROM purchase_bills pb WHERE pb.vendor_id = v.id
)
ON CONFLICT (party_type, party_id) DO UPDATE
SET party_name_snapshot = EXCLUDED.party_name_snapshot,
    updated_at = NOW();

INSERT INTO party_ledger_accounts (party_type, party_id, party_name_snapshot)
SELECT 'CUSTOMER'::party_type, c.id, c.name
FROM customers c
WHERE EXISTS (
    SELECT 1
    FROM sales_final_invoices sfi
    JOIN sales_orders so ON so.id = sfi.sales_order_id
    WHERE so.customer_id = c.id
)
OR EXISTS (
    SELECT 1 FROM payments p WHERE p.customer_id = c.id
)
ON CONFLICT (party_type, party_id) DO UPDATE
SET party_name_snapshot = EXCLUDED.party_name_snapshot,
    updated_at = NOW();

INSERT INTO party_ledger_entries (
    account_id,
    entry_kind,
    entry_date,
    description,
    reference_type,
    reference_id,
    admin_debit,
    admin_credit
)
SELECT
    pla.id,
    'PURCHASE_BILL'::party_ledger_entry_kind,
    pb.bill_date,
    'Purchase Bill ' || COALESCE(pb.bill_number, '-'),
    'purchase_bill',
    pb.id,
    0,
    COALESCE(items.bill_total, 0)
FROM purchase_bills pb
JOIN party_ledger_accounts pla
  ON pla.party_type = 'VENDOR'::party_type
 AND pla.party_id = pb.vendor_id
JOIN (
    SELECT purchase_bill_id, COALESCE(SUM(COALESCE(quantity, 0) * COALESCE(unit_price, 0)), 0) AS bill_total
    FROM purchase_bill_items
    GROUP BY purchase_bill_id
) items
  ON items.purchase_bill_id = pb.id
LEFT JOIN party_ledger_entries existing
  ON existing.account_id = pla.id
 AND existing.entry_kind = 'PURCHASE_BILL'::party_ledger_entry_kind
 AND existing.reference_type = 'purchase_bill'
 AND existing.reference_id = pb.id
WHERE existing.id IS NULL
  AND COALESCE(items.bill_total, 0) > 0;

INSERT INTO party_ledger_entries (
    account_id,
    entry_kind,
    entry_date,
    description,
    reference_type,
    reference_id,
    admin_debit,
    admin_credit
)
SELECT
    pla.id,
    'SALES_FINAL_INVOICE'::party_ledger_entry_kind,
    sfi.invoice_date,
    'Sales Invoice ' || COALESCE(sfi.invoice_number, '-'),
    'sales_final_invoice',
    sfi.id,
    COALESCE(sfi.total_amount, 0),
    0
FROM sales_final_invoices sfi
JOIN sales_orders so ON so.id = sfi.sales_order_id
JOIN party_ledger_accounts pla
  ON pla.party_type = 'CUSTOMER'::party_type
 AND pla.party_id = so.customer_id
LEFT JOIN party_ledger_entries existing
  ON existing.account_id = pla.id
 AND existing.entry_kind = 'SALES_FINAL_INVOICE'::party_ledger_entry_kind
 AND existing.reference_type = 'sales_final_invoice'
 AND existing.reference_id = sfi.id
WHERE existing.id IS NULL
  AND COALESCE(sfi.total_amount, 0) > 0;

INSERT INTO party_ledger_entries (
    account_id,
    entry_kind,
    entry_date,
    description,
    reference_type,
    reference_id,
    admin_debit,
    admin_credit
)
SELECT
    pla.id,
    'PAYMENT'::party_ledger_entry_kind,
    COALESCE(p.payment_date, DATE(p.created_at)),
    'Receipt' || COALESCE(' ' || p.reference_type, ''),
    'legacy_payment',
    p.id,
    0,
    COALESCE(p.amount, 0)
FROM payments p
JOIN party_ledger_accounts pla
  ON pla.party_type = 'CUSTOMER'::party_type
 AND pla.party_id = p.customer_id
LEFT JOIN party_ledger_entries existing
  ON existing.account_id = pla.id
 AND existing.entry_kind = 'PAYMENT'::party_ledger_entry_kind
 AND existing.reference_type = 'legacy_payment'
 AND existing.reference_id = p.id
WHERE existing.id IS NULL
  AND COALESCE(p.amount, 0) > 0;
