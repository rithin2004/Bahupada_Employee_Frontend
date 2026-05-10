UPDATE products p
SET tax_percent = h.gst_percent,
    updated_at = now()
FROM hsn_master h
WHERE p.hsn_id = h.id
  AND p.tax_percent IS DISTINCT FROM h.gst_percent;
