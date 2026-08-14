-- Phase 3 · M3 (Kaizen) — §F image gate (storage layer) + D-027 hygiene
-- ----------------------------------------------------------------------------
-- Bucket tpm-uploads is already hardened (256KB + jpeg/png/webp) by the OPL
-- migration (shared bucket) — not repeated. This adds the Kaizen orphan-computation
-- RPC; the opl-orphan-sweep Edge is extended to reconcile */kaizen/* too (one daily
-- cron covers both — no new schedule). The Edge removes via the Storage API (a
-- pure-SQL delete of storage.objects would orphan the bytes).
-- ----------------------------------------------------------------------------

-- Object paths under */kaizen/* older than N hours that NO kaizen row references
-- (failed uploads, replaced images). Handles stored-PATH and legacy public-URL forms.
CREATE OR REPLACE FUNCTION public.kaizen_orphan_image_paths(p_older_than_hours int DEFAULT 24)
 RETURNS text[] LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE(array_agg(o.name), '{}')
  FROM storage.objects o
  WHERE o.bucket_id = 'tpm-uploads'
    AND o.name LIKE '%/kaizen/%'
    AND o.created_at < now() - make_interval(hours => p_older_than_hours)
    AND o.name NOT IN (
      SELECT p FROM (
        SELECT COALESCE(NULLIF(split_part(before_image_1_url, '/tpm-uploads/', 2), ''), before_image_1_url) AS p
          FROM kaizen WHERE before_image_1_url IS NOT NULL
        UNION
        SELECT COALESCE(NULLIF(split_part(after_image_1_url, '/tpm-uploads/', 2), ''), after_image_1_url)
          FROM kaizen WHERE after_image_1_url IS NOT NULL
      ) refs
    );
$$;
REVOKE EXECUTE ON FUNCTION public.kaizen_orphan_image_paths(int) FROM authenticated, anon;
GRANT  EXECUTE ON FUNCTION public.kaizen_orphan_image_paths(int) TO service_role;
