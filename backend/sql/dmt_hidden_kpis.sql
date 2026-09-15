-- Per-user "hide this KPI from my Dashboard table" preference. Everyone sees every KPI by
-- default (no row = visible); a row here hides that KPI for that one user only — it never
-- affects what anyone else sees, and never deletes/deactivates the KPI itself.

CREATE TABLE IF NOT EXISTS dmt_hidden_kpis (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emp_id     text NOT NULL REFERENCES user_details(emp_id) ON DELETE CASCADE,
  kpi_id     uuid NOT NULL REFERENCES dmt_kpi_master(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (emp_id, kpi_id)
);
