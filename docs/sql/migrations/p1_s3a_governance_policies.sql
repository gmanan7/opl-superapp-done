-- ============================================================================
-- Phase 1 Step 3a — governance write policies + legacy helper removal 🔒
-- Applied to joryoadrvisizkkspuov on 2026-06-10 via Management API,
-- as ONE request = one implicit transaction. Plan approved by owner
-- (secrets guard tightened to system-only; dmt-consistency included).
-- Bracketed by contract_check before AND after — both green
-- (A 6/6 PASS, B 45/45, D zero drift). Hub-side manual sync: owner-run after.
--
-- Also fixed in this step: machine_read was USING (true) — cross-tenant
-- read leak (SECURITY_VAPT A2) — now factory-scoped.
-- ============================================================================

-- ===== Phase 1 Step 3a — governance write policies (ONE request = one transaction) =====

-- ---------- 1. Primary-scope helpers (authority follows PRIMARY, D-013) ----------
CREATE OR REPLACE FUNCTION my_primary_jh_group_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jh_group_id FROM worker_profile WHERE id = my_worker_id() AND is_active = true
$$;

CREATE OR REPLACE FUNCTION my_primary_dmt_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT dmt_id FROM worker_profile WHERE id = my_worker_id() AND is_active = true
$$;

-- ---------- 2. Self-service lang_pref RPC (the ONLY self-write path besides last_login) ----------
CREATE OR REPLACE FUNCTION set_my_lang_pref(p_lang text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Server-side language gate (D-008, defense in depth with the UI gate):
  -- 'ta' joins this list ONLY after Training Hub coordination clears.
  IF p_lang NOT IN ('en','hi','gu') THEN
    RAISE EXCEPTION 'lang_not_enabled';
  END IF;
  UPDATE worker_profile SET lang_pref = p_lang::lang_pref
  WHERE id = my_worker_id() AND is_active = true;
END $$;

-- ---------- 3. Credential-field guard: system-only (NO API identity, admin included) ----------
CREATE OR REPLACE FUNCTION fn_guard_worker_secrets() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.pin_hash IS DISTINCT FROM OLD.pin_hash
      OR NEW.supabase_user_id IS DISTINCT FROM OLD.supabase_user_id)
     AND my_worker_id() IS NOT NULL THEN   -- NULL = service-role/Edge/system context
    RAISE EXCEPTION 'denied';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_guard_worker_secrets BEFORE UPDATE ON worker_profile
  FOR EACH ROW EXECUTE FUNCTION fn_guard_worker_secrets();

-- ---------- 4. worker_profile policies ----------
DROP POLICY worker_profile_insert ON worker_profile;
DROP POLICY worker_profile_update ON worker_profile;
DROP POLICY self_update_last_login ON worker_profile;   -- self-escalation vector; RPC covers last_login

CREATE POLICY worker_profile_insert ON worker_profile FOR INSERT WITH CHECK (
  factory_id = my_factory_id()
  AND (
    is_admin()
    OR (my_role() = 'jh_leader'
        AND role IN ('apprentice','on_roll')
        AND jh_group_id = my_primary_jh_group_id()
        AND dmt_id IS NOT DISTINCT FROM (SELECT dmt_id FROM jh_group WHERE id = jh_group_id))
    OR (my_role() = 'dmt_leader'
        AND role IN ('apprentice','on_roll')
        AND jh_group_id IN (SELECT id FROM jh_group WHERE dmt_id = my_primary_dmt_id())
        AND dmt_id IS NOT DISTINCT FROM (SELECT dmt_id FROM jh_group WHERE id = jh_group_id))
  )
);

CREATE POLICY worker_profile_update_admin ON worker_profile FOR UPDATE
  USING      (factory_id = my_factory_id() AND is_admin())
  WITH CHECK (factory_id = my_factory_id() AND is_admin());

CREATE POLICY worker_profile_update_leader ON worker_profile FOR UPDATE
  USING (
    factory_id = my_factory_id()
    AND role IN ('apprentice','on_roll')                       -- OLD row: target is shop-floor
    AND (
      (my_role() = 'jh_leader'  AND jh_group_id = my_primary_jh_group_id())
      OR (my_role() = 'dmt_leader' AND jh_group_id IN (SELECT id FROM jh_group WHERE dmt_id = my_primary_dmt_id()))
    )
  )
  WITH CHECK (
    factory_id = my_factory_id()
    AND role IN ('apprentice','on_roll')                       -- NEW row: stays shop-floor (B6)
    AND (
      (my_role() = 'jh_leader'  AND jh_group_id = my_primary_jh_group_id())
      OR (my_role() = 'dmt_leader' AND jh_group_id IN (SELECT id FROM jh_group WHERE dmt_id = my_primary_dmt_id()))
    )
    AND dmt_id IS NOT DISTINCT FROM (SELECT dmt_id FROM jh_group WHERE id = jh_group_id)
  );

-- ---------- 5. Six-core write tightening (SELECT unchanged except machine_read leak fix) ----------
DROP POLICY factory_write ON factory;
CREATE POLICY factory_admin_update ON factory FOR UPDATE
  USING (id = my_factory_id() AND is_admin())
  WITH CHECK (id = my_factory_id() AND is_admin());
-- no INSERT/DELETE policies on factory: creation is seed/service-only (MDM_SPEC §3, §6)

DROP POLICY dmt_write ON dmt;
CREATE POLICY dmt_admin_insert ON dmt FOR INSERT
  WITH CHECK (factory_id = my_factory_id() AND is_admin());
CREATE POLICY dmt_admin_update ON dmt FOR UPDATE
  USING (factory_id = my_factory_id() AND is_admin())
  WITH CHECK (factory_id = my_factory_id() AND is_admin());

DROP POLICY jh_group_write ON jh_group;
CREATE POLICY jh_group_admin_insert ON jh_group FOR INSERT
  WITH CHECK (factory_id = my_factory_id() AND is_admin());
CREATE POLICY jh_group_admin_update ON jh_group FOR UPDATE
  USING (factory_id = my_factory_id() AND is_admin())
  WITH CHECK (factory_id = my_factory_id() AND is_admin());

DROP POLICY area_write ON area;
CREATE POLICY area_admin_insert ON area FOR INSERT
  WITH CHECK (factory_id = my_factory_id() AND is_admin());
CREATE POLICY area_admin_update ON area FOR UPDATE
  USING (factory_id = my_factory_id() AND is_admin())
  WITH CHECK (factory_id = my_factory_id() AND is_admin());

DROP POLICY machine_write ON machine;
DROP POLICY machine_read ON machine;                 -- was USING (true): cross-tenant leak (A2)
CREATE POLICY machine_read ON machine FOR SELECT
  USING (factory_id = my_factory_id());
CREATE POLICY machine_insert ON machine FOR INSERT WITH CHECK (
  factory_id = my_factory_id()
  AND (is_admin()
       OR (my_role() = 'dmt_leader'
           AND jh_group_id IN (SELECT id FROM jh_group WHERE dmt_id = my_primary_dmt_id())))
);
CREATE POLICY machine_update ON machine FOR UPDATE
  USING (
    factory_id = my_factory_id()
    AND (is_admin()
         OR (my_role() = 'dmt_leader'
             AND jh_group_id IN (SELECT id FROM jh_group WHERE dmt_id = my_primary_dmt_id())))
  )
  WITH CHECK (
    factory_id = my_factory_id()
    AND (is_admin()
         OR (my_role() = 'dmt_leader'
             AND jh_group_id IN (SELECT id FROM jh_group WHERE dmt_id = my_primary_dmt_id())))
  );
-- no DELETE policies anywhere in the six: deactivation is the path

-- ---------- 6. In-transaction zero-reference re-scan: abort on surprise ----------
DO $$
DECLARE v_refs int;
BEGIN
  SELECT count(*) INTO v_refs FROM (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND (COALESCE(qual,'') || COALESCE(with_check,''))
          ~ 'auth_role|auth_factory_id|auth_jh_group_id|auth_worker_id|auth_dmt_id|is_elevated|dmt_owns_jh'
    UNION ALL
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.prosrc ~ 'auth_role|auth_factory_id|auth_jh_group_id|auth_worker_id|auth_dmt_id|is_elevated|dmt_owns_jh'
        AND p.proname NOT IN ('auth_role','auth_factory_id','auth_jh_group_id',
                              'auth_worker_id','auth_dmt_id','is_elevated','dmt_owns_jh')
    UNION ALL
    SELECT 1 FROM pg_views WHERE schemaname = 'public'
      AND definition ~ 'auth_role|auth_factory_id|auth_jh_group_id|auth_worker_id|auth_dmt_id|is_elevated|dmt_owns_jh'
  ) s;
  IF v_refs > 0 THEN
    RAISE EXCEPTION 'legacy helper still referenced (% refs) — aborting transaction', v_refs;
  END IF;
END $$;

-- ---------- 7. Drop the legacy family (dependents first) — SECURITY_VAPT A5 ----------
DROP FUNCTION is_elevated();
DROP FUNCTION dmt_owns_jh(uuid);
DROP FUNCTION auth_role();
DROP FUNCTION auth_factory_id();
DROP FUNCTION auth_jh_group_id();
DROP FUNCTION auth_worker_id();
DROP FUNCTION auth_dmt_id();
