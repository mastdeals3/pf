/*
  # Fix DC numbers and B2B flag

  ## Changes

  1. Rename malformed DC number DC-2604-3206 → DC/2604/007

  2. Rename 7 LEGACY-DC-* challans to proper DC/YYMM/NNN format:
     - March 2026 → DC/2603/001
     - April 2026 → DC/2604/009 … DC/2604/014

  3. Update challan_number in stock_movements.reference_number for consistency.

  4. Fix DC/2604/008 is_b2b = true (its linked SO/2604/015 is B2B).
     Catch-all: sync is_b2b on all DCs from their linked SO.

  5. Advance document_sequences DC counter to 15 so next auto-number = DC/2604/016.
*/

-- 1. Malformed format
UPDATE delivery_challans SET challan_number = 'DC/2604/007' WHERE challan_number = 'DC-2604-3206';
UPDATE stock_movements   SET reference_number = 'DC/2604/007' WHERE reference_number = 'DC-2604-3206';

-- 2 & 3. March legacy
UPDATE delivery_challans SET challan_number = 'DC/2603/001' WHERE challan_number = 'LEGACY-DC-5066b7b2';
UPDATE stock_movements   SET reference_number = 'DC/2603/001' WHERE reference_number = 'LEGACY-DC-5066b7b2';

-- April legacy (sorted by challan_date)
UPDATE delivery_challans SET challan_number = 'DC/2604/009' WHERE challan_number = 'LEGACY-DC-57dc7751';
UPDATE stock_movements   SET reference_number = 'DC/2604/009' WHERE reference_number = 'LEGACY-DC-57dc7751';

UPDATE delivery_challans SET challan_number = 'DC/2604/010' WHERE challan_number = 'LEGACY-DC-cba192fc';
UPDATE stock_movements   SET reference_number = 'DC/2604/010' WHERE reference_number = 'LEGACY-DC-cba192fc';

UPDATE delivery_challans SET challan_number = 'DC/2604/011' WHERE challan_number = 'LEGACY-DC-fa6e7cd8';
UPDATE stock_movements   SET reference_number = 'DC/2604/011' WHERE reference_number = 'LEGACY-DC-fa6e7cd8';

UPDATE delivery_challans SET challan_number = 'DC/2604/012' WHERE challan_number = 'LEGACY-DC-140f34f8';
UPDATE stock_movements   SET reference_number = 'DC/2604/012' WHERE reference_number = 'LEGACY-DC-140f34f8';

UPDATE delivery_challans SET challan_number = 'DC/2604/013' WHERE challan_number = 'LEGACY-DC-3a7dee5c';
UPDATE stock_movements   SET reference_number = 'DC/2604/013' WHERE reference_number = 'LEGACY-DC-3a7dee5c';

UPDATE delivery_challans SET challan_number = 'DC/2604/014' WHERE challan_number = 'LEGACY-DC-ef4c738f';
UPDATE stock_movements   SET reference_number = 'DC/2604/014' WHERE reference_number = 'LEGACY-DC-ef4c738f';

-- 4. Fix B2B flags
UPDATE delivery_challans SET is_b2b = true  WHERE challan_number = 'DC/2604/008';

UPDATE delivery_challans dc
   SET is_b2b = so.is_b2b
  FROM sales_orders so
 WHERE dc.sales_order_id = so.id
   AND dc.is_b2b IS DISTINCT FROM so.is_b2b;

-- 5. Advance DC sequence counter to 15
INSERT INTO document_sequences (prefix, year_month, last_seq)
VALUES ('DC', '2604', 15)
ON CONFLICT (prefix, year_month)
DO UPDATE SET last_seq = GREATEST(document_sequences.last_seq, 15);
