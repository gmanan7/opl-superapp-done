-- Optional "who helped" on a Kaizen's implementation report. The submitter reporting
-- implementation can name up to 3 teammates who assisted (not mandatory). Stored as a
-- plain emp_id array on kaizen_details, same pattern as opl_training_schedule.target_emp_ids.
-- Purely additive: nullable, no default, existing rows unaffected.

ALTER TABLE kaizen_details
  ADD COLUMN IF NOT EXISTS team_member_emp_ids text[];
