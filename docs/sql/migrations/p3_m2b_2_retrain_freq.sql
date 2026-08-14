-- Phase 3 · M2b (addendum) — gated edit of opl.retrain_frequency_days
-- ----------------------------------------------------------------------------
-- The per-OPL retrain cadence is owner-confirmed as jh_leader+-editable. The
-- column is NOT in the M2a client-writable grant list (content columns only),
-- so editing it goes through a SECURITY DEFINER RPC gated by can_lead_opl_group
-- (same pattern as the other M2b mutations). Bounds 1..3650 days.
-- ----------------------------------------------------------------------------

BEGIN;

CREATE OR REPLACE FUNCTION public.set_opl_retrain_frequency(p_opl_id uuid, p_days int)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_grp uuid;
BEGIN
  IF p_days IS NULL OR p_days < 1 OR p_days > 3650 THEN
    RAISE EXCEPTION 'retrain frequency must be 1..3650 days' USING ERRCODE='check_violation'; END IF;
  SELECT jh_group_id INTO v_grp FROM opl WHERE id = p_opl_id AND factory_id = my_factory_id();
  IF v_grp IS NULL THEN RAISE EXCEPTION 'OPL not found' USING ERRCODE='no_data_found'; END IF;
  IF NOT can_lead_opl_group(v_grp) THEN
    RAISE EXCEPTION 'not authorized to change retrain cadence in this group' USING ERRCODE='insufficient_privilege'; END IF;
  UPDATE opl SET retrain_frequency_days = p_days WHERE id = p_opl_id;
END $$;

GRANT EXECUTE ON FUNCTION public.set_opl_retrain_frequency(uuid, int) TO authenticated, anon;

COMMIT;
