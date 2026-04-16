/*
  # Fix Document Number Format

  Changes the `next_document_number` function to use the required format:
  - Separator: `/` instead of `-`
  - Running number: 3 digits (001) instead of 4 digits (0001)
  - Format: PREFIX/YYMM/001  e.g. INV/2604/001

  Only affects NEW documents created after this migration.
  Existing records are not modified.
*/

CREATE OR REPLACE FUNCTION next_document_number(p_prefix text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_ym text := to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYMM');
  v_seq int;
BEGIN
  INSERT INTO document_sequences (prefix, year_month, last_seq)
    VALUES (p_prefix, v_ym, 1)
  ON CONFLICT (prefix, year_month)
    DO UPDATE SET last_seq = document_sequences.last_seq + 1
  RETURNING last_seq INTO v_seq;

  RETURN p_prefix || '/' || v_ym || '/' || lpad(v_seq::text, 3, '0');
END;
$$;
