-- Align legacy scheme_type (002_hardening_schema NOT NULL) with reward_type for rows missing it.
UPDATE schemes
SET scheme_type = CASE reward_type
    WHEN 'DISCOUNT' THEN 'DISCOUNT'
    WHEN 'FREE_ITEM' THEN 'FREE_ITEM'
    ELSE 'DISCOUNT'
END
WHERE scheme_type IS NULL;
