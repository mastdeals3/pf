/*
  # Add ship_to fields to delivery_challans and update RPC

  ## Summary
  Adds B2B ship-to columns to the delivery_challans table and updates the
  create_delivery_challan RPC to copy all ship_to_* and is_b2b fields from
  the linked sales order at DC creation time.

  ## New Columns on delivery_challans
  - `is_b2b` (boolean, default false) - whether this DC is for a B2B transaction
  - `ship_to_name` (text) - ship-to recipient name
  - `ship_to_phone` (text) - ship-to recipient phone
  - `ship_to_address1` (text) - ship-to address line 1
  - `ship_to_address2` (text) - ship-to address line 2
  - `ship_to_city` (text) - ship-to city
  - `ship_to_state` (text) - ship-to state
  - `ship_to_pin` (text) - ship-to PIN code

  ## RPC Changes
  The create_delivery_challan function now copies all ship_to_* and is_b2b
  fields from the linked sales order into the new DC row.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'delivery_challans' AND column_name = 'is_b2b') THEN
    ALTER TABLE delivery_challans ADD COLUMN is_b2b boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'delivery_challans' AND column_name = 'ship_to_name') THEN
    ALTER TABLE delivery_challans ADD COLUMN ship_to_name text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'delivery_challans' AND column_name = 'ship_to_phone') THEN
    ALTER TABLE delivery_challans ADD COLUMN ship_to_phone text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'delivery_challans' AND column_name = 'ship_to_address1') THEN
    ALTER TABLE delivery_challans ADD COLUMN ship_to_address1 text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'delivery_challans' AND column_name = 'ship_to_address2') THEN
    ALTER TABLE delivery_challans ADD COLUMN ship_to_address2 text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'delivery_challans' AND column_name = 'ship_to_city') THEN
    ALTER TABLE delivery_challans ADD COLUMN ship_to_city text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'delivery_challans' AND column_name = 'ship_to_state') THEN
    ALTER TABLE delivery_challans ADD COLUMN ship_to_state text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'delivery_challans' AND column_name = 'ship_to_pin') THEN
    ALTER TABLE delivery_challans ADD COLUMN ship_to_pin text;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION create_delivery_challan(
  p_sales_order_id uuid,
  p_payload jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    is_b2b, ship_to_name, ship_to_phone, ship_to_address1, ship_to_address2,
    ship_to_city, ship_to_state, ship_to_pin,
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
    COALESCE(v_so.is_b2b, false),
    v_so.ship_to_name,
    v_so.ship_to_phone,
    v_so.ship_to_address1,
    v_so.ship_to_address2,
    v_so.ship_to_city,
    v_so.ship_to_state,
    v_so.ship_to_pin,
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
