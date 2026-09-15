-- audit_multi_auditor_occurrence.sql
-- Every assigned auditor (and the Audit Admin) now fills in their OWN scorecard for an
-- occurrence (schedule + date). The occurrence carries the COMBINED score = the average of
-- the submitted scorecards, and stays 'open' until every expected auditor has submitted —
-- or a BE-lead / Global Audit Admin force-closes it (on the Audit Admin's request), in
-- which case only the scorecards actually submitted count toward the average (no zeros).
--
--   audit_occurrence  = one row per (schedule_id, due_date). Holds status + combined_score.
--   audit_submission  += occurrence_id (which occurrence this scorecard belongs to)
--                     += started_by_emp_id (whose scorecard this is, set at Start)
--
-- Backfill: existing submissions are grouped by (schedule_id, due_date) into one occurrence
-- each; a submitted occurrence is marked 'closed' with combined_score = the average of its
-- submitted children. Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS audit_occurrence (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id               uuid NOT NULL REFERENCES audit_schedule(id),
  template_id               uuid NOT NULL REFERENCES audit_template(id),
  zone_id                   uuid NOT NULL REFERENCES zone(id),
  factory_id                text NOT NULL REFERENCES factory(id),
  due_date                  date NOT NULL,
  status                    text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  combined_score            numeric,
  combined_max              numeric,
  submitted_count           int NOT NULL DEFAULT 0,
  expected_count            int NOT NULL DEFAULT 0,
  close_requested_by_emp_id text REFERENCES user_details(emp_id),
  close_requested_at        timestamptz,
  close_request_note        text,
  closed_by_emp_id          text REFERENCES user_details(emp_id),
  closed_at                 timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (schedule_id, due_date)
);
CREATE INDEX IF NOT EXISTS audit_occurrence_schedule_idx ON audit_occurrence (schedule_id);

ALTER TABLE audit_submission
  ADD COLUMN IF NOT EXISTS occurrence_id     uuid REFERENCES audit_occurrence(id),
  ADD COLUMN IF NOT EXISTS started_by_emp_id text REFERENCES user_details(emp_id);
CREATE INDEX IF NOT EXISTS audit_submission_occurrence_idx ON audit_submission (occurrence_id);

-- 1. One occurrence per distinct (schedule_id, due_date) that has submissions.
INSERT INTO audit_occurrence (schedule_id, template_id, zone_id, factory_id, due_date)
SELECT DISTINCT s.schedule_id, s.template_id, s.zone_id, s.factory_id, s.due_date
FROM audit_submission s
WHERE s.occurrence_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM audit_occurrence o
    WHERE o.schedule_id = s.schedule_id AND o.due_date = s.due_date
  );

-- 2. Link every submission to its occurrence + backfill started_by from submitted_by.
UPDATE audit_submission s
SET occurrence_id = o.id,
    started_by_emp_id = COALESCE(s.started_by_emp_id, s.submitted_by_emp_id)
FROM audit_occurrence o
WHERE o.schedule_id = s.schedule_id AND o.due_date = s.due_date
  AND s.occurrence_id IS NULL;

-- 3. Roll up each occurrence: submitted count + combined score, and close it if any child
--    is already submitted (legacy 1-scorecard rows were effectively "done" on submit).
UPDATE audit_occurrence o SET
  submitted_count = agg.n,
  combined_score  = agg.avg_score,
  combined_max    = agg.max_score,
  status          = CASE WHEN agg.n > 0 THEN 'closed' ELSE 'open' END,
  closed_at       = CASE WHEN agg.n > 0 THEN agg.last_submitted ELSE NULL END
FROM (
  SELECT occurrence_id,
         COUNT(*) FILTER (WHERE status = 'submitted') AS n,
         AVG(total_score) FILTER (WHERE status = 'submitted' AND total_score IS NOT NULL) AS avg_score,
         MAX(max_score) FILTER (WHERE status = 'submitted') AS max_score,
         MAX(submitted_at) FILTER (WHERE status = 'submitted') AS last_submitted
  FROM audit_submission
  WHERE occurrence_id IS NOT NULL
  GROUP BY occurrence_id
) agg
WHERE agg.occurrence_id = o.id;

COMMIT;
