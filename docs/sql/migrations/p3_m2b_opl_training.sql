-- Phase 3 · M2b (OPL Training) — event-grained training, audience, retrain, retire
-- ----------------------------------------------------------------------------
-- Realizes D-028 (OPL training architecture), owner-ruled forks (2026-06-18):
--   * Audience = computed-default + OVERRIDE (roster-live). effective(opl) =
--     {active PRIMARY members of opl.jh_group_id} ∪ {'included'} − {'excluded'}.
--     opl_intended_audience stores ONLY leader overrides (D-013: additional/support
--     people are opted in via 'included', never auto-obligated).
--   * Training is EVENT-GRAINED: one row per (worker × OPL × retrain_cycle).
--     method self_ack (worker's own attestation) | trainer_led (jh_leader+ attest).
--     NO worker counter-sign in M2 (→ Phase-4). trainer_id NULL ⇔ self_ack.
--   * Retraining resurfaces per opl.retrain_frequency_days (default 90); a bounded
--     due view + per-worker visible cap (applied in the consuming query) = "no drowning".
--   * Soft-retire (D-005): approved OPLs are retired (retired_at), NEVER hard-deleted.
-- ACCESS (mirrors p3_m2a1_opl_access.sql):
--   READ = role-conditional tier + worker-reads-OWN. OWNER OVERRULE (2026-06-18):
--     apprentice/on_roll (floor) read ONLY their own rows (worker_id=my_worker_id());
--     the D-024 group/DMT/factory tier applies to jh_leader+ (roster/due-board).
--   WRITE = RPC-only. Table INSERT/UPDATE/DELETE REVOKEd from client roles; events
--     are IMMUTABLE (no client UPDATE/DELETE ever). All mutations via SECURITY DEFINER
--     RPCs with EXPLICIT role lists (never native user_role enum order — dmt_*
--     are swapped) reusing can_lead_opl_group + my_worker_id + tier helpers.
-- Tables are NON-contract (no master-table touch). opl.retrain_frequency_days
-- ALREADY EXISTS (verified) — only retired_at/retired_by are added here.
-- ----------------------------------------------------------------------------

BEGIN;

-- ── opl: soft-retire columns (retrain_frequency_days already present) ────────
ALTER TABLE opl ADD COLUMN IF NOT EXISTS retired_at timestamptz;
ALTER TABLE opl ADD COLUMN IF NOT EXISTS retired_by uuid REFERENCES worker_profile(id);

-- ── opl_intended_audience: leader OVERRIDES only (default audience is computed) ─
CREATE TABLE IF NOT EXISTS opl_intended_audience (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id  uuid NOT NULL,
  jh_group_id uuid NOT NULL,
  opl_id      uuid NOT NULL REFERENCES opl(id) ON DELETE CASCADE,
  worker_id   uuid NOT NULL REFERENCES worker_profile(id),
  state       text NOT NULL CHECK (state IN ('included','excluded')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid NOT NULL REFERENCES worker_profile(id),
  UNIQUE (opl_id, worker_id)
);
CREATE INDEX IF NOT EXISTS oia_opl_idx     ON opl_intended_audience (opl_id);
CREATE INDEX IF NOT EXISTS oia_worker_idx  ON opl_intended_audience (worker_id);
CREATE INDEX IF NOT EXISTS oia_group_idx   ON opl_intended_audience (jh_group_id);

-- ── opl_training_event: event-grained capture (immutable audit grain) ────────
CREATE TABLE IF NOT EXISTS opl_training_event (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id    uuid NOT NULL,
  jh_group_id   uuid NOT NULL,
  opl_id        uuid NOT NULL REFERENCES opl(id),
  worker_id     uuid NOT NULL REFERENCES worker_profile(id),
  retrain_cycle int  NOT NULL CHECK (retrain_cycle >= 1),
  method        text NOT NULL CHECK (method IN ('self_ack','trainer_led')),
  trainer_id    uuid REFERENCES worker_profile(id),
  acknowledged  boolean NOT NULL DEFAULT true,
  trained_at    timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid NOT NULL REFERENCES worker_profile(id),
  UNIQUE (opl_id, worker_id, retrain_cycle),
  CHECK ((method = 'self_ack'  AND trainer_id IS NULL)
      OR (method = 'trainer_led' AND trainer_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS ote_worker_idx ON opl_training_event (worker_id);
CREATE INDEX IF NOT EXISTS ote_opl_idx    ON opl_training_event (opl_id);
CREATE INDEX IF NOT EXISTS ote_group_idx  ON opl_training_event (jh_group_id);
CREATE INDEX IF NOT EXISTS ote_factory_idx ON opl_training_event (factory_id);

-- ── Effective-audience: ONE source of truth (ARCHITECTURE §8.1). SECURITY
--    DEFINER so it composes regardless of base-table RLS; FACTORY-GUARDED so a
--    cross-factory p_opl_id yields nothing (no IDOR leak via the exposed RPC). ──
CREATE OR REPLACE FUNCTION public.opl_effective_audience(p_opl_id uuid)
 RETURNS TABLE (worker_id uuid)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH grp AS (
    SELECT id, jh_group_id FROM opl
    WHERE id = p_opl_id AND factory_id = my_factory_id()
  )
  SELECT wp.id
  FROM worker_profile wp JOIN grp ON wp.jh_group_id = grp.jh_group_id
  WHERE wp.is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM opl_intended_audience x
      WHERE x.opl_id = grp.id AND x.worker_id = wp.id AND x.state = 'excluded')
  UNION
  SELECT x.worker_id
  FROM opl_intended_audience x JOIN grp ON x.opl_id = grp.id
  WHERE x.state = 'included'
    AND EXISTS (SELECT 1 FROM worker_profile wp2
                WHERE wp2.id = x.worker_id AND wp2.is_active = true)
$$;

-- ── Views (security_invoker: base-table RLS applies to the querying role) ─────
DROP VIEW IF EXISTS opl_training_due_v;
DROP VIEW IF EXISTS opl_training_status_v;

-- Current status = latest-cycle event per (opl, worker). Scoped by event RLS.
CREATE VIEW opl_training_status_v WITH (security_invoker = true) AS
SELECT DISTINCT ON (e.opl_id, e.worker_id)
  e.opl_id, e.worker_id, e.jh_group_id, e.factory_id,
  e.retrain_cycle, e.method, e.trainer_id, e.trained_at, e.acknowledged,
  (e.trained_at + make_interval(days => COALESCE(o.retrain_frequency_days, 90))) AS next_due_at,
  (now() >= e.trained_at + make_interval(days => COALESCE(o.retrain_frequency_days, 90))) AS is_due
FROM opl_training_event e
JOIN opl o ON o.id = e.opl_id
ORDER BY e.opl_id, e.worker_id, e.retrain_cycle DESC;

-- Due queue = effective audience of approved, non-retired OPLs who are never-trained
-- OR whose latest cycle is due. Self-scoped to the same tier as the table RLS
-- (floor → own rows only). Per-worker cap + ordering applied in the consuming query.
CREATE VIEW opl_training_due_v WITH (security_invoker = true) AS
SELECT
  o.id AS opl_id, a.worker_id, o.jh_group_id, o.factory_id,
  o.title, o.opl_type, o.machine_id, o.is_star,
  s.trained_at, s.retrain_cycle AS last_cycle, s.next_due_at,
  COALESCE(s.retrain_cycle, 0) + 1 AS next_cycle,
  (s.trained_at IS NULL) AS never_trained,
  CASE WHEN s.next_due_at IS NULL THEN NULL
       ELSE GREATEST(0, floor(EXTRACT(epoch FROM (now() - s.next_due_at)) / 86400))::int
  END AS days_overdue
FROM opl o
JOIN LATERAL opl_effective_audience(o.id) a ON true
LEFT JOIN opl_training_status_v s ON s.opl_id = o.id AND s.worker_id = a.worker_id
WHERE o.status = 'approved' AND o.retired_at IS NULL
  AND (s.trained_at IS NULL OR s.is_due)
  AND (
        a.worker_id = my_worker_id()
        OR (my_role() = 'jh_leader' AND o.jh_group_id = ANY (my_jh_group_ids()))
        OR (my_role() = ANY (ARRAY['dmt_leader','dmt_member']::user_role[]) AND o.jh_group_id = ANY (my_dmt_group_ids()))
        OR (my_role() = ANY (ARRAY['pillar_champion','be_team','admin']::user_role[]))
      );

-- ── RLS: role-conditional tiered reads + worker-reads-own; NO write policies ──
ALTER TABLE opl_training_event   ENABLE ROW LEVEL SECURITY;
ALTER TABLE opl_intended_audience ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ote_read ON opl_training_event;
CREATE POLICY ote_read ON opl_training_event FOR SELECT
  USING (
    factory_id = my_factory_id() AND (
      worker_id = my_worker_id()                                                          -- everyone: own rows (floor = ONLY this)
      OR (my_role() = 'jh_leader' AND jh_group_id = ANY (my_jh_group_ids()))              -- jh_leader: own group(s)
      OR (my_role() = ANY (ARRAY['dmt_leader','dmt_member']::user_role[]) AND jh_group_id = ANY (my_dmt_group_ids()))
      OR (my_role() = ANY (ARRAY['pillar_champion','be_team','admin']::user_role[]))      -- champion/be/admin: factory-wide
    )
  );

DROP POLICY IF EXISTS oia_read ON opl_intended_audience;
CREATE POLICY oia_read ON opl_intended_audience FOR SELECT
  USING (
    factory_id = my_factory_id() AND (
      worker_id = my_worker_id()
      OR (my_role() = 'jh_leader' AND jh_group_id = ANY (my_jh_group_ids()))
      OR (my_role() = ANY (ARRAY['dmt_leader','dmt_member']::user_role[]) AND jh_group_id = ANY (my_dmt_group_ids()))
      OR (my_role() = ANY (ARRAY['pillar_champion','be_team','admin']::user_role[]))
    )
  );

-- Writes are RPC-only: revoke table DML from client roles (defense-in-depth atop
-- the absent write policies), keep SELECT (governed by RLS above).
REVOKE INSERT, UPDATE, DELETE ON opl_training_event   FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON opl_intended_audience FROM authenticated, anon;
GRANT  SELECT ON opl_training_event, opl_intended_audience TO authenticated, anon;
GRANT  SELECT ON opl_training_status_v, opl_training_due_v TO authenticated, anon;

-- ── RPCs (SECURITY DEFINER; explicit role lists; sanitized errors — §F.4/D5) ──

-- self_ack: caller attests they have learned an OPL they are on the hook for.
CREATE OR REPLACE FUNCTION public.self_ack_opl_training(p_opl_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_me uuid; v_grp uuid; v_fac uuid; v_status opl_status; v_retired timestamptz;
        v_freq int; v_cycle int; v_due timestamptz;
BEGIN
  v_me := my_worker_id();
  IF v_me IS NULL THEN RAISE EXCEPTION 'no identity' USING ERRCODE='insufficient_privilege'; END IF;
  SELECT jh_group_id, factory_id, status, retired_at, COALESCE(retrain_frequency_days,90)
    INTO v_grp, v_fac, v_status, v_retired, v_freq
    FROM opl WHERE id = p_opl_id AND factory_id = my_factory_id();
  IF v_grp IS NULL THEN RAISE EXCEPTION 'OPL not found' USING ERRCODE='no_data_found'; END IF;
  IF v_status <> 'approved' OR v_retired IS NOT NULL THEN
    RAISE EXCEPTION 'OPL is not open for training' USING ERRCODE='check_violation'; END IF;
  IF NOT EXISTS (SELECT 1 FROM opl_effective_audience(p_opl_id) WHERE worker_id = v_me) THEN
    RAISE EXCEPTION 'not in this OPL audience' USING ERRCODE='insufficient_privilege'; END IF;
  SELECT retrain_cycle, trained_at + make_interval(days => v_freq)
    INTO v_cycle, v_due
    FROM opl_training_event WHERE opl_id = p_opl_id AND worker_id = v_me
    ORDER BY retrain_cycle DESC LIMIT 1;
  IF v_cycle IS NULL THEN
    INSERT INTO opl_training_event (factory_id, jh_group_id, opl_id, worker_id, retrain_cycle, method, trainer_id, acknowledged, created_by)
    VALUES (v_fac, v_grp, p_opl_id, v_me, 1, 'self_ack', NULL, true, v_me);
  ELSIF now() >= v_due THEN
    INSERT INTO opl_training_event (factory_id, jh_group_id, opl_id, worker_id, retrain_cycle, method, trainer_id, acknowledged, created_by)
    VALUES (v_fac, v_grp, p_opl_id, v_me, v_cycle + 1, 'self_ack', NULL, true, v_me);
  ELSE
    RAISE EXCEPTION 'already trained for the current cycle' USING ERRCODE='unique_violation';
  END IF;
END $$;

-- mark_opl_training: jh_leader+ records trainer-led training for a batch of workers.
-- Correctness fix #2: EVERY target must be in the effective audience or the batch
-- fails (can't mark someone trained who isn't on the hook). Returns rows inserted.
CREATE OR REPLACE FUNCTION public.mark_opl_training(p_opl_id uuid, p_worker_ids uuid[])
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_me uuid; v_grp uuid; v_fac uuid; v_status opl_status; v_retired timestamptz;
        v_freq int; v_wid uuid; v_cycle int; v_due timestamptz; v_n int := 0;
BEGIN
  v_me := my_worker_id();
  SELECT jh_group_id, factory_id, status, retired_at, COALESCE(retrain_frequency_days,90)
    INTO v_grp, v_fac, v_status, v_retired, v_freq
    FROM opl WHERE id = p_opl_id AND factory_id = my_factory_id();
  IF v_grp IS NULL THEN RAISE EXCEPTION 'OPL not found' USING ERRCODE='no_data_found'; END IF;
  IF NOT can_lead_opl_group(v_grp) THEN
    RAISE EXCEPTION 'not authorized to mark training in this group' USING ERRCODE='insufficient_privilege'; END IF;
  IF v_status <> 'approved' OR v_retired IS NOT NULL THEN
    RAISE EXCEPTION 'OPL is not open for training' USING ERRCODE='check_violation'; END IF;
  IF p_worker_ids IS NULL OR array_length(p_worker_ids,1) IS NULL THEN
    RAISE EXCEPTION 'no workers given' USING ERRCODE='check_violation'; END IF;
  IF EXISTS (
       SELECT 1 FROM unnest(p_worker_ids) w(id)
       WHERE NOT EXISTS (SELECT 1 FROM opl_effective_audience(p_opl_id) a WHERE a.worker_id = w.id)
     ) THEN
    RAISE EXCEPTION 'one or more workers are not in this OPL audience' USING ERRCODE='insufficient_privilege'; END IF;
  FOREACH v_wid IN ARRAY p_worker_ids LOOP
    SELECT retrain_cycle, trained_at + make_interval(days => v_freq)
      INTO v_cycle, v_due
      FROM opl_training_event WHERE opl_id = p_opl_id AND worker_id = v_wid
      ORDER BY retrain_cycle DESC LIMIT 1;
    IF v_cycle IS NULL THEN
      INSERT INTO opl_training_event (factory_id, jh_group_id, opl_id, worker_id, retrain_cycle, method, trainer_id, acknowledged, created_by)
      VALUES (v_fac, v_grp, p_opl_id, v_wid, 1, 'trainer_led', v_me, true, v_me);
      v_n := v_n + 1;
    ELSIF now() >= v_due THEN
      INSERT INTO opl_training_event (factory_id, jh_group_id, opl_id, worker_id, retrain_cycle, method, trainer_id, acknowledged, created_by)
      VALUES (v_fac, v_grp, p_opl_id, v_wid, v_cycle + 1, 'trainer_led', v_me, true, v_me);
      v_n := v_n + 1;
    END IF;  -- already-current this cycle: skip (idempotent), don't fail the batch
  END LOOP;
  RETURN v_n;
END $$;

-- add_to_opl_audience: jh_leader+ puts a worker ON the hook. Primary member →
-- clear any 'excluded' (re-include); non-member → upsert 'included' (D-013 opt-in).
CREATE OR REPLACE FUNCTION public.add_to_opl_audience(p_opl_id uuid, p_worker_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_grp uuid; v_fac uuid; v_primary boolean;
BEGIN
  SELECT jh_group_id, factory_id INTO v_grp, v_fac FROM opl WHERE id=p_opl_id AND factory_id=my_factory_id();
  IF v_grp IS NULL THEN RAISE EXCEPTION 'OPL not found' USING ERRCODE='no_data_found'; END IF;
  IF NOT can_lead_opl_group(v_grp) THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='insufficient_privilege'; END IF;
  SELECT (jh_group_id = v_grp) INTO v_primary FROM worker_profile WHERE id=p_worker_id AND factory_id=v_fac AND is_active=true;
  IF v_primary IS NULL THEN RAISE EXCEPTION 'worker not found in factory' USING ERRCODE='no_data_found'; END IF;
  IF v_primary THEN
    DELETE FROM opl_intended_audience WHERE opl_id=p_opl_id AND worker_id=p_worker_id AND state='excluded';
  ELSE
    INSERT INTO opl_intended_audience (factory_id, jh_group_id, opl_id, worker_id, state, created_by)
    VALUES (v_fac, v_grp, p_opl_id, p_worker_id, 'included', my_worker_id())
    ON CONFLICT (opl_id, worker_id) DO UPDATE SET state='included', created_by=my_worker_id();
  END IF;
END $$;

-- remove_from_opl_audience: jh_leader+ takes a worker OFF the hook. Primary member
-- → upsert 'excluded'; non-member with an 'included' override → drop it.
CREATE OR REPLACE FUNCTION public.remove_from_opl_audience(p_opl_id uuid, p_worker_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_grp uuid; v_fac uuid; v_primary boolean;
BEGIN
  SELECT jh_group_id, factory_id INTO v_grp, v_fac FROM opl WHERE id=p_opl_id AND factory_id=my_factory_id();
  IF v_grp IS NULL THEN RAISE EXCEPTION 'OPL not found' USING ERRCODE='no_data_found'; END IF;
  IF NOT can_lead_opl_group(v_grp) THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='insufficient_privilege'; END IF;
  SELECT (jh_group_id = v_grp) INTO v_primary FROM worker_profile WHERE id=p_worker_id AND factory_id=v_fac AND is_active=true;
  IF v_primary IS NULL THEN RAISE EXCEPTION 'worker not found in factory' USING ERRCODE='no_data_found'; END IF;
  IF v_primary THEN
    INSERT INTO opl_intended_audience (factory_id, jh_group_id, opl_id, worker_id, state, created_by)
    VALUES (v_fac, v_grp, p_opl_id, p_worker_id, 'excluded', my_worker_id())
    ON CONFLICT (opl_id, worker_id) DO UPDATE SET state='excluded', created_by=my_worker_id();
  ELSE
    DELETE FROM opl_intended_audience WHERE opl_id=p_opl_id AND worker_id=p_worker_id AND state='included';
  END IF;
END $$;

-- retire / unretire: jh_leader+ soft-retires an APPROVED OPL (D-005). Retired OPLs
-- drop out of due_v + training lists but are NEVER hard-deleted.
CREATE OR REPLACE FUNCTION public.retire_opl(p_opl_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_grp uuid; v_status opl_status;
BEGIN
  SELECT jh_group_id, status INTO v_grp, v_status FROM opl WHERE id=p_opl_id AND factory_id=my_factory_id();
  IF v_grp IS NULL THEN RAISE EXCEPTION 'OPL not found' USING ERRCODE='no_data_found'; END IF;
  IF NOT can_lead_opl_group(v_grp) THEN RAISE EXCEPTION 'not authorized to retire OPL in this group' USING ERRCODE='insufficient_privilege'; END IF;
  IF v_status <> 'approved' THEN RAISE EXCEPTION 'only an approved OPL may be retired' USING ERRCODE='check_violation'; END IF;
  UPDATE opl SET retired_at = now(), retired_by = my_worker_id() WHERE id=p_opl_id;
END $$;

CREATE OR REPLACE FUNCTION public.unretire_opl(p_opl_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_grp uuid;
BEGIN
  SELECT jh_group_id INTO v_grp FROM opl WHERE id=p_opl_id AND factory_id=my_factory_id();
  IF v_grp IS NULL THEN RAISE EXCEPTION 'OPL not found' USING ERRCODE='no_data_found'; END IF;
  IF NOT can_lead_opl_group(v_grp) THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='insufficient_privilege'; END IF;
  UPDATE opl SET retired_at = NULL, retired_by = NULL WHERE id=p_opl_id;
END $$;

GRANT EXECUTE ON FUNCTION
  public.opl_effective_audience(uuid),
  public.self_ack_opl_training(uuid),
  public.mark_opl_training(uuid, uuid[]),
  public.add_to_opl_audience(uuid, uuid),
  public.remove_from_opl_audience(uuid, uuid),
  public.retire_opl(uuid),
  public.unretire_opl(uuid)
  TO authenticated, anon;

COMMIT;
