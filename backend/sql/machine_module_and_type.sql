-- Machine master: the PM "line" (SFM/RFM text) becomes a real Module link, and the PM "category"
-- column becomes the machine's Machine type. Run AFTER pm_machines_to_machine.sql. Safe to re-run.
-- Writes data / changes the table: backfills module_id from the old line text, renames
-- category -> machine_type, then drops the old `line` column (only if every line value found a module;
-- the old dmt_pm_machines backup table still holds the original line values).

BEGIN;

ALTER TABLE machine ADD COLUMN IF NOT EXISTS module_id uuid REFERENCES modules(id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'machine' AND column_name = 'line') THEN
    UPDATE machine m SET module_id = mo.id FROM modules mo WHERE m.module_id IS NULL AND m.line = mo.name;
    IF EXISTS (SELECT 1 FROM machine WHERE line IS NOT NULL AND module_id IS NULL) THEN
      RAISE EXCEPTION 'some machine.line values have no matching module - not dropping line';
    END IF;
    ALTER TABLE machine DROP COLUMN line;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'machine' AND column_name = 'category')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'machine' AND column_name = 'machine_type') THEN
    ALTER TABLE machine RENAME COLUMN category TO machine_type;
  END IF;
END $$;

COMMIT;
