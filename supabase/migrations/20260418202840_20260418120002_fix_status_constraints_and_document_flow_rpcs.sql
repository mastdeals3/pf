/*
  # Fix status constraints and create document flow RPCs

  1. Expands delivery_challans.status to include 'created' and 'invoiced'
  2. Expands invoices.status to include 'issued'
  3. Backfills invoices.delivery_challan_id:
     - If the invoice's SO already has a DC, link to that DC
     - Otherwise, create a synthetic DC
  4. Enforces NOT NULL on delivery_challans.sales_order_id and invoices.delivery_challan_id
  5. Creates unique partial indexes
  6. Creates RPCs: create_delivery_challan, create_invoice,
     cancel_delivery_challan, cancel_invoice
*/

-- ---------------------------------------------------------------------------
-- 1. FIX STATUS CONSTRAINTS
-- ---------------------------------------------------------------------------

ALTER TABLE delivery_challans DROP CONSTRAINT IF EXISTS delivery_challans_status_check;
ALTER TABLE delivery_challans ADD CONSTRAINT delivery_challans_status_check
  CHECK (status = ANY (ARRAY[
    'draft','created','dispatched','invoiced','delivered','cancelled'
  ]));

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
  CHECK (status = ANY (ARRAY[
    'draft','issued','sent','partial','paid','overdue','cancelled'
  ]));

-- ---------------------------------------------------------------------------
-- 2. BACKFILL orphaned DCs (sales_order_id IS NULL)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  dc_rec    RECORD;
  new_so_id uuid;
BEGIN
  FOR dc_rec IN
    SELECT * FROM delivery_challans WHERE sales_order_id IS NULL
  LOOP
    INSERT INTO sales_orders (
      so_number, customer_id, customer_name, customer_phone,
      customer_address, customer_address2, customer_city, customer_state,
      customer_pincode, so_date, status, subtotal, total_amount,
      company_id, notes
    ) VALUES (
      'LEGACY-SO-' || substring(dc_rec.id::text, 1, 8),
      dc_rec.customer_id, dc_rec.customer_name, dc_rec.customer_phone,
      dc_rec.customer_address, dc_rec.customer_address2,
      dc_rec.customer_city, dc_rec.customer_state, dc_rec.customer_pincode,
      dc_rec.challan_date, 'dispatched', 0, 0, dc_rec.company_id,
      'Legacy backfill from DC ' || COALESCE(dc_rec.challan_number, dc_rec.id::text)
    ) RETURNING id INTO new_so_id;

    INSERT INTO sales_order_items (
      sales_order_id, product_id, product_name, unit, quantity,
      unit_price, discount_pct, total_price, godown_id
    )
    SELECT new_so_id, product_id, product_name, unit, quantity,
      unit_price, discount_pct, total_price, godown_id
    FROM delivery_challan_items WHERE delivery_challan_id = dc_rec.id;

    UPDATE delivery_challans SET sales_order_id = new_so_id WHERE id = dc_rec.id;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. BACKFILL orphaned invoices (delivery_challan_id IS NULL)
--    Link to existing DC if one exists for the SO; otherwise create one.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  inv_rec    RECORD;
  new_so_id  uuid;
  new_dc_id  uuid;
  exist_dc_id uuid;
BEGIN
  FOR inv_rec IN
    SELECT * FROM invoices WHERE delivery_challan_id IS NULL
  LOOP
    -- Ensure there's a parent SO
    IF inv_rec.sales_order_id IS NULL THEN
      INSERT INTO sales_orders (
        so_number, customer_id, customer_name, customer_phone,
        customer_address, customer_address2, customer_city, customer_state,
        customer_pincode, so_date, status, subtotal, total_amount,
        company_id, notes
      ) VALUES (
        'LEGACY-SO-' || substring(inv_rec.id::text, 1, 8),
        inv_rec.customer_id, inv_rec.customer_name, inv_rec.customer_phone,
        inv_rec.customer_address, inv_rec.customer_address2,
        inv_rec.customer_city, inv_rec.customer_state, inv_rec.customer_pincode,
        inv_rec.invoice_date, 'dispatched',
        COALESCE(inv_rec.subtotal, 0), COALESCE(inv_rec.total_amount, 0),
        inv_rec.company_id,
        'Legacy backfill from invoice ' || COALESCE(inv_rec.invoice_number, inv_rec.id::text)
      ) RETURNING id INTO new_so_id;
      UPDATE invoices SET sales_order_id = new_so_id WHERE id = inv_rec.id;
    ELSE
      new_so_id := inv_rec.sales_order_id;
    END IF;

    -- Check if the SO already has a DC
    SELECT id INTO exist_dc_id
      FROM delivery_challans
     WHERE sales_order_id = new_so_id
     LIMIT 1;

    IF exist_dc_id IS NOT NULL THEN
      -- Link invoice to the existing DC
      UPDATE invoices SET delivery_challan_id = exist_dc_id WHERE id = inv_rec.id;
    ELSE
      -- Create a synthetic DC
      INSERT INTO delivery_challans (
        challan_number, sales_order_id, customer_id, customer_name,
        customer_phone, customer_address, customer_address2,
        customer_city, customer_state, customer_pincode,
        challan_date, status, notes, company_id
      ) VALUES (
        'LEGACY-DC-' || substring(inv_rec.id::text, 1, 8),
        new_so_id, inv_rec.customer_id, inv_rec.customer_name,
        inv_rec.customer_phone, inv_rec.customer_address, inv_rec.customer_address2,
        inv_rec.customer_city, inv_rec.customer_state, inv_rec.customer_pincode,
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
    END IF;
  END LOOP;
END $$;

-- Migrate old DC status vocabulary to new flow vocabulary
-- DCs that have an active (non-cancelled) linked invoice → 'invoiced'
UPDATE delivery_challans dc
   SET status = 'invoiced'
  WHERE status = 'dispatched'
    AND EXISTS (
      SELECT 1 FROM invoices i
       WHERE i.delivery_challan_id = dc.id
         AND i.status <> 'cancelled'
    );

-- DCs that have NO active invoice and are currently 'dispatched' → 'created'
UPDATE delivery_challans dc
   SET status = 'created'
  WHERE status = 'dispatched'
    AND NOT EXISTS (
      SELECT 1 FROM invoices i
       WHERE i.delivery_challan_id = dc.id
         AND i.status <> 'cancelled'
    );

-- Migrate old invoice status 'sent' → 'issued' for the RPC flow
-- (keep 'sent' in the allowed list so existing records aren't broken)
-- No conversion needed; 'sent' remains valid, 'issued' is added

-- ---------------------------------------------------------------------------
-- 4. NOT NULL CONSTRAINTS
-- ---------------------------------------------------------------------------

ALTER TABLE delivery_challans ALTER COLUMN sales_order_id SET NOT NULL;
ALTER TABLE invoices ALTER COLUMN delivery_challan_id SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 5. UNIQUE PARTIAL INDEXES
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS ux_delivery_challan_active_per_so
  ON delivery_challans (sales_order_id)
  WHERE status <> 'cancelled';

CREATE UNIQUE INDEX IF NOT EXISTS ux_invoice_active_per_dc
  ON invoices (delivery_challan_id)
  WHERE status <> 'cancelled';

-- ---------------------------------------------------------------------------
-- 6. create_delivery_challan RPC
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION create_delivery_challan(
  p_sales_order_id uuid,
  p_payload        jsonb
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_dc_id          uuid;
  v_so             RECORD;
  v_item           RECORD;
  v_challan_number text;
BEGIN
  IF p_sales_order_id IS NULL THEN
    RAISE EXCEPTION 'sales_order_id is required';
  END IF;

  SELECT * INTO v_so FROM sales_orders WHERE id = p_sales_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sales order % not found', p_sales_order_id;
  END IF;
  IF v_so.status NOT IN ('draft', 'confirmed') THEN
    RAISE EXCEPTION 'Sales order % cannot be dispatched (status: %)',
      v_so.so_number, v_so.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1 FROM delivery_challans
     WHERE sales_order_id = p_sales_order_id AND status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'Sales order % already has an active delivery challan',
      v_so.so_number
      USING ERRCODE = 'check_violation';
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
  FROM sales_order_items WHERE sales_order_id = p_sales_order_id;

  FOR v_item IN
    SELECT product_id, godown_id, quantity
      FROM sales_order_items
     WHERE sales_order_id = p_sales_order_id
       AND godown_id IS NOT NULL AND product_id IS NOT NULL
  LOOP
    PERFORM post_stock_movement(
      v_item.product_id, v_item.godown_id, -v_item.quantity,
      'sale', 'delivery_challan', v_dc_id,
      v_challan_number, 'DC ' || v_challan_number
    );
  END LOOP;

  UPDATE sales_orders SET status = 'dispatched', updated_at = now()
   WHERE id = p_sales_order_id;

  RETURN v_dc_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_delivery_challan(uuid, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. create_invoice RPC
-- ---------------------------------------------------------------------------

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

  SELECT * INTO v_dc FROM delivery_challans WHERE id = p_delivery_challan_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery challan % not found', p_delivery_challan_id;
  END IF;
  IF v_dc.status <> 'created' THEN
    RAISE EXCEPTION 'Delivery challan % cannot be invoiced (status: %)',
      v_dc.challan_number, v_dc.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1 FROM invoices
     WHERE delivery_challan_id = p_delivery_challan_id AND status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'Delivery challan % already has an active invoice',
      v_dc.challan_number
      USING ERRCODE = 'check_violation';
  END IF;

  v_tax_map  := COALESCE(p_payload->'item_tax', '{}'::jsonb);
  v_courier  := COALESCE((p_payload->>'courier_charges')::numeric, 0);
  v_discount := COALESCE((p_payload->>'discount_amount')::numeric, 0);

  FOR v_item IN
    SELECT * FROM delivery_challan_items WHERE delivery_challan_id = p_delivery_challan_id
  LOOP
    v_line_base    := v_item.quantity * v_item.unit_price
                      * (1 - COALESCE(v_item.discount_pct, 0) / 100);
    v_line_tax_pct := COALESCE((v_tax_map->>v_item.id::text)::numeric, 0);
    v_subtotal     := v_subtotal + v_line_base;
    v_tax          := v_tax + v_line_base * v_line_tax_pct / 100;
  END LOOP;

  v_total          := v_subtotal + v_tax + v_courier - v_discount;
  v_invoice_number := COALESCE(p_payload->>'invoice_number', '');

  INSERT INTO invoices (
    invoice_number, sales_order_id, delivery_challan_id,
    customer_id, customer_name, customer_phone,
    customer_address, customer_address2, customer_city, customer_state, customer_pincode,
    invoice_date, due_date, status,
    subtotal, tax_amount, courier_charges, discount_amount, total_amount,
    paid_amount, outstanding_amount,
    payment_terms, notes, bank_name, account_number, ifsc_code, company_id
  ) VALUES (
    v_invoice_number, v_dc.sales_order_id, p_delivery_challan_id,
    v_dc.customer_id, v_dc.customer_name, v_dc.customer_phone,
    v_dc.customer_address, v_dc.customer_address2, v_dc.customer_city,
    v_dc.customer_state, v_dc.customer_pincode,
    COALESCE(NULLIF(p_payload->>'invoice_date', '')::date, CURRENT_DATE),
    NULLIF(p_payload->>'due_date', '')::date,
    'issued',
    v_subtotal, v_tax, v_courier, v_discount, v_total,
    0, v_total,
    p_payload->>'payment_terms', p_payload->>'notes',
    p_payload->>'bank_name', p_payload->>'account_number', p_payload->>'ifsc_code',
    v_dc.company_id
  ) RETURNING id INTO v_invoice_id;

  INSERT INTO invoice_items (
    invoice_id, product_id, product_name, description, unit, quantity,
    unit_price, discount_pct, tax_pct, total_price, godown_id
  )
  SELECT v_invoice_id,
    dci.product_id, dci.product_name, NULL, dci.unit, dci.quantity,
    dci.unit_price,
    COALESCE(dci.discount_pct, 0),
    COALESCE((v_tax_map->>dci.id::text)::numeric, 0),
    dci.quantity * dci.unit_price
      * (1 - COALESCE(dci.discount_pct, 0) / 100)
      * (1 + COALESCE((v_tax_map->>dci.id::text)::numeric, 0) / 100),
    dci.godown_id
  FROM delivery_challan_items dci WHERE dci.delivery_challan_id = p_delivery_challan_id;

  INSERT INTO ledger_entries (
    customer_id, party_id, party_name, account_type, entry_type,
    amount, description, reference_type, reference_id, entry_date
  ) VALUES (
    v_dc.customer_id, v_dc.customer_id, COALESCE(v_dc.customer_name, ''),
    'customer', 'debit', v_total,
    'Invoice ' || v_invoice_number,
    'invoice', v_invoice_id,
    COALESCE(NULLIF(p_payload->>'invoice_date', '')::date, CURRENT_DATE)
  );

  UPDATE delivery_challans SET status = 'invoiced', updated_at = now()
   WHERE id = p_delivery_challan_id;

  RETURN v_invoice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_invoice(uuid, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. cancel_delivery_challan RPC
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION cancel_delivery_challan(p_dc_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_dc         RECORD;
  v_item       RECORD;
  v_active_inv int;
BEGIN
  IF p_dc_id IS NULL THEN
    RAISE EXCEPTION 'dc_id is required';
  END IF;

  SELECT * INTO v_dc FROM delivery_challans WHERE id = p_dc_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery challan % not found', p_dc_id;
  END IF;
  IF v_dc.status = 'cancelled' THEN
    RAISE EXCEPTION 'Delivery challan % is already cancelled', v_dc.challan_number
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COUNT(*) INTO v_active_inv FROM invoices
   WHERE delivery_challan_id = p_dc_id AND status <> 'cancelled';
  IF v_active_inv > 0 THEN
    RAISE EXCEPTION 'Cannot cancel DC %: it has an active invoice. Cancel the invoice first.',
      v_dc.challan_number
      USING ERRCODE = 'check_violation';
  END IF;

  FOR v_item IN
    SELECT product_id, godown_id, quantity FROM delivery_challan_items
     WHERE delivery_challan_id = p_dc_id
       AND godown_id IS NOT NULL AND product_id IS NOT NULL
  LOOP
    PERFORM post_stock_movement(
      v_item.product_id, v_item.godown_id, v_item.quantity,
      'sale_return', 'delivery_challan_cancel', p_dc_id,
      v_dc.challan_number, 'Reverse DC ' || v_dc.challan_number
    );
  END LOOP;

  UPDATE delivery_challans SET status = 'cancelled', updated_at = now()
   WHERE id = p_dc_id;

  UPDATE sales_orders SET status = 'confirmed', updated_at = now()
   WHERE id = v_dc.sales_order_id AND status = 'dispatched';
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_delivery_challan(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 9. cancel_invoice RPC
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION cancel_invoice(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_inv         RECORD;
  v_outstanding numeric;
BEGIN
  IF p_invoice_id IS NULL THEN
    RAISE EXCEPTION 'invoice_id is required';
  END IF;

  SELECT * INTO v_inv FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % not found', p_invoice_id;
  END IF;
  IF v_inv.status = 'cancelled' THEN
    RAISE EXCEPTION 'Invoice % is already cancelled', v_inv.invoice_number
      USING ERRCODE = 'check_violation';
  END IF;

  v_outstanding := COALESCE(v_inv.outstanding_amount, 0);

  IF v_outstanding > 0 THEN
    INSERT INTO ledger_entries (
      customer_id, party_id, party_name, account_type, entry_type,
      amount, description, reference_type, reference_id, entry_date
    ) VALUES (
      v_inv.customer_id, v_inv.customer_id, COALESCE(v_inv.customer_name, ''),
      'customer', 'credit', v_outstanding,
      'Cancellation of Invoice ' || v_inv.invoice_number,
      'invoice', p_invoice_id, CURRENT_DATE
    );
  END IF;

  UPDATE invoices
     SET status = 'cancelled', outstanding_amount = 0, updated_at = now()
   WHERE id = p_invoice_id;

  UPDATE delivery_challans SET status = 'created', updated_at = now()
   WHERE id = v_inv.delivery_challan_id AND status = 'invoiced';
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_invoice(uuid) TO authenticated;
