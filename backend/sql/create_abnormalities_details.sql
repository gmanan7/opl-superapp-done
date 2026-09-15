-- New table for the redesigned Abnormalities module (step 1 — minimal version).
-- Mirrors kaizen_details / opl_details: plain text identity columns
-- (submitted_by, submitter_emp_id) sourced from user_details, no enforced FKs.
-- Does not touch any existing table.

CREATE TABLE abnormalities_details (
    abnormality_id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    description           text,
    before_image          text,
    submitted_by          text,
    submitter_emp_id      text,
    jh_group_id           uuid,
    factory_id            text,
    "timestamp"           timestamp with time zone NOT NULL DEFAULT now()
);
