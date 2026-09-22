-- Marks a group as "private" (BE-Admin-created only). Task visibility is unchanged: members of
-- the group, BE Admin and Task Board Overview viewers see its tasks, same as any other group.
-- The flag exists so the upcoming auto-escalation feature can treat private groups differently.
-- Additive and safe to re-run.
ALTER TABLE dmt_tier ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false;
