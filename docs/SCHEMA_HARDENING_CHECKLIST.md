# Schema Hardening Checklist (Scale Plan)

This is a migration-first plan to harden the current schema for scale, consistency, and safer authz.  
Goal: keep changes backward-compatible, avoid downtime, and allow phased rollout.

## Scope
- Source schema: `apps/backend/app/models/entities.py`
- Current migration style: SQL files under `apps/backend/migrations/`

---

## P0 (Must Do First): Identity, Role, and Integrity Baseline

### 1) Canonicalize role model
Current issue:
- `employees.role` (enum) and `employees.role_id` (FK to `roles`) can drift.

Decision:
- Keep `role_id` as canonical for RBAC.
- Keep enum temporarily for backward compatibility.

Steps:
1. Ensure seed rows exist in `roles` matching enum values.
2. Backfill `employees.role_id` for all rows based on `employees.role`.
3. Add NOT NULL to `employees.role_id` only after backfill.
4. Add DB check/trigger to keep enum and FK aligned during transition.
5. Deprecate enum checks in app code, then later drop or freeze enum column.

### 2) Enforce user<->employee mapping rules
Current issue:
- `users.employee_id` nullable; cardinality is not explicit.

Recommended:
- If one login per employee: add unique partial index on `users(employee_id)` where not null.
- If service accounts allowed: keep nullable but classify account type explicitly.

Steps:
1. Add `users.account_type` (`EMPLOYEE`, `SYSTEM`, optional `CUSTOMER` if needed).
2. Add unique partial index for employee-bound accounts.
3. Add FK constraints already present; validate orphan cases with cleanup script.

### 3) Add portal/access classification at schema level
Current issue:
- No explicit DB field representing portal separation (admin vs employee vs customer).

Recommended:
- Add `roles.portal_scope` (`ADMIN`, `EMPLOYEE`, `BOTH`) OR `users.portal_scope`.

Steps:
1. Add nullable column.
2. Backfill from existing role mapping.
3. Move authz checks to this field.
4. Make non-null after rollout.

---

## P1: Tenant/Org Boundary Hardening

### 4) Introduce explicit tenant/company scoping
Current issue:
- Many tables are global; future multi-company scale risks data leakage.

Recommended:
- Add `company_id` (or `tenant_id`) to operational and master tables.

Priority tables:
- Masters: `warehouses`, `employees`, `vendors`, `customers`, `products`, `route_master`, `area_master`
- Transactions: procurement, sales, packing, delivery, finance, payroll tables

Steps:
1. Add nullable `company_id` + FK.
2. Backfill from existing org logic.
3. Add composite indexes with `company_id`.
4. Move app queries to scoped filters.
5. Mark non-null.

---

## P1: Lifecycle and Workflow Consistency

### 5) Standardize status/state machine columns
Current issue:
- Status handling is mixed across tables; some use free text.

Recommended:
- Normalize critical workflow status columns to constrained enums/check constraints.

Targets:
- `purchase_challans.status`
- `purchase_bills.status`
- `sales_orders.status`
- `packing_tasks.status`
- delivery run/status columns

Steps:
1. Add check constraints (or enum type) with allowed values.
2. Backfill invalid values to canonical set.
3. Enforce transitions in service layer + optionally DB trigger for critical flows.

### 6) Add header-item integrity constraints
Current issue:
- Item tables rely on app logic only.

Recommended constraints:
- quantity > 0 on all item tables.
- non-empty batch where required.
- unique constraints where domain requires (e.g., duplicate item rows prevention with header+product+batch).

---

## P1: Auditing and Traceability

### 7) Uniform audit columns + mutation trail
Current issue:
- Some entities have good audit/versioning (invoice edits), others do not.

Recommended:
- For critical masters/finance/procurement/sales:
  - `created_by`, `updated_by`
  - `updated_at`
  - optional revision table for sensitive docs

Steps:
1. Add nullable actor columns.
2. Populate from service layer context.
3. Add audit log records for write actions.

---

## P2: Query Scale and Performance

### 8) Add production query indexes (scoped + status + date)

Pattern:
- `(company_id, status, created_at desc)`
- `(company_id, foreign_key, created_at desc)`
- `(company_id, is_active)` for masters

Likely high-value indexes:
- `sales_orders(company_id, status, created_at desc)`
- `packing_tasks(company_id, warehouse_id, status, created_at desc)`
- `delivery_runs(company_id, run_date desc, warehouse_id)`
- `payments(company_id, customer_id, payment_date desc)`
- `customers(company_id, route_id, is_active)`

### 9) Pagination consistency
Current issue:
- Some endpoints paginate; many list endpoints still full-scan.

Recommended:
- Standardize paginated list queries for all high-cardinality tables.
- Add stable sort keys and matching indexes.

---

## Table-by-Table Recommendations

## `employees`
- Make `role_id` canonical.
- Keep `role` enum transitional.
- Add `company_id`.
- Add unique employee code if needed for HR operations.

## `users`
- Add `account_type`.
- Add portal scope or derive from role.
- Add unique partial index on `employee_id` (if 1:1 policy).

## `roles`, `permissions`, `role_permissions`
- Keep as RBAC source of truth.
- Add `company_id` if role sets differ per org.
- Add policy seed/version table for permission migrations.

## `customers`
- Keep separate from users/employees.
- Add `company_id`.
- Add unique business keys as needed (`gstin` per company when present).

## `vendors`
- Add `company_id`.
- Add uniqueness policy (`name` per company; GSTIN per company when present).

## `route_master`, `area_master`
- Add full lifecycle APIs (list/update/deactivate) to match schema importance.
- Add `company_id`.
- Ensure route uniqueness scoped by company.

## `purchase_challans`, `purchase_challan_items`
- Add `company_id`.
- Add header-level workflow constraints.
- Add item-level positive quantity checks.
- If two-step entry is needed, add dedicated item endpoints and sequence constraints.

## `sales_*` tables
- Standardize status constraints.
- Add `company_id`.
- Keep invoice versioning; extend audit consistency.

## `packing_tasks`, `delivery_*`
- Keep role-based assignment constraints.
- Add `company_id`.
- Add indexes for dispatch and daily dashboards.

## `finance_*` / `payroll`
- Add `company_id`.
- Enforce accounting invariants with constraints (balanced entries, non-negative rules where applicable).

---

## Backward-Compatible Migration Template

Use this order for each major change:

1. Add nullable column / new table / new index (non-breaking).
2. Backfill in batches.
3. Deploy app code that reads/writes new field.
4. Validate data invariants.
5. Add NOT NULL / check / unique constraints.
6. Remove old fields/logic only after stable soak period.

---

## Suggested Migration Files (Example Sequence)

1. `007_identity_role_canonicalization.sql`
2. `008_user_account_type_and_portal_scope.sql`
3. `009_company_scope_columns.sql`
4. `010_status_constraints_and_item_checks.sql`
5. `011_audit_columns_and_actor_tracking.sql`
6. `012_indexes_for_dashboard_and_lists.sql`

---

## Acceptance Criteria

- No role drift between auth and employee assignments.
- Portal access derived from DB-backed role/scope fields.
- All write-heavy tables have lifecycle-safe constraints.
- All major list endpoints support pagination with indexed sort/filter.
- Tenant/company boundaries are enforced at schema + query layer.
