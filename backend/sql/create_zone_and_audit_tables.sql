-- Zone table: free-form capture areas a BE-lead creates ad hoc while configuring an audit
-- (e.g. Printing, Cutting & Creasing). Plant-scoped only (factory_id) -- no linkage to
-- module_groups or departments. Acts as a simple, growing repository, not a fixed lookup.
CREATE TABLE zone (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id text NOT NULL REFERENCES factory(id),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO zone (factory_id, name)
VALUES ('1', 'Printing'), ('1', 'Cutting & Creasing');

-- Audits module: configurable questionnaire templates (e.g. "5S Audit"), scheduled
-- (recurring or one-off) against a zone, scored 1-5 per question.
CREATE TABLE audit_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id text NOT NULL REFERENCES factory(id),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by_emp_id text REFERENCES user_details(emp_id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- category = one of the 5 fixed 5S pillars every question belongs to. is_active lets a
-- 5S admin/BE-lead "retire" a question (never hard-delete) so old submitted audits keep
-- referencing it unchanged while new templates/captures no longer see it -- retiring and
-- adding a replacement question are independent actions on the same template.
-- photo_required = an admin can force a mandatory photo on specific questions regardless
-- of score, on top of (not instead of) the always-on "score 1 or 2 needs a photo" rule.
CREATE TABLE audit_template_question (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES audit_template(id) ON DELETE CASCADE,
  question_text text NOT NULL,
  question_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  category text NOT NULL CHECK (category IN ('sort','set_in_order','shine','standardize','sustain')),
  photo_required boolean NOT NULL DEFAULT false
);

-- Who may conduct a scheduled audit -- an assignment, not a role change (mirrors
-- approval_routing: the assignee's user_details.role is never touched).
CREATE TABLE audit_schedule_auditor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES audit_schedule(id) ON DELETE CASCADE,
  emp_id text NOT NULL REFERENCES user_details(emp_id),
  assigned_by_emp_id text REFERENCES user_details(emp_id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (schedule_id, emp_id)
);

-- admin_emp_id is mandatory: every schedule must have a named, accountable 5S Admin at
-- creation time, chosen via the same worker picker as everything else. This grants that
-- person configure rights over THIS schedule and its submissions specifically -- narrower
-- than a template admin (audit_template_admin), and independent of it.
CREATE TABLE audit_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES audit_template(id) ON DELETE CASCADE,
  zone_id uuid NOT NULL REFERENCES zone(id),
  factory_id text NOT NULL REFERENCES factory(id),
  recurrence text NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none','daily','weekly','fortnightly','monthly')),
  specific_date date,
  is_active boolean NOT NULL DEFAULT true,
  created_by_emp_id text REFERENCES user_details(emp_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  admin_emp_id text NOT NULL REFERENCES user_details(emp_id),
  CHECK (recurrence <> 'none' OR specific_date IS NOT NULL)
);

-- Global 5S Admin: appointable only by a true BE-lead, grants full audit capability
-- (create templates, configure ANY template, schedule ANY audit, manage ANY schedule's
-- auditors) across the whole factory -- effectively a second BE-lead tier scoped to the
-- Audits module. Does NOT grant zone/home-zone management or the right to appoint anyone.
CREATE TABLE audit_global_admin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id text NOT NULL REFERENCES factory(id),
  emp_id text NOT NULL REFERENCES user_details(emp_id),
  assigned_by_emp_id text REFERENCES user_details(emp_id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (factory_id, emp_id)
);

CREATE TABLE audit_submission (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES audit_schedule(id),
  template_id uuid NOT NULL REFERENCES audit_template(id),
  zone_id uuid NOT NULL REFERENCES zone(id),
  factory_id text NOT NULL REFERENCES factory(id),
  due_date date NOT NULL,
  submitted_by_emp_id text REFERENCES user_details(emp_id),
  submitted_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','submitted','overdue')),
  total_score numeric,
  max_score numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Scoring: 4 = good, 2-3 = marginal, 1 = poor. A photo is mandatory whenever score is 1 or 2.
CREATE TABLE audit_response (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES audit_submission(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES audit_template_question(id),
  score int CHECK (score BETWEEN 1 AND 4),
  remarks text,
  photo_url text,
  CHECK (score IS NULL OR score > 2 OR photo_url IS NOT NULL)
);

-- Auto-computed per-category (Sort/Set in Order/Shine/Standardize/Sustain) average for a submission;
-- audit_submission.total_score/max_score carries the overall final average.
CREATE TABLE audit_submission_category_score (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES audit_submission(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('sort','set_in_order','shine','standardize','sustain')),
  avg_score numeric,
  UNIQUE (submission_id, category)
);

-- Lets a be_lead (or it_lead/leadership) hand "configure this specific audit" capability
-- (edit its questions, schedule it, manage its schedules' auditors) to specific people, per
-- template -- NOT a global/factory-wide grant. Being admin of "5S Audit" says nothing about
-- any other audit template; a different audit needs its own appointment. Role is never
-- touched (same non-role-overwrite pattern as approval_routing/audit_schedule_auditor).
-- Only a true BE-lead-tier user may add/remove rows here; creating a brand-new template and
-- managing factory-wide Zones/Home Zones both stay BE-lead-only regardless of this table.
CREATE TABLE audit_template_admin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES audit_template(id) ON DELETE CASCADE,
  emp_id text NOT NULL REFERENCES user_details(emp_id),
  assigned_by_emp_id text REFERENCES user_details(emp_id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, emp_id)
);

CREATE TABLE audit_audit_trail (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid REFERENCES audit_submission(id),
  template_id uuid REFERENCES audit_template(id),
  action text NOT NULL,
  actor_emp_id text REFERENCES user_details(emp_id),
  changed_fields jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Master mapping of each worker's "home zone" -- configured by a BE-lead or a delegated
-- 5S admin (audit_admin_assignment), so a worker whose home zone matches a schedule's
-- zone can be quickly assigned to audit it. One home zone per worker (UNIQUE emp_id).
CREATE TABLE audit_home_zone (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id text NOT NULL REFERENCES factory(id),
  emp_id text NOT NULL REFERENCES user_details(emp_id),
  zone_id uuid NOT NULL REFERENCES zone(id),
  assigned_by_emp_id text REFERENCES user_details(emp_id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (emp_id)
);

-- Per-occurrence auditor override: a 5S admin may reassign auditors for one specific
-- day's submission of a recurring schedule, without touching the schedule's default pool
-- (audit_schedule_auditor) which stays the fallback for every occurrence without an override.
CREATE TABLE audit_submission_auditor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES audit_submission(id) ON DELETE CASCADE,
  emp_id text NOT NULL REFERENCES user_details(emp_id),
  assigned_by_emp_id text REFERENCES user_details(emp_id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (submission_id, emp_id)
);

-- Post-submission change requests: an auditor asks to change a score/photo/remarks on an
-- already-submitted audit, with a reason; a 5S admin or BE-lead approves/rejects. Approval
-- applies the change and logs to audit_audit_trail -- full history, visible to 5S Admin/BE-lead.
CREATE TABLE audit_change_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES audit_submission(id) ON DELETE CASCADE,
  requested_by_emp_id text NOT NULL REFERENCES user_details(emp_id),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by_emp_id text REFERENCES user_details(emp_id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_change_request_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  change_request_id uuid NOT NULL REFERENCES audit_change_request(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES audit_template_question(id),
  field text NOT NULL CHECK (field IN ('score','photo','remarks')),
  old_value text,
  new_value text
);
