-- Task escalation + tasks belong to a GROUP (not a department). server.js applies all of this
-- automatically at startup (ensureDmtEscalationSchema / ensureDmtTaskDeptNullable), so running it
-- by hand is optional; kept here as the record. Additive / relaxing, safe to re-run.

-- escalation fields on a task
ALTER TABLE dmt_tasks
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz,
  ADD COLUMN IF NOT EXISTS escalation_type text,
  ADD COLUMN IF NOT EXISTS escalated_to_tier_id uuid REFERENCES dmt_tier(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS escalated_from_owner_id text REFERENCES user_details(emp_id),
  ADD COLUMN IF NOT EXISTS escalated_by text REFERENCES user_details(emp_id),
  ADD COLUMN IF NOT EXISTS escalation_note text;

-- per-group auto-escalation: days past the due date (NULL = off). Server default is 90; existing
-- non-T4, non-private groups were backfilled to 90 once.
ALTER TABLE dmt_tier
  ADD COLUMN IF NOT EXISTS escalation_days integer CHECK (escalation_days BETWEEN 1 AND 365);
ALTER TABLE dmt_tier ALTER COLUMN escalation_days SET DEFAULT 90;
-- (one-time) UPDATE dmt_tier SET escalation_days = 90
--   WHERE escalation_days IS NULL AND name <> 'T4' AND is_private = false;

-- history rows for an escalation
ALTER TABLE dmt_task_updates DROP CONSTRAINT IF EXISTS dmt_task_updates_update_type_check;
ALTER TABLE dmt_task_updates ADD CONSTRAINT dmt_task_updates_update_type_check
  CHECK (update_type = ANY (ARRAY['status_change','comment','due_date_change','title_change','description_change','assignee_change','escalation']));

-- tasks no longer carry a department: the column is only relaxed (data kept, not dropped)
ALTER TABLE dmt_tasks ALTER COLUMN department_id DROP NOT NULL;
