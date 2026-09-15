-- completion_date: the actual day the closer's fix was done (distinct from closed_at,
-- which is when the closure form was submitted).
-- review_changes: JSON snapshot of {field: {from, to}} for whatever the JH reviewer edited
-- during "assign_for_closure", so the submitter can see what was changed and by how much.
-- Ran directly against the live DB on 2026-08-25.

ALTER TABLE abnormalities_details ADD COLUMN IF NOT EXISTS completion_date date;
ALTER TABLE abnormalities_details ADD COLUMN IF NOT EXISTS review_changes jsonb;
