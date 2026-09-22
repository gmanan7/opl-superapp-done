-- PM Schedule shows only machines someone has deliberately SELECTED from the master `machine`
-- table (people with PM edit access do this on the page). Safe to re-run.
-- Writes data: creates the table and pre-selects the machines that were already on the PM
-- calendar (the ones copied in by pm_machines_to_machine.sql, i.e. those with a PM line) so the
-- calendar does not go empty. Machines added to the master later stay OFF the calendar until picked.

CREATE TABLE IF NOT EXISTS dmt_pm_machine (
  machine_id uuid PRIMARY KEY REFERENCES machine(id) ON DELETE CASCADE,
  added_by   text,
  added_at   timestamptz NOT NULL DEFAULT now()
);

INSERT INTO dmt_pm_machine (machine_id, added_by)
SELECT id, NULL FROM machine WHERE line IS NOT NULL
ON CONFLICT (machine_id) DO NOTHING;
