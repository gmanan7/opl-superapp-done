-- ============================================================================
-- Fulcrum — Training Hub contract-protection check
-- ----------------------------------------------------------------------------
-- Source of truth: docs/TRAINING_HUB_SYNC_CONTRACT.md (§3 column contract,
-- §12 baseline row counts) and docs/MDM_SPEC.md §7.
--
-- Run in the Supabase SQL Editor (TPM Fulcrum project joryoadrvisizkkspuov)
-- AFTER every migration step that touches any of the six contract tables:
--   factory, dmt, jh_group, area, machine, worker_profile
--
-- Healthy output: every row in sections A and B shows status = 'PASS',
-- and the drift check (section D, once enabled) returns ZERO rows.
-- ANY 'FAIL' → roll back the migration step immediately (MDM_SPEC §7.3).
--
-- Read-only: this script never writes anything.
-- ============================================================================


-- ============================================================================
-- SECTION A — Row-count check (contract §12 baseline, 2026-06-08)
-- Counts must remain >= baseline. A drop means rows disappeared and the
-- Training Hub sync will soft-deactivate the corresponding mirror rows.
-- ============================================================================

WITH baseline(table_name, expected_min) AS (
  VALUES
    ('factory',        1),
    ('dmt',            2),
    ('jh_group',       8),
    ('area',          18),
    ('machine',       40),
    ('worker_profile',80)
),
actual AS (
            SELECT 'factory'        AS table_name, count(*)::int AS actual_count FROM factory
  UNION ALL SELECT 'dmt',                          count(*)::int FROM dmt
  UNION ALL SELECT 'jh_group',                     count(*)::int FROM jh_group
  UNION ALL SELECT 'area',                         count(*)::int FROM area
  UNION ALL SELECT 'machine',                      count(*)::int FROM machine
  UNION ALL SELECT 'worker_profile',               count(*)::int FROM worker_profile
)
SELECT
  b.table_name,
  b.expected_min,
  a.actual_count,
  CASE WHEN a.actual_count >= b.expected_min THEN 'PASS' ELSE 'FAIL' END AS status
FROM baseline b
JOIN actual   a USING (table_name)
ORDER BY CASE b.table_name
  WHEN 'factory' THEN 1 WHEN 'dmt' THEN 2 WHEN 'jh_group' THEN 3
  WHEN 'area' THEN 4 WHEN 'machine' THEN 5 WHEN 'worker_profile' THEN 6 END;


-- ============================================================================
-- SECTION B — Column-contract check (contract §3)
-- Every column the Training Hub sync reads must exist in public.<table> with
-- a compatible data type. Enum columns appear in information_schema as
-- 'USER-DEFINED'; the contract permits enum-or-text for role/apprentice_type
-- (§5: Training Hub stringifies them). Timestamps accept with/without time
-- zone (§7: adding precision is fine).
-- Healthy output: all rows status = 'PASS'. FAIL rows sort to the top.
-- ============================================================================

WITH contract(table_name, column_name, accepted_types) AS (
  VALUES
    -- §3.1 factory: id, name, code, location, is_active, created_at
    ('factory', 'id',         ARRAY['uuid']),
    ('factory', 'name',       ARRAY['text', 'character varying']),
    ('factory', 'code',       ARRAY['text', 'character varying']),
    ('factory', 'location',   ARRAY['text', 'character varying']),
    ('factory', 'is_active',  ARRAY['boolean']),
    ('factory', 'created_at', ARRAY['timestamp with time zone', 'timestamp without time zone']),
    -- §3.2 dmt: id, factory_id, name, code, created_at
    ('dmt', 'id',         ARRAY['uuid']),
    ('dmt', 'factory_id', ARRAY['uuid']),
    ('dmt', 'name',       ARRAY['text', 'character varying']),
    ('dmt', 'code',       ARRAY['text', 'character varying']),
    ('dmt', 'created_at', ARRAY['timestamp with time zone', 'timestamp without time zone']),
    -- §3.3 jh_group: id, factory_id, dmt_id, name, code, is_active, created_at
    ('jh_group', 'id',         ARRAY['uuid']),
    ('jh_group', 'factory_id', ARRAY['uuid']),
    ('jh_group', 'dmt_id',     ARRAY['uuid']),
    ('jh_group', 'name',       ARRAY['text', 'character varying']),
    ('jh_group', 'code',       ARRAY['text', 'character varying']),
    ('jh_group', 'is_active',  ARRAY['boolean']),
    ('jh_group', 'created_at', ARRAY['timestamp with time zone', 'timestamp without time zone']),
    -- §3.4 area: id, factory_id, jh_group_id, name, is_active
    ('area', 'id',          ARRAY['uuid']),
    ('area', 'factory_id',  ARRAY['uuid']),
    ('area', 'jh_group_id', ARRAY['uuid']),
    ('area', 'name',        ARRAY['text', 'character varying']),
    ('area', 'is_active',   ARRAY['boolean']),
    -- §3.5 machine: id, factory_id, jh_group_id, area_id, name, code,
    --               machine_type, is_active, created_at
    ('machine', 'id',           ARRAY['uuid']),
    ('machine', 'factory_id',   ARRAY['uuid']),
    ('machine', 'jh_group_id',  ARRAY['uuid']),
    ('machine', 'area_id',      ARRAY['uuid']),
    ('machine', 'name',         ARRAY['text', 'character varying']),
    ('machine', 'code',         ARRAY['text', 'character varying']),
    ('machine', 'machine_type', ARRAY['text', 'character varying', 'USER-DEFINED']),
    ('machine', 'is_active',    ARRAY['boolean']),
    ('machine', 'created_at',   ARRAY['timestamp with time zone', 'timestamp without time zone']),
    -- §3.6 worker_profile (THE most important table): id, factory_id,
    --   employee_id, name, role, apprentice_type, jh_group_id, dmt_id,
    --   lang_pref, is_active, created_at, last_login_at, deactivated_at
    ('worker_profile', 'id',              ARRAY['uuid']),
    ('worker_profile', 'factory_id',      ARRAY['uuid']),
    ('worker_profile', 'employee_id',     ARRAY['text', 'character varying']),
    ('worker_profile', 'name',            ARRAY['text', 'character varying']),
    ('worker_profile', 'role',            ARRAY['USER-DEFINED', 'text']),
    ('worker_profile', 'apprentice_type', ARRAY['USER-DEFINED', 'text']),
    ('worker_profile', 'jh_group_id',     ARRAY['uuid']),
    ('worker_profile', 'dmt_id',          ARRAY['uuid']),
    ('worker_profile', 'lang_pref',       ARRAY['USER-DEFINED', 'text']),
    ('worker_profile', 'is_active',       ARRAY['boolean']),
    ('worker_profile', 'created_at',      ARRAY['timestamp with time zone', 'timestamp without time zone']),
    ('worker_profile', 'last_login_at',   ARRAY['timestamp with time zone', 'timestamp without time zone']),
    ('worker_profile', 'deactivated_at',  ARRAY['timestamp with time zone', 'timestamp without time zone'])
)
SELECT
  c.table_name,
  c.column_name,
  array_to_string(c.accepted_types, ' | ') AS expected_type,
  COALESCE(ic.data_type, '(column missing)') AS actual_type,
  CASE
    WHEN ic.column_name IS NULL                       THEN 'FAIL - missing'
    WHEN NOT (ic.data_type = ANY (c.accepted_types))  THEN 'FAIL - type mismatch'
    ELSE 'PASS'
  END AS status
FROM contract c
LEFT JOIN information_schema.columns ic
  ON  ic.table_schema = 'public'
  AND ic.table_name   = c.table_name
  AND ic.column_name  = c.column_name
ORDER BY
  CASE WHEN ic.column_name IS NULL OR NOT (ic.data_type = ANY (c.accepted_types))
       THEN 0 ELSE 1 END,   -- FAILs first
  c.table_name, c.column_name;


-- ============================================================================
-- SECTION C — UUID snapshot (all ids across the six tables, for diffing)
-- Save/export this output before a migration; re-run after and diff.
-- Every pre-migration id must still be present post-migration (contract §4).
-- ============================================================================

          SELECT 'factory'        AS table_name, id FROM factory
UNION ALL SELECT 'dmt',                          id FROM dmt
UNION ALL SELECT 'jh_group',                     id FROM jh_group
UNION ALL SELECT 'area',                         id FROM area
UNION ALL SELECT 'machine',                      id FROM machine
UNION ALL SELECT 'worker_profile',               id FROM worker_profile
ORDER BY table_name, id;


-- ============================================================================
-- SECTION D — UUID drift check (vs stored baseline) — TEMPLATE
-- Requires the contract_uuid_baseline table created by
-- docs/sql/contract_baseline_capture.sql. Uncomment and run after every
-- migration step. Healthy output: ZERO rows. Any row = a baseline UUID has
-- disappeared from its table = contract §4 violation → ROLL BACK NOW.
-- (New ids added since baseline are fine and intentionally not reported.)
-- ============================================================================

-- WITH current_ids AS (
--             SELECT 'factory'        AS table_name, id FROM factory
--   UNION ALL SELECT 'dmt',                          id FROM dmt
--   UNION ALL SELECT 'jh_group',                     id FROM jh_group
--   UNION ALL SELECT 'area',                         id FROM area
--   UNION ALL SELECT 'machine',                      id FROM machine
--   UNION ALL SELECT 'worker_profile',               id FROM worker_profile
-- )
-- SELECT
--   b.table_name,
--   b.id          AS missing_uuid,
--   b.captured_at AS baseline_captured_at,
--   'FAIL - UUID DRIFT: id present at baseline, gone now' AS status
-- FROM contract_uuid_baseline b
-- LEFT JOIN current_ids c
--   ON c.table_name = b.table_name AND c.id = b.id
-- WHERE c.id IS NULL
-- ORDER BY b.table_name, b.id;
