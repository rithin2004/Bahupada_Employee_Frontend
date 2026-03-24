# Purchase Entry Workflow

## Purpose
This document locks the keyboard-first purchase bill workflow so future changes do not regress it back into a mouse-heavy modal flow.

## Scope
- Main workflow: direct purchase bill creation from `Purchase Entry`
- Challan workflow: still supported separately in the legacy procurement flow
- Stock truth: stored in base quantity
- UI stock display: always shown as product-configured 1st/2nd/3rd unit ratio

## Header Flow
Field order is fixed:
1. `bill_date`
2. vendor search/select
3. `bill_number`
4. `received_date`
5. `payment_mode` (`CREDIT` default)
6. derived `tax_type`
7. product grid

### Date Entry Rule
- User types `ddmmyyyy`
- UI parses it into ISO date
- If entered date is not today's date, UI must warn and require confirmation before proceeding

### Vendor Selection Rule
- Vendor picker opens immediately after bill date is confirmed
- Arrow keys move highlighted vendor
- Enter selects vendor
- Vendor detail panel updates while selection moves

## Vendor Summary
Vendor summary should show:
- address
- GSTIN
- phone
- area
- route
- annual purchase amount
- monthly purchase amount
- balance from party ledger
- last purchase date
- last payment date
- last 3 bills

Notes:
- current schema does not keep a dedicated vendor route field
- until route master linkage exists, backend may return `null`
- current summary falls back to city as `area`

## Product Search and Selection
- Product cell opens product search overlay
- Keyboard only: type, arrow up/down, enter
- Preview pane shows:
  - stock ratio
  - configured unit names
  - MRP
  - latest purchase rate
  - latest discount
  - GST
  - HSN
- `F4` opens in-flow product edit for commercial/master corrections

## Unit Hierarchy Rule
Product unit conversions are packaging hierarchy, not measurement conversion.

Example:
- 1 third = 10 second
- 1 second = 10 first
- entry = 3 first + 2 second + 1 third
- base quantity = 3 + 20 + 100 = 123 first units

This rule applies to:
- purchase entry quantities
- stock posting
- stock display ratio
- purchase rate normalization

## Stock Display Rule
Backend stock remains numeric in base units.
UI must display stock using configured product hierarchy.

Example:
- available base stock = 123
- conversions as above
- stock ratio display = `1 : 2 : 3` for `third : second : first`

The ratio display is a breakdown, not a separate stored stock field.

## Rate Entry Rule
Each line stores:
- quantity in 1st unit
- quantity in 2nd unit
- quantity in 3rd unit
- rate value
- rate unit basis (`1`, `2`, or `3`)
- discount percent
- optional discount lumpsum

Normalization:
- rate on 1st unit => base rate unchanged
- rate on 2nd unit => base rate = rate / `conv_2_to_1`
- rate on 3rd unit => base rate = rate / `conv_3_to_1`

The normalized base rate is used for:
- line subtotal
- tax calculation
- stock valuation compatibility

## Tax Rule
`tax_type` is derived automatically:
- `LOCAL` if vendor state matches warehouse state
- `CENTRAL` otherwise

Tax behavior:
- `LOCAL` => CGST + SGST split logically applies
- `CENTRAL` => IGST logically applies

Current implementation stores aggregate GST amount on the bill and line tax amount on each line.
Detailed split fields can be added later if reporting demands it.

## Bill Totals
Footer totals must update live:
- value of goods
- discount
- GST
- freight
- final bill amount

`freight_amount` is part of final bill total.
Vendor payable should use posted final bill total.

## Posting Rule
When purchase entry is saved:
- purchase bill is created directly
- each line stores entered quantities plus normalized `base_quantity`
- inventory batches are incremented using `base_quantity`
- stock movements are created using normalized quantity
- vendor payable is posted to party ledger from final bill total

## Keyboard Behavior
Required behavior:
- `Enter` commits current field and moves forward
- `Arrow Up/Down` navigates overlay result lists
- `Esc` closes current overlay
- `Ctrl+S` saves bill
- `F4` edits selected product

## Current Backend/API Contract
Endpoints added for the workflow:
- `GET /procurement/purchase-entry/bootstrap`
- `GET /procurement/purchase-entry/vendors/search`
- `GET /procurement/purchase-entry/vendors/{vendor_id}/summary`
- `GET /procurement/purchase-entry/products/search`
- `GET /procurement/purchase-entry/products/{product_id}/summary`
- `POST /procurement/purchase-entry`

## Known Limits
- Vendor route is not yet modeled explicitly
- Purchase entry currently posts the bill directly; draft support is not yet implemented
- Tax split is derived behavior, not separate persisted CGST/SGST/IGST columns yet
