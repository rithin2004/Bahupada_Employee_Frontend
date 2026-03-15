BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Clear session/runtime state first.
TRUNCATE TABLE
    user_sessions,
    login_attempts,
    audit_logs,
    idempotency_keys
RESTART IDENTITY CASCADE;

-- Reset client/business data and mutable masters.
-- We intentionally preserve:
--   roles
--   permissions
--   role_permissions
--   SYSTEM users are re-created at the end of the script because TRUNCATE CASCADE
--   from employees/customers will also clear users.
-- so the application remains accessible and RBAC metadata does not break.
TRUNCATE TABLE
    company_documents,
    companies,
    salesman_daily_assignments,
    salesman_monthly_plans,
    delivery_daily_assignments,
    delivery_monthly_plans,
    salesman_visits,
    salesman_weekly_planner,
    driver_vehicle_planner,
    delivery_assignments,
    delivery_run_stops,
    delivery_runs,
    pod_events,
    packing_tasks,
    attendance_logs,
    salary,
    purchase_return_items,
    purchase_returns,
    purchase_expiry_items,
    purchase_expiries,
    purchase_bill_items,
    purchase_bills,
    purchase_challan_items,
    purchase_challans,
    sales_return_items,
    sales_returns,
    sales_expiry_items,
    sales_expiries,
    sales_final_invoice_items,
    sales_final_invoices,
    sales_order_reservations,
    sales_order_items,
    sales_orders,
    invoice_versions,
    reorder_items,
    reorder_logs,
    warehouse_transfer_items,
    warehouse_transfers,
    stock_movements,
    inventory_batches,
    payment_allocations,
    payments,
    journal_lines,
    journal_entries,
    ledger_entries,
    credit_notes,
    debit_notes,
    party_ledger_payments,
    party_ledger_entries,
    party_ledger_accounts,
    scheme_products,
    schemes,
    route_product_prices,
    customer_product_prices,
    pricing,
    item_bundle_components,
    products,
    customers,
    vendors,
    vehicles,
    employees,
    rack_rows,
    racks,
    warehouses,
    customer_categories,
    route_master,
    area_master,
    hsn_master,
    units,
    chart_of_accounts
RESTART IDENTITY CASCADE;

-- Recreate the fallback admin user after the reset so login remains possible.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'users'
          AND column_name = 'is_super_admin'
    ) THEN
        EXECUTE $sql$
            INSERT INTO users (
                id,
                account_type,
                username,
                password_hash,
                failed_login_attempts,
                is_super_admin,
                is_active,
                created_at,
                updated_at
            )
            SELECT
                gen_random_uuid(),
                'SYSTEM',
                'admin',
                crypt('ChangeMe@123', gen_salt('bf')),
                0,
                TRUE,
                TRUE,
                now(),
                now()
            WHERE NOT EXISTS (
                SELECT 1
                FROM users
                WHERE account_type = 'SYSTEM'
                   OR username = 'admin'
            )
        $sql$;
    ELSE
        INSERT INTO users (
            id,
            account_type,
            username,
            password_hash,
            failed_login_attempts,
            is_active,
            created_at,
            updated_at
        )
        SELECT
            gen_random_uuid(),
            'SYSTEM',
            'admin',
            crypt('ChangeMe@123', gen_salt('bf')),
            0,
            TRUE,
            now(),
            now()
        WHERE NOT EXISTS (
            SELECT 1
            FROM users
            WHERE account_type = 'SYSTEM'
               OR username = 'admin'
        );
    END IF;
END $$;

COMMIT;
