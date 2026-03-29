CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'balance_side') THEN
        CREATE TYPE balance_side AS ENUM ('DR', 'CR');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transaction_direction') THEN
        CREATE TYPE transaction_direction AS ENUM ('INCOMING', 'OUTGOING');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transaction_party_type') THEN
        CREATE TYPE transaction_party_type AS ENUM ('CUSTOMER', 'VENDOR');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS self_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL UNIQUE,
    account_type VARCHAR(80),
    opening_balance NUMERIC(18,4) NOT NULL DEFAULT 0,
    opening_balance_side balance_side NOT NULL DEFAULT 'DR',
    opening_balance_date DATE NOT NULL,
    note TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS self_account_id UUID REFERENCES self_accounts(id);

ALTER TABLE party_ledger_payments
    ADD COLUMN IF NOT EXISTS self_account_id UUID REFERENCES self_accounts(id);

CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_date DATE NOT NULL,
    direction transaction_direction NOT NULL,
    amount NUMERIC(18,4) NOT NULL,
    payment_mode VARCHAR(30),
    description TEXT,
    reference_type VARCHAR(40) NOT NULL,
    reference_id UUID,
    party_type transaction_party_type,
    party_id UUID,
    self_account_id UUID REFERENCES self_accounts(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_bill_payment_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    party_ledger_payment_id UUID NOT NULL REFERENCES party_ledger_payments(id),
    purchase_bill_id UUID NOT NULL REFERENCES purchase_bills(id),
    allocated_amount NUMERIC(18,4) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_purchase_bill_payment_allocation UNIQUE (party_ledger_payment_id, purchase_bill_id)
);

CREATE INDEX IF NOT EXISTS idx_self_accounts_active_name ON self_accounts(is_active, name);
CREATE INDEX IF NOT EXISTS idx_transactions_date_direction ON transactions(transaction_date DESC, direction);
CREATE INDEX IF NOT EXISTS idx_transactions_reference ON transactions(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_transactions_party ON transactions(party_type, party_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_self_account ON transactions(self_account_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_bill_payment_alloc_payment ON purchase_bill_payment_allocations(party_ledger_payment_id);
CREATE INDEX IF NOT EXISTS idx_purchase_bill_payment_alloc_bill ON purchase_bill_payment_allocations(purchase_bill_id);
