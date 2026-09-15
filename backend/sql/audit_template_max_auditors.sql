-- audit_template_max_auditors.sql
-- Optional per-audit-type cap on how many people can audit one occurrence.
-- NULL = unlimited. The count INCLUDES the schedule's Audit Admin (admin_emp_id),
-- so max_auditors = 1 means "only the Audit Admin, no extra auditors".
-- Only a BE-lead / Global Audit Admin sets it (they own audit-type creation). Additive.

ALTER TABLE audit_template ADD COLUMN IF NOT EXISTS max_auditors int;
ALTER TABLE audit_template DROP CONSTRAINT IF EXISTS audit_template_max_auditors_chk;
ALTER TABLE audit_template ADD CONSTRAINT audit_template_max_auditors_chk
  CHECK (max_auditors IS NULL OR max_auditors >= 1);
