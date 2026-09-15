// Seeds ONE dummy item in EVERY workflow status, for two submitters (the JH Leader 333333
// and the Operator 222222), across all three modules: OPL, Kaizen, Abnormality.
// Everything it creates is prefixed "[SEED] " in its title/description.
//
//   node backend/tools/seed_demo_workflow_items.mjs         -> (re)create the seed set
//   node backend/tools/seed_demo_workflow_items.mjs clean   -> remove it, create nothing
//
// Idempotent: every run first deletes all "[SEED] %" rows (and their audit-trail children)
// then re-inserts, so statuses/fields always match this script.
import { config } from 'dotenv';
config({ path: 'C:/Users/HP Pavilion/Documents/ITC/opl-done-superapp/opl-superapp-done/.env' });
import pg from 'pg';

const pool = new pg.Pool({
  host: process.env.DB_HOST, user: process.env.DB_USER,
  password: String(process.env.DB_PASSWORD), port: +process.env.DB_PORT, database: process.env.DB_DATABASE,
});

const TAG = '[SEED] ';
const JH_GROUP = '603fdad1-f78e-4655-87cc-cf235f94cb50';   // SFM Printing
const FACTORY = '1';                                        // TVT
const REVIEWER = '333333';                                  // JH Leader — stands in as the reviewer/closer
const SUBMITTERS = [
  { emp_id: '333333', label: 'JH Leader (ID: 333333)', who: 'JH Leader' },
  { emp_id: '222222', label: 'Operator (ID: 222222)', who: 'Operator' },
];

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const photo = (label, colour) =>
  'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="${colour}"/><text x="160" y="106" font-family="sans-serif" font-size="18" fill="#fff" text-anchor="middle">${label}</text></svg>`
  );

const OPL_STATUSES = ['draft', 'pending_jh_review', 'pending_approval', 'pending_be_review', 'approved', 'rejected'];
const KAIZEN_STATUSES = ['draft', 'proposed', 'approved_for_implementation', 'submitted_for_confirmation', 'confirmed_closed', 'rejected'];
const ABN_STATUSES = ['draft', 'pending_review', 'assigned', 'pending_dmt_review', 'closed', 'marked_for_deletion'];

const CLASSIFICATIONS = ['Basic Condition', 'Troubleshoot', 'Improvement'];
const KAIZEN_CATEGORIES = ['productivity', 'quality', 'cost', 'delivery', 'safety', 'morale'];
const ABN_TYPES = ['minor_flaw', 'unfulfilled_basic_condition', 'source_of_contamination', 'inaccessible_place', 'source_of_quality_defect', 'unnecessary_item', 'unsafe_place'];

async function wipe() {
  // Audit-trail children first (FK), then the detail rows. All keyed off the [SEED] marker.
  await pool.query(`DELETE FROM opl_audit_trail WHERE opl_id IN (SELECT opl_id::text FROM opl_details WHERE title LIKE $1)`, [TAG + '%']);
  await pool.query(`DELETE FROM kaizen_audit_trail WHERE kaizen_id IN (SELECT kaizen_id::text FROM kaizen_details WHERE title LIKE $1)`, [TAG + '%']);
  await pool.query(`DELETE FROM abnormality_audit_trail WHERE abnormality_id IN (SELECT abnormality_id::text FROM abnormalities_details WHERE description LIKE $1)`, [TAG + '%']);
  await pool.query(`DELETE FROM opl_details WHERE title LIKE $1`, [TAG + '%']);
  await pool.query(`DELETE FROM kaizen_details WHERE title LIKE $1`, [TAG + '%']);
  await pool.query(`DELETE FROM abnormalities_details WHERE description LIKE $1`, [TAG + '%']);
}

async function seedOpl() {
  let n = 0;
  for (const s of SUBMITTERS) {
    for (let i = 0; i < OPL_STATUSES.length; i++) {
      const status = OPL_STATUSES[i];
      const cls = CLASSIFICATIONS[i % CLASSIFICATIONS.length];
      const stageOrder = status === 'pending_approval' ? 2 : status === 'pending_be_review' ? 3 : 1;
      await pool.query(
        `INSERT INTO opl_details
           (title, content, before_image, after_image, before_description, after_description,
            classification, is_star, submitted_by, submitter_emp_id, status, jh_group_id, factory_id,
            current_stage_order, rejection_reason, timestamp)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, NOW() - ($16 || ' days')::interval)`,
        [
          `${TAG}${s.who} OPL — ${status}`,
          `Dummy OPL by ${s.who} sitting in "${status}". Lesson: keep the guard rail clear.`,
          photo('BEFORE', '#b91c1c'), status === 'draft' ? null : photo('AFTER', '#15803d'),
          'Guard rail was blocked by stored pallets.', 'Pallets relocated; rail marked and kept clear.',
          cls, status === 'approved' && i % 2 === 0, s.label, s.emp_id, status, JH_GROUP, FACTORY,
          stageOrder, status === 'rejected' ? 'Not enough detail in the after-state — please expand.' : null,
          String(i + 2),
        ]
      );
      n++;
    }
  }
  return n;
}

async function seedKaizen() {
  let n = 0;
  for (const s of SUBMITTERS) {
    for (let i = 0; i < KAIZEN_STATUSES.length; i++) {
      const status = KAIZEN_STATUSES[i];
      const cat = KAIZEN_CATEGORIES[i % KAIZEN_CATEGORIES.length];
      const implemented = status === 'submitted_for_confirmation' || status === 'confirmed_closed';
      const reviewed = ['approved_for_implementation', 'submitted_for_confirmation', 'confirmed_closed', 'rejected'].includes(status);
      await pool.query(
        `INSERT INTO kaizen_details
           (title, content, category, before_image, after_image, submitted_by, submitter_emp_id, status,
            jh_group_id, factory_id, savings_estimate, savings_unit, improvement_notes, implementation_date,
            implementation_cost, team_member_emp_ids, reviewed_by, reviewed_at, rejection_reason, timestamp)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19, NOW() - ($20 || ' days')::interval)`,
        [
          `${TAG}${s.who} Kaizen — ${status}`,
          `Dummy Kaizen by ${s.who} in "${status}". Idea: a simple jig to cut changeover time.`,
          cat, photo('BEFORE', '#b45309'), implemented ? photo('AFTER', '#047857') : null,
          s.label, s.emp_id, status, JH_GROUP, FACTORY,
          implemented ? 12000 : null, implemented ? 'Rs' : null,
          implemented ? 'Built the jig from scrap stock; changeover now one person, 4 min.' : null,
          implemented ? daysAgo(3) : null,
          implemented ? 500 : null,
          implemented ? ['666666', '777777'] : null,
          reviewed ? REVIEWER : null, reviewed ? new Date(Date.now() - 2 * 864e5).toISOString() : null,
          status === 'rejected' ? 'Savings basis unclear — rework the estimate and resubmit.' : null,
          String(i + 2),
        ]
      );
      n++;
    }
  }
  return n;
}

async function seedAbn() {
  let n = 0;
  for (const s of SUBMITTERS) {
    for (let i = 0; i < ABN_STATUSES.length; i++) {
      const status = ABN_STATUSES[i];
      const type = ABN_TYPES[i % ABN_TYPES.length];
      const tag = i % 2 === 0 ? 'red' : 'white';
      const assigned = ['assigned', 'pending_dmt_review', 'closed'].includes(status);
      const closureReported = ['pending_dmt_review', 'closed'].includes(status);
      await pool.query(
        `INSERT INTO abnormalities_details
           (description, before_image, after_image, submitted_by, submitter_emp_id, jh_group_id, factory_id,
            type, tag_color, status, action, assignee_emp_id, assigned_by, assigned_at, target_date,
            closure_notes, completion_date, closed_by, closed_at, rejection_reason, reviewed_by, reviewed_at, timestamp)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22, NOW() - ($23 || ' days')::interval)`,
        [
          `${TAG}${s.who} abnormality — ${status}`,
          photo('BEFORE', '#7c3aed'), closureReported ? photo('AFTER', '#0f766e') : null,
          s.label, s.emp_id, JH_GROUP, FACTORY, type, tag, status,
          'Clean the source and add a shield to stop recurrence.',
          assigned ? '666666' : null, assigned ? REVIEWER : null, assigned ? new Date(Date.now() - 4 * 864e5).toISOString() : null,
          assigned ? daysAgo(-5) : null,
          closureReported ? 'Source cleaned, shield fitted, area re-checked after one shift.' : null,
          closureReported ? daysAgo(1) : null,
          status === 'closed' ? REVIEWER : null, status === 'closed' ? new Date(Date.now() - 1 * 864e5).toISOString() : null,
          status === 'marked_for_deletion' ? 'Duplicate of an existing report — marking for deletion.' : null,
          status === 'marked_for_deletion' ? REVIEWER : null,
          status === 'marked_for_deletion' ? new Date(Date.now() - 2 * 864e5).toISOString() : null,
          String(i + 2),
        ]
      );
      n++;
    }
  }
  return n;
}

(async () => {
  const clean = process.argv[2] === 'clean';
  try {
    await wipe();
    if (clean) { console.log('Removed all [SEED] OPL / Kaizen / Abnormality rows.'); return; }
    const o = await seedOpl();
    const k = await seedKaizen();
    const a = await seedAbn();
    console.log(`Seeded: ${o} OPL, ${k} Kaizen, ${a} Abnormality rows`);
    console.log(`  submitters: JH Leader (333333) + Operator (222222)`);
    console.log(`  OPL statuses:    ${OPL_STATUSES.join(', ')}`);
    console.log(`  Kaizen statuses: ${KAIZEN_STATUSES.join(', ')}`);
    console.log(`  Abn statuses:    ${ABN_STATUSES.join(', ')}`);
    console.log(`Undo: node backend/tools/seed_demo_workflow_items.mjs clean`);
  } catch (e) {
    console.error('Seed failed:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
