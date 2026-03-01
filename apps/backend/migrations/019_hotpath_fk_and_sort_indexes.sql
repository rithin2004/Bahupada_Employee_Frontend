-- Additional hot-path indexes for list APIs and joins.

-- Sales list: speeds per-page item count aggregation.
CREATE INDEX IF NOT EXISTS idx_sales_order_items_order_id
ON sales_order_items (sales_order_id);

-- Stock snapshot cursor/order path.
CREATE INDEX IF NOT EXISTS idx_inventory_batches_created_id
ON inventory_batches (created_at DESC, id DESC);

-- Procurement list/detail joins.
CREATE INDEX IF NOT EXISTS idx_purchase_challan_items_challan_id
ON purchase_challan_items (purchase_challan_id);

CREATE INDEX IF NOT EXISTS idx_purchase_bill_items_bill_id
ON purchase_bill_items (purchase_bill_id);

-- Product cursor pagination/order path.
CREATE INDEX IF NOT EXISTS idx_products_created_id
ON products (created_at DESC, id DESC);
