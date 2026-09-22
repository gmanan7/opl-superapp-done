-- Ties meetings (and the templates they're created from) to the T4/T3/T2 tier system,
-- so Decision Log can scope visibility through the meeting a decision was recorded in.
-- Additive, idempotent, non-destructive.

ALTER TABLE dmt_meetings ADD COLUMN IF NOT EXISTS tier_id uuid REFERENCES dmt_tier(id) ON DELETE SET NULL;
ALTER TABLE dmt_meeting_templates ADD COLUMN IF NOT EXISTS tier_id uuid REFERENCES dmt_tier(id) ON DELETE SET NULL;
