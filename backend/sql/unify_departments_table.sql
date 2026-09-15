-- Unify DMT's own dmt_department table into the shared TPM `departments` table.
-- Single transaction: if anything doesn't match cleanly, the whole thing rolls back
-- and dmt_department is left untouched.
--
-- What this does:
--   1. Adds code/display_order/is_active to `departments` (DMT's admin UI needs them).
--   2. Auto-fills `departments.factory_id` on insert (single-factory app; DMT's UI no
--      longer needs to supply a factory id, since dmt_factory != TPM's factory table).
--   3. Copies over any dmt_department rows not already present in `departments` (by name).
--   4. Repoints every FK that referenced dmt_department(id) to departments(id) instead,
--      matching by department name. Aborts (and rolls back) if any row fails to match.
--   5. Keeps a full copy of the old data in `dmt_department_backup` (not used by the app),
--      then drops the live `dmt_department` table.

BEGIN;

CREATE TABLE IF NOT EXISTS dmt_department_backup AS TABLE dmt_department;

ALTER TABLE departments ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS display_order int NOT NULL DEFAULT 0;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION departments_default_factory_id() RETURNS trigger AS $$
BEGIN
  IF NEW.factory_id IS NULL THEN
    SELECT id INTO NEW.factory_id FROM factory ORDER BY id LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_departments_default_factory_id ON departments;
CREATE TRIGGER trg_departments_default_factory_id
  BEFORE INSERT ON departments
  FOR EACH ROW EXECUTE FUNCTION departments_default_factory_id();

INSERT INTO departments (name, code, display_order, is_active, factory_id)
SELECT dd.name, dd.code, dd.display_order, dd.is_active, f.id
FROM dmt_department dd
CROSS JOIN (SELECT id FROM factory ORDER BY id LIMIT 1) f
WHERE NOT EXISTS (
  SELECT 1 FROM departments d WHERE LOWER(d.name) = LOWER(dd.name)
);

UPDATE departments d
SET code = COALESCE(d.code, dd.code),
    display_order = CASE WHEN d.display_order = 0 THEN dd.display_order ELSE d.display_order END
FROM dmt_department dd
WHERE LOWER(d.name) = LOWER(dd.name);

DO $$
DECLARE
  tbl text;
  con record;
  mismatch_count int;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['dmt_user_departments','dmt_kpi_master','dmt_project_tracker_items',
                             'dmt_meeting_invitees','dmt_tasks','dmt_kpi_charts']
  LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN department_id_new uuid', tbl);

    EXECUTE format(
      'UPDATE %I t SET department_id_new = d.id
       FROM dmt_department dd JOIN departments d ON LOWER(d.name) = LOWER(dd.name)
       WHERE t.department_id = dd.id', tbl);

    EXECUTE format(
      'SELECT count(*) FROM %I t WHERE t.department_id IS NOT NULL AND t.department_id_new IS NULL', tbl
    ) INTO mismatch_count;
    IF mismatch_count > 0 THEN
      RAISE EXCEPTION 'Unmatched department rows in %: % — aborting, nothing changed', tbl, mismatch_count;
    END IF;

    FOR con IN
      SELECT tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = tbl
        AND kcu.column_name = 'department_id'
    LOOP
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', tbl, con.constraint_name);
    END LOOP;

    EXECUTE format('ALTER TABLE %I DROP COLUMN department_id', tbl);
    EXECUTE format('ALTER TABLE %I RENAME COLUMN department_id_new TO department_id', tbl);
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (department_id) REFERENCES departments(id)',
                   tbl, tbl || '_department_id_fkey');
  END LOOP;
END $$;

ALTER TABLE dmt_user_departments ALTER COLUMN department_id SET NOT NULL;
ALTER TABLE dmt_kpi_master ALTER COLUMN department_id SET NOT NULL;
ALTER TABLE dmt_project_tracker_items ALTER COLUMN department_id SET NOT NULL;
ALTER TABLE dmt_tasks ALTER COLUMN department_id SET NOT NULL;
-- dmt_meeting_invitees.department_id and dmt_kpi_charts.department_id stay nullable (unchanged)

DROP TABLE dmt_department;

COMMIT;
