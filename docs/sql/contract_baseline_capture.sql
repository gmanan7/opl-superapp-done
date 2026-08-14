-- ============================================================================
-- Fulcrum — Phase 0 UUID baseline capture
-- ----------------------------------------------------------------------------
-- Creates contract_uuid_baseline and snapshots every id from the six
-- Training Hub contract tables (docs/TRAINING_HUB_SYNC_CONTRACT.md §3, §4).
-- The drift check in docs/sql/contract_check.sql section D compares the live
-- tables against this snapshot.
--
-- *** WARNING — re-run semantics ***
-- This script TRUNCATES and re-inserts. Re-running REPLACES the stored
-- baseline with the current state of the tables. That is correct exactly
-- once (Phase 0 capture) and after any owner-approved intentional change to
-- master data. NEVER re-run it to "fix" a failing drift check — a failing
-- drift check means UUIDs were lost and the migration must be rolled back
-- (MDM_SPEC §7.3); re-capturing would bury the corruption.
-- ============================================================================

-- 1. Baseline table (internal tooling — not part of the sync contract;
--    contract §6 permits new tables freely).
CREATE TABLE IF NOT EXISTS contract_uuid_baseline (
  table_name  text        NOT NULL,
  id          uuid        NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (table_name, id)
);

-- RLS on, no policies: invisible to anon/authenticated via PostgREST.
-- Readable only via service role / SQL Editor, which is all it needs.
ALTER TABLE contract_uuid_baseline ENABLE ROW LEVEL SECURITY;

-- 2. Truncate-and-insert guard: one authoritative baseline, no duplicates.
TRUNCATE contract_uuid_baseline;

INSERT INTO contract_uuid_baseline (table_name, id)
          SELECT 'factory'        AS table_name, id FROM factory
UNION ALL SELECT 'dmt',                          id FROM dmt
UNION ALL SELECT 'jh_group',                     id FROM jh_group
UNION ALL SELECT 'area',                         id FROM area
UNION ALL SELECT 'machine',                      id FROM machine
UNION ALL SELECT 'worker_profile',               id FROM worker_profile;

-- 3. Confirm what was captured. Expected at Phase 0 (contract §12 baseline):
--    factory 1, dmt 2, jh_group 8, area 18, machine 40, worker_profile 80
--    = 149 ids total.
SELECT table_name, count(*) AS ids_captured, min(captured_at) AS captured_at
FROM contract_uuid_baseline
GROUP BY table_name
ORDER BY CASE table_name
  WHEN 'factory' THEN 1 WHEN 'dmt' THEN 2 WHEN 'jh_group' THEN 3
  WHEN 'area' THEN 4 WHEN 'machine' THEN 5 WHEN 'worker_profile' THEN 6 END;
