# PRD + Technical Plan: Unified ERP (Web + App + Common Backend)

## Summary
Build a single-company ERP platform with:
- `Website`: Next.js (admin + customer + employee portals based on role)
- `App`: Flutter (same business functionality as website)
- `Backend`: FastAPI (single source of business logic)
- `Database`: PostgreSQL (`Neon` now, `AWS RDS` at deployment)
- `Routing`: Google Maps APIs

This release includes all modules in one go: masters, procurement, inventory, sales, packing, delivery, salesman planning, payments, ledgers/accounts, payroll, schemes, and dashboards.

## Product Scope
- In scope:
  - Company setup and all masters
  - Warehouse-centric operations (mandatory links)
  - Purchase challan/bill with stock update and stock movement ledger
  - Sales challan from admin, salesman, customer channels
  - Packing assignment + supervisor grouping + readiness flow
  - Delivery team scheduling and assignment with route optimization
  - Salesman planning and order/payment collection
  - Customer and owner accounts management
  - Audit, security, observability, and scale-ready architecture
- Out of scope:
  - Multi-company tenancy
  - Offline-first conflict sync (basic retry only in v1)

## Roles and Access
- Roles:
  - `Admin` (superuser)
  - `Packer`
  - `Supervisor`
  - `Salesman`
  - `DeliveryEmployee` with subtype: `Driver`, `InVehicleHelper`, `BillManager`, `Loader`
  - `Customer` (B2B/B2C)
- Login policy (as chosen):
  - Password-only for all roles
  - Mandatory controls: strong password policy, bcrypt/argon2id hashing, account lockout, IP/device rate limits, JWT rotation, refresh token revocation, session/device history, suspicious login alerts.
- Authorization:
  - RBAC + permission matrix by module/action
  - Row-level scoping by warehouse/route/customer assignment

## Core Business Rules (Locked)
- Warehouse is mandatory for all operational employees and stock entities.
- Admin is the owner of all setup and orchestration.
- Sales price classes:
  - `B-Class`: Distributor/Wholesaler
  - `A-Class`: Semi-Wholesale, Top Outlets, MASS Groceries
  - `C-Class`: B2C
- Pricing conflict resolution: deterministic priority ladder:
  1. Customer-specific override
  2. Contract/route-specific price
  3. Category price class (A/B/C)
  4. Active scheme/promotion
  5. Base product price
- Final invoice edit policy (as chosen):
  - Admin can edit finalized invoice
  - Every edit creates immutable version record + audit event + optional automatic debit/credit note linkage.

## End-to-End Workflows

### 1. Setup
1. Admin creates company profile and compliance docs.
2. Admin creates area master, route master, warehouses, racks, vehicles.
3. Admin creates employees; each employee mapped to warehouse (except optional HQ admin).
4. Admin configures products, units, HSN/tax, price lists, schemes, vendors, customers.

### 2. Procurement + Stock Inward
1. Admin creates `PurchaseChallan`.
2. On goods receipt, admin creates `PurchaseBill` (actual quantity, rate, returns/expiry notes).
3. System creates/updates product batches (`batch_no` + expiry).
4. Stock update happens only on purchase bill posting.
5. Every stock effect writes to immutable `stock_movements` (`IN/OUT/ADJUST/RETURN/EXPIRY/RESERVE/RELEASE`).

### 3. Sales Order/Challan Creation
- Source channels:
  - Admin (office table order)
  - Salesman (field order)
  - Customer (web/app self-order)
- Output:
  - `SalesChallan` + items + warehouse + fulfillment status.

### 4. Packing Flow
1. Admin views pending challans and creates `SalesInitialInvoice`.
2. Packers and supervisors mark active attendance daily.
3. Assignment engine groups active packers under supervisors (target `1 supervisor : 4 packers`).
4. Tasks distributed per warehouse evenly (weighted by line count/volume).
5. Packers update task statuses; on completion mark `ReadyToDispatch`.
6. Invoice number/pack label captured and validated.

### 5. Delivery Flow
1. Admin sees `ReadyToDispatch` list.
2. Admin selects monthly pre-built delivery schedule (can override).
3. System assigns 4-member team: driver, helper, bill manager, loader.
4. Route optimization:
  - Inputs: warehouse geo, customer stops, constraints (time window/priority)
  - Engine: Google Directions/Routes optimization
5. Bill manager UI shows reverse stop sequence for loading logic:
  - Last drop packed first, first drop packed last
6. At delivery:
  - POD capture (status, timestamp, geo, signature/photo)
  - Bill manager records on-spot payment (partial/full), updates accounts.

### 6. Salesman Flow
1. Monthly schedule created from routes.
2. Daily route view and outlet visit list.
3. Salesman creates orders and collects payments.
4. Route adherence and performance recorded.

### 7. Accounts and Ledger
- Auto-journal entries for purchase, sales, returns, payments, notes.
- Customer/vendor outstanding, aging, reconciliation.
- Cash/bank ledger and audit trail.

## Optimized Database Design (PostgreSQL)

### Design Principles
- UUID primary keys
- Immutable movement/event tables
- Transaction + line-item separation
- Strict FK constraints, soft delete (`is_active`) where needed
- Partial indexes for active/open records
- Table partitioning for high-volume logs/movements by month
- Monetary fields as `numeric(18,4)`

### Major Tables (high-level)
- Org and masters:
  - `companies`, `company_documents`
  - `warehouses`, `warehouse_racks`, `areas`, `routes`, `route_stops`
  - `units`, `hsn_codes`, `products`, `product_variants`, `product_prices`
  - `vendors`, `customers`, `customer_addresses`, `vehicles`
- Identity and access:
  - `users`, `roles`, `permissions`, `role_permissions`, `user_sessions`, `login_attempts`
  - `employees`, `employee_roles`, `employee_warehouse_map`
- Inventory:
  - `inventory_batches` (product+batch+warehouse+rack+expiry)
  - `stock_balances` (current aggregated)
  - `stock_movements` (immutable ledger)
  - `stock_reservations`
- Procurement:
  - `purchase_challans`, `purchase_challan_items`
  - `purchase_bills`, `purchase_bill_items`
  - `purchase_returns`, `purchase_return_items`
- Sales & fulfillment:
  - `sales_orders` (challan source-aware), `sales_order_items`
  - `sales_initial_invoices`, `sales_initial_invoice_items`
  - `packing_tasks`, `packing_task_items`, `packing_assignments`
  - `sales_final_invoices`, `sales_final_invoice_items`, `invoice_versions`
  - `delivery_runs`, `delivery_run_stops`, `delivery_assignments`, `pod_events`
  - `sales_returns`, `sales_return_items`, `sales_expiries`, `sales_expiry_items`
- Planning:
  - `salesman_monthly_plans`, `salesman_daily_assignments`
  - `delivery_monthly_plans`, `delivery_daily_assignments`
  - `attendance_logs`
- Finance:
  - `chart_of_accounts`, `ledger_entries`, `journal_entries`, `journal_lines`
  - `payments`, `payment_allocations`
  - `credit_notes`, `debit_notes`
  - `customer_wallets` (optional), `customer_outstandings`
- HR (included in full scope):
  - `salary_structures`, `salary_runs`, `salary_payouts`
- Promotion:
  - `schemes`, `scheme_rules`, `scheme_product_links`

### Critical Constraints and Indexes
- `employees.warehouse_id NOT NULL` for operational roles
- Unique:
  - `inventory_batches(warehouse_id, product_id, batch_no)`
  - `users(email)` / `users(phone)` (nullable unique with partial index)
  - invoice numbers by financial year + document type
- FK protection on all transaction items
- Indexes:
  - Pending states (`status in (...)`) for dashboards
  - `(warehouse_id, status, created_at)` on orders/tasks
  - `(route_id, date)` on schedules
  - `(customer_id, due_date)` on receivables

## Public APIs / Interfaces (Important)
- Auth:
  - `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`
- Masters:
  - CRUD for company, warehouse, rack, area, route, product, vendor, customer, vehicle, employees
- Procurement:
  - `POST /purchase-challans`
  - `POST /purchase-bills/{challan_id}/post` (stock movement trigger)
- Sales:
  - `POST /sales-orders` (source=`admin|salesman|customer`)
  - `POST /sales-initial-invoices`
  - `POST /sales-final-invoices/{id}/edit` (versioned)
- Packing:
  - `POST /packing/attendance`
  - `POST /packing/assignments/auto`
  - `PATCH /packing/tasks/{id}/status`
- Delivery:
  - `POST /delivery/plans/monthly`
  - `POST /delivery/runs/{id}/optimize-route`
  - `POST /delivery/runs/{id}/assign-team`
  - `POST /delivery/stops/{id}/pod`
- Finance:
  - `POST /payments`
  - `GET /customers/{id}/outstanding`
  - `GET /ledger/trial-balance`
- Common API contract:
  - Idempotency key support on posting endpoints
  - Cursor pagination for lists
  - Consistent error schema with trace ids

## Architecture for Scale and Reuse
- Backend:
  - Modular monolith first (domain modules), clean service boundaries for later extraction
  - Async task queue for heavy operations (route optimization, report generation, notifications)
  - Outbox pattern for reliable event emission
- Frontend and app:
  - Shared design tokens and business workflow parity
  - Feature-sliced architecture and reusable form/list/task components
  - API client generated from OpenAPI to avoid drift
- Data and performance:
  - Read models/materialized views for dashboards
  - Caching hot masters and pricing rules
  - Batch writes for stock/ledger posting
- Deployment:
  - Env1: Neon + managed storage + managed redis
  - Env2: AWS RDS Postgres + object storage + redis + autoscaled app services

## Security and Compliance Baseline (0 compromise implementation)
- Secrets in manager, never in code
- TLS end-to-end
- At-rest encryption for DB and object storage
- PII minimization and masking (Aadhaar hash only)
- Fine-grained audit log on every critical action
- Rate limiting and WAF rules on auth/payment/order endpoints
- Signed URLs for documents
- Periodic backup + PITR + restore drills
- SAST/DAST/dependency scanning in CI

## Testing and Acceptance Criteria

### Functional tests
- Purchase bill posting updates stock and stock movement correctly.
- Sales order from all 3 channels follows identical business validations.
- Packing auto-assignment respects active attendance and warehouse grouping.
- Delivery run uses optimized route and reverse loading sequence for bill manager.
- Payment collection at delivery updates customer outstanding and ledger.

### Data integrity tests
- No negative stock unless explicit policy allows with approval.
- Batch expiry and FIFO/FEFO policy validated.
- Invoice edit creates version trail; no data overwrite loss.

### Security tests
- Brute-force lockout and token rotation behavior.
- Role access isolation across modules.
- Audit event generation for sensitive actions.

### Performance tests
- Dashboard query SLA < 2s at target dataset.
- Posting throughput under concurrent challan/invoice load.
- Route optimization async completion with retry guarantees.

## Rollout Plan (Single full release with guarded activation)
1. Foundation: auth/RBAC, masters, product/pricing, warehouse.
2. Inventory + procurement posting + movement ledger.
3. Sales + packing + delivery orchestration.
4. Accounts + payments + notes + reports.
5. Payroll + schemes + hardening + go-live checks.
6. Cutover to production with migration and reconciliation checklist.

## Assumptions and Defaults Chosen
- Single-company product (no multi-tenant in v1).
- Password-only auth for all roles (with strict compensating controls).
- Google Maps API for route optimization.
- All modules included in first release.
- Final invoices editable by admin with mandatory versioning and audit.
- Deterministic pricing precedence as defined above.
- Monthly schedule pattern follows provided planner style; admin can override per date.
