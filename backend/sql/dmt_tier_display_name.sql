-- Lets a T4-level (factory-wide) tier get a custom display name, and lets BE admins create
-- more than one T4-level group (previously capped to exactly one per factory).
-- Additive/relaxing only — no data removed.

ALTER TABLE dmt_tier ADD COLUMN IF NOT EXISTS display_name text;

-- Was: at most one row named 'T4' (no dmt_id/jh_group_id) per factory. BE admins can now
-- create several independently named T4-level groups, so this cap no longer applies.
DROP INDEX IF EXISTS dmt_tier_factory_name_no_dmt;
