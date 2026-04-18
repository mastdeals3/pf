/*
  # Document flow locking — SO → DC → Invoice

  Enforces a strict, one-directional document chain:
    Sales Order → Delivery Challan → Invoice

  ## Invariants
  - An Invoice cannot exist without a Delivery Challan
    (invoices.delivery_challan_id NOT NULL, FK to delivery_challans.id)
  - A Delivery Challan cannot exist without a Sales Order
    (delivery_challans.sales_order_id NOT NULL, FK to sales_orders.id)
  - Stock is reduced exactly once, at DC creation
    (via post_stock_movement inside create_delivery_challan)
  - Invoices never touch stock

  ## Status flow
  - SO:       draft → confirmed → dispatched
  - DC:       created → invoiced
  - Invoice:  issued → paid

  ## Contents
  1. Backfill orphaned DCs / invoices so the NOT NULL can be applied.
  2. ALTER columns to NOT NULL.
  3. Create RPCs: create_sales_order, create_delivery_challan, create_invoice.
     Each validates inputs, copies downstream fields from the upstream doc,
     and runs in a single transaction. Frontend values for stock and totals
     on the invoice/DC level are ignored.
*/

-- ---------------------------------------------------------------------------
-- 1. BACKFILL ORPHANS
-- ---------------------------------------------------------------------------

-- 1a. Orphan DCs (sales_order_id IS NULL) → synthesize a matching SO from
--     the DC's own customer + items.
DO $$
DECLARE
  dc_rec RECORD;
  new_so_id uuid;
BEGIN
  FOR dc_rec IN SELECT * FROM delivery_challans WHERE sales_order_id IS NULL LOOP
    INSERT INTO sales_orders (
      so_number, customer_id, customer_name, customer_phone, customer_address,
      customer_address2, customer_city, customer_state, customer_pincode,
      so_date, status, subtotal, total_amount, company_id, notes
    ) VALUES (
      'LEGACY-SO-' || substring(dc_rec.id::text, 1, 8),
      dc_rec.customer_id, dc_rec.customer_name, dc_rec.customer_phone, dc_rec.customer_address,
      dc_rec.customer_address2, dc_rec.customer_city, dc_rec.customer_state, dc_rec.customer_pincode,
      dc_rec.challan_date, 'dispatched',
      0, 0, dc_rec.company_id,
      'Legacy backfill from DC ' || COALESCE(dc_rec.challan_number, dc_rec.id::text)
    ) RETURNING id INTO new_so_id;

    INSERT INTO sales_order_items (
      sales_order_id, product_id, product_name, unit, quantity,
      unit_price, discount_pct, total_price, godown_id
    )
    SELECT new_so_id, product_id, product_name, unit, quantity,
      unit_price, discount_pct, total_price, godown_id
    FROM delivery_challan_items WHERE delivery_challan_id = dc_rec.id;

    UPDATE sales_orders SET
      subtotal     = (SELECT COALESCE(SUM(total_price), 0) FROM sales_order_items WHERE sales_order_id = new_so_id),
      total_amount = (SELECT COALESCE(SUM(total_price), 0) FROM sales_order_items WHERE sales_order_id = new_so_id)
    WHERE id = new_so_id;

    UPDATE delivery_challans SET sales_order_id = new_so_id WHERE id = dc_rec.id;
  END LOOP;
END $$;

-- 1b. Orphan invoices (delivery_challan_id IS NULL) → synthesize a DC
--     (and an SO if also missing) from the invoice's own items.
DO $$
DECLARE
  inv_rec RECORD;
  new_so_id uuid;
  new_dc_id uuid;
BEGIN
  FOR inv_rec IN SELECT * FROM invoices WHERE delivery_challan_id IS NULL LOOP
    IF inv_rec.sales_order_id IS NULL THEN
      INSERT INTO sales_orders (
        so_number, customer_id, customer_name, customer_phone, customer_address,
        customer_address2, customer_city, customer_state, customer_pincode,
        so_date, status, subtotal, total_amount, company_id, notes
      ) VALUES (
        'LEGACY-SO-' || substring(inv_rec.id::text, 1, 8),
        inv_rec.customer_id, inv_rec.customer_name, inv_rec.customer_phone, inv_rec.customer_address,
        inv_rec.customer_address2, inv_rec.customer_city, inv_rec.customer_state, inv_rec.customer_pincode,
        inv_rec.invoice_date, 'dispatched',
        COALESCE(inv_rec.subtotal, 0), COALESCE(inv_rec.total_amount, 0), inv_rec.company_id,
        'Legacy backfill from invoice ' || COALESCE(inv_rec.invoice_number, inv_rec.id::text)
      ) RETURNING id INTO new_so_id;

      INSERT INTO sales_order_items (
        sales_order_id, product_id, product_name, unit, quantity,
        unit_price, discount_pct, total_price, godown_id
      )
      SELECT new_so_id, product_id, product_name, unit, quantity,
        unit_price, discount_pct, total_price, godown_id
      FROM invoice_items WHERE invoice_id = inv_rec.id;

      UPDATE invoices SET sales_order_id = new_so_id WHERE id = inv_rec.id;
    ELSE
      new_so_id := inv_rec.sales_order_id;
    END IF;

    INSERT INTO delivery_challans (
      challan_number, sales_order_id, customer_id, customer_name, customer_phone,
      customer_address, customer_address2, customer_city, customer_state, customer_pincode,
      challan_date, status, notes, company_id
    ) VALUES (
      'LEGACY-DC-' || substring(inv_rec.id::text, 1, 8),
      new_so_id, inv_rec.customer_id, inv_rec.customer_name, inv_rec.customer_phone,
      inv_rec.customer_address, inv_rec.customer_address2, inv_rec.customer_city,
      inv_rec.customer_state, inv_rec.customer_pincode,
      inv_rec.invoice_date, 'invoiced',
      'Legacy backfill from invoice ' || COALESCE(inv_rec.invoice_number, inv_rec.id::text),
      inv_rec.company_id
    ) RETURNING id INTO new_dc_id;

    INSERT INTO delivery_challan_items (
      delivery_challan_id, product_id, product_name, unit, quantity,
      unit_price, discount_pct, total_price, godown_id
    )
    SELECT new_dc_id, product_id, product_name, unit, quantity,
      unit_price, discount_pct, total_price, godown_id
    FROM invoice_items WHERE invoice_id = inv_rec.id;

    UPDATE invoices SET delivery_challan_id = new_dc_id WHERE id = inv_rec.id;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2. NOT NULL CONSTRAINTS
-- ---------------------------------------------------------------------------

ALTER TABLE delivery_challans ALTER COLUMN sales_order_id     SET NOT NULL;
ALTER TABLE invoices          ALTER COLUMN delivery_challan_id SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. RPCs
-- ---------------------------------------------------------------------------

-- 3a. create_sales_order -----------------------------------------------------
CREATE OR REPLACE FUNCTION create_sales_order(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_so_id       uuid;
  v_items       jsonb;
  v_item        jsonb;
  v_subtotal    numeric := 0;
  v_total       numeric;
  v_customer_id uuid;
BEGIN
  v_customer_id := NULLIF(p_payload->>'customer_id', '')::uuid;
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'customer_id is required';
  END IF;

  v_items := p_payload->'items';
  IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'at least one item is required';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    IF (v_item->>'product_id') IS NULL OR (v_item->>'quantity')::numeric <= 0 THEN
      RAISE EXCEPTION 'each item needs product_id and positive quantity';
    END IF;
    v_subtotal := v_subtotal
      + (v_item->>'quantity')::numeric
      * (v_item->>'unit_price')::numeric
      * (1 - COALESCE((v_item->>'discount_pct')::numeric, 0) / 100);
  END LOOP;

  v_total := v_subtotal
    + COALESCE((p_payload->>'courier_charges')::numeric, 0)
    + COALESCE((p_payload->>'tax_amount')::numeric, 0)
    - COALESCE((p_payload->>'discount_amount')::numeric, 0);

  INSERT INTO sales_orders (
    so_number, customer_id, customer_name, customer_phone, customer_address,
    customer_address2, customer_city, customer_state, customer_pincode,
    so_date, delivery_date, status, subtotal, tax_amount, courier_charges,
    discount_amount, total_amount, notes, godown_id, company_id
  ) VALUES (
    p_payload->>'so_number',
    v_customer_id,
    p_payload->>'customer_name',
    p_payload->>'customer_phone',
    p_payload->>'customer_address',
    p_payload->>'customer_address2',
    p_payload->>'customer_city',
    p_payload->>'customer_state',
    p_payload->>'customer_pincode',
    NULLIF(p_payload->>'so_date', '')::date,
    NULLIF(p_payload->>'delivery_date', '')::date,
    'confirmed',
    v_subtotal,
    COALESCE((p_payload->>'tax_amount')::numeric, 0),
    COALESCE((p_payload->>'courier_charges')::numeric, 0),
    COALESCE((p_payload->>'discount_amount')::numeric, 0),
    v_total,
    p_payload->>'notes',
    NULLIF(p_payload->>'godown_id', '')::uuid,
    NULLIF(p_payload->>'company_id', '')::uuid
  ) RETURNING id INTO v_so_id;

  INSERT INTO sales_order_items (
    sales_order_id, product_id, product_name, unit, quantity,
    unit_price, discount_pct, total_price, godown_id
  )
  SELECT v_so_id,
    (item->>'product_id')::uuid,
    item->>'product_name',
    item->>'unit',
    (item->>'quantity')::numeric,
    (item->>'unit_price')::numeric,
    COALESCE((item->>'discount_pct')::numeric, 0),
    (item->>'quantity')::numeric
      * (item->>'unit_price')::numeric
      * (1 - COALESCE((item->>'discount_pct')::numeric, 0) / 100),
    NULLIF(item->>'godown_id', '')::uuid
  FROM jsonb_array_elements(v_items) AS item;

  RETURN v_so_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_sales_order(jsonb) TO authenticated;

-- 3b. create_delivery_challan -----------------------------------------------
-- Copies customer + items from the SO. Reduces stock per item via
-- post_stock_movement. Transitions SO to 'dispatched'. DC status = 'created'.
CREATE OR REPLACE FUNCTION create_delivery_challan(
  p_sales_order_id uuid,
  p_payload        jsonb
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_dc_id           uuid;
  v_so              RECORD;
  v_item            RECORD;
  v_challan_number  text;
BEGIN
  IF p_sales_order_id IS NULL THEN
    RAISE EXCEPTION 'sales_order_id is required';
  END IF;

  SELECT * INTO v_so FROM sales_orders WHERE id = p_sales_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sales order % not found', p_sales_order_id;
  END IF;
  IF v_so.status NOT IN ('draft', 'confirmed') THEN
    RAISE EXCEPTION 'Sales order cannot be dispatched (status: %)', v_so.status;
  END IF;

  v_challan_number := COALESCE(p_payload->>'challan_number', '');

  INSERT INTO delivery_challans (
    challan_number, sales_order_id, customer_id, customer_name, customer_phone,
    customer_address, customer_address2, customer_city, customer_state, customer_pincode,
    challan_date, dispatch_mode, courier_company, tracking_number,
    status, notes, company_id
  ) VALUES (
    v_challan_number,
    p_sales_order_id,
    v_so.customer_id,
    v_so.customer_name,
    v_so.customer_phone,
    v_so.customer_address,
    v_so.customer_address2,
    v_so.customer_city,
    v_so.customer_state,
    v_so.customer_pincode,
    COALESCE(NULLIF(p_payload->>'challan_date', '')::date, CURRENT_DATE),
    p_payload->>'dispatch_mode',
    p_payload->>'courier_company',
    p_payload->>'tracking_number',
    'created',
    p_payload->>'notes',
    v_so.company_id
  ) RETURNING id INTO v_dc_id;

  INSERT INTO delivery_challan_items (
    delivery_challan_id, product_id, product_name, unit, quantity,
    unit_price, discount_pct, total_price, godown_id
  )
  SELECT v_dc_id, product_id, product_name, unit, quantity,
    unit_price, discount_pct, total_price, godown_id
  FROM sales_order_items
  WHERE sales_order_id = p_sales_order_id;

  -- Reduce stock for every item that has a godown set.
  FOR v_item IN
    SELECT product_id, godown_id, quantity
    FROM sales_order_items
    WHERE sales_order_id = p_sales_order_id
      AND godown_id IS NOT NULL
      AND product_id IS NOT NULL
  LOOP
    PERFORM post_stock_movement(
      v_item.product_id,
      v_item.godown_id,
      -v_item.quantity,
      'sale',
      'delivery_challan',
      v_dc_id,
      v_challan_number,
      'DC ' || v_challan_number
    );
  END LOOP;

  UPDATE sales_orders
     SET status = 'dispatched', updated_at = now()
   WHERE id = p_sales_order_id;

  RETURN v_dc_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_delivery_challan(uuid, jsonb) TO authenticated;

-- 3c. create_invoice ---------------------------------------------------------
-- Copies customer + items from the DC. Never touches stock. Transitions DC to
-- 'invoiced'. Writes the customer AR debit ledger entry. Tax is applied from
-- the optional item_tax map { "<dc_item_id>": <tax_pct> }.
CREATE OR REPLACE FUNCTION create_invoice(
  p_delivery_challan_id uuid,
  p_payload             jsonb
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_invoice_id     uuid;
  v_dc             RECORD;
  v_item           RECORD;
  v_tax_map        jsonb;
  v_subtotal       numeric := 0;
  v_tax            numeric := 0;
  v_total          numeric;
  v_line_base      numeric;
  v_line_tax_pct   numeric;
  v_invoice_number text;
  v_courier        numeric;
  v_discount       numeric;
BEGIN
  IF p_delivery_challan_id IS NULL THEN
    RAISE EXCEPTION 'delivery_challan_id is required';
  END IF;

  SELECT * INTO v_dc FROM delivery_challans WHERE id = p_delivery_challan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery challan % not found', p_delivery_challan_id;
  END IF;
  IF v_dc.status <> 'created' THEN
    RAISE EXCEPTION 'Delivery challan cannot be invoiced (status: %)', v_dc.status;
  END IF;

  v_tax_map := COALESCE(p_payload->'item_tax', '{}'::jsonb);
  v_courier := COALESCE((p_payload->>'courier_charges')::numeric, 0);
  v_discount := COALESCE((p_payload->>'discount_amount')::numeric, 0);

  FOR v_item IN
    SELECT * FROM delivery_challan_items
    WHERE delivery_challan_id = p_delivery_challan_id
  LOOP
    v_line_base := v_item.quantity * v_item.unit_price
                   * (1 - COALESCE(v_item.discount_pct, 0) / 100);
    v_line_tax_pct := COALESCE((v_tax_map->>v_item.id::text)::numeric, 0);
    v_subtotal := v_subtotal + v_line_base;
    v_tax      := v_tax + v_line_base * v_line_tax_pct / 100;
  END LOOP;

  v_total := v_subtotal + v_tax + v_courier - v_discount;
  v_invoice_number := COALESCE(p_payload->>'invoice_number', '');

  INSERT INTO invoices (
    invoice_number, sales_order_id, delivery_challan_id,
    customer_id, customer_name, customer_phone, customer_address,
    customer_address2, customer_city, customer_state, customer_pincode,
    invoice_date, due_date, status,
    subtotal, tax_amount, courier_charges, discount_amount, total_amount,
    paid_amount, outstanding_amount,
    payment_terms, notes, bank_name, account_number, ifsc_code, company_id
  ) VALUES (
    v_invoice_number,
    v_dc.sales_order_id,
    p_delivery_challan_id,
    v_dc.customer_id,
    v_dc.customer_name,
    v_dc.customer_phone,
    v_dc.customer_address,
    v_dc.customer_address2,
    v_dc.customer_city,
    v_dc.customer_state,
    v_dc.customer_pincode,
    COALESCE(NULLIF(p_payload->>'invoice_date', '')::date, CURRENT_DATE),
    NULLIF(p_payload->>'due_date', '')::date,
    'issued',
    v_subtotal,
    v_tax,
    v_courier,
    v_discount,
    v_total,
    0,
    v_total,
    p_payload->>'payment_terms',
    p_payload->>'notes',
    p_payload->>'bank_name',
    p_payload->>'account_number',
    p_payload->>'ifsc_code',
    v_dc.company_id
  ) RETURNING id INTO v_invoice_id;

  INSERT INTO invoice_items (
    invoice_id, product_id, product_name, description, unit, quantity,
    unit_price, discount_pct, tax_pct, total_price, godown_id
  )
  SELECT v_invoice_id,
    dci.product_id,
    dci.product_name,
    NULL,
    dci.unit,
    dci.quantity,
    dci.unit_price,
    COALESCE(dci.discount_pct, 0),
    COALESCE((v_tax_map->>dci.id::text)::numeric, 0),
    dci.quantity * dci.unit_price
      * (1 - COALESCE(dci.discount_pct, 0) / 100)
      * (1 + COALESCE((v_tax_map->>dci.id::text)::numeric, 0) / 100),
    dci.godown_id
  FROM delivery_challan_items dci
  WHERE dci.delivery_challan_id = p_delivery_challan_id;

  INSERT INTO ledger_entries (
    customer_id, party_id, party_name, account_type, entry_type,
    amount, description, reference_type, reference_id, entry_date
  ) VALUES (
    v_dc.customer_id,
    v_dc.customer_id,
    COALESCE(v_dc.customer_name, ''),
    'customer',
    'debit',
    v_total,
    'Invoice ' || v_invoice_number,
    'invoice',
    v_invoice_id,
    COALESCE(NULLIF(p_payload->>'invoice_date', '')::date, CURRENT_DATE)
  );

  UPDATE delivery_challans
     SET status = 'invoiced', updated_at = now()
   WHERE id = p_delivery_challan_id;

  RETURN v_invoice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_invoice(uuid, jsonb) TO authenticated;
