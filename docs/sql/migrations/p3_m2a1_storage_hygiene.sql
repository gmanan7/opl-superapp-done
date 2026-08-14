-- Phase 3 · M2a-1 (OPL) — §F image gate (storage layer) + D-027 hygiene
-- ----------------------------------------------------------------------------
-- Part A: bucket-level allow-list + size cap (server-enforced, defence-in-depth
--   alongside the validate-opl-image Edge's magic-byte/double-extension checks).
-- Part B: orphan-computation RPC for the opl-orphan-sweep Edge (the Edge removes
--   via the Storage API — a pure-SQL delete of storage.objects orphans the bytes).
-- Part C: pg_cron schedule (applied separately; reads the sweep secret from Vault,
--   never a literal — safe to keep in the repo).
-- tpm-uploads holds ONLY compressed images (bulk-import is transient, never stored).
-- ----------------------------------------------------------------------------

-- ── Part A — bucket hardening (§F E1/E4) ────────────────────────────────────
UPDATE storage.buckets
  SET file_size_limit    = 262144,  -- 256KB ceiling (compressed target is ~150KB)
      allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp']
  WHERE id = 'tpm-uploads';

-- ── Part B — orphan computation (D-027 b) ───────────────────────────────────
-- Object paths under */opl/* older than N hours that NO opl row references.
-- Handles both stored-PATH and legacy stored-public-URL forms via split_part.
CREATE OR REPLACE FUNCTION public.opl_orphan_image_paths(p_older_than_hours int DEFAULT 24)
 RETURNS text[] LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE(array_agg(o.name), '{}')
  FROM storage.objects o
  WHERE o.bucket_id = 'tpm-uploads'
    AND o.name LIKE '%/opl/%'
    AND o.created_at < now() - make_interval(hours => p_older_than_hours)
    AND o.name NOT IN (
      SELECT p FROM (
        SELECT COALESCE(NULLIF(split_part(before_image_url, '/tpm-uploads/', 2), ''), before_image_url) AS p
          FROM opl WHERE before_image_url IS NOT NULL
        UNION
        SELECT COALESCE(NULLIF(split_part(after_image_url, '/tpm-uploads/', 2), ''), after_image_url)
          FROM opl WHERE after_image_url IS NOT NULL
      ) refs
    );
$$;
REVOKE EXECUTE ON FUNCTION public.opl_orphan_image_paths(int) FROM authenticated, anon;
GRANT  EXECUTE ON FUNCTION public.opl_orphan_image_paths(int) TO service_role;

-- ── Part C — pg_cron schedule (apply separately; Vault-backed secret) ───────
-- Prereq (one-time, out of repo so the secret never lands here):
--   SELECT vault.create_secret('<random>', 'opl_sweep_secret');
--   supabase secrets set SWEEP_SECRET=<same random>   (for the Edge)
-- Then:
--   CREATE EXTENSION IF NOT EXISTS pg_cron;
--   CREATE EXTENSION IF NOT EXISTS pg_net;
--   SELECT cron.schedule('opl-orphan-sweep', '17 3 * * *', $cron$
--     SELECT net.http_post(
--       url := 'https://joryoadrvisizkkspuov.supabase.co/functions/v1/opl-orphan-sweep',
--       headers := jsonb_build_object(
--         'Content-Type','application/json',
--         'x-sweep-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='opl_sweep_secret'))
--     ) $cron$);
