CREATE INDEX IF NOT EXISTS ix_sales_orders_deleted_at_created_at ON sales_orders (deleted_at, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_sales_orders_customer_id ON sales_orders (customer_id);
CREATE INDEX IF NOT EXISTS ix_sales_orders_warehouse_id ON sales_orders (warehouse_id);

CREATE INDEX IF NOT EXISTS ix_sales_order_items_sales_order_id ON sales_order_items (sales_order_id);
CREATE INDEX IF NOT EXISTS ix_sales_order_items_product_id ON sales_order_items (product_id);
