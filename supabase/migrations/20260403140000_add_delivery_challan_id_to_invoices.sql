/*
  # Add delivery_challan_id to invoices

  Links invoices back to the delivery challan they were created from.
  Also adds challan_number index for display purposes.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'delivery_challan_id'
  ) THEN
    ALTER TABLE invoices ADD COLUMN delivery_challan_id uuid REFERENCES delivery_challans(id);
  END IF;
END $$;
