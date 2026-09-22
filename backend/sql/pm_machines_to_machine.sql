-- PM Schedule now reads its machine list from the shared `machine` table only.
-- Safe to re-run. Writes data: copies the old dmt_pm_machines rows into `machine`
-- (same ids, so existing dmt_pm_plan / dmt_pm_actual rows stay attached) and re-points
-- the two foreign keys. dmt_pm_machines itself is left untouched as a backup (unused).

BEGIN;

-- `machine` never had a primary key; a foreign key needs one (table was empty when added).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'machine'::regclass AND contype = 'p') THEN
    ALTER TABLE machine ADD PRIMARY KEY (id);
  END IF;
END $$;

ALTER TABLE machine
  ADD COLUMN IF NOT EXISTS line          text,
  ADD COLUMN IF NOT EXISTS is_critical   boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS category      text,
  ADD COLUMN IF NOT EXISTS display_order int     NOT NULL DEFAULT 0;

-- factory_id mirrors what POST /api/machines already writes (legacy placeholder uuid).
INSERT INTO machine (id, factory_id, jh_group_id, name, code, is_active, line, is_critical, category, display_order)
SELECT p.id, '00000000-0000-0000-0000-000000000001', NULL, p.name, NULL, p.is_active, p.line, p.is_critical, p.group_name, p.display_order
FROM dmt_pm_machines p
ON CONFLICT (id) DO NOTHING;

ALTER TABLE dmt_pm_plan   DROP CONSTRAINT IF EXISTS dmt_pm_plan_machine_id_fkey;
ALTER TABLE dmt_pm_plan   ADD  CONSTRAINT dmt_pm_plan_machine_id_fkey
  FOREIGN KEY (machine_id) REFERENCES machine(id) ON DELETE CASCADE;

ALTER TABLE dmt_pm_actual DROP CONSTRAINT IF EXISTS dmt_pm_actual_machine_id_fkey;
ALTER TABLE dmt_pm_actual ADD  CONSTRAINT dmt_pm_actual_machine_id_fkey
  FOREIGN KEY (machine_id) REFERENCES machine(id) ON DELETE CASCADE;

COMMIT;
