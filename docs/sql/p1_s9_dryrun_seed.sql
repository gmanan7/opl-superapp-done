-- ============================================================================
-- Phase 1 Step 9 — onboarding dry-run SEED (TPM Fulcrum · WRITE)
-- ----------------------------------------------------------------------------
-- The one §6 step the MDM UI does not cover: the factory row itself plus its
-- first admin (MDM_SPEC §3 — "platform owner via controlled seed/Edge
-- Function"). Everything after this seed happens through the normal MDM
-- surfaces as that admin. Committed BEFORE apply (Step 9 sequencing rule:
-- the file existing is audit evidence of intent before mutation).
--
-- MANUAL STEP FIRST (auth users cannot be created from SQL):
--   Create the Supabase Auth user via the GoTrue admin API with the
--   service-role key:
--     POST {SUPABASE_URL}/auth/v1/admin/users
--     { "email": "dryrun.admin@test.invalid",
--       "password": "<throwaway — hold in memory only>",
--       "email_confirm": true }
--   Capture the returned user id and substitute it for <AUTH_USER_ID> below.
--
-- Factory UUID is FIXED (minted once, forever — contract §4): the dry-run
-- factory is never deleted, only deactivated (D-005). Identifiable forever
-- by code TZZ-DRYRUN.
--
-- Teardown is NOT in this file: deactivation happens through the MDM
-- surfaces / manage-user as the dry-run admin (that is part of the proof).
-- ============================================================================

-- 1. The factory row (platform-owner action)
INSERT INTO factory (id, name, code, location, is_active)
VALUES (
  'ffffffff-0000-4000-a000-000000000001',
  'Test Factory — DELETE AFTER DRY RUN',
  'TZZ-DRYRUN',
  'dry-run synthetic',
  true
);

-- 2. Its first admin (email identity; credential linkage via supabase_user_id)
INSERT INTO worker_profile (factory_id, name, role, lang_pref, supabase_user_id, is_active)
VALUES (
  'ffffffff-0000-4000-a000-000000000001',
  'Dryrun Admin',
  'admin',
  'en',
  '<AUTH_USER_ID>',
  true
)
RETURNING id AS dryrun_admin_worker_id;

-- 3. Home-factory membership (D-010 dormant model — populated, not consulted)
INSERT INTO worker_factory_membership (worker_profile_id, factory_id, is_home, is_active)
VALUES (
  (SELECT id FROM worker_profile WHERE supabase_user_id = '<AUTH_USER_ID>'),
  'ffffffff-0000-4000-a000-000000000001',
  true,
  true
);

-- 4. Audit the seed (actor NULL = system/platform-owner writer, D-016)
INSERT INTO mdm_audit (factory_id, actor_worker_id, entity_table, entity_id, action, changed_fields)
VALUES (
  'ffffffff-0000-4000-a000-000000000001',
  NULL,
  'factory',
  'ffffffff-0000-4000-a000-000000000001',
  'create',
  '{"via": "p1_s9_dryrun_seed", "code": "TZZ-DRYRUN"}'
);
