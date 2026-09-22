-- Factory-wide Task Board visibility grant: lets a BE Lead name specific people who see every
-- group's tasks, without making them BE Lead (role). BE Lead already gets this by construction
-- (dmtVisibleTierIdsFor) — this table is only for extra names beyond that default set. Private
-- tasks are unaffected (they're never tier-scoped, so tier visibility never touches them).
CREATE TABLE IF NOT EXISTS dmt_global_task_viewer (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id text NOT NULL REFERENCES factory(id),
  emp_id     text NOT NULL REFERENCES user_details(emp_id) ON DELETE CASCADE,
  added_by   text REFERENCES user_details(emp_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (factory_id, emp_id)
);
