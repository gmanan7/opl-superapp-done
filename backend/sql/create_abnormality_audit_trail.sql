-- Audit trail for abnormalities, mirroring opl_audit_trail / kaizen_audit_trail's shape.
-- One row per lifecycle action (created, marked_for_deletion, assigned_for_closure,
-- submitted_for_dmt_review, dmt_closed). View is admin-only (see /api/abnormality-audit-trail).
-- Ran directly against the live DB on 2026-08-25.

CREATE TABLE IF NOT EXISTS abnormality_audit_trail (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    abnormality_id text NOT NULL,
    action text NOT NULL,
    status_from text,
    status_to text,
    performed_by text,
    comments text,
    changed_fields jsonb,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
