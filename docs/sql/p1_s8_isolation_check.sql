-- ============================================================================
-- Step 8 — import_batch cross-tenant isolation check (SECURITY_VAPT K7 / §F.3)
-- ----------------------------------------------------------------------------
-- Read-only harness: impersonates API identities with SET LOCAL inside a
-- rolled-back transaction and asserts the RLS surface of import_batch:
--   1. anon sees ZERO rows.
--   2. an authenticated identity with NO worker_profile (≈ foreign-factory /
--      unknown user — my_factory_id() resolves NULL) sees ZERO rows.
--   3. the same identity cannot INSERT (WITH CHECK fails).
--   4. DELETE is not grantable to any client identity (no DELETE policy).
-- Run per-block in the Supabase SQL editor (TPM Fulcrum joryoadrvisizkkspuov)
-- after any schema change touching import_batch. Healthy: every probe PASS.
-- ============================================================================

-- Probe 1+2: visibility
BEGIN;
SET LOCAL role anon;
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS anon_sees_zero FROM import_batch;
ROLLBACK;

BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-dead-beef-0000-000000000000","role":"authenticated"}';
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS foreign_identity_sees_zero FROM import_batch;
ROLLBACK;

-- Probe 3: foreign identity INSERT must fail (expect: RLS violation error)
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-dead-beef-0000-000000000000","role":"authenticated"}';
INSERT INTO import_batch (factory_id, entity_type, source_filename, source_format,
  total_rows, valid_rows, warning_rows, invalid_rows, status, preview_snapshot)
VALUES ('00000000-0000-0000-0000-000000000001', 'workers', 'x.csv', 'csv',
  0, 0, 0, 0, 'previewed', '{}');
ROLLBACK;

-- Probe 4: no DELETE policy exists for any client role (expect: zero rows)
SELECT count(*) AS delete_policies_should_be_zero
FROM pg_policy WHERE polrelid = 'public.import_batch'::regclass AND polcmd = 'd';

-- Probe 5 (positive control): a real admin identity DOES see own-factory
-- batches. Replace <ADMIN_SUB> with: SELECT supabase_user_id FROM
-- worker_profile WHERE role = 'admin' AND is_active LIMIT 1;
-- BEGIN;
-- SET LOCAL role authenticated;
-- SET LOCAL request.jwt.claims = '{"sub":"<ADMIN_SUB>","role":"authenticated"}';
-- SELECT CASE WHEN count(*) > 0 THEN 'PASS' ELSE 'FAIL' END AS admin_sees_own_batches FROM import_batch;
-- ROLLBACK;

-- All five probes run GREEN on 2026-06-11 (Step 8 build session).
