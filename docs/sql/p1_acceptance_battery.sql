-- ============================================================================
-- Phase 1 — MDM acceptance battery (MDM_SPEC §9) · READ-ONLY · re-runnable
-- ----------------------------------------------------------------------------
-- One labeled block per acceptance item. Run in the Supabase SQL editor on
-- TPM Fulcrum (joryoadrvisizkkspuov). Items not expressible as SQL carry a
-- comment pointing at their captured evidence (commit hashes + session
-- reports). First full run: 2026-06-12 (Step 9) — all blocks PASS.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- A1 · SECURITY_VAPT §F gate per module — evidence index (not SQL-queryable)
-- ----------------------------------------------------------------------------
-- §F items are wire/UI proofs. Where the evidence lives:
--   · Step 3a governance: commit 444c308 (14 SQL-harness + 8 wire probes).
--   · Step 5/6 People + manage-user: commits 0502625, d4d237d.
--   · Step 8 bulk-import: commits 5d8d0e2, 0d27662 (17-probe manage-user
--     matrix), eda1484 (30-denial matrix + §E battery + stale/tamper/
--     idempotency probes), 4590be9 (client + K7 harness). Session report
--     2026-06-11.
--   · Step 9: K7 first real two-tenant matrix + §J.5 re-verification —
--     session report 2026-06-12.
--   · Standing isolation harness: docs/sql/p1_s8_isolation_check.sql.
-- Runnable slice — the §F-relevant audit actions exist and the audit table
-- is admin-read-only:
SELECT
  (SELECT count(*) FROM mdm_audit WHERE action = 'import_batch')      AS import_batch_summaries,
  (SELECT count(*) FROM mdm_audit WHERE action = 'pins_acknowledged') AS pin_acknowledgements,
  (SELECT count(*) FROM mdm_audit WHERE action = 'deactivate')        AS deactivations,
  (SELECT count(*) FROM pg_policy
    WHERE polrelid = 'public.mdm_audit'::regclass AND polcmd = 'r')   AS audit_read_policies, -- expect 1 (admin-only)
  (SELECT pg_get_expr(polqual, polrelid) FROM pg_policy
    WHERE polrelid = 'public.mdm_audit'::regclass AND polcmd = 'r')   AS audit_read_qual;

-- ────────────────────────────────────────────────────────────────────────────
-- A2 · Contract §7 checks — counts ≥ baseline · 45 contracted columns · drift
-- ----------------------------------------------------------------------------
WITH baseline(table_name, expected_min) AS (
  VALUES ('factory',1),('dmt',2),('jh_group',8),('area',18),('machine',40),('worker_profile',80)
),
actual AS (
            SELECT 'factory' AS table_name, count(*)::int AS actual_count FROM factory
  UNION ALL SELECT 'dmt', count(*)::int FROM dmt
  UNION ALL SELECT 'jh_group', count(*)::int FROM jh_group
  UNION ALL SELECT 'area', count(*)::int FROM area
  UNION ALL SELECT 'machine', count(*)::int FROM machine
  UNION ALL SELECT 'worker_profile', count(*)::int FROM worker_profile
)
SELECT b.table_name, b.expected_min, a.actual_count,
       CASE WHEN a.actual_count >= b.expected_min THEN 'PASS' ELSE 'FAIL' END AS status
FROM baseline b JOIN actual a USING (table_name) ORDER BY b.table_name;

-- Column contract: run SECTION B of docs/sql/contract_check.sql (45 checks).
-- UUID drift vs stored baseline (expect drift_rows = 0):
WITH current_ids AS (
            SELECT 'factory' AS table_name, id FROM factory
  UNION ALL SELECT 'dmt', id FROM dmt
  UNION ALL SELECT 'jh_group', id FROM jh_group
  UNION ALL SELECT 'area', id FROM area
  UNION ALL SELECT 'machine', id FROM machine
  UNION ALL SELECT 'worker_profile', id FROM worker_profile
)
SELECT count(*) AS drift_rows
FROM contract_uuid_baseline b
LEFT JOIN current_ids c ON c.table_name = b.table_name AND c.id = b.id
WHERE c.id IS NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- A3 · Onboarding dry-run (§6) — populated by p1_s9_dryrun (session report
--      2026-06-12; seed file docs/sql/p1_s9_dryrun_seed.sql)
-- ----------------------------------------------------------------------------
-- The TZZ-DRYRUN factory is permanent deactivated residue (D-005). Expect:
-- factory 1 (inactive), dmt 1 (no is_active column — active-by-existence),
-- jh_group 2 / area 2 / machine 7 / worker 7, ALL inactive.
WITH f AS (SELECT id FROM factory WHERE code = 'TZZ-DRYRUN')
SELECT 'factory' AS t, count(*) AS total, count(*) FILTER (WHERE NOT is_active) AS inactive
  FROM factory WHERE code = 'TZZ-DRYRUN'
UNION ALL SELECT 'dmt', count(*), NULL FROM dmt WHERE factory_id = (SELECT id FROM f)
UNION ALL SELECT 'jh_group', count(*), count(*) FILTER (WHERE NOT is_active) FROM jh_group WHERE factory_id = (SELECT id FROM f)
UNION ALL SELECT 'area', count(*), count(*) FILTER (WHERE NOT is_active) FROM area WHERE factory_id = (SELECT id FROM f)
UNION ALL SELECT 'machine', count(*), count(*) FILTER (WHERE NOT is_active) FROM machine WHERE factory_id = (SELECT id FROM f)
UNION ALL SELECT 'worker_profile', count(*), count(*) FILTER (WHERE NOT is_active) FROM worker_profile WHERE factory_id = (SELECT id FROM f)
ORDER BY t;

-- ────────────────────────────────────────────────────────────────────────────
-- A4 · Bulk import ≥20 mixed-validity rows per §5a
-- ----------------------------------------------------------------------------
-- Step 8 fixtures: 7-row workers CSV + 3-row machines CSV (NPF) — commit
-- eda1484 + 2026-06-11 report. Step 9 fixtures: 4-row machines CSV + 5-row
-- workers XLSX (TZZ) — 2026-06-12 report. Combined: ≥19 fixture rows across
-- every tier (ok/warning/error) + stale + tamper + idempotency probes; the
-- ≥20-row Vitest fixtures live in src/__tests__ (importParsing/validators).
-- Runnable slice — batches exist with correct lifecycle states:
SELECT entity_type, source_format, status, total_rows, valid_rows, warning_rows,
       invalid_rows, committed_rows, pins_acknowledged_at IS NOT NULL AS pins_ack
FROM import_batch ORDER BY created_at;

-- ────────────────────────────────────────────────────────────────────────────
-- A5 · 80 baseline workers untouched — UUIDs present AND still active
-- ----------------------------------------------------------------------------
-- Expect: missing_from_table = 0 AND unexpectedly_inactive = 0.
SELECT
  (SELECT count(*) FROM contract_uuid_baseline b
    WHERE b.table_name = 'worker_profile'
      AND NOT EXISTS (SELECT 1 FROM worker_profile w WHERE w.id = b.id)) AS missing_from_table,
  (SELECT count(*) FROM contract_uuid_baseline b
    JOIN worker_profile w ON w.id = b.id
    WHERE b.table_name = 'worker_profile' AND w.is_active = false)       AS unexpectedly_inactive;

-- ────────────────────────────────────────────────────────────────────────────
-- A6 · Hub sync clean — TPM-side evidence + Hub-side queries
-- ----------------------------------------------------------------------------
-- TPM-side evidence: Step 8 manual sync (6/6, +2 machines +3 workers, 0
-- soft-deactivations) and Step 9 runs 1+2 (6/6 each; run 2 carries the
-- teardown flags as UPDATES with rows_soft_deactivated = 0 — per contract §5
-- that counter fires only on hard delete). Response bodies in the session
-- reports.
-- Hub-side (run on the Fulcrum Training Hub project, NOT here):
--   · contract §9.1 cron health:
--       SELECT runid, status, return_message, start_time, end_time
--       FROM cron.job_run_details
--       WHERE jobid = (SELECT jobid FROM cron.job
--                      WHERE jobname = 'fulcrum-training-hub-master-sync')
--       ORDER BY start_time DESC LIMIT 10;
--   · contract §9.2 per-table results:
--       SELECT run_at, table_name, status, error_message, rows_inserted,
--              rows_updated, rows_soft_deactivated, duration_ms
--       FROM sync_log WHERE run_at > now() - interval '3 days'
--       ORDER BY run_at DESC, table_name;
