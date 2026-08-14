-- Phase 3 · M2b (addendum) — drop the superseded prototype training table
-- ----------------------------------------------------------------------------
-- opl_training_record was the prototype's one-row-per-worker-per-OPL "read" log
-- (columns: opl_id, worker_id, read_at, acknowledged). It cannot hold retraining
-- history (D-028); opl_training_event (event-grained, per retrain_cycle) is now the
-- canonical training log. Verified before drop: exactly 4 prototype/test rows
-- (single OPL 05451c2a…, group CNC, April 2026), no inbound FKs, no dependent views,
-- no production training data. NOT migrated — copying test "reads" would inject fake
-- cycle-1 events into opl_training_event. Non-contract table; safe to drop (D-029).
-- ----------------------------------------------------------------------------

BEGIN;
DROP TABLE IF EXISTS opl_training_record;
COMMIT;
