-- ============================================================================
-- Phase 1 Step 8 — bulk import schema (TPM Fulcrum · WRITE)
-- import_batch table + RLS · check_emails_exist() · mdm_audit action CHECK.
--
-- mdm_audit_action_check note: the previous CHECK carried 'import' — added in
-- p1_s1 beyond the MDM_SPEC §2.2 list. Dropped — zero historical rows
-- confirmed via fresh count (2026-06-11); never documented in MDM_SPEC §2.2.
-- Step 8's actual actions are 'import_batch' (batch summary) + 'pins_acknowledged'.
-- ============================================================================

-- ---------- 1. import_batch ----------
CREATE TABLE import_batch (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id uuid NOT NULL REFERENCES factory(id),
  actor_worker_id uuid REFERENCES worker_profile(id),  -- nullable per D-016 (defensive)
  entity_type text NOT NULL CHECK (entity_type IN ('workers','machines')),
  source_filename text NOT NULL,
  source_format text NOT NULL CHECK (source_format IN ('csv','xlsx')),
  total_rows int NOT NULL,
  valid_rows int NOT NULL,
  warning_rows int NOT NULL,
  invalid_rows int NOT NULL,
  committed_rows int,                                  -- NULL until commit
  status text NOT NULL CHECK (status IN ('previewed','committed','abandoned')),
  preview_snapshot jsonb NOT NULL,                     -- totals + valid_row_hashes + error_summary; NO verbatim row data
  pins_acknowledged_at timestamptz,                    -- workers + committed only
  created_at timestamptz DEFAULT now(),
  committed_at timestamptz
);
CREATE INDEX ix_import_batch_factory_time ON import_batch (factory_id, created_at DESC);
ALTER TABLE import_batch ENABLE ROW LEVEL SECURITY;

-- Admin-only, factory-scoped. No DELETE policy = no client delete.
CREATE POLICY ib_select ON import_batch FOR SELECT
  USING (factory_id = my_factory_id() AND is_admin());
CREATE POLICY ib_insert ON import_batch FOR INSERT
  WITH CHECK (factory_id = my_factory_id() AND is_admin());
CREATE POLICY ib_update ON import_batch FOR UPDATE
  USING (factory_id = my_factory_id() AND is_admin())
  WITH CHECK (factory_id = my_factory_id() AND is_admin());

-- ---------- 2. Bulk email-existence lookup (preview-time email_duplicate) ----------
-- Standard pattern for exposing an auth-schema read to Edge-side code.
-- Service-role execute ONLY.
CREATE OR REPLACE FUNCTION check_emails_exist(emails text[])
RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT COALESCE(array_agg(DISTINCT lower(u.email)), '{}')
  FROM auth.users u
  WHERE lower(u.email) = ANY (SELECT lower(e) FROM unnest(emails) e)
$$;
REVOKE EXECUTE ON FUNCTION check_emails_exist(text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION check_emails_exist(text[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION check_emails_exist(text[]) TO service_role;

-- ---------- 3. mdm_audit action CHECK: add Step 8 actions, drop dead 'import' ----------
ALTER TABLE mdm_audit DROP CONSTRAINT mdm_audit_action_check;
ALTER TABLE mdm_audit ADD CONSTRAINT mdm_audit_action_check CHECK (action IN
  ('create','update','deactivate','reactivate','pin_reset','redact',
   'import_batch','pins_acknowledged'));
