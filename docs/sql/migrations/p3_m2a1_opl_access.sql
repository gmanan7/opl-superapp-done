-- Phase 3 · M2a-1 (OPL) — access-control + lifecycle RPCs (D-028 / D-024 / §F.4)
-- ----------------------------------------------------------------------------
-- Closes the live broken-access hole (any factory user could approve an OPL).
-- Model: D-024 group-tiered READS; own-group INSERT (any role); author edits own
-- DRAFT/REJECTED content via client UPDATE; ALL privileged transitions (submit /
-- approve / reject / star / delete) go through SECURITY DEFINER RPCs, and the
-- privileged COLUMNS are REVOKEd from client roles so they cannot be set by a
-- crafted PostgREST update. Role checks use EXPLICIT role lists, never native
-- user_role enum ordering (dmt_member/dmt_leader are swapped — D-024/D-025).
-- opl is NON-contract. Per-slot image hashes added for D-027 dedup.
-- ----------------------------------------------------------------------------

BEGIN;

-- ── Schema: per-slot image dedup hashes (D-027 d) ───────────────────────────
ALTER TABLE opl ADD COLUMN IF NOT EXISTS before_image_hash text;
ALTER TABLE opl ADD COLUMN IF NOT EXISTS after_image_hash  text;

-- ── Leadership gate helper: jh_leader+ AND the OPL's group is in the caller's
--    tiered scope (jh_leader→own group(s); dmt→DMT groups; champion/be/admin→
--    factory-wide). SECURITY DEFINER so it composes the *-DEFINER helpers safely.
CREATE OR REPLACE FUNCTION public.can_lead_opl_group(p_grp uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT my_role() = ANY (ARRAY['jh_leader','dmt_member','dmt_leader','pillar_champion','be_team','admin']::user_role[])
     AND (
       my_role() = ANY (ARRAY['pillar_champion','be_team','admin']::user_role[])
       OR (my_role() = ANY (ARRAY['dmt_leader','dmt_member']::user_role[]) AND p_grp = ANY (my_dmt_group_ids()))
       OR p_grp = ANY (my_jh_group_ids())
     )
$$;

-- ── RLS: replace factory-only with D-024 tiered reads + own-group writes ─────
DROP POLICY IF EXISTS opl_read   ON opl;
DROP POLICY IF EXISTS opl_insert ON opl;
DROP POLICY IF EXISTS opl_update ON opl;

CREATE POLICY opl_read ON opl FOR SELECT
  USING (
    factory_id = my_factory_id() AND (
      my_role() = ANY (ARRAY['pillar_champion','be_team','admin']::user_role[])
      OR (my_role() = ANY (ARRAY['dmt_leader','dmt_member']::user_role[]) AND jh_group_id = ANY (my_dmt_group_ids()))
      OR jh_group_id = ANY (my_jh_group_ids())
    )
  );

-- Create: own-group, any role; new OPLs start as draft, authored by the caller.
CREATE POLICY opl_insert ON opl FOR INSERT
  WITH CHECK (
    factory_id = my_factory_id()
    AND jh_group_id = ANY (my_jh_group_ids())
    AND created_by = my_worker_id()
    AND status = 'draft'::opl_status
  );

-- Client update: author editing their OWN draft/rejected lesson, in their group.
-- Privileged columns (status/star/approval/owner/scope) are REVOKEd below, so this
-- policy can only ever touch content fields (title/type/machine/images/remarks/etc).
CREATE POLICY opl_update ON opl FOR UPDATE
  USING (
    factory_id = my_factory_id()
    AND created_by = my_worker_id()
    AND status = ANY (ARRAY['draft','rejected']::opl_status[])
    AND jh_group_id = ANY (my_jh_group_ids())
  )
  WITH CHECK (
    factory_id = my_factory_id()
    AND created_by = my_worker_id()
    AND jh_group_id = ANY (my_jh_group_ids())
  );
-- NOTE: no DELETE policy — deletion is RPC-only (delete_opl), draft/rejected only.

-- ── Column privileges: client roles get UPDATE on CONTENT columns only ──────
-- Table-level UPDATE is revoked FIRST — a column-level REVOKE is a no-op while the
-- role still holds table-level UPDATE (which Supabase grants by default), so the
-- privileged columns would stay client-writable. Then column-level UPDATE is granted
-- on content fields only. Result: status/is_star/approval/owner/scope are client-
-- unwritable → settable ONLY via the SECURITY DEFINER RPCs (closes self-approval).
REVOKE UPDATE ON opl FROM authenticated, anon;
GRANT UPDATE (title, opl_type, machine_id, content_text,
              before_image_url, after_image_url, before_remarks, after_remarks,
              before_image_hash, after_image_hash) ON opl TO authenticated, anon;

-- ── Lifecycle RPCs (SECURITY DEFINER; explicit role lists) ──────────────────

-- Submit: author moves their own draft/rejected lesson → pending_approval.
CREATE OR REPLACE FUNCTION public.submit_opl(p_opl_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_owner uuid; v_grp uuid; v_status opl_status;
BEGIN
  SELECT created_by, jh_group_id, status INTO v_owner, v_grp, v_status
    FROM opl WHERE id = p_opl_id AND factory_id = my_factory_id();
  IF v_grp IS NULL THEN RAISE EXCEPTION 'OPL not found' USING ERRCODE='no_data_found'; END IF;
  IF v_owner <> my_worker_id() THEN RAISE EXCEPTION 'only the author may submit' USING ERRCODE='insufficient_privilege'; END IF;
  IF v_status NOT IN ('draft','rejected') THEN RAISE EXCEPTION 'only a draft/rejected OPL may be submitted' USING ERRCODE='check_violation'; END IF;
  UPDATE opl SET status='pending_approval', rejection_reason=NULL WHERE id=p_opl_id;
END $$;

-- Approve: jh_leader+ within the OPL's group; pending_approval → approved.
CREATE OR REPLACE FUNCTION public.approve_opl(p_opl_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_grp uuid; v_status opl_status;
BEGIN
  SELECT jh_group_id, status INTO v_grp, v_status FROM opl WHERE id=p_opl_id AND factory_id=my_factory_id();
  IF v_grp IS NULL THEN RAISE EXCEPTION 'OPL not found' USING ERRCODE='no_data_found'; END IF;
  IF NOT can_lead_opl_group(v_grp) THEN RAISE EXCEPTION 'not authorized to approve OPL in this group' USING ERRCODE='insufficient_privilege'; END IF;
  IF v_status <> 'pending_approval' THEN RAISE EXCEPTION 'only a pending OPL may be approved' USING ERRCODE='check_violation'; END IF;
  UPDATE opl SET status='approved', approved_by=my_worker_id(), approved_at=now(), rejection_reason=NULL WHERE id=p_opl_id;
END $$;

-- Reject: jh_leader+ within group; pending_approval → rejected (+ mandatory reason).
CREATE OR REPLACE FUNCTION public.reject_opl(p_opl_id uuid, p_reason text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_grp uuid; v_status opl_status;
BEGIN
  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN RAISE EXCEPTION 'rejection reason required' USING ERRCODE='check_violation'; END IF;
  SELECT jh_group_id, status INTO v_grp, v_status FROM opl WHERE id=p_opl_id AND factory_id=my_factory_id();
  IF v_grp IS NULL THEN RAISE EXCEPTION 'OPL not found' USING ERRCODE='no_data_found'; END IF;
  IF NOT can_lead_opl_group(v_grp) THEN RAISE EXCEPTION 'not authorized to reject OPL in this group' USING ERRCODE='insufficient_privilege'; END IF;
  IF v_status <> 'pending_approval' THEN RAISE EXCEPTION 'only a pending OPL may be rejected' USING ERRCODE='check_violation'; END IF;
  UPDATE opl SET status='rejected', rejection_reason=btrim(p_reason), approved_by=NULL, approved_at=NULL WHERE id=p_opl_id;
END $$;

-- Star: jh_leader+ within group toggles is_star.
CREATE OR REPLACE FUNCTION public.set_opl_star(p_opl_id uuid, p_is_star boolean)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_grp uuid;
BEGIN
  SELECT jh_group_id INTO v_grp FROM opl WHERE id=p_opl_id AND factory_id=my_factory_id();
  IF v_grp IS NULL THEN RAISE EXCEPTION 'OPL not found' USING ERRCODE='no_data_found'; END IF;
  IF NOT can_lead_opl_group(v_grp) THEN RAISE EXCEPTION 'not authorized to star OPL in this group' USING ERRCODE='insufficient_privilege'; END IF;
  UPDATE opl SET is_star = p_is_star WHERE id=p_opl_id;
END $$;

-- Delete: DRAFT/REJECTED only; author OR jh_leader+ in group. Approved OPLs are
-- NEVER hard-deleted (soft-retire deferred to M2b, D-005). Storage objects are
-- reclaimed by the orphan sweeper (D-027).
CREATE OR REPLACE FUNCTION public.delete_opl(p_opl_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_owner uuid; v_grp uuid; v_status opl_status;
BEGIN
  SELECT created_by, jh_group_id, status INTO v_owner, v_grp, v_status FROM opl WHERE id=p_opl_id AND factory_id=my_factory_id();
  IF v_grp IS NULL THEN RAISE EXCEPTION 'OPL not found' USING ERRCODE='no_data_found'; END IF;
  IF v_status NOT IN ('draft','rejected') THEN RAISE EXCEPTION 'only a draft/rejected OPL may be deleted' USING ERRCODE='check_violation'; END IF;
  IF NOT (v_owner = my_worker_id() OR can_lead_opl_group(v_grp)) THEN RAISE EXCEPTION 'not authorized to delete this OPL' USING ERRCODE='insufficient_privilege'; END IF;
  DELETE FROM opl WHERE id=p_opl_id;
END $$;

GRANT EXECUTE ON FUNCTION public.can_lead_opl_group(uuid),
  public.submit_opl(uuid), public.approve_opl(uuid), public.reject_opl(uuid, text),
  public.set_opl_star(uuid, boolean), public.delete_opl(uuid) TO authenticated, anon;

COMMIT;
