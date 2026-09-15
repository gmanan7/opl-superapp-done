-- Links abnormality_responsibility to the real departments table so the "Assign To"
-- picker on the report form can be auto-filtered to workers in that department.
-- Ran directly against the live DB on 2026-08-24.

ALTER TABLE abnormality_responsibility ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES departments(id);

-- 'Materials' had no matching department yet (only Production/Quality/Engineering existed).
INSERT INTO departments (name, factory_id)
SELECT 'Materials', '1'
WHERE NOT EXISTS (SELECT 1 FROM departments WHERE name = 'Materials' AND factory_id = '1');

UPDATE abnormality_responsibility ar
SET department_id = d.id
FROM departments d
WHERE d.name = ar.name AND d.factory_id = ar.factory_id;
