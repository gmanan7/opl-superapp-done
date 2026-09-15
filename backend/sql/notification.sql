-- In-app notifications. Currently used for "you have a pending training" reminders that an
-- incharge sends from the OPL → My Team analytics tab, but the table is generic (kind column)
-- so other modules can reuse it. Poll-based on the frontend; no external services.
-- Creates one table; touches no existing data.

CREATE TABLE IF NOT EXISTS notification (
    id                serial PRIMARY KEY,
    recipient_emp_id  text NOT NULL,
    kind              text NOT NULL DEFAULT 'general',   -- e.g. 'training_reminder'
    title             text NOT NULL,
    body              text,
    opl_id            integer,                           -- optional deep-link target
    created_by_emp_id text,
    is_read           boolean NOT NULL DEFAULT false,
    read_at           timestamptz,
    created_at        timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notification_recipient_idx ON notification (recipient_emp_id, is_read, created_at DESC);
