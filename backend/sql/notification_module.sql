-- Notifications: tag each notification with its module + entity so the bell can show one
-- tab per module (OPL / Kaizen / Abnormality / Audit) and deep-link correctly.
-- Additive only. Backfills existing rows (all currently OPL training reminders).

ALTER TABLE notification ADD COLUMN IF NOT EXISTS module    text;
ALTER TABLE notification ADD COLUMN IF NOT EXISTS entity_id text;

UPDATE notification
   SET module = 'opl',
       entity_id = opl_id::text
 WHERE opl_id IS NOT NULL
   AND module IS NULL;

CREATE INDEX IF NOT EXISTS notification_module_entity_idx
    ON notification (module, entity_id, kind);
