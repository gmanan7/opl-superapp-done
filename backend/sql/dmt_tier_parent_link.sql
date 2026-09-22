-- Explicit T3 -> T4 hierarchy link. Needed because BE Leads can create multiple T4 groups
-- (CreateT4Dialog), so "which T4 does this DMT's T3 report to" can no longer be inferred by
-- just grabbing whichever T4 row comes back first. T2's parent stays auto-derived from
-- jh_group.module_group_id (real structural data) — only T3->T4 needs a manual link.
ALTER TABLE dmt_tier ADD COLUMN IF NOT EXISTS parent_tier_id uuid REFERENCES dmt_tier(id) ON DELETE SET NULL;
