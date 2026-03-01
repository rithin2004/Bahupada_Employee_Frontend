-- Add planning and finance extension tables introduced after 005.

CREATE TABLE IF NOT EXISTS salesman_monthly_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_name VARCHAR(200) NOT NULL UNIQUE,
    month INTEGER NOT NULL,
    year INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS salesman_daily_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    monthly_plan_id UUID NOT NULL REFERENCES salesman_monthly_plans(id) ON DELETE CASCADE,
    duty_date DATE NOT NULL,
    salesman_id UUID NOT NULL REFERENCES employees(id),
    route_id UUID NOT NULL REFERENCES route_master(id),
    note TEXT NULL,
    is_override BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_salesman_daily_assignment UNIQUE (monthly_plan_id, duty_date, salesman_id)
);

CREATE TABLE IF NOT EXISTS salesman_visits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salesman_id UUID NOT NULL REFERENCES employees(id),
    customer_id UUID NOT NULL REFERENCES customers(id),
    route_id UUID NULL REFERENCES route_master(id),
    visit_date DATE NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'VISITED',
    latitude NUMERIC(10,7) NULL,
    longitude NUMERIC(10,7) NULL,
    note TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_date DATE NOT NULL,
    reference_type VARCHAR(40) NULL,
    reference_id UUID NULL,
    note TEXT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'POSTED',
    created_by UUID NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS journal_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    line_no INTEGER NOT NULL,
    account_id UUID NULL REFERENCES chart_of_accounts(id),
    account_name VARCHAR(200) NOT NULL,
    debit NUMERIC(18,4) NOT NULL DEFAULT 0,
    credit NUMERIC(18,4) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS payment_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    sales_final_invoice_id UUID NOT NULL REFERENCES sales_final_invoices(id) ON DELETE CASCADE,
    allocated_amount NUMERIC(18,4) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_payment_invoice_allocation UNIQUE (payment_id, sales_final_invoice_id)
);

CREATE INDEX IF NOT EXISTS idx_delivery_daily_assignments_plan_date
    ON delivery_daily_assignments(monthly_plan_id, duty_date);
CREATE INDEX IF NOT EXISTS idx_salesman_daily_assignments_plan_date
    ON salesman_daily_assignments(monthly_plan_id, duty_date);
CREATE INDEX IF NOT EXISTS idx_salesman_daily_assignments_salesman_date
    ON salesman_daily_assignments(salesman_id, duty_date);
CREATE INDEX IF NOT EXISTS idx_salesman_visits_salesman_date
    ON salesman_visits(salesman_id, visit_date DESC);
CREATE INDEX IF NOT EXISTS idx_salesman_visits_customer_date
    ON salesman_visits(customer_id, visit_date DESC);
CREATE INDEX IF NOT EXISTS idx_journal_entries_date
    ON journal_entries(entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_journal_lines_entry
    ON journal_lines(journal_entry_id, line_no);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_payment
    ON payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_invoice
    ON payment_allocations(sales_final_invoice_id);
