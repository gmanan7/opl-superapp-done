-- ============================================================================
-- Phase 1 Step 7 — worker_profile.dmt_id backfill 🔒
-- TPM Fulcrum · WRITE · backfills worker_profile.dmt_id where recoverable.
--
-- Context: pre-Step-3a service-role Edge writes bypassed the RLS
-- dmt-consistency check, leaving dmt_id NULL. Step 6 closed the gap for new
-- writes; this backfills existing rows from their JH group.
--
-- Count note: the Step 6 discovery reported 46 "recoverable_via_jh", but that
-- query only required jh_group_id IS NOT NULL. Two of those workers are in
-- groups whose OWN dmt_id is NULL (no-DMT groups) — correctly not backfillable.
-- True target set: 44. Correctly-NULL after backfill: 7 (5 groupless + 2 in
-- no-DMT groups).
--
-- Audit: the Step-1 fn_mdm_audit trigger fires per UPDATE — one mdm_audit row
-- per worker with changed_fields {"dmt_id": {old: null, new: <uuid>}} and
-- actor NULL (system). No UUIDs/rows created or removed: contract-safe by
-- construction; bracketed by contract_check before/after regardless.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE _backfill_targets AS
SELECT wp.id AS worker_id, wp.factory_id, wp.jh_group_id, jg.dmt_id AS derived_dmt_id
FROM worker_profile wp
JOIN jh_group jg ON jg.id = wp.jh_group_id
WHERE wp.dmt_id IS NULL
  AND wp.is_active = true
  AND jg.dmt_id IS NOT NULL;

-- SELECT count(*) FROM _backfill_targets;  -- expect 44 (see count note)

UPDATE worker_profile wp
SET dmt_id = bt.derived_dmt_id
FROM _backfill_targets bt
WHERE wp.id = bt.worker_id;

COMMIT;
