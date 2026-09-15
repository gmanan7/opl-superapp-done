-- Generalizes OPL's configurable-stage-ladder pattern to Kaizen and Abnormality, each of
-- which has TWO review points (phase 1 = pre-implementation/pre-assignment JH review, phase 2
-- = post-implementation/post-closure-evidence final review). One shared table instead of four
-- separate ones. No rows for a given (factory, module, phase) = today's exact default behavior
-- unchanged (resolved in code, not stored).
CREATE TABLE IF NOT EXISTS workflow_stage (
    id SERIAL PRIMARY KEY,
    factory_id text NOT NULL,
    module text NOT NULL,       -- 'kaizen' | 'abnormality'
    phase integer NOT NULL,     -- 1 | 2
    stage_order integer NOT NULL,
    stage_name text NOT NULL,
    updated_by text,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT workflow_stage_unique UNIQUE (factory_id, module, phase, stage_order)
);

-- Tracks which stage an in-flight Kaizen/Abnormality is currently sitting on, within
-- whichever phase its status currently represents. Mirrors opl_details.current_stage_order.
ALTER TABLE kaizen_details ADD COLUMN IF NOT EXISTS current_stage_order integer;
ALTER TABLE abnormalities_details ADD COLUMN IF NOT EXISTS current_stage_order integer;
