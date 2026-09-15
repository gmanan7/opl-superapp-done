-- review_changes: JSON snapshot of {field: {from, to}} for whatever the JH reviewer edited
-- on a Kaizen (title/content/category/before_image) at approve/reject time. Mirrors
-- abnormalities_details.review_changes.
ALTER TABLE kaizen_details ADD COLUMN IF NOT EXISTS review_changes jsonb;
