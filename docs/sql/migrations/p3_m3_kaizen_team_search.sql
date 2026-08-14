-- Phase 3 · M3 (Kaizen) — factory-wide team-member search (UAT round 2, item C)
-- ----------------------------------------------------------------------------
-- A MINIMAL scoped read for the Kaizen team picker: returns only {id, name, jh_group}
-- for ACTIVE workers in the CALLER's factory — never a broad worker_profile select — so
-- it survives the People/PIN read-tightening and exposes no PII beyond the name already
-- available via worker_names. Factory-scoped (my_factory_id()); SECURITY DEFINER so it
-- does not depend on worker_profile RLS. Lets the author / jh_leader / approver add team
-- members from OUTSIDE their JH group; cross-factory-safe (no cross-factory rows possible).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.kaizen_worker_search(p_q text DEFAULT NULL)
 RETURNS TABLE (id uuid, name text, jh_group text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT wp.id, wp.name, jg.name
  FROM worker_profile wp
  LEFT JOIN jh_group jg ON jg.id = wp.jh_group_id
  WHERE wp.factory_id = my_factory_id()
    AND wp.is_active = true
    AND (p_q IS NULL OR btrim(p_q) = '' OR wp.name ILIKE '%' || btrim(p_q) || '%')
  ORDER BY wp.name
  LIMIT 50
$$;

REVOKE EXECUTE ON FUNCTION public.kaizen_worker_search(text) FROM public;
GRANT  EXECUTE ON FUNCTION public.kaizen_worker_search(text) TO authenticated, anon;
