-- audit_schedule_reminder.sql
-- Day-before reminder bookkeeping. `last_reminded_for` holds the occurrence date the
-- schedule was last reminded about, so the sweep sends exactly one "audit tomorrow"
-- notification per occurrence (to the assigned auditors + the schedule's Audit Admin).
-- Additive, idempotent.

ALTER TABLE audit_schedule ADD COLUMN IF NOT EXISTS last_reminded_for date;
