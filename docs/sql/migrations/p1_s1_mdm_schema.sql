-- ============================================================================
-- Phase 1 Step 1 — MDM schema (module zero) 🔒
-- Applied to joryoadrvisizkkspuov on 2026-06-10 via Management API.
-- Plan approved by owner (D-016, D-017). Bracketed by contract_check.sql
-- before AND after — both green (A 6/6 PASS, B 45/45, D zero drift).
--
-- Execution notes:
--   Section 1 ran as ONE request = one implicit transaction.
--   Section 2 (ALTER TYPE) ran as its own statement (Postgres requirement).
--   Section 3 (seeds) ran after; fires the audit triggers (actor NULL = system).
-- ============================================================================

-- ===== SECTION 1 — DDL (executed as ONE request = one implicit transaction) =====

-- ---------- 1a. factory_module ----------
CREATE TABLE factory_module (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id  uuid NOT NULL REFERENCES factory(id),
  module_key  text NOT NULL,
  is_enabled  boolean NOT NULL DEFAULT true,
  enabled_at  timestamptz DEFAULT now(),
  UNIQUE (factory_id, module_key),
  CHECK (module_key IN ('jh_kpi','opl','kaizen','clti','abnormality',
                        'meetings','jh_audit','dashboards'))
);
ALTER TABLE factory_module ENABLE ROW LEVEL SECURITY;

-- ---------- 1b. worker_group_membership (D-016 shape) ----------
CREATE TABLE worker_group_membership (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id        uuid NOT NULL REFERENCES factory(id),
  worker_profile_id uuid NOT NULL REFERENCES worker_profile(id),
  jh_group_id       uuid REFERENCES jh_group(id),
  dmt_id            uuid REFERENCES dmt(id),
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz DEFAULT now(),
  CHECK (num_nonnulls(jh_group_id, dmt_id) = 1)
);
CREATE UNIQUE INDEX ux_wgm_worker_jh
  ON worker_group_membership (worker_profile_id, jh_group_id)
  WHERE jh_group_id IS NOT NULL AND is_active;
CREATE UNIQUE INDEX ux_wgm_worker_dmt
  ON worker_group_membership (worker_profile_id, dmt_id)
  WHERE dmt_id IS NOT NULL AND is_active;
ALTER TABLE worker_group_membership ENABLE ROW LEVEL SECURITY;

-- ---------- 1c. worker_factory_membership (dormant, D-010) ----------
CREATE TABLE worker_factory_membership (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_profile_id uuid NOT NULL REFERENCES worker_profile(id),
  factory_id        uuid NOT NULL REFERENCES factory(id),
  is_home           boolean NOT NULL DEFAULT false,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz DEFAULT now(),
  UNIQUE (worker_profile_id, factory_id)
);
CREATE UNIQUE INDEX ux_wfm_one_home
  ON worker_factory_membership (worker_profile_id)
  WHERE is_home AND is_active;
ALTER TABLE worker_factory_membership ENABLE ROW LEVEL SECURITY;

-- ---------- 1d. mdm_audit (actor nullable per D-016) ----------
CREATE TABLE mdm_audit (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id      uuid NOT NULL,
  actor_worker_id uuid,
  entity_table    text NOT NULL,
  entity_id       uuid NOT NULL,
  action          text NOT NULL CHECK (action IN
    ('create','update','deactivate','reactivate','pin_reset','redact','import')),
  changed_fields  jsonb,
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX ix_mdm_audit_entity ON mdm_audit (entity_table, entity_id);
CREATE INDEX ix_mdm_audit_factory_time ON mdm_audit (factory_id, created_at DESC);
ALTER TABLE mdm_audit ENABLE ROW LEVEL SECURITY;

-- mdm_audit: clients may never write (rows arrive via SECURITY DEFINER trigger
-- and service-role Edge Functions). SELECT stays granted; RLS gates rows.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON mdm_audit FROM anon, authenticated;

-- ---------- 2. Identity helpers (D-017 trust model) ----------
CREATE OR REPLACE FUNCTION my_worker_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT id FROM worker_profile
      WHERE supabase_user_id = auth.uid() AND is_active = true LIMIT 1),
    (SELECT wp.id FROM worker_profile wp
      WHERE wp.id = NULLIF(current_setting('request.headers', true)::json->>'x-worker-id','')::uuid
        AND wp.factory_id = NULLIF(current_setting('request.headers', true)::json->>'x-factory-id','')::uuid
        AND wp.is_active = true
        AND wp.role IN ('apprentice','on_roll'))
  )
$$;

-- NOTE: user_role enum sort order is NOT authority order (dmt_member sorts
-- after dmt_leader). Only equality/IN checks on this value — never >=.
CREATE OR REPLACE FUNCTION my_role() RETURNS user_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM worker_profile WHERE id = my_worker_id() AND is_active = true
$$;

-- Admin is reachable ONLY via JWT identity: the header path in my_worker_id()
-- rejects any role above on_roll, so a client-asserted header can never
-- satisfy this check (D-017).
CREATE OR REPLACE FUNCTION is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT my_role() = 'admin'
$$;

CREATE OR REPLACE FUNCTION my_jh_group_ids() RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(DISTINCT g), '{}') FROM (
    SELECT jh_group_id AS g FROM worker_profile
      WHERE id = my_worker_id() AND jh_group_id IS NOT NULL
    UNION
    SELECT jh_group_id FROM worker_group_membership
      WHERE worker_profile_id = my_worker_id()
        AND is_active = true AND jh_group_id IS NOT NULL
  ) s
$$;

CREATE OR REPLACE FUNCTION my_dmt_ids() RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(DISTINCT d), '{}') FROM (
    SELECT dmt_id AS d FROM worker_profile
      WHERE id = my_worker_id() AND dmt_id IS NOT NULL
    UNION
    SELECT dmt_id FROM worker_group_membership
      WHERE worker_profile_id = my_worker_id()
        AND is_active = true AND dmt_id IS NOT NULL
  ) s
$$;

-- ---------- 3. RLS policies for the four new tables ----------
CREATE POLICY fm_read  ON factory_module FOR SELECT
  USING (factory_id = my_factory_id());
CREATE POLICY fm_write ON factory_module FOR ALL
  USING (factory_id = my_factory_id() AND is_admin())
  WITH CHECK (factory_id = my_factory_id() AND is_admin());

CREATE POLICY wgm_read  ON worker_group_membership FOR SELECT
  USING (factory_id = my_factory_id());
CREATE POLICY wgm_write ON worker_group_membership FOR ALL
  USING (factory_id = my_factory_id() AND is_admin())
  WITH CHECK (factory_id = my_factory_id() AND is_admin());

CREATE POLICY wfm_admin ON worker_factory_membership FOR ALL
  USING (factory_id = my_factory_id() AND is_admin())
  WITH CHECK (factory_id = my_factory_id() AND is_admin());

CREATE POLICY audit_admin_read ON mdm_audit FOR SELECT
  USING (factory_id = my_factory_id() AND is_admin());

-- ---------- 4. Audit trigger ----------
CREATE OR REPLACE FUNCTION fn_mdm_audit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_new     jsonb := to_jsonb(NEW);
  v_old     jsonb;
  v_changed jsonb := '{}'::jsonb;
  v_action  text;
  v_key     text;
  v_nkeys   int;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action  := 'create';
    v_changed := NULL;
  ELSE
    v_old := to_jsonb(OLD);
    FOR v_key IN SELECT jsonb_object_keys(v_new) LOOP
      CONTINUE WHEN v_key IN ('pin_hash','supabase_user_id');  -- secrets never logged
      IF v_new->v_key IS DISTINCT FROM v_old->v_key THEN
        v_changed := v_changed || jsonb_build_object(v_key,
          jsonb_build_object('old', v_old->v_key, 'new', v_new->v_key));
      END IF;
    END LOOP;
    SELECT count(*) INTO v_nkeys FROM jsonb_object_keys(v_changed) k;
    IF v_nkeys = 0 THEN RETURN NEW; END IF;                                 -- nothing auditable
    IF v_nkeys = 1 AND v_changed ? 'last_login_at' THEN RETURN NEW; END IF; -- login-stamp noise
    IF v_changed ? 'is_active' THEN
      v_action := CASE WHEN (v_new->>'is_active')::boolean THEN 'reactivate' ELSE 'deactivate' END;
    ELSE
      v_action := 'update';
    END IF;
  END IF;
  INSERT INTO mdm_audit (factory_id, actor_worker_id, entity_table, entity_id, action, changed_fields)
  VALUES (
    COALESCE((v_new->>'factory_id')::uuid, (v_new->>'id')::uuid),  -- factory table: its own id
    my_worker_id(),                                                 -- NULL = system (D-016)
    TG_TABLE_NAME,
    (v_new->>'id')::uuid,
    v_action,
    v_changed
  );
  RETURN NEW;
END
$$;

-- Triggers: six contract tables + the three writable MDM tables (not mdm_audit).
CREATE TRIGGER trg_mdm_audit_factory        AFTER INSERT OR UPDATE ON factory                   FOR EACH ROW EXECUTE FUNCTION fn_mdm_audit();
CREATE TRIGGER trg_mdm_audit_dmt            AFTER INSERT OR UPDATE ON dmt                       FOR EACH ROW EXECUTE FUNCTION fn_mdm_audit();
CREATE TRIGGER trg_mdm_audit_jh_group       AFTER INSERT OR UPDATE ON jh_group                  FOR EACH ROW EXECUTE FUNCTION fn_mdm_audit();
CREATE TRIGGER trg_mdm_audit_area           AFTER INSERT OR UPDATE ON area                      FOR EACH ROW EXECUTE FUNCTION fn_mdm_audit();
CREATE TRIGGER trg_mdm_audit_machine        AFTER INSERT OR UPDATE ON machine                   FOR EACH ROW EXECUTE FUNCTION fn_mdm_audit();
CREATE TRIGGER trg_mdm_audit_worker_profile AFTER INSERT OR UPDATE ON worker_profile            FOR EACH ROW EXECUTE FUNCTION fn_mdm_audit();
CREATE TRIGGER trg_mdm_audit_factory_module AFTER INSERT OR UPDATE ON factory_module            FOR EACH ROW EXECUTE FUNCTION fn_mdm_audit();
CREATE TRIGGER trg_mdm_audit_wgm            AFTER INSERT OR UPDATE ON worker_group_membership   FOR EACH ROW EXECUTE FUNCTION fn_mdm_audit();
CREATE TRIGGER trg_mdm_audit_wfm            AFTER INSERT OR UPDATE ON worker_factory_membership FOR EACH ROW EXECUTE FUNCTION fn_mdm_audit();

-- ===== SECTION 2 — 'ta' enum value (own statement; live enum name is lang_pref, D-016) =====
-- Schema-level only: worker-facing selection stays gated (D-008) via the
-- SELECTABLE_LANGS constant in the Phase 2 i18n build.
ALTER TYPE lang_pref ADD VALUE IF NOT EXISTS 'ta';

-- ===== SECTION 3 — Seeds (fire the audit triggers: 'create' rows, actor NULL = system) =====

-- 3a. Module enablement for NPF (owner-confirmed initial state).
-- Seeds may reference the NPF UUID (CLAUDE.md hard rule 4 exception).
INSERT INTO factory_module (factory_id, module_key, is_enabled)
SELECT '00000000-0000-0000-0000-000000000001', k.key, k.enabled
FROM (VALUES
  ('jh_kpi', true), ('opl', true), ('kaizen', true), ('abnormality', true),
  ('clti', false), ('meetings', false), ('jh_audit', false), ('dashboards', false)
) AS k(key, enabled)
ON CONFLICT (factory_id, module_key) DO NOTHING;

-- 3b. Home membership for every existing worker (factory derived per row).
INSERT INTO worker_factory_membership (worker_profile_id, factory_id, is_home, is_active)
SELECT id, factory_id, true, true FROM worker_profile
ON CONFLICT (worker_profile_id, factory_id) DO NOTHING;
