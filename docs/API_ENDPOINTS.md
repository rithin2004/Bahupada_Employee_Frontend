# Bahu ERP API Endpoints

Base URL prefix: `/api/v1`

Notes:
- Endpoints listed here are from current FastAPI routers.
- Write endpoints supporting idempotency use header: `X-Idempotency-Key`.

## Auth (`/auth`)
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`

## Masters (`/masters`)
### Create
- `POST /api/v1/masters/companies`
- `POST /api/v1/masters/areas`
- `POST /api/v1/masters/routes`
- `POST /api/v1/masters/warehouses`
- `POST /api/v1/masters/racks`
- `POST /api/v1/masters/vehicles`
- `POST /api/v1/masters/employees`
- `POST /api/v1/masters/products`
- `POST /api/v1/masters/vendors`
- `POST /api/v1/masters/customers`

### List
- `GET /api/v1/masters/products`
- `GET /api/v1/masters/customers`
- `GET /api/v1/masters/warehouses`

### Detail / Update / Deactivate
- `GET /api/v1/masters/products/{product_id}`
- `PATCH /api/v1/masters/products/{product_id}`
- `DELETE /api/v1/masters/products/{product_id}`
- `GET /api/v1/masters/customers/{customer_id}`
- `PATCH /api/v1/masters/customers/{customer_id}`
- `DELETE /api/v1/masters/customers/{customer_id}`
- `GET /api/v1/masters/warehouses/{warehouse_id}`
- `PATCH /api/v1/masters/warehouses/{warehouse_id}`
- `DELETE /api/v1/masters/warehouses/{warehouse_id}`
- `GET /api/v1/masters/vendors/{vendor_id}`
- `PATCH /api/v1/masters/vendors/{vendor_id}`
- `DELETE /api/v1/masters/vendors/{vendor_id}`
- `GET /api/v1/masters/employees/{employee_id}`
- `PATCH /api/v1/masters/employees/{employee_id}`
- `DELETE /api/v1/masters/employees/{employee_id}`

## Procurement (`/procurement`)
- `POST /api/v1/procurement/purchase-challans`
- `POST /api/v1/procurement/purchase-bills`
- `POST /api/v1/procurement/purchase-bills/{purchase_bill_id}/post`
- `POST /api/v1/procurement/purchase-returns`
- `GET /api/v1/procurement/purchase-returns`
- `POST /api/v1/procurement/purchase-expiries`
- `GET /api/v1/procurement/purchase-expiries`
- `POST /api/v1/procurement/warehouse-transfers`
- `GET /api/v1/procurement/warehouse-transfers`
- `POST /api/v1/procurement/reorder-logs`
- `GET /api/v1/procurement/reorder-logs`

## Sales (`/sales`)
- `POST /api/v1/sales/sales-orders`
- `GET /api/v1/sales/dashboard/pending-orders`
- `POST /api/v1/sales/sales-initial-invoices`
- `POST /api/v1/sales/sales-final-invoices`
- `POST /api/v1/sales/sales-final-invoices/{sales_final_invoice_id}/edit`
- `POST /api/v1/sales/sales-returns`
- `GET /api/v1/sales/sales-returns`
- `POST /api/v1/sales/sales-expiries`
- `GET /api/v1/sales/sales-expiries`

## Packing (`/packing`)
- `POST /api/v1/packing/attendance`
- `POST /api/v1/packing/assignments/auto`
- `PATCH /api/v1/packing/tasks/{task_id}/status`
- `GET /api/v1/packing/dashboard/ready-to-dispatch`

## Delivery (`/delivery`)
- `POST /api/v1/delivery/plans/monthly`
- `POST /api/v1/delivery/runs/optimize-route`
- `GET /api/v1/delivery/runs/ready-to-dispatch`
- `POST /api/v1/delivery/runs/from-ready`
- `POST /api/v1/delivery/runs/optimize-route/async`
- `GET /api/v1/delivery/tasks/{task_id}`
- `POST /api/v1/delivery/runs/assign-team`
- `POST /api/v1/delivery/stops/pod`
- `GET /api/v1/delivery/runs/{delivery_run_id}/summary`

## Finance (`/finance`)
- `POST /api/v1/finance/payments`
- `POST /api/v1/finance/payments/{payment_id}/allocations`
- `GET /api/v1/finance/payments/{payment_id}/allocations`
- `GET /api/v1/finance/customers/{customer_id}/outstanding`
- `GET /api/v1/finance/ledger/trial-balance`
- `GET /api/v1/finance/ledger/summary`
- `GET /api/v1/finance/customers/{customer_id}/statement`
- `GET /api/v1/finance/customers/{customer_id}/aging`
- `POST /api/v1/finance/journal-entries`
- `GET /api/v1/finance/journal-entries/{journal_entry_id}/lines`

## Payroll (`/payroll`)
- `POST /api/v1/payroll/salaries`
- `POST /api/v1/payroll/salary-runs`
- `GET /api/v1/payroll/salaries`
- `PATCH /api/v1/payroll/salaries/{salary_id}/mark-paid`

## Planning (`/planning`)
### Salesman Monthly Calendar
- `POST /api/v1/planning/salesman/monthly-plans`
- `POST /api/v1/planning/salesman/monthly-plans/{monthly_plan_id}/assignments`
- `GET /api/v1/planning/salesman/monthly-plans/{monthly_plan_id}/assignments`

### Delivery Duty Assignment
- `POST /api/v1/planning/delivery/monthly-plans/{monthly_plan_id}/assignments`
- `GET /api/v1/planning/delivery/monthly-plans/{monthly_plan_id}/assignments`

## Schemes (`/schemes`)
- `POST /api/v1/schemes`
- `POST /api/v1/schemes/{scheme_id}/products`
- `GET /api/v1/schemes/active`
- `GET /api/v1/schemes/{scheme_id}`

## Salesman Ops (`/salesman`)
- `POST /api/v1/salesman/visits`
- `GET /api/v1/salesman/visits`
- `GET /api/v1/salesman/performance/{salesman_id}`

## Customer Portal (`/customer`)
- `GET /api/v1/customer/customers/{customer_id}/profile`
- `GET /api/v1/customer/customers/{customer_id}/orders`
- `GET /api/v1/customer/customers/{customer_id}/payments`

## System (`/system`)
- `GET /api/v1/system/go-live-checks`

## Health
- `GET /health`
