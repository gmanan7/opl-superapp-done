-- Lets a recurring meeting series (weekly repeat) tag every generated meeting with a shared
-- series_id, so they can be told apart from one-off meetings. Additive only.
ALTER TABLE dmt_meetings ADD COLUMN IF NOT EXISTS series_id uuid;
