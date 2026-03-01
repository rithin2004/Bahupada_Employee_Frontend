# Operations Workflow

This document describes the current business flow implemented in the project, from admin master-data setup through procurement, stock visibility, customer ordering, and downstream employee operations.

It also separates:
- what is already implemented
- what is still pending

## 1. Master Data Setup (Admin)

This is the first step. Admin is expected to create and maintain the master records before any operational transaction starts.

### Implemented

Admin modules currently available:
- Products
- Warehouse Module
- Vendor Module
- Customers Module
- Employees Module
- Price Module

Core master records that should exist first:
1. Products
2. Warehouses
3. Racks (under warehouses, where applicable)
4. Vendors
5. Customers
6. Customer Categories
7. Employees
8. Price mappings

### Notes

- `Products` are the base inventory and sales items.
- `Warehouses` hold physical stock.
- `Racks` are warehouse sub-locations.
- `Vendors` are required before purchase challans/bills.
- `Customers` are required before sales orders.
- `Customer Categories` map customer type and price class.
- `Employees` are now stored and editable from admin.
- `Price Module` is expected to hold price-class driven selling prices.

## 2. Procurement Flow (Admin)

Procurement is how stock enters the system.

### Implemented

Admin can:
1. Select vendor
2. Select warehouse
3. Optionally select rack
4. Search products
5. Add items to a purchase challan
6. Capture quantity per item
7. Capture expiry date per selected item
8. Auto-generate batch number based on date
9. Create purchase challan in popup flow

Purchase bills are also part of the purchase flow UI.

### Data effect

When purchase challan / bill is processed:
- inventory batches are created or updated
- available stock becomes visible in stock views
- batch-level inventory is tracked

## 3. Stock Visibility

Stock is exposed from `inventory_batches`, not from static product masters.

### Implemented

Admin Stock Module:
- shows live stock from inventory batches
- supports search
- supports pagination
- uses loading skeletons

Customer Inventory:
- shows sellable stock snapshot
- supports search
- supports pagination
- supports add-to-cart with quantity validation

Employee Stock Lookup:
- shows inventory batch visibility
- currently read-only

### Business rule

Stock shown in operational screens should come from batch inventory created by procurement transactions.

## 4. Customer Setup and Pricing

Customers are now more structured and support price segmentation.

### Implemented

Customer fields include:
- PAN number / PAN document path
- GST number / GST document path
- WhatsApp number
- Alternate number
- Customer type (`B2B` / `B2C`)
- Customer category mapping

Customer categories currently support price-class mapping such as:
- Distributor
- Wholesaler
- Semi-Wholesale
- Top Outlets
- Mass Groceries
- B2C

These categories are used to determine which price class applies.

### Important design point

Price class selection is driven by:
- customer category
- customer type

Actual product pricing is still maintained in pricing-related tables, not duplicated in the customer category table.

## 5. Customer Sales Order Flow

This is the customer-side ordering flow.

### Implemented

Customer dashboard supports:
1. View inventory
2. Search available products
3. See price in inventory list
4. Enter quantity before adding to cart
5. Prevent ordering more than available quantity
6. Add to cart with toast feedback
7. Open cart from top bar
8. Create sales challan / sales order from cart
9. View own created orders in `My Orders`
10. Open order popup to see:
   - product
   - unit
   - price
   - quantity

### Current persistence behavior

- Customer dashboard uses state management for UI continuity.
- On refresh, fresh backend data should be re-fetched.
- Cart and order list behavior is frontend-driven, but the source of truth is backend APIs.

## 6. Sales Order Flow (Admin)

Sales order handling was simplified so that the sales order itself is the main initial operational record.

### Implemented

Admin Sales Module supports:
1. View sales orders
2. Search sales orders
3. Pagination
4. Row selection
5. Per-row `View` popup

Popup currently shows:
- product
- unit
- price
- quantity
- customer and warehouse context in the header

### Current model direction

- `sales_order` is being treated as the primary operational order entity.
- Older “initial invoice” concepts were intentionally reduced in importance.
- `sales_order_reservations` is used to record which batch quantities were reserved against which order.

## 7. Reservation and Inventory Behavior

### Current intended behavior

When a sales order is created:
- the system reserves stock against specific inventory batches
- reservation is recorded in `sales_order_reservations`
- batch-level stock accounting should reflect reserved quantities

### Why `sales_order_reservations` exists

This table is not redundant.

It exists so the system can track:
- which order reserved stock
- which exact inventory batch was reserved
- how much quantity was reserved per batch

This is required for:
- auditability
- partial fulfillment
- release / reallocation
- later packing and dispatch

Updating only `reserved_quantity` in `inventory_batches` is not enough for traceability.

## 8. Employee Master and Role Model

Employees are maintained as admin-managed master data.

### Implemented

Admin can now:
- view employees
- search employees
- paginate employees
- edit employees
- delete (deactivate) employees

Employee records support:
- warehouse
- base role
- optional sub-role (`role_id`)
- phone
- alternate phone
- email
- gender
- optional identity/license fields

### Base roles currently relevant

- `SALESMAN`
- `DELIVERY_EMPLOYEE`
- `PACKER`
- `SUPERVISOR`

### Important role design

Delivery staff should use:
- base role: `DELIVERY_EMPLOYEE`

Operational sub-role is meant to be assigned separately, for example:
- Driver
- In Vehicle
- Bill Manager
- Loading By

That sub-role is not the employee’s permanent base role.

## 9. Employee Login / Employee Portal

This area is only partially complete.

### Already implemented

Employee-side routes and UI exist for:
- Dashboard
- My Orders
- Packing Tasks
- Delivery Runs
- Stock Lookup
- Duty Calendar

Employee login page also exists:
- separate from admin login

Current employee screens can read and display operational data from backend APIs.

### What is still mostly scaffold / incomplete

The employee portal is not yet a full execution workflow.

Still pending:
1. Real employee-specific authentication and access enforcement
2. Actual employee assignment filtering
   - today pages largely show operational queues, not truly “my assigned work”
3. Monthly sub-role assignment workflow for delivery employees
4. Task claim / accept / reject actions
5. Packing completion actions
6. Delivery run execution actions
7. Attendance / duty roster management tied to employees
8. End-to-end employee transaction updates back into operations
9. Employee-facing validations and action toasts for workflow completion

### Current status summary

The employee portal is currently:
- good as a visibility/scaffold layer
- not yet complete as a production execution portal

## 10. Recommended Operational Sequence

The intended business sequence should be:

1. Admin adds products
2. Admin adds warehouses and racks
3. Admin adds vendors
4. Admin configures pricing and customer categories
5. Admin adds customers
6. Admin adds employees
7. Admin creates purchase challans / purchase bills
8. Inventory batches are created and stock becomes available
9. Customer views stock and creates sales orders
10. Admin monitors sales orders
11. Stock gets reserved against batches
12. Employee operations begin:
    - planning
    - packing
    - delivery
13. Final employee execution and downstream finance / delivery actions continue

## 11. What Is Done vs Pending

### Done

- Admin master data management for products, warehouses, vendors, customers, employees
- Purchase challan creation flow
- Inventory batch driven stock visibility
- Customer ordering flow
- Admin sales order visibility
- Customer and admin order item popups
- Customer category and price-class groundwork
- Employee master records and employee admin UI
- Employee portal skeleton with data visibility screens

### Pending / Next major work

- Full employee operational execution flow
- Employee-specific assignment logic
- Monthly sub-role assignment process
- Packing workflow completion actions
- Delivery workflow completion actions
- Stronger stock reservation / release lifecycle validation
- More complete finance linkage after sales fulfillment
- Migration tracking table for SQL migrations
- Infrastructure move / DB placement optimization if low latency is required consistently

## 12. Practical Implementation Rule

Any new module or page in this system should continue following the same standard:

1. Schema-first
2. Backend route support
3. Responsive UI
4. Search
5. Loading skeleton
6. Pagination
7. State management where tab/page continuity matters
8. Clear distinction between:
   - master data
   - transaction data
   - operational workflow data

