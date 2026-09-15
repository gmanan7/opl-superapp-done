-- Recurring OPL training pushes. An "incharge" (BE-lead tier / module lead / JH lead / a
-- configured OPL reviewer) can put an approved OPL on a repeating cycle (an interval in
-- days) that auto-assigns it as training to the current members of one or more JH groups
-- (optionally narrowed to a hand-picked subset). Every incharge sees every schedule and can
-- pause / resume / delete / run-now / change the interval. Firing is done by an in-process
-- hourly sweep in server.js (no external scheduler) plus an on-page-load backstop.
-- Safe to run once; creates two tables and (if an older 'recurrence' version exists) migrates it.

CREATE TABLE IF NOT EXISTS opl_training_schedule (
    id                    serial PRIMARY KEY,
    opl_id                integer NOT NULL,
    interval_days         integer NOT NULL DEFAULT 30 CHECK (interval_days >= 1 AND interval_days <= 3650),
    target_jh_group_ids   text[] NOT NULL DEFAULT '{}',
    target_emp_ids        text[] NOT NULL DEFAULT '{}',   -- empty => every current member of the target groups
    start_date            date NOT NULL DEFAULT CURRENT_DATE,
    end_date              date,
    is_active             boolean NOT NULL DEFAULT true,
    created_by_emp_id     text NOT NULL,
    paused_by_emp_id      text,
    pause_reason          text,
    last_run_at           timestamptz,
    created_at            timestamptz NOT NULL DEFAULT NOW(),
    updated_at            timestamptz NOT NULL DEFAULT NOW()
);

-- Upgrade path from the earlier fixed-cadence ('recurrence') version.
ALTER TABLE opl_training_schedule ADD COLUMN IF NOT EXISTS interval_days integer;
UPDATE opl_training_schedule
SET interval_days = CASE recurrence
        WHEN 'fortnightly' THEN 14
        WHEN 'monthly' THEN 30
        WHEN 'quarterly' THEN 90
        ELSE 30 END
WHERE interval_days IS NULL AND to_regclass('opl_training_schedule') IS NOT NULL
  AND EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'opl_training_schedule' AND column_name = 'recurrence');
UPDATE opl_training_schedule SET interval_days = 30 WHERE interval_days IS NULL;
ALTER TABLE opl_training_schedule ALTER COLUMN interval_days SET NOT NULL;
ALTER TABLE opl_training_schedule ALTER COLUMN interval_days SET DEFAULT 30;
ALTER TABLE opl_training_schedule DROP COLUMN IF EXISTS recurrence;

CREATE INDEX IF NOT EXISTS opl_training_schedule_active_idx ON opl_training_schedule (is_active);

CREATE TABLE IF NOT EXISTS opl_training_schedule_run (
    id              serial PRIMARY KEY,
    schedule_id     integer NOT NULL REFERENCES opl_training_schedule (id) ON DELETE CASCADE,
    run_at          timestamptz NOT NULL DEFAULT NOW(),
    assigned_count  integer NOT NULL DEFAULT 0,
    triggered_by    text NOT NULL DEFAULT 'auto'   -- 'auto' or an emp_id for a manual "run now"
);

CREATE INDEX IF NOT EXISTS opl_training_schedule_run_sched_idx ON opl_training_schedule_run (schedule_id, run_at DESC);
