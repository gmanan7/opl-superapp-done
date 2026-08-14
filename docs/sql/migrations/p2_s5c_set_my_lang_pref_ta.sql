-- ============================================================================
-- Phase 2 Step 5c — open the set_my_lang_pref server-side whitelist to 'ta'
-- ============================================================================
-- D-008 Tamil gate is verified open (lang_pref enum already has 'ta'; Training Hub
-- syncs it). This adds 'ta' to the self-service whitelist (defense-in-depth alongside
-- the client SELECTABLE_LANGS). CREATE OR REPLACE — no signature change, grants
-- preserved. Still a factory-scoped self-write keyed on my_worker_id() + is_active
-- (SECURITY_VAPT §F).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_my_lang_pref(p_lang text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF p_lang NOT IN ('en','hi','gu','ta') THEN
    RAISE EXCEPTION 'lang_not_enabled';
  END IF;
  UPDATE worker_profile SET lang_pref = p_lang::lang_pref
  WHERE id = my_worker_id() AND is_active = true;
END $function$;
