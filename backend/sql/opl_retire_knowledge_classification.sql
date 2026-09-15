-- Retires the "Knowledge" OPL classification. Only three remain:
-- Basic Condition, Troubleshoot, Improvement.
-- Any existing OPL classified as "Knowledge" (or left null) becomes "Basic Condition".
-- WRITES DATA.

UPDATE opl_details
SET classification = 'Basic Condition'
WHERE classification = 'Knowledge'
   OR classification IS NULL;
