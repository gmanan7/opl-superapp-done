-- ============================================================================
-- Phase 2 hotfix — get_my_worker_context omitted lang_pref
-- ============================================================================
-- BUG: get_my_worker_context() returned (id, role, factory_id, jh_group_id,
-- dmt_id) but NOT lang_pref. The frontend WorkerCtxRow type *declared* lang_pref,
-- so worker.lang_pref was always undefined and email sessions resolved to
-- `worker.lang_pref ?? 'en'` — pinning every email user to English regardless of
-- their stored worker_profile.lang_pref. (PIN was unaffected: pin-auth Edge
-- Function already selects + returns lang_pref live.)
--
-- This is Hard Rule 2 applied to a TYPE: the type asserted a column the RPC never
-- returned. A mocked unit test cannot catch this — only verifying the live RPC
-- output shape can (the standing query at the bottom of this file).
--
-- CHANGE: add lang_pref to the RETURNS TABLE signature and the SELECT. Returned
-- as text (mirroring how `role` is returned as text from its enum column).
-- DROP+CREATE is required because CREATE OR REPLACE cannot change the OUT row type.
-- Grants restored to match the pre-change ACL exactly (PUBLIC + anon/authenticated/
-- service_role had EXECUTE). No contracted-column / UUID / row-count impact — this
-- only changes a function that READS worker_profile.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.get_my_worker_context();

CREATE FUNCTION public.get_my_worker_context()
  RETURNS TABLE(id uuid, role text, factory_id uuid, jh_group_id uuid, dmt_id uuid, lang_pref text)
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
  SELECT id, role, factory_id, jh_group_id, dmt_id, lang_pref
  FROM worker_profile
  WHERE supabase_user_id = auth.uid()
    AND is_active = true
  LIMIT 1;
$function$;

GRANT EXECUTE ON FUNCTION public.get_my_worker_context() TO anon, authenticated, service_role;

COMMIT;

-- ============================================================================
-- STANDING RPC-SHAPE GUARD (layer-b). Run after any change to this function or
-- to worker_profile. The result MUST include a lang_pref column.
-- ============================================================================
-- SELECT pg_get_function_result(p.oid)
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE p.proname = 'get_my_worker_context' AND n.nspname = 'public';
--   expected: TABLE(id uuid, role text, factory_id uuid, jh_group_id uuid,
--                   dmt_id uuid, lang_pref text)
