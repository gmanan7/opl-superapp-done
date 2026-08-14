-- Phase 3 · Module 1 (KPIs) — access-control migration (D-024)
-- ----------------------------------------------------------------------------
-- Closes the prototype's client-side-only KPI write gate (live §F broken-access-
-- control: both jh_kpi_* tables had factory-only RLS, so ANY factory user could
-- write ANY group's KPIs). Implements the D-024 model:
--   READ  — group-scoped tiered: shop floor + jh_leader → their group(s)
--           (my_jh_group_ids, primary+additional per D-013); dmt_member/dmt_leader
--           → their DMT's groups; pillar_champion/be_team/admin → factory-wide.
--   WRITE (entry) — own-group for ALL roles (apprentice/on_roll AND jh_leader+)
--           via my_jh_group_ids; NOT apprentice_type-gated. INSERT+UPDATE, no DELETE.
--   DEFINITION writes — admin only.
-- Enforced server-side via my_role() (SECURITY DEFINER) + group/factory helpers.
-- Role checks use EXPLICIT role lists, never native user_role enum ordering
-- (dmt_member/dmt_leader are swapped in the enum — see D-024 / CLAUDE.md).
-- jh_kpi_definition / jh_kpi_entry are NON-contract tables — safe to alter RLS.
-- ----------------------------------------------------------------------------

BEGIN;

-- ── Helpers ────────────────────────────────────────────────────────────────

-- Caller's role, resolved for BOTH identity types via my_worker_id()
-- (email → auth.uid(); PIN → x-worker-id/x-factory-id headers, capped to
-- shop-floor roles per D-017). NULL when the caller cannot be resolved → deny.
CREATE OR REPLACE FUNCTION public.my_role()
 RETURNS user_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT role FROM worker_profile WHERE id = my_worker_id()
$function$;

-- jh_group ids belonging to the caller's DMT(s). SECURITY DEFINER so the tiered
-- read policy does not depend on jh_group RLS being permissive for the caller.
CREATE OR REPLACE FUNCTION public.my_dmt_group_ids()
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(array_agg(id), '{}') FROM jh_group WHERE dmt_id = ANY(my_dmt_ids())
$function$;

-- ── jh_kpi_definition — tiered read, admin write ────────────────────────────

DROP POLICY IF EXISTS kpi_def_read  ON jh_kpi_definition;
DROP POLICY IF EXISTS kpi_def_write ON jh_kpi_definition;

CREATE POLICY kpi_def_read ON jh_kpi_definition
  FOR SELECT
  USING (
    factory_id = my_factory_id() AND (
      my_role() IN ('pillar_champion','be_team','admin')
      OR (my_role() IN ('dmt_leader','dmt_member') AND jh_group_id = ANY(my_dmt_group_ids()))
      OR jh_group_id = ANY(my_jh_group_ids())
    )
  );

CREATE POLICY kpi_def_write ON jh_kpi_definition
  FOR ALL
  USING (factory_id = my_factory_id() AND my_role() = 'admin')
  WITH CHECK (factory_id = my_factory_id() AND my_role() = 'admin');

-- ── jh_kpi_entry — tiered read, own-group insert+update (all roles) ─────────

DROP POLICY IF EXISTS kpi_entry_read   ON jh_kpi_entry;
DROP POLICY IF EXISTS kpi_entry_write  ON jh_kpi_entry;
DROP POLICY IF EXISTS kpi_entry_insert ON jh_kpi_entry;
DROP POLICY IF EXISTS kpi_entry_update ON jh_kpi_entry;

CREATE POLICY kpi_entry_read ON jh_kpi_entry
  FOR SELECT
  USING (
    factory_id = my_factory_id() AND (
      my_role() IN ('pillar_champion','be_team','admin')
      OR (my_role() IN ('dmt_leader','dmt_member') AND jh_group_id = ANY(my_dmt_group_ids()))
      OR jh_group_id = ANY(my_jh_group_ids())
    )
  );

-- Own-group write for ALL roles (capture-first thesis). No DELETE policy:
-- entries are corrected via UPDATE (upsert by machine_id+date+group), never deleted.
CREATE POLICY kpi_entry_insert ON jh_kpi_entry
  FOR INSERT
  WITH CHECK (factory_id = my_factory_id() AND jh_group_id = ANY(my_jh_group_ids()));

CREATE POLICY kpi_entry_update ON jh_kpi_entry
  FOR UPDATE
  USING (factory_id = my_factory_id() AND jh_group_id = ANY(my_jh_group_ids()))
  WITH CHECK (factory_id = my_factory_id() AND jh_group_id = ANY(my_jh_group_ids()));

COMMIT;
