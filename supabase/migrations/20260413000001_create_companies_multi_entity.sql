-- Multi-company billing entity support
CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  tagline text, address1 text, address2 text,
  city text, state text, pincode text,
  phone text, alt_phone text, email text, website text,
  gstin text, pan text,
  bank_name text, account_number text, ifsc_code text, account_holder text, upi_id text,
  footer_note text, logo_url text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view companies" ON companies FOR SELECT USING (true);
CREATE POLICY "Authenticated can insert companies" ON companies FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can update companies" ON companies FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can delete companies" ON companies FOR DELETE USING (auth.uid() IS NOT NULL);

-- Seed from existing company_settings
INSERT INTO companies (name, tagline, address1, address2, city, state, pincode, phone, email, gstin, pan, bank_name, account_number, ifsc_code, account_holder, upi_id, footer_note, sort_order)
SELECT name, tagline, address1, address2, city, state, pincode, phone, email, gstin, pan, bank_name, account_number, ifsc_code, account_holder, upi_id, footer_note, 1
FROM company_settings WHERE id = 1 ON CONFLICT DO NOTHING;

INSERT INTO companies (name, tagline, sort_order) VALUES ('Heer', 'Healing & Spiritual Products', 2) ON CONFLICT DO NOTHING;

-- company_id on core tables
ALTER TABLE products ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE SET NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE SET NULL;
ALTER TABLE delivery_challans ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE SET NULL;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE SET NULL;

-- Default existing products to Heer
UPDATE products SET company_id = (SELECT id FROM companies WHERE sort_order = 2 LIMIT 1) WHERE company_id IS NULL;

-- Storage bucket for logos
INSERT INTO storage.buckets (id, name, public) VALUES ('company-logos', 'company-logos', true) ON CONFLICT DO NOTHING;
