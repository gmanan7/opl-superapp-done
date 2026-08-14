-- Phase 3 · M3 (Kaizen) — submit requires all four core fields (D-031 amendment)
-- ----------------------------------------------------------------------------
-- Owner ruling: title + brief_description + problem_description + solution_description
-- are ALL mandatory to SUBMIT (a draft may still be saved incomplete). Server-side
-- guard in submit_kaizen (defense in depth — not client-only). Sanitized error (D5).
-- CREATE OR REPLACE — idempotent; no schema change.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.submit_kaizen(p_kaizen_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_owner uuid; v_grp uuid; v_status kaizen_status;
        v_title text; v_brief text; v_problem text; v_solution text;
BEGIN
  SELECT submitted_by, jh_group_id, status, title, brief_description, problem_description, solution_description
    INTO v_owner, v_grp, v_status, v_title, v_brief, v_problem, v_solution
    FROM kaizen WHERE id = p_kaizen_id AND factory_id = my_factory_id();
  IF v_grp IS NULL THEN RAISE EXCEPTION 'Kaizen not found' USING ERRCODE='no_data_found'; END IF;
  IF v_owner <> my_worker_id() THEN RAISE EXCEPTION 'only the author may submit' USING ERRCODE='insufficient_privilege'; END IF;
  IF v_status NOT IN ('draft','rejected') THEN RAISE EXCEPTION 'only a draft/rejected Kaizen may be submitted' USING ERRCODE='check_violation'; END IF;
  IF v_title IS NULL OR btrim(v_title) = ''
     OR v_brief IS NULL OR btrim(v_brief) = ''
     OR v_problem IS NULL OR btrim(v_problem) = ''
     OR v_solution IS NULL OR btrim(v_solution) = '' THEN
    RAISE EXCEPTION 'title, description, problem and solution are all required to submit' USING ERRCODE='check_violation';
  END IF;
  UPDATE kaizen SET status='submitted', submitted_at=now(), rejection_reason=NULL WHERE id=p_kaizen_id;
END $$;
