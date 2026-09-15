-- review_changes: JSON snapshot of {field: {from, to}} for whatever the JH reviewer edited
-- while approving an OPL, so the submitter can see a before/after diff. Mirrors
-- kaizen_details.review_changes / abnormalities_details.review_changes.
-- Adds a column; does not touch existing data.

ALTER TABLE opl_details ADD COLUMN IF NOT EXISTS review_changes jsonb;
