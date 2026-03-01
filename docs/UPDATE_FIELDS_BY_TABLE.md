# Update Fields By Table

This document lists the **current API-supported update fields** table-by-table, based on backend code in:
- `apps/backend/app/api/routers/*.py`
- `apps/backend/app/schemas/*.py`

It reflects the code as of now. If a table is not listed under "has update endpoint", it currently has **no dedicated update API**.

## Has Update Endpoint

### `products`
- Endpoint: `PATCH /api/v1/masters/products/{product_id}`
- Schema: `ProductUpdate`
- Updatable fields:
  - `name`
  - `display_name`
  - `brand`
  - `category`
  - `sub_category`
  - `description`
  - `unit`
  - `base_price`
  - `tax_percent`
  - `is_active`

### `customers`
- Endpoint: `PATCH /api/v1/masters/customers/{customer_id}`
- Schema: `CustomerUpdate`
- Updatable fields:
  - `name`
  - `outlet_name`
  - `customer_class`
  - `route_id`
  - `route_name`
  - `gstin`
  - `owner_name`
  - `phone`
  - `email`
  - `credit_limit`
  - `is_line_sale_outlet`
  - `is_active`

### `warehouses`
- Endpoint: `PATCH /api/v1/masters/warehouses/{warehouse_id}`
- Schema: `WarehouseUpdate`
- Updatable fields:
  - `code`
  - `name`
  - `street`
  - `city`
  - `state`
  - `pincode`
  - `latitude`
  - `longitude`
  - `is_active`

### `vendors`
- Endpoint: `PATCH /api/v1/masters/vendors/{vendor_id}`
- Schema: `VendorUpdate`
- Updatable fields:
  - `name`
  - `firm_name`
  - `gstin`
  - `pan`
  - `owner_name`
  - `phone`
  - `alternate_phone`
  - `email`
  - `street`
  - `city`
  - `state`
  - `pincode`
  - `bank_account_number`
  - `ifsc_code`
  - `is_active`

### `employees`
- Endpoint: `PATCH /api/v1/masters/employees/{employee_id}`
- Schema: `EmployeeUpdate`
- Updatable fields:
  - `full_name` (also mirrors to internal `name`)
  - `role`
  - `phone`
  - `warehouse_id`
  - `gender`
  - `alternate_phone`
  - `email`
  - `is_active`

### `sales_final_invoices`
- Endpoint: `POST /api/v1/sales/sales-final-invoices/{sales_final_invoice_id}/edit`
- Schema: `SalesFinalInvoiceEditRequest`
- Updatable fields:
  - `subtotal`
  - `gst_amount`
  - `total_amount`
  - `status`
  - `delivery_status`
  - `reason`
  - `auto_note`

### `packing_tasks`
- Endpoint: `PATCH /api/v1/packing/tasks/{task_id}/status`
- Schema: `PackingTaskStatusUpdate`
- Updatable fields:
  - `status`
  - `pack_label`
  - `invoice_written_on_pack`

### `salaries`
- Endpoint: `PATCH /api/v1/payroll/salaries/{salary_id}/mark-paid`
- Schema: `SalaryMarkPaidRequest`
- Updatable fields:
  - `paid_status`

### `salesman_daily_assignments` (upsert behavior)
- Endpoint: `POST /api/v1/planning/salesman/monthly-plans/{monthly_plan_id}/assignments`
- Schema: `SalesmanDailyAssignmentUpsert`
- Insert/update fields:
  - `duty_date`
  - `salesman_id`
  - `route_id`
  - `note`
  - `is_override`

### `delivery_daily_assignments` (upsert behavior)
- Endpoint: `POST /api/v1/planning/delivery/monthly-plans/{monthly_plan_id}/assignments`
- Schema: `DeliveryDailyAssignmentUpsert`
- Insert/update fields:
  - `duty_date`
  - `vehicle_id`
  - `driver_id`
  - `helper_id`
  - `bill_manager_id`
  - `loader_id`

## Soft Deactivate Endpoints (status-style update)

These are implemented as `DELETE` routes but set active flags:

### `products`
- Endpoint: `DELETE /api/v1/masters/products/{product_id}`
- Effect: `is_active = false`

### `customers`
- Endpoint: `DELETE /api/v1/masters/customers/{customer_id}`
- Effect: `is_active = false`

### `warehouses`
- Endpoint: `DELETE /api/v1/masters/warehouses/{warehouse_id}`
- Effect: `is_active = false`

### `vendors`
- Endpoint: `DELETE /api/v1/masters/vendors/{vendor_id}`
- Effect: `is_active = false`

### `employees`
- Endpoint: `DELETE /api/v1/masters/employees/{employee_id}`
- Effect: `is_active = false`

## Tables Without Dedicated Update Endpoint (Current)

No PATCH/PUT/edit route currently exists for these table families:
- `area_master`
- `route_master`
- `companies`
- `racks`
- `vehicles`
- `purchase_challans`
- `purchase_challan_items`
- `purchase_bills` (except post action)
- `purchase_bill_items`
- `purchase_returns`
- `purchase_return_items`
- `purchase_expiries`
- `purchase_expiry_items`
- `warehouse_transfers`
- `warehouse_transfer_items`
- `reorder_logs`
- `reorder_items`
- `sales_orders`
- `sales_order_items`
- `sales_initial_invoices`
- `sales_returns`
- `sales_return_items`
- `sales_expiries`
- `sales_expiry_items`
- `delivery_runs` (no general update route; assignment/POD/summary specific actions exist)

## Notes

- Some business flows mutate data through action endpoints (example: posting purchase bill), not generic update endpoints.
- If you want, we can generate a second doc for **create fields by table** in the same format.
