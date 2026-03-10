BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
    v_now timestamptz := now();
    v_unit_pcs uuid;
    v_hsn_honey uuid;
    v_hsn_sample uuid;
    v_warehouse uuid;
    v_customer_category uuid;
    v_customer uuid;
    v_salesman uuid;
    v_product_honey_1kg uuid;
    v_product_honey_500g uuid;
    v_product_sample uuid;
BEGIN
    -- Minimal unit master required by products.
    SELECT id
    INTO v_unit_pcs
    FROM units
    WHERE upper(unit_name) = 'PCS'
    LIMIT 1;

    IF v_unit_pcs IS NULL THEN
        INSERT INTO units (id, unit_name, created_at, updated_at)
        VALUES (gen_random_uuid(), 'PCS', v_now, v_now)
        RETURNING id INTO v_unit_pcs;
    END IF;

    -- Minimal HSN master rows used by demo products.
    SELECT id
    INTO v_hsn_honey
    FROM hsn_master
    WHERE hsn_code = '04090010'
    LIMIT 1;

    IF v_hsn_honey IS NULL THEN
        INSERT INTO hsn_master (id, hsn_code, description, gst_percent, is_active, created_at, updated_at)
        VALUES (
            gen_random_uuid(),
            '04090010',
            'Natural honey and honey based products',
            5.00,
            TRUE,
            v_now,
            v_now
        )
        RETURNING id INTO v_hsn_honey;
    END IF;

    SELECT id
    INTO v_hsn_sample
    FROM hsn_master
    WHERE hsn_code = '21069099'
    LIMIT 1;

    IF v_hsn_sample IS NULL THEN
        INSERT INTO hsn_master (id, hsn_code, description, gst_percent, is_active, created_at, updated_at)
        VALUES (
            gen_random_uuid(),
            '21069099',
            'Food preparation sample pack',
            5.00,
            TRUE,
            v_now,
            v_now
        )
        RETURNING id INTO v_hsn_sample;
    END IF;

    -- One warehouse is enough for admin, customer, and salesman sales-order testing.
    SELECT id
    INTO v_warehouse
    FROM warehouses
    WHERE code = 'DEMO-WH'
    LIMIT 1;

    IF v_warehouse IS NULL THEN
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
            'DEMO-WH',
            'Demo Main Warehouse',
            'Seed Data Street',
            'Nellore',
            'Andhra Pradesh',
            '524001',
            TRUE,
            v_now,
            v_now
        )
        RETURNING id INTO v_warehouse;
    END IF;

    -- Customer category controls class pricing and scheme eligibility.
    SELECT id
    INTO v_customer_category
    FROM customer_categories
    WHERE code = 'DEMO_B2B'
    LIMIT 1;

    IF v_customer_category IS NULL THEN
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
            'DEMO_B2B',
            'Demo B2B Category',
            'B2B',
            'B',
            TRUE,
            v_now,
            v_now
        )
        RETURNING id INTO v_customer_category;
    END IF;

    -- Seed one customer for customer/admin sales-order flows.
    SELECT id
    INTO v_customer
    FROM customers
    WHERE name = 'Demo Scheme Customer'
    LIMIT 1;

    IF v_customer IS NULL THEN
        INSERT INTO customers (
            id,
            name,
            customer_type,
            customer_category_id,
            phone,
            whatsapp_number,
            email,
            customer_class,
            is_line_sale_outlet,
            opening_balance,
            current_balance,
            credit_limit,
            password_hash,
            is_active,
            created_at,
            updated_at
        )
        VALUES (
            gen_random_uuid(),
            'Demo Scheme Customer',
            'B2B',
            v_customer_category,
            '9000010001',
            '9000010001',
            'customer.demo@bahu.local',
            'B2B_DISTRIBUTOR',
            FALSE,
            0,
            0,
            50000,
            crypt('ChangeMe@123', gen_salt('bf')),
            TRUE,
            v_now,
            v_now
        )
        RETURNING id INTO v_customer;
    END IF;

    INSERT INTO users (
        id,
        customer_id,
        account_type,
        phone,
        email,
        username,
        password_hash,
        failed_login_attempts,
        is_active,
        created_at,
        updated_at
    )
    SELECT
        gen_random_uuid(),
        v_customer,
        'CUSTOMER',
        '9000010001',
        'customer.demo@bahu.local',
        'customer.demo',
        crypt('ChangeMe@123', gen_salt('bf')),
        0,
        TRUE,
        v_now,
        v_now
    WHERE NOT EXISTS (
        SELECT 1
        FROM users
        WHERE customer_id = v_customer
           OR username = 'customer.demo'
    );

    -- Seed one salesman for employee sales-order flow.
    SELECT id
    INTO v_salesman
    FROM employees
    WHERE full_name = 'Demo Salesman'
    LIMIT 1;

    IF v_salesman IS NULL THEN
        INSERT INTO employees (
            id,
            warehouse_id,
            full_name,
            name,
            role,
            gender,
            phone,
            email,
            is_active,
            created_at,
            updated_at
        )
        VALUES (
            gen_random_uuid(),
            v_warehouse,
            'Demo Salesman',
            'Demo Salesman',
            'SALESMAN',
            'MALE',
            '9000011001',
            'salesman.demo@bahu.local',
            TRUE,
            v_now,
            v_now
        )
        RETURNING id INTO v_salesman;
    END IF;

    INSERT INTO users (
        id,
        employee_id,
        account_type,
        phone,
        email,
        username,
        password_hash,
        failed_login_attempts,
        is_active,
        created_at,
        updated_at
    )
    SELECT
        gen_random_uuid(),
        v_salesman,
        'EMPLOYEE',
        '9000011001',
        'salesman.demo@bahu.local',
        'salesman.demo',
        crypt('ChangeMe@123', gen_salt('bf')),
        0,
        TRUE,
        v_now,
        v_now
    WHERE NOT EXISTS (
        SELECT 1
        FROM users
        WHERE employee_id = v_salesman
           OR username = 'salesman.demo'
    );

    -- Demo products that make both discount and free-item schemes testable.
    SELECT id
    INTO v_product_honey_1kg
    FROM products
    WHERE sku = 'DEMO-HONEY-1KG'
    LIMIT 1;

    IF v_product_honey_1kg IS NULL THEN
        INSERT INTO products (
            id,
            sku,
            display_name,
            name,
            brand,
            category,
            sub_category,
            description,
            hsn_id,
            primary_unit_id,
            weight_in_grams,
            unit,
            is_bundle,
            base_price,
            tax_percent,
            is_active,
            created_at,
            updated_at
        )
        VALUES (
            gen_random_uuid(),
            'DEMO-HONEY-1KG',
            'Demo Honey 1 KG',
            'Demo Honey 1 KG',
            'BAHU',
            'HONEY',
            'PURE HONEY',
            'Scheme demo primary product',
            v_hsn_honey,
            v_unit_pcs,
            1000,
            'PCS',
            FALSE,
            240,
            5,
            TRUE,
            v_now,
            v_now
        )
        RETURNING id INTO v_product_honey_1kg;
    END IF;

    SELECT id
    INTO v_product_honey_500g
    FROM products
    WHERE sku = 'DEMO-HONEY-500G'
    LIMIT 1;

    IF v_product_honey_500g IS NULL THEN
        INSERT INTO products (
            id,
            sku,
            display_name,
            name,
            brand,
            category,
            sub_category,
            description,
            hsn_id,
            primary_unit_id,
            weight_in_grams,
            unit,
            is_bundle,
            base_price,
            tax_percent,
            is_active,
            created_at,
            updated_at
        )
        VALUES (
            gen_random_uuid(),
            'DEMO-HONEY-500G',
            'Demo Honey 500 G',
            'Demo Honey 500 G',
            'BAHU',
            'HONEY',
            'PURE HONEY',
            'Scheme demo secondary product',
            v_hsn_honey,
            v_unit_pcs,
            500,
            'PCS',
            FALSE,
            140,
            5,
            TRUE,
            v_now,
            v_now
        )
        RETURNING id INTO v_product_honey_500g;
    END IF;

    SELECT id
    INTO v_product_sample
    FROM products
    WHERE sku = 'DEMO-SAMPLE-100G'
    LIMIT 1;

    IF v_product_sample IS NULL THEN
        INSERT INTO products (
            id,
            sku,
            display_name,
            name,
            brand,
            category,
            sub_category,
            description,
            hsn_id,
            primary_unit_id,
            weight_in_grams,
            unit,
            is_bundle,
            base_price,
            tax_percent,
            is_active,
            created_at,
            updated_at
        )
        VALUES (
            gen_random_uuid(),
            'DEMO-SAMPLE-100G',
            'Demo Sample Pack 100 G',
            'Demo Sample Pack 100 G',
            'BAHU',
            'SAMPLES',
            'PROMO',
            'Free item demo product',
            v_hsn_sample,
            v_unit_pcs,
            100,
            'PCS',
            FALSE,
            30,
            5,
            TRUE,
            v_now,
            v_now
        )
        RETURNING id INTO v_product_sample;
    END IF;

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
        (gen_random_uuid(), v_product_honey_1kg, 260, 180, 220, 210, 230, TRUE, v_now, v_now),
        (gen_random_uuid(), v_product_honey_500g, 150, 95, 135, 125, 140, TRUE, v_now, v_now),
        (gen_random_uuid(), v_product_sample, 35, 18, 30, 28, 32, TRUE, v_now, v_now)
    ON CONFLICT (product_id) DO UPDATE
    SET
        mrp = EXCLUDED.mrp,
        cost_price = EXCLUDED.cost_price,
        a_class_price = EXCLUDED.a_class_price,
        b_class_price = EXCLUDED.b_class_price,
        c_class_price = EXCLUDED.c_class_price,
        is_active = EXCLUDED.is_active,
        updated_at = v_now;

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
        (gen_random_uuid(), v_warehouse, v_product_honey_1kg, 'DEMO-H1KG-001', (current_date + INTERVAL '365 days')::date, 40, 0, 0, v_now, v_now),
        (gen_random_uuid(), v_warehouse, v_product_honey_500g, 'DEMO-H500G-001', (current_date + INTERVAL '365 days')::date, 60, 0, 0, v_now, v_now),
        (gen_random_uuid(), v_warehouse, v_product_sample, 'DEMO-SAMPLE-001', (current_date + INTERVAL '365 days')::date, 100, 0, 0, v_now, v_now)
    ON CONFLICT (warehouse_id, product_id, batch_no) DO UPDATE
    SET
        expiry_date = EXCLUDED.expiry_date,
        available_quantity = EXCLUDED.available_quantity,
        reserved_quantity = 0,
        damaged_quantity = 0,
        updated_at = v_now;

    -- Scheme 1: 10 percent discount once honey purchase value crosses INR 300.
    IF NOT EXISTS (
        SELECT 1
        FROM schemes
        WHERE scheme_name = 'Demo Honey 10 Percent Off'
    ) THEN
        INSERT INTO schemes (
            id,
            scheme_name,
            customer_category_id,
            condition_basis,
            threshold_value,
            threshold_unit,
            brand,
            category,
            sub_category,
            product_id,
            reward_type,
            reward_discount_percent,
            reward_product_id,
            reward_product_quantity,
            note,
            start_date,
            end_date,
            is_active,
            created_at,
            updated_at
        )
        VALUES (
            gen_random_uuid(),
            'Demo Honey 10 Percent Off',
            v_customer_category,
            'VALUE',
            300,
            'INR',
            'BAHU',
            'HONEY',
            NULL,
            NULL,
            'DISCOUNT',
            10,
            NULL,
            NULL,
            'Applies 10 percent discount when honey cart value reaches INR 300.',
            (current_date - INTERVAL '1 day')::date,
            (current_date + INTERVAL '365 days')::date,
            TRUE,
            v_now,
            v_now
        );
    END IF;

    -- Scheme 2: when quantity reaches 3 honey pieces, add one free sample pack.
    IF NOT EXISTS (
        SELECT 1
        FROM schemes
        WHERE scheme_name = 'Demo Honey Free Sample'
    ) THEN
        INSERT INTO schemes (
            id,
            scheme_name,
            customer_category_id,
            condition_basis,
            threshold_value,
            threshold_unit,
            brand,
            category,
            sub_category,
            product_id,
            reward_type,
            reward_discount_percent,
            reward_product_id,
            reward_product_quantity,
            note,
            start_date,
            end_date,
            is_active,
            created_at,
            updated_at
        )
        VALUES (
            gen_random_uuid(),
            'Demo Honey Free Sample',
            v_customer_category,
            'QUANTITY',
            3,
            'PIECE',
            'BAHU',
            'HONEY',
            NULL,
            NULL,
            'FREE_ITEM',
            NULL,
            v_product_sample,
            1,
            'Adds one demo sample pack when honey quantity reaches 3 pieces.',
            (current_date - INTERVAL '1 day')::date,
            (current_date + INTERVAL '365 days')::date,
            TRUE,
            v_now,
            v_now
        );
    END IF;
END $$;

COMMIT;
