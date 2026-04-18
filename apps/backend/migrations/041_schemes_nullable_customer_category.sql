-- Allow "All customer categories" schemes: customer_category_id NULL = applies to every category.
ALTER TABLE schemes
  ALTER COLUMN customer_category_id DROP NOT NULL;
