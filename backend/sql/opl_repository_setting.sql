-- Per-plant control over the OPL "Standard Lessons" repository: which OTHER plants' approved
-- lessons this plant also sees. The plant always sees its own lessons; extra_factory_ids
-- lists the additional plants opted in. Empty array / no row = own plant only.
-- Set by a BE-lead-tier user for their own plant via POST /api/opl-repository-setting.
-- Creates / upgrades a table; touches no OPL data.

CREATE TABLE IF NOT EXISTS opl_repository_setting (
    factory_id          text PRIMARY KEY,
    cross_plant_visible boolean NOT NULL DEFAULT false,
    updated_by_emp_id   text,
    updated_at          timestamptz NOT NULL DEFAULT NOW()
);

ALTER TABLE opl_repository_setting
    ADD COLUMN IF NOT EXISTS extra_factory_ids text[] NOT NULL DEFAULT '{}';

-- Carry a previously-set "all plants" flag over to the explicit list, then retire the flag.
UPDATE opl_repository_setting s
SET extra_factory_ids = (
        SELECT COALESCE(array_agg(f.id), '{}')
        FROM factory f
        WHERE f.id <> s.factory_id
    )
WHERE s.cross_plant_visible = true
  AND (s.extra_factory_ids IS NULL OR cardinality(s.extra_factory_ids) = 0);

ALTER TABLE opl_repository_setting DROP COLUMN IF EXISTS cross_plant_visible;
