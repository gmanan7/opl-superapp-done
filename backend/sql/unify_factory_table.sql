-- Unify DMT's own dmt_factory table into the shared TPM `factory` table.
-- Single transaction: if anything doesn't match cleanly, the whole thing rolls back
-- and dmt_factory is left untouched.
--
-- NOTE: `factory` already holds several real plants (TVT/NPF/UPF/MPF); dmt_factory has
-- exactly one row (code 'ITC-PPB'). This migration does NOT try to map ITC-PPB onto one
-- of those existing plants — it adds it as its own row in `factory` (matched by code),
-- so DMT keeps pointing at the same plant identity it always has, just in the shared
-- table. Merging it onto an existing TVT/NPF/UPF/MPF row would be a business decision
-- (which physical plant DMT actually is), not a mechanical step — do that separately if
-- the owner confirms it's the same plant.
--
-- IMPORTANT: `factory.id` is `text` holding small hand-assigned numbers ('1','2','3','4'
-- for TVT/NPF/UPF/MPF), NOT a uuid, and has no default — so the new row's id has to be
-- picked explicitly (next integer, as text). `dmt_factory.id` is a real uuid, which is
-- why every FK below needs a type change (uuid -> text), not just a repoint.
--
-- What this does:
--   1. Adds `location` to `factory` (dmt_factory had it; `factory` may not).
--   2. Copies the dmt_factory row into `factory` if its code isn't already there,
--      assigning it the next free id (as text, matching the existing '1'..'4' scheme).
--   3. Repoints every FK that referenced dmt_factory(id uuid) to factory(id text) instead,
--      matching by code. Aborts (and rolls back) if any row fails to match.
--   4. Keeps a full copy of the old data in `dmt_factory_backup` (not used by the app),
--      then drops the live `dmt_factory` table.

BEGIN;

CREATE TABLE IF NOT EXISTS dmt_factory_backup AS TABLE dmt_factory;

ALTER TABLE factory ADD COLUMN IF NOT EXISTS location text;

INSERT INTO factory (id, name, code, location, is_active)
SELECT (SELECT COALESCE(MAX(id::int), 0) + 1 FROM factory)::text,
       df.name, df.code, df.location, df.is_active
FROM dmt_factory df
WHERE NOT EXISTS (
  SELECT 1 FROM factory f WHERE UPPER(f.code) = UPPER(df.code)
);

DO $$
DECLARE
  tbl text;
  con record;
  mismatch_count int;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['dmt_meetings','dmt_meeting_templates','dmt_task_groups',
                             'dmt_pm_machines','dmt_pd_jobs','dmt_kpi_charts']
  LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN factory_id_new text', tbl);

    EXECUTE format(
      'UPDATE %I t SET factory_id_new = f.id
       FROM dmt_factory df JOIN factory f ON UPPER(f.code) = UPPER(df.code)
       WHERE t.factory_id = df.id', tbl);

    EXECUTE format(
      'SELECT count(*) FROM %I t WHERE t.factory_id IS NOT NULL AND t.factory_id_new IS NULL', tbl
    ) INTO mismatch_count;
    IF mismatch_count > 0 THEN
      RAISE EXCEPTION 'Unmatched factory rows in %: % — aborting, nothing changed', tbl, mismatch_count;
    END IF;

    FOR con IN
      SELECT tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = tbl
        AND kcu.column_name = 'factory_id'
    LOOP
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', tbl, con.constraint_name);
    END LOOP;

    EXECUTE format('ALTER TABLE %I DROP COLUMN factory_id', tbl);
    EXECUTE format('ALTER TABLE %I RENAME COLUMN factory_id_new TO factory_id', tbl);
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (factory_id) REFERENCES factory(id)',
                   tbl, tbl || '_factory_id_fkey');
  END LOOP;
END $$;

ALTER TABLE dmt_meetings ALTER COLUMN factory_id SET NOT NULL;
ALTER TABLE dmt_meeting_templates ALTER COLUMN factory_id SET NOT NULL;
ALTER TABLE dmt_task_groups ALTER COLUMN factory_id SET NOT NULL;
ALTER TABLE dmt_pm_machines ALTER COLUMN factory_id SET NOT NULL;
ALTER TABLE dmt_pd_jobs ALTER COLUMN factory_id SET NOT NULL;
-- dmt_kpi_charts.factory_id stays nullable (unchanged, ON DELETE SET NULL)

DROP TABLE dmt_factory;

COMMIT;
