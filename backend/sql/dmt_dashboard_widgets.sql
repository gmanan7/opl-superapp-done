-- Per-user configurable dashboard widgets — generalises the old "My View" pinned-KPI
-- table (which could only ever hold a KPI trend chart) into a typed widget with its own
-- config, so a user can also add KPI status cards, task lists and task counters.
--
-- config shapes by widget_type:
--   kpi_chart       { "kpi_id": "<uuid>" }
--   multi_kpi_chart { "kpi_ids": ["<uuid>", …], "chart_type": "line|bar|composed", "name": "…" }
--   saved_chart     { "chart_id": "<uuid>" }          a chart built on Admin → KPI Charts
--   kpi_stat        { "department_id": "<uuid>" | null }   null = all departments
--   task_list       { "department_id": "<uuid>" | null }   null = all departments
--   task_count      { "department_id": "<uuid>" | null }   null = all departments
--
-- Picking a department other than your own (or "all") is restricted to
-- factory_manager+ tiers — enforced server-side in dmtValidateWidget().
--
-- Writes: creates one table, copies existing My View pins into it, drops the old table.

BEGIN;

CREATE TABLE IF NOT EXISTS dmt_dashboard_widgets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emp_id        text NOT NULL REFERENCES user_details(emp_id) ON DELETE CASCADE,
  widget_type   text NOT NULL,
  config        jsonb NOT NULL DEFAULT '{}'::jsonb,
  display_order int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Stated separately (and re-stated on every run) so adding a widget type later is a
-- one-line change here rather than a table rebuild.
ALTER TABLE dmt_dashboard_widgets DROP CONSTRAINT IF EXISTS dmt_dashboard_widgets_type_chk;
ALTER TABLE dmt_dashboard_widgets DROP CONSTRAINT IF EXISTS dmt_dashboard_widgets_widget_type_check;
ALTER TABLE dmt_dashboard_widgets ADD CONSTRAINT dmt_dashboard_widgets_type_chk
  CHECK (widget_type IN ('kpi_chart', 'multi_kpi_chart', 'saved_chart', 'kpi_stat', 'task_list', 'task_count'));

CREATE INDEX IF NOT EXISTS dmt_idx_dashboard_widgets_emp ON dmt_dashboard_widgets(emp_id);

-- Carry every existing My View pin over as a kpi_chart widget, then retire that table.
-- Guarded so the whole script stays safe to re-run.
DO $$
BEGIN
  IF to_regclass('public.dmt_my_view_items') IS NOT NULL THEN
    INSERT INTO dmt_dashboard_widgets (emp_id, widget_type, config, display_order, created_at)
    SELECT emp_id, 'kpi_chart', jsonb_build_object('kpi_id', kpi_id::text), display_order, created_at
    FROM dmt_my_view_items;

    DROP TABLE dmt_my_view_items;
  END IF;
END $$;

COMMIT;
