-- Removes the `code` column from `departments` — it was only used by one DMT feature
-- (the Engineering-department write bypass), which now matches on department name instead.
-- Writes/changes schema (drops a column, so any data in it is gone) — not reversible.

ALTER TABLE departments DROP COLUMN IF EXISTS code;
