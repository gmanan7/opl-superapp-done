-- Phase 3 · M3 (Kaizen) — access-control + scoring RPCs + schema hygiene (D-020 / D-024 / §F.4)
-- ----------------------------------------------------------------------------
-- Closes the live broken-access hole: kaizen RLS was factory-only (any factory
-- user could UPDATE status→approved + scores via crafted PostgREST), the only gate
-- was client-side, and it used the WRONG tier (jh_leader+ vs D-020's approver tier).
-- Mirrors the OPL re-ground (p3_m2a1_opl_access.sql / D-029):
--   READ  — D-024 group-tiered (floor+jh_leader→group; dmt→DMT; champion/be/admin→factory).
--   CREATE — own-group, any role; new kaizens start as draft, authored by caller.
--   CONTENT EDIT — author edits own draft/rejected via client UPDATE (content cols only).
--   STATUS/SCORE/APPROVAL — settable ONLY via SECURITY DEFINER RPCs; the privileged
--     columns are REVOKEd from client roles. Approve/reject gated to the D-020 APPROVER
--     tier {dmt_leader (→DMT groups), pillar_champion, be_team, admin (→factory)};
--     jh_leader/dmt_member are REVIEWER (read-only — enforced by NOT being in the gate).
--   SCORING — straight 1/3/9 SUM → total out of 36, COMPUTED SERVER-SIDE in approve_kaizen
--     (client-supplied totals are ignored). Role checks use EXPLICIT role lists, never
--     native user_role enum order (dmt_* swapped — D-024/D-029).
-- HYGIENE — drop prototype residue columns (verified empty) + kaizen_training_record
--   (0 rows, no FKs — the same one-row-per-worker residue dropped for OPL); reduce to
--   1 before + 1 after image slot (KAIZEN_DETAIL §5) with per-slot D-027 hash; GIN team.
-- kaizen is NON-contract (no master-table touch).
-- ----------------------------------------------------------------------------

BEGIN;

-- ── Schema hygiene: drop verified-empty prototype residue ───────────────────
ALTER TABLE kaizen
  DROP COLUMN IF EXISTS problem_desc,
  DROP COLUMN IF EXISTS solution_desc,
  DROP COLUMN IF EXISTS benefit_desc,
  DROP COLUMN IF EXISTS benefit_type,
  DROP COLUMN IF EXISTS before_images,
  DROP COLUMN IF EXISTS after_images,
  DROP COLUMN IF EXISTS reviewed_by,
  DROP COLUMN IF EXISTS review_notes,
  DROP COLUMN IF EXISTS before_image_2_url,
  DROP COLUMN IF EXISTS after_image_2_url;

DROP TABLE IF EXISTS kaizen_training_record;  -- prototype residue (0 rows, no FKs)

-- Per-slot image dedup hash (D-027 d) for the two kept slots; GIN for team arrays.
ALTER TABLE kaizen
  ADD COLUMN IF NOT EXISTS before_image_1_hash text,
  ADD COLUMN IF NOT EXISTS after_image_1_hash  text;
CREATE INDEX IF NOT EXISTS kaizen_team_gin ON kaizen USING gin (team_member_ids);

-- ── Approver-tier gate (D-020): dmt_leader→DMT groups; champion/be/admin→factory.
--    Deliberately EXCLUDES jh_leader/dmt_member (reviewer tier — read-only). SECURITY
--    DEFINER so it composes the *-DEFINER helpers safely. ─────────────────────
CREATE OR REPLACE FUNCTION public.can_approve_kaizen_group(p_grp uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT my_role() = ANY (ARRAY['dmt_leader','pillar_champion','be_team','admin']::user_role[])
     AND (
       my_role() = ANY (ARRAY['pillar_champion','be_team','admin']::user_role[])
       OR (my_role() = 'dmt_leader' AND p_grp = ANY (my_dmt_group_ids()))
     )
$$;

-- ── RLS: replace factory-only with D-024 tiered reads + own-group writes ─────
DROP POLICY IF EXISTS kaizen_read   ON kaizen;
DROP POLICY IF EXISTS kaizen_insert ON kaizen;
DROP POLICY IF EXISTS kaizen_update ON kaizen;

CREATE POLICY kaizen_read ON kaizen FOR SELECT
  USING (
    factory_id = my_factory_id() AND (
      my_role() = ANY (ARRAY['pillar_champion','be_team','admin']::user_role[])
      OR (my_role() = ANY (ARRAY['dmt_leader','dmt_member']::user_role[]) AND jh_group_id = ANY (my_dmt_group_ids()))
      OR jh_group_id = ANY (my_jh_group_ids())
    )
  );

-- Create: own-group, any role; new kaizens start as draft, authored by the caller.
CREATE POLICY kaizen_insert ON kaizen FOR INSERT
  WITH CHECK (
    factory_id = my_factory_id()
    AND jh_group_id = ANY (my_jh_group_ids())
    AND submitted_by = my_worker_id()
    AND status = 'draft'::kaizen_status
  );

-- Client update: author editing their OWN draft/rejected kaizen, in their group.
-- Privileged columns (status/score_*/approval) are REVOKEd below → this policy can
-- only ever touch content fields (problem/solution/images/team/cost/HD/etc).
CREATE POLICY kaizen_update ON kaizen FOR UPDATE
  USING (
    factory_id = my_factory_id()
    AND submitted_by = my_worker_id()
    AND status = ANY (ARRAY['draft','rejected']::kaizen_status[])
    AND jh_group_id = ANY (my_jh_group_ids())
  )
  WITH CHECK (
    factory_id = my_factory_id()
    AND submitted_by = my_worker_id()
    AND jh_group_id = ANY (my_jh_group_ids())
  );
-- NOTE: no DELETE policy — drafts are edited/submitted, not deleted (no delete RPC).

-- ── Column privileges: client roles get UPDATE on CONTENT columns only ──────
-- Revoke table-level write FIRST (a column REVOKE is a no-op while table-level UPDATE
-- is held), then grant UPDATE on content fields only → status/score_*/approval are
-- client-unwritable, settable ONLY via the SECURITY DEFINER RPCs (closes self-approval).
REVOKE UPDATE, DELETE ON kaizen FROM authenticated, anon;
GRANT UPDATE (title, result_area, brief_description, machine_id, area_id,
              problem_description, solution_description,
              before_image_1_url, after_image_1_url, before_image_1_hash, after_image_1_hash,
              cost_impl, benefit_description, team_member_ids,
              horizontal_deployment, horizontal_deployment_details) ON kaizen TO authenticated, anon;

-- ── Lifecycle RPCs (SECURITY DEFINER; explicit role lists; sanitized errors) ─

-- Submit: author promotes their own draft/rejected kaizen → submitted.
CREATE OR REPLACE FUNCTION public.submit_kaizen(p_kaizen_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_owner uuid; v_grp uuid; v_status kaizen_status;
BEGIN
  SELECT submitted_by, jh_group_id, status INTO v_owner, v_grp, v_status
    FROM kaizen WHERE id = p_kaizen_id AND factory_id = my_factory_id();
  IF v_grp IS NULL THEN RAISE EXCEPTION 'Kaizen not found' USING ERRCODE='no_data_found'; END IF;
  IF v_owner <> my_worker_id() THEN RAISE EXCEPTION 'only the author may submit' USING ERRCODE='insufficient_privilege'; END IF;
  IF v_status NOT IN ('draft','rejected') THEN RAISE EXCEPTION 'only a draft/rejected Kaizen may be submitted' USING ERRCODE='check_violation'; END IF;
  UPDATE kaizen SET status='submitted', submitted_at=now(), rejection_reason=NULL WHERE id=p_kaizen_id;
END $$;

-- Approve: D-020 approver tier within scope; submitted → approved. Scores are 1/3/9;
-- total_score is the straight SUM (max 36), computed HERE — any client total is ignored.
CREATE OR REPLACE FUNCTION public.approve_kaizen(p_kaizen_id uuid, p_pq int, p_ehs int, p_quant int, p_easy int)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_grp uuid; v_status kaizen_status;
BEGIN
  IF p_pq NOT IN (1,3,9) OR p_ehs NOT IN (1,3,9) OR p_quant NOT IN (1,3,9) OR p_easy NOT IN (1,3,9) THEN
    RAISE EXCEPTION 'each score must be 1, 3, or 9' USING ERRCODE='check_violation'; END IF;
  SELECT jh_group_id, status INTO v_grp, v_status FROM kaizen WHERE id=p_kaizen_id AND factory_id=my_factory_id();
  IF v_grp IS NULL THEN RAISE EXCEPTION 'Kaizen not found' USING ERRCODE='no_data_found'; END IF;
  IF NOT can_approve_kaizen_group(v_grp) THEN RAISE EXCEPTION 'not authorized to approve Kaizen in this group' USING ERRCODE='insufficient_privilege'; END IF;
  IF v_status <> 'submitted' THEN RAISE EXCEPTION 'only a submitted Kaizen may be approved' USING ERRCODE='check_violation'; END IF;
  UPDATE kaizen SET status='approved',
    score_pq=p_pq, score_ehs=p_ehs, score_quant=p_quant, score_easy=p_easy,
    total_score = (p_pq + p_ehs + p_quant + p_easy),
    approved_by=my_worker_id(), approved_at=now(), rejection_reason=NULL
   WHERE id=p_kaizen_id;
END $$;

-- Reject: D-020 approver tier within scope; submitted → rejected (+ mandatory reason).
CREATE OR REPLACE FUNCTION public.reject_kaizen(p_kaizen_id uuid, p_reason text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_grp uuid; v_status kaizen_status;
BEGIN
  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN RAISE EXCEPTION 'rejection reason required' USING ERRCODE='check_violation'; END IF;
  SELECT jh_group_id, status INTO v_grp, v_status FROM kaizen WHERE id=p_kaizen_id AND factory_id=my_factory_id();
  IF v_grp IS NULL THEN RAISE EXCEPTION 'Kaizen not found' USING ERRCODE='no_data_found'; END IF;
  IF NOT can_approve_kaizen_group(v_grp) THEN RAISE EXCEPTION 'not authorized to reject Kaizen in this group' USING ERRCODE='insufficient_privilege'; END IF;
  IF v_status <> 'submitted' THEN RAISE EXCEPTION 'only a submitted Kaizen may be rejected' USING ERRCODE='check_violation'; END IF;
  UPDATE kaizen SET status='rejected', rejection_reason=btrim(p_reason),
    score_pq=NULL, score_ehs=NULL, score_quant=NULL, score_easy=NULL, total_score=NULL,
    approved_by=NULL, approved_at=NULL
   WHERE id=p_kaizen_id;
END $$;

GRANT EXECUTE ON FUNCTION
  public.can_approve_kaizen_group(uuid),
  public.submit_kaizen(uuid),
  public.approve_kaizen(uuid, int, int, int, int),
  public.reject_kaizen(uuid, text)
  TO authenticated, anon;

COMMIT;
