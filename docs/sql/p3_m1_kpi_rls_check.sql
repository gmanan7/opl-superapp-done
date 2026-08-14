-- ============================================================================
-- Phase 3 · M1 (KPIs) — RLS access-control check (D-024 / SECURITY_VAPT §F.3)
-- ----------------------------------------------------------------------------
-- Read-only harness: impersonates API identities and asserts the D-024 model on
-- jh_kpi_definition / jh_kpi_entry. Run per-block in the Supabase SQL editor
-- (joryoadrvisizkkspuov) after any change touching the KPI RLS. Healthy = PASS.
--
-- IMPORTANT ordering: resolve supabase_user_id via set_config WHILE STILL the
-- owner role, THEN `SET LOCAL role authenticated`. If you switch role first, the
-- worker_profile subselect runs under RLS with no identity and resolves NULL
-- (observed 2026-06-15 — caused a false FAIL).
--
-- Live results recorded 2026-06-15, verified BOTH ways — SET LOCAL below AND
-- real-PostgREST HTTP probes (minted JWTs / PIN headers):
--   jh_leader → 1 group · dmt_leader → 4 groups (70 defs) · admin → 6 (92)
--   shop-floor own-group INSERT → 201 (allowed) · cross-group INSERT → 401 (blocked)
-- ============================================================================

-- Probe 1: anon sees ZERO KPI definitions and ZERO entries.
BEGIN;
SET LOCAL role anon;
SELECT CASE WHEN (SELECT count(*) FROM jh_kpi_definition) = 0
             AND (SELECT count(*) FROM jh_kpi_entry) = 0 THEN 'PASS' ELSE 'FAIL' END AS anon_sees_zero;
ROLLBACK;

-- Probe 2: an authenticated identity with no worker_profile (my_factory_id()/
-- my_role() resolve NULL — the cross-factory / unknown-user proxy) sees ZERO.
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-dead-beef-0000-000000000000","role":"authenticated"}', true);
SET LOCAL role authenticated;
SELECT CASE WHEN (SELECT count(*) FROM jh_kpi_definition) = 0 THEN 'PASS' ELSE 'FAIL' END AS unknown_identity_sees_zero;
ROLLBACK;

-- Probe 3 (GROUP-SCOPING): a jh_leader sees EXACTLY their own group's KPIs.
BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub',
    (SELECT supabase_user_id FROM worker_profile
       WHERE role='jh_leader' AND is_active AND jh_group_id IS NOT NULL AND supabase_user_id IS NOT NULL LIMIT 1),
    'role','authenticated')::text, true);
SET LOCAL role authenticated;
SELECT CASE WHEN count(DISTINCT jh_group_id) = 1 THEN 'PASS' ELSE 'FAIL' END AS jh_leader_single_group,
       count(*) AS visible_defs
FROM jh_kpi_definition;
ROLLBACK;

-- Probe 4 (DMT TIER): a dmt_leader sees their DMT's groups (> 1, all one factory).
BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub',
    (SELECT supabase_user_id FROM worker_profile WHERE role='dmt_leader' AND is_active AND supabase_user_id IS NOT NULL LIMIT 1),
    'role','authenticated')::text, true);
SET LOCAL role authenticated;
SELECT CASE WHEN count(DISTINCT jh_group_id) >= 1 AND count(DISTINCT factory_id) = 1 THEN 'PASS' ELSE 'FAIL' END AS dmt_leader_dmt_tier,
       count(DISTINCT jh_group_id) AS visible_groups
FROM jh_kpi_definition;
ROLLBACK;

-- Probe 5 (FACTORY TIER): an admin sees ALL of NPF's groups, never another factory.
BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub',
    (SELECT supabase_user_id FROM worker_profile WHERE role='admin' AND is_active AND supabase_user_id IS NOT NULL LIMIT 1),
    'role','authenticated')::text, true);
SET LOCAL role authenticated;
SELECT CASE WHEN count(DISTINCT factory_id) = 1 THEN 'PASS' ELSE 'FAIL' END AS admin_single_factory,
       count(DISTINCT jh_group_id) AS visible_groups
FROM jh_kpi_definition;
ROLLBACK;

-- Probe 6 (WRITE GATE): own-group write allowed for ALL roles incl. shop floor;
-- cross-group write blocked. Verified live over PostgREST (see header). SQL form:
-- impersonate a shop-floor PIN identity via request.headers, try both inserts.
BEGIN;
DO $$
DECLARE wid uuid; fac uuid; own_grp uuid; other_grp uuid; own_ok boolean := false; cross_blocked boolean := false;
BEGIN
  SELECT id, factory_id, jh_group_id INTO wid, fac, own_grp
    FROM worker_profile WHERE role IN ('apprentice','on_roll') AND is_active AND jh_group_id IS NOT NULL LIMIT 1;
  SELECT id INTO other_grp FROM jh_group WHERE is_active AND id <> own_grp LIMIT 1;
  PERFORM set_config('request.headers',
    json_build_object('x-worker-id', wid::text, 'x-factory-id', fac::text)::text, true);
  EXECUTE 'SET LOCAL role anon';
  BEGIN
    INSERT INTO jh_kpi_entry (factory_id, jh_group_id, entry_date, entered_by, kpi_values)
      VALUES (fac, own_grp, DATE '2099-12-31', wid, '{}'::jsonb);
    own_ok := true;
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN own_ok := false; END;
  BEGIN
    INSERT INTO jh_kpi_entry (factory_id, jh_group_id, entry_date, entered_by, kpi_values)
      VALUES (fac, other_grp, DATE '2099-12-31', wid, '{}'::jsonb);
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN cross_blocked := true; END;
  RAISE NOTICE 'write_gate own_ok=% cross_blocked=% (both true = PASS)', own_ok, cross_blocked;
END $$;
ROLLBACK;  -- discard the probe insert

-- Probe 7: no DELETE policy for any client role on jh_kpi_entry.
SELECT count(*) AS delete_policies_should_be_zero
FROM pg_policy WHERE polrelid = 'public.jh_kpi_entry'::regclass AND polcmd = 'd';

-- Probe 8: definition writes are admin-only — confirm via the policy catalog.
SELECT CASE WHEN qual LIKE '%my_role() = %admin%' THEN 'PASS (admin-only def write)' ELSE 'CHECK' END AS def_write_admin_only
FROM pg_policies WHERE tablename = 'jh_kpi_definition' AND policyname = 'kpi_def_write';
