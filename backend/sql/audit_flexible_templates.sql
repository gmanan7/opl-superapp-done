-- audit_flexible_templates.sql
-- Flexible audit template creation, added on top of the original fixed
-- "5S Audit, questions under 5 pillars, score 1-4, one photo, photo forced on score <=2".
--
-- A template now has:
--   structure     'questions' | 'categories' | 'categories_questions'
--   scoring_mode  'required' | 'optional' | 'off'
--   score_min / score_max / score_step  (the mark scale; "step" = smallest increment)
-- Categories are free-form (audit_template_category), no longer the fixed 5S pillar enum.
-- A response can score a question OR a category directly.
-- Each response can carry unlimited photos, each with an optional caption
-- (audit_response_photo). The old "score 1/2 needs a photo" rule is removed -- a photo
-- is required only where the creator ticked photo_required (>=1 photo then suffices).
--
-- All changes are additive / non-destructive to existing 5S data:
--   - existing 5S template already matches the new defaults (categories_questions, 1-4, step 1, required)
--   - its 5 pillar values become audit_template_category rows and its questions relink to them
--   - existing single photos are copied into audit_response_photo
-- Idempotent: safe to re-run.

BEGIN;

-- 1. Template-level structure + scoring configuration ------------------------------------
ALTER TABLE audit_template
  ADD COLUMN IF NOT EXISTS structure text NOT NULL DEFAULT 'categories_questions',
  ADD COLUMN IF NOT EXISTS scoring_mode text NOT NULL DEFAULT 'required',
  ADD COLUMN IF NOT EXISTS score_min numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS score_max numeric NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS score_step numeric NOT NULL DEFAULT 1;

ALTER TABLE audit_template DROP CONSTRAINT IF EXISTS audit_template_structure_chk;
ALTER TABLE audit_template ADD CONSTRAINT audit_template_structure_chk
  CHECK (structure IN ('questions','categories','categories_questions'));
ALTER TABLE audit_template DROP CONSTRAINT IF EXISTS audit_template_scoring_mode_chk;
ALTER TABLE audit_template ADD CONSTRAINT audit_template_scoring_mode_chk
  CHECK (scoring_mode IN ('required','optional','off'));
ALTER TABLE audit_template DROP CONSTRAINT IF EXISTS audit_template_scale_chk;
ALTER TABLE audit_template ADD CONSTRAINT audit_template_scale_chk
  CHECK (score_max > score_min AND score_step > 0);

-- 2. Free-form categories --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_template_category (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES audit_template(id) ON DELETE CASCADE,
  name text NOT NULL,
  category_order int NOT NULL DEFAULT 0,
  photo_required boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_template_category_template_idx ON audit_template_category (template_id);

-- 3. Seed categories from every existing template's distinct question.category values ---
INSERT INTO audit_template_category (template_id, name, category_order)
SELECT sub.template_id, sub.category,
       (row_number() OVER (PARTITION BY sub.template_id ORDER BY sub.category))::int - 1
FROM (SELECT DISTINCT template_id, category FROM audit_template_question) sub
WHERE NOT EXISTS (
  SELECT 1 FROM audit_template_category c
  WHERE c.template_id = sub.template_id AND c.name = sub.category
);

-- 4. Questions relink to category_id; drop the fixed-pillar constraint -----------------
ALTER TABLE audit_template_question
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES audit_template_category(id) ON DELETE SET NULL;

UPDATE audit_template_question q
SET category_id = c.id
FROM audit_template_category c
WHERE c.template_id = q.template_id AND c.name = q.category AND q.category_id IS NULL;

ALTER TABLE audit_template_question DROP CONSTRAINT IF EXISTS audit_template_question_category_check;
ALTER TABLE audit_template_question ALTER COLUMN category DROP NOT NULL;

-- 5. Responses: nullable question_id, add category_id, numeric score, drop old checks --
ALTER TABLE audit_response DROP CONSTRAINT IF EXISTS audit_response_score_check;
ALTER TABLE audit_response DROP CONSTRAINT IF EXISTS audit_response_photo_required;
ALTER TABLE audit_response ALTER COLUMN question_id DROP NOT NULL;
ALTER TABLE audit_response ALTER COLUMN score TYPE numeric USING score::numeric;
ALTER TABLE audit_response
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES audit_template_category(id) ON DELETE CASCADE;
ALTER TABLE audit_response DROP CONSTRAINT IF EXISTS audit_response_target_chk;
ALTER TABLE audit_response ADD CONSTRAINT audit_response_target_chk
  CHECK (question_id IS NOT NULL OR category_id IS NOT NULL);

-- 6. Unlimited captioned photos per response ------------------------------------------
CREATE TABLE IF NOT EXISTS audit_response_photo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id uuid NOT NULL REFERENCES audit_response(id) ON DELETE CASCADE,
  photo_url text NOT NULL,
  caption text,
  photo_order int NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS audit_response_photo_response_idx ON audit_response_photo (response_id);

INSERT INTO audit_response_photo (response_id, photo_url, photo_order)
SELECT id, photo_url, 0 FROM audit_response r
WHERE r.photo_url IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM audit_response_photo p WHERE p.response_id = r.id);

-- 7. Per-category score rows keyed by category_id -------------------------------------
ALTER TABLE audit_submission_category_score
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES audit_template_category(id) ON DELETE CASCADE;

UPDATE audit_submission_category_score scs
SET category_id = c.id
FROM audit_submission s
JOIN audit_template_category c ON c.template_id = s.template_id
WHERE scs.submission_id = s.id AND c.name = scs.category AND scs.category_id IS NULL;

ALTER TABLE audit_submission_category_score DROP CONSTRAINT IF EXISTS audit_submission_category_score_category_check;
ALTER TABLE audit_submission_category_score DROP CONSTRAINT IF EXISTS audit_submission_category_score_submission_id_category_key;
ALTER TABLE audit_submission_category_score ALTER COLUMN category DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS audit_submission_category_score_sub_catid_key
  ON audit_submission_category_score (submission_id, category_id);

COMMIT;
