-- audit_schedule_recurrence.sql
-- Teams-style recurrence for audit schedules. Replaces the old fixed
-- recurrence enum ('none'/'daily'/'weekly'/'fortnightly'/'monthly') + single specific_date
-- with a real pattern: frequency + interval ("every N") + weekday set (weekly) +
-- day-of-month (monthly) + a start date + an end rule (never / on a date / after N times).
--
-- The old `recurrence` and `specific_date` columns are KEPT and kept roughly in sync
-- (best-effort legacy label) so anything still reading them keeps working. Additive and
-- idempotent; existing rows are backfilled from their current recurrence value.

BEGIN;

ALTER TABLE audit_schedule
  ADD COLUMN IF NOT EXISTS freq text NOT NULL DEFAULT 'once',
  ADD COLUMN IF NOT EXISTS recur_interval int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS weekdays int[] NOT NULL DEFAULT '{}',      -- 0=Sun .. 6=Sat (JS getDay)
  ADD COLUMN IF NOT EXISTS day_of_month int,                          -- 1..31, null = use start_date's day
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_type text NOT NULL DEFAULT 'never',    -- 'never' | 'on' | 'after'
  ADD COLUMN IF NOT EXISTS end_date date,
  ADD COLUMN IF NOT EXISTS occurrence_count int;

ALTER TABLE audit_schedule DROP CONSTRAINT IF EXISTS audit_schedule_freq_chk;
ALTER TABLE audit_schedule ADD CONSTRAINT audit_schedule_freq_chk
  CHECK (freq IN ('once','daily','weekly','monthly'));
ALTER TABLE audit_schedule DROP CONSTRAINT IF EXISTS audit_schedule_end_type_chk;
ALTER TABLE audit_schedule ADD CONSTRAINT audit_schedule_end_type_chk
  CHECK (end_type IN ('never','on','after'));
ALTER TABLE audit_schedule DROP CONSTRAINT IF EXISTS audit_schedule_interval_chk;
ALTER TABLE audit_schedule ADD CONSTRAINT audit_schedule_interval_chk
  CHECK (recur_interval >= 1 AND recur_interval <= 365);

-- Backfill from the legacy recurrence value.
UPDATE audit_schedule SET
  start_date = COALESCE(start_date, specific_date, created_at::date),
  freq = CASE recurrence
           WHEN 'none' THEN 'once'
           WHEN 'daily' THEN 'daily'
           WHEN 'weekly' THEN 'weekly'
           WHEN 'fortnightly' THEN 'weekly'
           WHEN 'monthly' THEN 'monthly'
           ELSE 'once'
         END,
  recur_interval = CASE recurrence WHEN 'fortnightly' THEN 2 ELSE 1 END
WHERE freq = 'once' AND recurrence IS DISTINCT FROM 'none';

-- One-off rows: make sure they carry a start_date too.
UPDATE audit_schedule SET start_date = COALESCE(start_date, specific_date, created_at::date)
WHERE start_date IS NULL;

COMMIT;
