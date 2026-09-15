-- ============================================================================
-- DMT (Daily Management Tool) — consolidated schema for the shared superdb
-- ============================================================================
-- Source: dmt/supabase/migrations/*.sql (24 files), folded into one script with
-- all later ALTERs applied inline. Migrated OFF Supabase:
--   * every `profiles(id uuid)` FK  -> `user_details(emp_id text)` (shared identity)
--   * `user_roles` table            -> DROPPED (roles derive from user_details.role)
--   * all RLS / policies / auth.*    -> REMOVED (authorization is hand-rolled in
--                                       backend/server.js, x-worker-id header)
--   * all SECURITY DEFINER RPCs      -> REMOVED (re-implemented as Express routes)
--   * audit trigger fn              -> REMOVED (audit rows written by Express)
-- Kept: generic updated_at touch, pd job-number assignment, pd comment stage stamp.
-- Every DMT object is prefixed `dmt_`. Idempotent: safe to re-run.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------------
DO $$ BEGIN CREATE TYPE dmt_kpi_frequency      AS ENUM ('daily','weekly','monthly'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE dmt_kpi_direction      AS ENUM ('higher_is_better','lower_is_better','target_is_exact'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE dmt_kpi_type           AS ENUM ('numeric','descriptive','project_tracker'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE dmt_rag_status         AS ENUM ('red','amber','green'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE dmt_meeting_status     AS ENUM ('scheduled','in_progress','completed','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE dmt_attendance_status  AS ENUM ('present','absent','excused'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE dmt_task_priority      AS ENUM ('low','medium','high','critical'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE dmt_task_status        AS ENUM ('open','in_progress','blocked','completed','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE dmt_task_origin        AS ENUM ('meeting','kpi_red','standalone'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE dmt_project_item_status AS ENUM ('active','completed','on_hold','dropped'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE dmt_audit_action       AS ENUM ('INSERT','UPDATE','DELETE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE dmt_mtd_aggregation_type AS ENUM ('sum','average','weighted_average'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE dmt_pd_stage           AS ENUM ('upcoming','in_process','processing_finished','feedback_approved','feedback_rejected','abandoned'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- SHARED HELPER: generic updated_at touch
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION dmt_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- ORG: factory + department (DMT-owned; single factory, own 9 departments)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dmt_factory (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  code       text NOT NULL UNIQUE,
  location   text,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dmt_department (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id    uuid NOT NULL REFERENCES dmt_factory(id),
  name          text NOT NULL,
  code          text NOT NULL,
  display_order int NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (factory_id, code)
);

-- multi-department membership for a shared-identity user (emp_id)
CREATE TABLE IF NOT EXISTS dmt_user_departments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emp_id        text NOT NULL REFERENCES user_details(emp_id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES dmt_department(id) ON DELETE CASCADE,
  is_primary    boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (emp_id, department_id)
);

-- ---------------------------------------------------------------------------
-- KPI master + entries + project tracker
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dmt_kpi_master (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id         uuid NOT NULL REFERENCES dmt_department(id),
  name                  text NOT NULL,
  unit                  text,
  kpi_type              dmt_kpi_type NOT NULL DEFAULT 'numeric',
  frequency             dmt_kpi_frequency NOT NULL DEFAULT 'daily',
  direction             dmt_kpi_direction NOT NULL DEFAULT 'higher_is_better',
  target_value          numeric,
  green_threshold       numeric,
  amber_threshold       numeric,
  display_order         int NOT NULL DEFAULT 0,
  is_active             boolean NOT NULL DEFAULT true,
  description           text,
  mtd_aggregation       dmt_mtd_aggregation_type NOT NULL DEFAULT 'sum',
  is_hidden_from_trends boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dmt_kpi_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_id          uuid NOT NULL REFERENCES dmt_kpi_master(id),
  reporting_date  date NOT NULL,
  actual_value    numeric,
  text_value      text,
  computed_status dmt_rag_status,
  meeting_id      uuid,   -- FK added after dmt_meetings
  submitted_by    text NOT NULL REFERENCES user_details(emp_id),
  submitted_at    timestamptz NOT NULL DEFAULT now(),
  is_late_entry   boolean NOT NULL DEFAULT false,
  remarks         text,
  UNIQUE (kpi_id, reporting_date)
);

CREATE TABLE IF NOT EXISTS dmt_project_tracker_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_id        uuid NOT NULL REFERENCES dmt_kpi_master(id),
  department_id uuid NOT NULL REFERENCES dmt_department(id),
  title         text NOT NULL,
  description   text,
  status        dmt_project_item_status NOT NULL DEFAULT 'active',
  display_order int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    text REFERENCES user_details(emp_id)
);

CREATE TABLE IF NOT EXISTS dmt_project_item_stage_updates (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id        uuid NOT NULL REFERENCES dmt_project_tracker_items(id) ON DELETE CASCADE,
  stage_name     text NOT NULL,
  update_note    text,
  reporting_date date NOT NULL DEFAULT CURRENT_DATE,
  updated_by     text NOT NULL REFERENCES user_details(emp_id),
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- MEETINGS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dmt_meetings (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id           uuid NOT NULL REFERENCES dmt_factory(id),
  title                text NOT NULL,
  scheduled_date       date NOT NULL,
  scheduled_start_time time NOT NULL,
  scheduled_end_time   time NOT NULL,
  actual_start         timestamptz,
  actual_end           timestamptz,
  status               dmt_meeting_status NOT NULL DEFAULT 'scheduled',
  facilitator_id       text NOT NULL REFERENCES user_details(emp_id),
  location             text,
  summary              text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           text REFERENCES user_details(emp_id)
);

DO $$ BEGIN
  ALTER TABLE dmt_kpi_entries ADD CONSTRAINT dmt_fk_kpi_meeting
    FOREIGN KEY (meeting_id) REFERENCES dmt_meetings(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS dmt_meeting_invitees (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id        uuid NOT NULL REFERENCES dmt_meetings(id),
  user_id           text REFERENCES user_details(emp_id),
  guest_name        text,
  guest_designation text,
  department_id     uuid REFERENCES dmt_department(id),
  is_mandatory      boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR guest_name IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS dmt_meeting_attendance (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES dmt_meetings(id),
  invitee_id uuid NOT NULL REFERENCES dmt_meeting_invitees(id),
  status     dmt_attendance_status NOT NULL,
  marked_by  text NOT NULL REFERENCES user_details(emp_id),
  marked_at  timestamptz NOT NULL DEFAULT now(),
  remarks    text,
  UNIQUE (meeting_id, invitee_id)
);

CREATE TABLE IF NOT EXISTS dmt_meeting_discussion_points (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES dmt_meetings(id),
  title      text NOT NULL,
  notes      text,
  sequence   int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES user_details(emp_id)
);

CREATE TABLE IF NOT EXISTS dmt_meeting_decisions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id          uuid NOT NULL REFERENCES dmt_meetings(id),
  discussion_point_id uuid REFERENCES dmt_meeting_discussion_points(id),
  decision_text       text NOT NULL,
  linked_task_id      uuid,   -- FK added after dmt_tasks
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          text REFERENCES user_details(emp_id)
);

CREATE TABLE IF NOT EXISTS dmt_meeting_templates (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id               uuid NOT NULL REFERENCES dmt_factory(id),
  name                     text NOT NULL,
  description              text,
  default_duration_minutes int NOT NULL DEFAULT 30,
  default_start_time       time,
  default_location         text,
  is_active                boolean NOT NULL DEFAULT true,
  created_at               timestamptz NOT NULL DEFAULT now(),
  created_by               text REFERENCES user_details(emp_id)
);

CREATE TABLE IF NOT EXISTS dmt_meeting_template_invitees (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  uuid NOT NULL REFERENCES dmt_meeting_templates(id) ON DELETE CASCADE,
  user_id      text NOT NULL REFERENCES user_details(emp_id),
  is_mandatory boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- TASK GROUPS (sub-teams)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dmt_task_groups (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL CHECK (length(trim(name)) > 0),
  created_by text NOT NULL REFERENCES user_details(emp_id),
  factory_id uuid NOT NULL REFERENCES dmt_factory(id),
  color      text NOT NULL DEFAULT '#6366f1',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dmt_task_group_members (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   uuid NOT NULL REFERENCES dmt_task_groups(id) ON DELETE CASCADE,
  user_id    text NOT NULL REFERENCES user_details(emp_id) ON DELETE CASCADE,
  added_by   text REFERENCES user_details(emp_id),
  is_leader  boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);
ALTER TABLE dmt_task_group_members ADD COLUMN IF NOT EXISTS is_leader boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- TASKS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dmt_tasks (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_number         serial NOT NULL,
  title               text NOT NULL,
  description         text,
  department_id       uuid NOT NULL REFERENCES dmt_department(id),
  owner_id            text NOT NULL REFERENCES user_details(emp_id),
  assigned_by         text NOT NULL REFERENCES user_details(emp_id),
  priority            dmt_task_priority NOT NULL DEFAULT 'medium',
  status              dmt_task_status NOT NULL DEFAULT 'open',
  due_date            date NOT NULL,
  completed_at        timestamptz,
  resolution_note     text,
  origin_type         dmt_task_origin NOT NULL DEFAULT 'standalone',
  origin_meeting_id   uuid REFERENCES dmt_meetings(id),
  origin_kpi_entry_id uuid REFERENCES dmt_kpi_entries(id),
  is_carryover        boolean NOT NULL DEFAULT false,
  is_private          boolean NOT NULL DEFAULT false,
  task_group_id       uuid REFERENCES dmt_task_groups(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by          text REFERENCES user_details(emp_id)
);
CREATE INDEX IF NOT EXISTS dmt_idx_tasks_task_group_id ON dmt_tasks(task_group_id);

DO $$ BEGIN
  ALTER TABLE dmt_meeting_decisions ADD CONSTRAINT dmt_fk_decision_task
    FOREIGN KEY (linked_task_id) REFERENCES dmt_tasks(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS dmt_task_updates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id           uuid NOT NULL REFERENCES dmt_tasks(id),
  previous_status   dmt_task_status,
  new_status        dmt_task_status,
  update_note       text,
  update_type       text NOT NULL DEFAULT 'status_change'
                    CHECK (update_type IN ('status_change','comment','due_date_change',
                                           'title_change','description_change','assignee_change')),
  previous_due_date date,
  new_due_date      date,
  previous_text     text,
  new_text          text,
  updated_by        text NOT NULL REFERENCES user_details(emp_id),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dmt_task_due_date_history (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id           uuid NOT NULL REFERENCES dmt_tasks(id),
  previous_due_date date NOT NULL,
  new_due_date      date NOT NULL,
  reason            text NOT NULL,
  changed_by        text NOT NULL REFERENCES user_details(emp_id),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dmt_idx_tgm_user_id  ON dmt_task_group_members(user_id);
CREATE INDEX IF NOT EXISTS dmt_idx_tgm_group_id ON dmt_task_group_members(group_id);

-- ---------------------------------------------------------------------------
-- PLANNER + MY VIEW (per-user)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dmt_planner_items (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emp_id                 text NOT NULL REFERENCES user_details(emp_id) ON DELETE CASCADE,
  title                  text NOT NULL,
  notes                  text,
  due_date               date,
  is_completed           boolean NOT NULL DEFAULT false,
  completed_at           timestamptz,
  display_order          int NOT NULL DEFAULT 0,
  recurrence_type        text DEFAULT 'none' CHECK (recurrence_type IN ('none','daily','weekly','monthly')),
  recurrence_day_of_week int,
  recurrence_day_of_month int,
  origin_context         text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dmt_my_view_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emp_id        text NOT NULL REFERENCES user_details(emp_id) ON DELETE CASCADE,
  kpi_id        uuid NOT NULL REFERENCES dmt_kpi_master(id) ON DELETE CASCADE,
  display_order int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (emp_id, kpi_id)
);

-- ---------------------------------------------------------------------------
-- PM SCHEDULE (preventive maintenance)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dmt_pm_machines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id    uuid NOT NULL REFERENCES dmt_factory(id),
  line          text NOT NULL,
  group_name    text NOT NULL,
  name          text NOT NULL,
  is_critical   boolean NOT NULL DEFAULT true,
  is_active     boolean NOT NULL DEFAULT true,
  display_order int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dmt_pm_plan (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id   uuid NOT NULL REFERENCES dmt_pm_machines(id) ON DELETE CASCADE,
  planned_date date NOT NULL,
  created_by   text REFERENCES user_details(emp_id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (machine_id, planned_date)
);

CREATE TABLE IF NOT EXISTS dmt_pm_actual (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id  uuid NOT NULL REFERENCES dmt_pm_machines(id) ON DELETE CASCADE,
  actual_date date NOT NULL,
  remarks     text,
  recorded_by text REFERENCES user_details(emp_id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (machine_id, actual_date)
);

-- ---------------------------------------------------------------------------
-- PD CYCLE (product development jobs)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dmt_pd_jobs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_number            int NOT NULL,
  factory_id            uuid NOT NULL REFERENCES dmt_factory(id),
  title                 text NOT NULL,
  customer              text,
  product               text,
  substrate             text,
  stage                 dmt_pd_stage NOT NULL DEFAULT 'upcoming',
  feedback_note         text,
  previous_job_id       uuid REFERENCES dmt_pd_jobs(id),
  respawn_reason        text,
  target_dispatch_date  date,
  created_by            text REFERENCES user_details(emp_id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  closed_at             timestamptz,
  UNIQUE (factory_id, job_number)
);

CREATE TABLE IF NOT EXISTS dmt_pd_job_comments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id           uuid NOT NULL REFERENCES dmt_pd_jobs(id) ON DELETE CASCADE,
  author_id        text NOT NULL REFERENCES user_details(emp_id),
  body             text NOT NULL,
  stage_at_comment dmt_pd_stage,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dmt_pd_stage_history (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id     uuid NOT NULL REFERENCES dmt_pd_jobs(id) ON DELETE CASCADE,
  from_stage dmt_pd_stage,
  to_stage   dmt_pd_stage NOT NULL,
  changed_by text REFERENCES user_details(emp_id),
  changed_at timestamptz NOT NULL DEFAULT now(),
  note       text
);

-- auto job_number per factory (kept as trigger — pure data logic, no auth)
CREATE OR REPLACE FUNCTION dmt_pd_jobs_assign_number()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.job_number IS NULL OR NEW.job_number = 0 THEN
    SELECT COALESCE(MAX(job_number),0) + 1 INTO NEW.job_number
      FROM dmt_pd_jobs WHERE factory_id = NEW.factory_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS dmt_trg_pd_jobs_assign_number ON dmt_pd_jobs;
CREATE TRIGGER dmt_trg_pd_jobs_assign_number
  BEFORE INSERT ON dmt_pd_jobs FOR EACH ROW EXECUTE FUNCTION dmt_pd_jobs_assign_number();

DROP TRIGGER IF EXISTS dmt_trg_pd_jobs_updated_at ON dmt_pd_jobs;
CREATE TRIGGER dmt_trg_pd_jobs_updated_at
  BEFORE UPDATE ON dmt_pd_jobs FOR EACH ROW EXECUTE FUNCTION dmt_set_updated_at();

CREATE OR REPLACE FUNCTION dmt_pd_comments_set_stage()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.stage_at_comment IS NULL THEN
    SELECT stage INTO NEW.stage_at_comment FROM dmt_pd_jobs WHERE id = NEW.job_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS dmt_trg_pd_comments_set_stage ON dmt_pd_job_comments;
CREATE TRIGGER dmt_trg_pd_comments_set_stage
  BEFORE INSERT ON dmt_pd_job_comments FOR EACH ROW EXECUTE FUNCTION dmt_pd_comments_set_stage();

-- ---------------------------------------------------------------------------
-- KPI CHARTS (analytics dashboard config)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dmt_kpi_charts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  factory_id    uuid REFERENCES dmt_factory(id) ON DELETE SET NULL,
  department_id uuid REFERENCES dmt_department(id) ON DELETE SET NULL,
  size_width    int NOT NULL DEFAULT 1 CHECK (size_width BETWEEN 1 AND 3),
  size_height   int NOT NULL DEFAULT 1 CHECK (size_height BETWEEN 1 AND 3),
  chart_type    text NOT NULL DEFAULT 'composed' CHECK (chart_type IN ('line','bar','composed')),
  display_order int NOT NULL DEFAULT 0,
  created_by    text REFERENCES user_details(emp_id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dmt_idx_kpi_charts_department_id ON dmt_kpi_charts(department_id);

DROP TRIGGER IF EXISTS dmt_set_kpi_charts_updated_at ON dmt_kpi_charts;
CREATE TRIGGER dmt_set_kpi_charts_updated_at
  BEFORE UPDATE ON dmt_kpi_charts FOR EACH ROW EXECUTE FUNCTION dmt_set_updated_at();

CREATE TABLE IF NOT EXISTS dmt_kpi_chart_kpis (
  chart_id      uuid NOT NULL REFERENCES dmt_kpi_charts(id) ON DELETE CASCADE,
  kpi_id        uuid NOT NULL REFERENCES dmt_kpi_master(id) ON DELETE CASCADE,
  render_as     text NOT NULL DEFAULT 'line' CHECK (render_as IN ('line','bar')),
  axis          text NOT NULL DEFAULT 'primary' CHECK (axis IN ('primary','secondary')),
  color         text,
  display_order int NOT NULL DEFAULT 0,
  PRIMARY KEY (chart_id, kpi_id)
);

-- ---------------------------------------------------------------------------
-- AUDIT LOG (rows written by the Express layer, not a DB trigger)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dmt_audit_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name   text NOT NULL,
  record_id    uuid NOT NULL,
  action       dmt_audit_action NOT NULL,
  old_values   jsonb,
  new_values   jsonb,
  performed_by text REFERENCES user_details(emp_id),
  performed_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- updated_at triggers on the remaining mutable tables
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS dmt_trg_task_groups_updated_at ON dmt_task_groups;
CREATE TRIGGER dmt_trg_task_groups_updated_at
  BEFORE UPDATE ON dmt_task_groups FOR EACH ROW EXECUTE FUNCTION dmt_set_updated_at();

DROP TRIGGER IF EXISTS dmt_trg_tasks_updated_at ON dmt_tasks;
CREATE TRIGGER dmt_trg_tasks_updated_at
  BEFORE UPDATE ON dmt_tasks FOR EACH ROW EXECUTE FUNCTION dmt_set_updated_at();

DROP TRIGGER IF EXISTS dmt_trg_project_items_updated_at ON dmt_project_tracker_items;
CREATE TRIGGER dmt_trg_project_items_updated_at
  BEFORE UPDATE ON dmt_project_tracker_items FOR EACH ROW EXECUTE FUNCTION dmt_set_updated_at();

DROP TRIGGER IF EXISTS dmt_trg_planner_items_updated_at ON dmt_planner_items;
CREATE TRIGGER dmt_trg_planner_items_updated_at
  BEFORE UPDATE ON dmt_planner_items FOR EACH ROW EXECUTE FUNCTION dmt_set_updated_at();

DROP TRIGGER IF EXISTS dmt_trg_pm_machines_updated_at ON dmt_pm_machines;
CREATE TRIGGER dmt_trg_pm_machines_updated_at
  BEFORE UPDATE ON dmt_pm_machines FOR EACH ROW EXECUTE FUNCTION dmt_set_updated_at();

DROP TRIGGER IF EXISTS dmt_trg_pm_plan_updated_at ON dmt_pm_plan;
CREATE TRIGGER dmt_trg_pm_plan_updated_at
  BEFORE UPDATE ON dmt_pm_plan FOR EACH ROW EXECUTE FUNCTION dmt_set_updated_at();

DROP TRIGGER IF EXISTS dmt_trg_pm_actual_updated_at ON dmt_pm_actual;
CREATE TRIGGER dmt_trg_pm_actual_updated_at
  BEFORE UPDATE ON dmt_pm_actual FOR EACH ROW EXECUTE FUNCTION dmt_set_updated_at();

-- ---------------------------------------------------------------------------
-- SEED: factory + 9 departments (from the original migration; ITC-PPB)
-- ---------------------------------------------------------------------------
INSERT INTO dmt_factory (name, code, location)
VALUES ('ITC PPB Unit', 'ITC-PPB', 'Nadiad, Gujarat')
ON CONFLICT (code) DO NOTHING;

INSERT INTO dmt_department (factory_id, name, code, display_order)
SELECT f.id, v.name, v.code, v.ord
FROM dmt_factory f
CROSS JOIN (VALUES
  ('EHS','EHS',1), ('Quality','QA',2), ('Production','PROD',3),
  ('Engineering','ENG',4), ('Human Resources','HR',5), ('Stores','STORES',6),
  ('Finance','FIN',7), ('Logistics & Dispatch','LOG',8), ('Product Development','PD',9)
) AS v(name, code, ord)
WHERE f.code = 'ITC-PPB'
ON CONFLICT (factory_id, code) DO NOTHING;

-- PM machines seed (SFM + RFM lines, from 20260422103439)
INSERT INTO dmt_pm_machines (factory_id, line, group_name, name, is_critical, display_order)
SELECT f.id, v.line, v.grp, v.mname, v.critical, v.ord
FROM dmt_factory f
CROSS JOIN (VALUES
  ('SFM','Printing',  'Heidelberg - 1',      true,  1),
  ('SFM','Printing',  'Heidelberg - 2',      true,  2),
  ('SFM','C&C',       'Nova Cut E',          true,  3),
  ('SFM','C&C',       'Novacut ER-1',        true,  4),
  ('SFM','C&C',       'Novacut ER-2',        true,  5),
  ('SFM','VA',        'Hot Foil Stamping',   true,  6),
  ('SFM','VA',        'Steinemann',          true,  7),
  ('SFM','VA',        'UV Coater',           true,  8),
  ('SFM','VA',        'Meiguang',            true,  9),
  ('SFM','VA',        'Sheet Fed Gravure',   true,  10),
  ('SFM','VA',        'Kohmann Liner',       true,  11),
  ('SFM','VA',        'Clamshell 1/2',       true,  12),
  ('SFM','VA',        'Zhengmao Machine',    true,  13),
  ('SFM','F&G',       'Exper Fold',          true,  14),
  ('SFM','F&G',       'Vision Fold-1',       true,  15),
  ('SFM','F&G',       'Vision Fold-2',       true,  16),
  ('SFM','F&G',       'Nova Fold',           true,  17),
  ('SFM','Pre-Press', 'CTP',                 true,  18),
  ('SFM','Pre-Press', 'Kongsberg',           false, 19),
  ('SFM','Others',    'Pile Turner',         false, 20),
  ('RFM','RFM Line',  'Delta Printing Line', true,  21),
  ('RFM','RFM Line',  'Hugobeck',            true,  22),
  ('RFM','RFM Line',  'Hunkeler',            true,  23),
  ('RFM','RFM Line',  'Bundler Line',        true,  24)
) AS v(line, grp, mname, critical, ord)
WHERE f.code = 'ITC-PPB'
  AND NOT EXISTS (SELECT 1 FROM dmt_pm_machines);

COMMIT;
