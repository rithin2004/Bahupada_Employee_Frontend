-- Sample master data: units, HSN, account categories, customer category, warehouse,
-- product brands/categories/subcategories, vendors, vendor_brands, products, pricing,
-- customers, inventory batches.
-- Safe to re-run: uses IF NOT EXISTS / SELECT-then-insert patterns per entity.
-- Expects: pgcrypto; tables from migrations through 035 (vendor_brands) and 038 (no base_price on products).

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
    v_now timestamptz := now();
    v_u_pcs uuid;
    v_u_kg uuid;
    v_u_box uuid;
    v_hsn_oil uuid;
    v_hsn_rice uuid;
    v_hsn_honey uuid;
    v_wh uuid;
    v_ac_v uuid;
    v_ac_c uuid;
    v_cc uuid;
    v_b_marico uuid;
    v_b_bahu uuid;
    v_b_itc uuid;
    v_cat_oil uuid;
    v_cat_grocery uuid;
    v_cat_honey uuid;
    v_sub_refined uuid;
    v_sub_mustard uuid;
    v_sub_rice uuid;
    v_sub_pure uuid;
    v_v1 uuid;
    v_v2 uuid;
    v_p_oil uuid;
    v_p_rice uuid;
    v_p_honey uuid;
    v_c1 uuid;
    v_c2 uuid;
BEGIN
    -- Units (unit_code required after 029)
    SELECT id INTO v_u_pcs FROM units WHERE upper(unit_name) = 'PCS' OR unit_code = 'PCS' LIMIT 1;
    IF v_u_pcs IS NULL THEN
        INSERT INTO units (id, unit_code, unit_name, created_at, updated_at)
        VALUES (gen_random_uuid(), 'PCS', 'PCS', v_now, v_now)
        RETURNING id INTO v_u_pcs;
    END IF;

    SELECT id INTO v_u_kg FROM units WHERE upper(unit_name) = 'KG' OR unit_code = 'KG' LIMIT 1;
    IF v_u_kg IS NULL THEN
        INSERT INTO units (id, unit_code, unit_name, created_at, updated_at)
        VALUES (gen_random_uuid(), 'KG', 'KG', v_now, v_now)
        RETURNING id INTO v_u_kg;
    END IF;

    SELECT id INTO v_u_box FROM units WHERE upper(unit_name) = 'BOX' OR unit_code = 'BOX' LIMIT 1;
    IF v_u_box IS NULL THEN
        INSERT INTO units (id, unit_code, unit_name, created_at, updated_at)
        VALUES (gen_random_uuid(), 'BOX', 'BOX', v_now, v_now)
        RETURNING id INTO v_u_box;
    END IF;

    -- HSN
    SELECT id INTO v_hsn_oil FROM hsn_master WHERE hsn_code = '15162029' LIMIT 1;
    IF v_hsn_oil IS NULL THEN
        INSERT INTO hsn_master (id, hsn_code, description, gst_percent, is_active, created_at, updated_at)
        VALUES (
            gen_random_uuid(),
            '15162029',
            'Edible blended vegetable oils',
            5.00,
            TRUE,
            v_now,
            v_now
        )
        RETURNING id INTO v_hsn_oil;
    END IF;

    SELECT id INTO v_hsn_rice FROM hsn_master WHERE hsn_code = '10063020' LIMIT 1;
    IF v_hsn_rice IS NULL THEN
        INSERT INTO hsn_master (id, hsn_code, description, gst_percent, is_active, created_at, updated_at)
        VALUES (
            gen_random_uuid(),
            '10063020',
            'Semi-milled or wholly milled rice',
            5.00,
            TRUE,
            v_now,
            v_now
        )
        RETURNING id INTO v_hsn_rice;
    END IF;

    SELECT id INTO v_hsn_honey FROM hsn_master WHERE hsn_code = '04090010' LIMIT 1;
    IF v_hsn_honey IS NULL THEN
        INSERT INTO hsn_master (id, hsn_code, description, gst_percent, is_active, created_at, updated_at)
        VALUES (
            gen_random_uuid(),
            '04090010',
            'Natural honey',
            5.00,
            TRUE,
            v_now,
            v_now
        )
        RETURNING id INTO v_hsn_honey;
    END IF;

    -- Account categories (030)
    SELECT id INTO v_ac_v FROM account_categories WHERE code = 'SAMPLE-ACC-VENDOR' LIMIT 1;
    IF v_ac_v IS NULL THEN
        INSERT INTO account_categories (id, code, name, party_type, description, is_active, created_at, updated_at)
        VALUES (
            gen_random_uuid(),
            'SAMPLE-ACC-VENDOR',
            'Sample vendor ledger',
            'VENDOR'::party_type,
            'Seeded default vendor account bucket',
            TRUE,
            v_now,
            v_now
        )
        RETURNING id INTO v_ac_v;
    END IF;

    SELECT id INTO v_ac_c FROM account_categories WHERE code = 'SAMPLE-ACC-CUSTOMER' LIMIT 1;
    IF v_ac_c IS NULL THEN
        INSERT INTO account_categories (id, code, name, party_type, description, is_active, created_at, updated_at)
        VALUES (
            gen_random_uuid(),
            'SAMPLE-ACC-CUSTOMER',
            'Sample customer ledger',
            'CUSTOMER'::party_type,
            'Seeded default customer account bucket',
            TRUE,
            v_now,
            v_now
        )
        RETURNING id INTO v_ac_c;
    END IF;

    -- Warehouse
    SELECT id INTO v_wh FROM warehouses WHERE code = 'SAMPLE-WH' LIMIT 1;
    IF v_wh IS NULL THEN
        INSERT INTO warehouses (
            id,
            code,
            name,
            street,
            city,
            state,
            pincode,
            is_active,
            created_at,
            updated_at
        )
        VALUES (
            gen_random_uuid(),
            'SAMPLE-WH',
            'Sample main warehouse',
            '12 Industrial Area',
            'Nellore',
            'Andhra Pradesh',
            '524001',
            TRUE,
            v_now,
            v_now
        )
        RETURNING id INTO v_wh;
    END IF;

    -- Customer category
    SELECT id INTO v_cc FROM customer_categories WHERE code = 'SAMPLE-B2B' LIMIT 1;
    IF v_cc IS NULL THEN
        INSERT INTO customer_categories (
            id,
            code,
            name,
            customer_type,
            price_class,
            is_active,
            created_at,
            updated_at
        )
        VALUES (
            gen_random_uuid(),
            'SAMPLE-B2B',
            'Sample B2B trade',
            'B2B'::customer_type,
            'A',
            TRUE,
            v_now,
            v_now
        )
        RETURNING id INTO v_cc;
    END IF;

    -- Brands
    SELECT id INTO v_b_marico FROM product_brands WHERE name = 'Marico' LIMIT 1;
    IF v_b_marico IS NULL THEN
        INSERT INTO product_brands (id, name, is_active, created_at, updated_at)
        VALUES (gen_random_uuid(), 'Marico', TRUE, v_now, v_now)
        RETURNING id INTO v_b_marico;
    END IF;

    SELECT id INTO v_b_bahu FROM product_brands WHERE name = 'BAHU' LIMIT 1;
    IF v_b_bahu IS NULL THEN
        INSERT INTO product_brands (id, name, is_active, created_at, updated_at)
        VALUES (gen_random_uuid(), 'BAHU', TRUE, v_now, v_now)
        RETURNING id INTO v_b_bahu;
    END IF;

    SELECT id INTO v_b_itc FROM product_brands WHERE name = 'ITC' LIMIT 1;
    IF v_b_itc IS NULL THEN
        INSERT INTO product_brands (id, name, is_active, created_at, updated_at)
        VALUES (gen_random_uuid(), 'ITC', TRUE, v_now, v_now)
        RETURNING id INTO v_b_itc;
    END IF;

    -- Categories
    SELECT id INTO v_cat_oil FROM product_categories WHERE name = 'Edible Oils' LIMIT 1;
    IF v_cat_oil IS NULL THEN
        INSERT INTO product_categories (id, name, is_active, created_at, updated_at)
        VALUES (gen_random_uuid(), 'Edible Oils', TRUE, v_now, v_now)
        RETURNING id INTO v_cat_oil;
    END IF;

    SELECT id INTO v_cat_grocery FROM product_categories WHERE name = 'Packaged Grocery' LIMIT 1;
    IF v_cat_grocery IS NULL THEN
        INSERT INTO product_categories (id, name, is_active, created_at, updated_at)
        VALUES (gen_random_uuid(), 'Packaged Grocery', TRUE, v_now, v_now)
        RETURNING id INTO v_cat_grocery;
    END IF;

    SELECT id INTO v_cat_honey FROM product_categories WHERE name = 'Honey' LIMIT 1;
    IF v_cat_honey IS NULL THEN
        INSERT INTO product_categories (id, name, is_active, created_at, updated_at)
        VALUES (gen_random_uuid(), 'Honey', TRUE, v_now, v_now)
        RETURNING id INTO v_cat_honey;
    END IF;

    -- Sub-categories
    SELECT psc.id INTO v_sub_refined FROM product_sub_categories psc
    JOIN product_categories pc ON pc.id = psc.category_id
    WHERE pc.id = v_cat_oil AND psc.name = 'Refined Oil'
    LIMIT 1;
    IF v_sub_refined IS NULL THEN
        INSERT INTO product_sub_categories (id, category_id, name, is_active, created_at, updated_at)
        VALUES (gen_random_uuid(), v_cat_oil, 'Refined Oil', TRUE, v_now, v_now)
        RETURNING id INTO v_sub_refined;
    END IF;

    SELECT psc.id INTO v_sub_mustard FROM product_sub_categories psc
    JOIN product_categories pc ON pc.id = psc.category_id
    WHERE pc.id = v_cat_oil AND psc.name = 'Mustard Oil'
    LIMIT 1;
    IF v_sub_mustard IS NULL THEN
        INSERT INTO product_sub_categories (id, category_id, name, is_active, created_at, updated_at)
        VALUES (gen_random_uuid(), v_cat_oil, 'Mustard Oil', TRUE, v_now, v_now)
        RETURNING id INTO v_sub_mustard;
    END IF;

    SELECT psc.id INTO v_sub_rice FROM product_sub_categories psc
    JOIN product_categories pc ON pc.id = psc.category_id
    WHERE pc.id = v_cat_grocery AND psc.name = 'Rice'
    LIMIT 1;
    IF v_sub_rice IS NULL THEN
        INSERT INTO product_sub_categories (id, category_id, name, is_active, created_at, updated_at)
        VALUES (gen_random_uuid(), v_cat_grocery, 'Rice', TRUE, v_now, v_now)
        RETURNING id INTO v_sub_rice;
    END IF;

    SELECT psc.id INTO v_sub_pure FROM product_sub_categories psc
    JOIN product_categories pc ON pc.id = psc.category_id
    WHERE pc.id = v_cat_honey AND psc.name = 'Pure Honey'
    LIMIT 1;
    IF v_sub_pure IS NULL THEN
        INSERT INTO product_sub_categories (id, category_id, name, is_active, created_at, updated_at)
        VALUES (gen_random_uuid(), v_cat_honey, 'Pure Honey', TRUE, v_now, v_now)
        RETURNING id INTO v_sub_pure;
    END IF;

    -- Vendors
    SELECT id INTO v_v1 FROM vendors WHERE name = 'Sample Foods Nellore Pvt Ltd' LIMIT 1;
    IF v_v1 IS NULL THEN
        INSERT INTO vendors (
            id,
            name,
            firm_name,
            gstin,
            phone,
            email,
            city,
            state,
            pincode,
            purchase_type,
            account_category_id,
            is_active,
            created_at,
            updated_at
        )
        VALUES (
            gen_random_uuid(),
            'Sample Foods Nellore Pvt Ltd',
            'Sample Foods',
            '37AABCS1234F1Z5',
            '8612345678',
            'purchase.sample@bahu.local',
            'Nellore',
            'Andhra Pradesh',
            '524001',
            'LOCAL',
            v_ac_v,
            TRUE,
            v_now,
            v_now
        )
        RETURNING id INTO v_v1;
    END IF;

    SELECT id INTO v_v2 FROM vendors WHERE name = 'National Distributors Ltd' LIMIT 1;
    IF v_v2 IS NULL THEN
        INSERT INTO vendors (
            id,
            name,
            firm_name,
            gstin,
            phone,
            email,
            city,
            state,
            pincode,
            purchase_type,
            account_category_id,
            is_active,
            created_at,
            updated_at
        )
        VALUES (
            gen_random_uuid(),
            'National Distributors Ltd',
            'National Distributors',
            '37AABCN9876E1Z1',
            '8623456789',
            'central.vendor@bahu.local',
            'Hyderabad',
            'Telangana',
            '500032',
            'CENTRAL',
            v_ac_v,
            TRUE,
            v_now,
            v_now
        )
        RETURNING id INTO v_v2;
    END IF;

    -- Vendor ↔ brand links (035)
    INSERT INTO vendor_brands (id, vendor_id, brand_id, is_primary, is_active, created_at, updated_at)
    VALUES
        (gen_random_uuid(), v_v1, v_b_marico, TRUE, TRUE, v_now, v_now),
        (gen_random_uuid(), v_v1, v_b_bahu, FALSE, TRUE, v_now, v_now),
        (gen_random_uuid(), v_v2, v_b_itc, TRUE, TRUE, v_now, v_now)
    ON CONFLICT (vendor_id, brand_id) DO NOTHING;

    -- Products
    SELECT id INTO v_p_oil FROM products WHERE sku = 'SAMP-OIL-1L-SUN' LIMIT 1;
    IF v_p_oil IS NULL THEN
        INSERT INTO products (
            id,
            sku,
            display_name,
            name,
            brand,
            category,
            sub_category,
            brand_id,
            category_id,
            sub_category_id,
            description,
            hsn_id,
            primary_unit_id,
            weight_in_grams,
            unit,
            is_bundle,
            tax_percent,
            is_active,
            created_at,
            updated_at
        )
        VALUES (
            gen_random_uuid(),
            'SAMP-OIL-1L-SUN',
            'Sunflower refined oil 1 L',
            'Sunflower refined oil 1 L',
            'Marico',
            'Edible Oils',
            'Refined Oil',
            v_b_marico,
            v_cat_oil,
            v_sub_refined,
            'Sample seeded product',
            v_hsn_oil,
            v_u_pcs,
            900,
            'PCS',
            FALSE,
            5.00,
            TRUE,
            v_now,
            v_now
        )
        RETURNING id INTO v_p_oil;
    END IF;

    SELECT id INTO v_p_rice FROM products WHERE sku = 'SAMP-RICE-5KG-PON' LIMIT 1;
    IF v_p_rice IS NULL THEN
        INSERT INTO products (
            id,
            sku,
            display_name,
            name,
            brand,
            category,
            sub_category,
            brand_id,
            category_id,
            sub_category_id,
            description,
            hsn_id,
            primary_unit_id,
            weight_in_grams,
            unit,
            is_bundle,
            tax_percent,
            is_active,
            created_at,
            updated_at
        )
        VALUES (
            gen_random_uuid(),
            'SAMP-RICE-5KG-PON',
            'Ponni rice 5 KG bag',
            'Ponni rice 5 KG bag',
            'ITC',
            'Packaged Grocery',
            'Rice',
            v_b_itc,
            v_cat_grocery,
            v_sub_rice,
            'Sample seeded product',
            v_hsn_rice,
            v_u_box,
            5000,
            'BOX',
            FALSE,
            5.00,
            TRUE,
            v_now,
            v_now
        )
        RETURNING id INTO v_p_rice;
    END IF;

    SELECT id INTO v_p_honey FROM products WHERE sku = 'SAMP-HONEY-500' LIMIT 1;
    IF v_p_honey IS NULL THEN
        INSERT INTO products (
            id,
            sku,
            display_name,
            name,
            brand,
            category,
            sub_category,
            brand_id,
            category_id,
            sub_category_id,
            description,
            hsn_id,
            primary_unit_id,
            weight_in_grams,
            unit,
            is_bundle,
            tax_percent,
            is_active,
            created_at,
            updated_at
        )
        VALUES (
            gen_random_uuid(),
            'SAMP-HONEY-500',
            'Pure honey 500 G',
            'Pure honey 500 G',
            'BAHU',
            'Honey',
            'Pure Honey',
            v_b_bahu,
            v_cat_honey,
            v_sub_pure,
            'Sample seeded product',
            v_hsn_honey,
            v_u_pcs,
            500,
            'PCS',
            FALSE,
            5.00,
            TRUE,
            v_now,
            v_now
        )
        RETURNING id INTO v_p_honey;
    END IF;

    -- Pricing
    INSERT INTO pricing (
        id,
        product_id,
        mrp,
        cost_price,
        a_class_price,
        b_class_price,
        c_class_price,
        is_active,
        created_at,
        updated_at
    )
    VALUES
        (gen_random_uuid(), v_p_oil, 220, 165, 200, 195, 205, TRUE, v_now, v_now),
        (gen_random_uuid(), v_p_rice, 450, 320, 410, 400, 420, TRUE, v_now, v_now),
        (gen_random_uuid(), v_p_honey, 180, 120, 165, 160, 170, TRUE, v_now, v_now)
    ON CONFLICT (product_id) DO UPDATE
    SET
        mrp = EXCLUDED.mrp,
        cost_price = EXCLUDED.cost_price,
        a_class_price = EXCLUDED.a_class_price,
        b_class_price = EXCLUDED.b_class_price,
        c_class_price = EXCLUDED.c_class_price,
        is_active = EXCLUDED.is_active,
        updated_at = EXCLUDED.updated_at;

    -- Customers
    SELECT id INTO v_c1 FROM customers WHERE name = 'Sample Traders Nellore' LIMIT 1;
    IF v_c1 IS NULL THEN
        INSERT INTO customers (
            id,
            name,
            customer_type,
            customer_category_id,
            account_category_id,
            phone,
            whatsapp_number,
            email,
            customer_class,
            is_line_sale_outlet,
            opening_balance,
            current_balance,
            credit_limit,
            is_active,
            created_at,
            updated_at
        )
        VALUES (
            gen_random_uuid(),
            'Sample Traders Nellore',
            'B2B'::customer_type,
            v_cc,
            v_ac_c,
            '9000020001',
            '9000020001',
            'sample.traders1@bahu.local',
            'B2B_DISTRIBUTOR'::customer_class,
            FALSE,
            0,
            0,
            100000,
            TRUE,
            v_now,
            v_now
        )
        RETURNING id INTO v_c1;
    END IF;

    SELECT id INTO v_c2 FROM customers WHERE name = 'Sri Lakshmi Wholesale' LIMIT 1;
    IF v_c2 IS NULL THEN
        INSERT INTO customers (
            id,
            name,
            customer_type,
            customer_category_id,
            account_category_id,
            phone,
            whatsapp_number,
            email,
            customer_class,
            is_line_sale_outlet,
            opening_balance,
            current_balance,
            credit_limit,
            is_active,
            created_at,
            updated_at
        )
        VALUES (
            gen_random_uuid(),
            'Sri Lakshmi Wholesale',
            'B2B'::customer_type,
            v_cc,
            v_ac_c,
            '9000020002',
            '9000020002',
            'sample.traders2@bahu.local',
            'B2B_MASS_GROCERY'::customer_class,
            FALSE,
            0,
            0,
            75000,
            TRUE,
            v_now,
            v_now
        )
        RETURNING id INTO v_c2;
    END IF;

    -- Stock batches (optional on-hand for warehouse)
    INSERT INTO inventory_batches (
        id,
        warehouse_id,
        product_id,
        batch_no,
        expiry_date,
        available_quantity,
        reserved_quantity,
        damaged_quantity,
        created_at,
        updated_at
    )
    VALUES
        (gen_random_uuid(), v_wh, v_p_oil, 'SAMP-OIL-B1', (current_date + INTERVAL '400 days')::date, 48, 0, 0, v_now, v_now),
        (gen_random_uuid(), v_wh, v_p_rice, 'SAMP-RICE-B1', (current_date + INTERVAL '300 days')::date, 25, 0, 0, v_now, v_now),
        (gen_random_uuid(), v_wh, v_p_honey, 'SAMP-HON-B1', (current_date + INTERVAL '500 days')::date, 60, 0, 0, v_now, v_now)
    ON CONFLICT (warehouse_id, product_id, batch_no) DO UPDATE
    SET
        expiry_date = EXCLUDED.expiry_date,
        available_quantity = EXCLUDED.available_quantity,
        reserved_quantity = 0,
        damaged_quantity = 0,
        updated_at = EXCLUDED.updated_at;
END $$;

COMMIT;
