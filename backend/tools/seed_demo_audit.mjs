// Builds ONE realistic closed 5S audit round so the audit report can be viewed.
// Everything it creates is prefixed "DEMO " — delete with the SQL printed at the end.
//   node _seed_demo_audit.mjs          -> create + print the report URL
//   node _seed_demo_audit.mjs clean    -> remove it
import { config } from 'dotenv';
config({ path: 'C:/Users/HP Pavilion/Documents/ITC/opl-done-superapp/opl-superapp-done/.env' });
import pg from 'pg';

const BASE = 'http://localhost:3000';
const BE = '444444';                 // be_lead — creates the audit
const ADMIN = '555555';              // module_lead — the Audit Admin (also audits)
const AUDITORS = ['666666', '777777', '888888'];   // Operator1/2/3
const TAG = 'DEMO ';
const pool = new pg.Pool({ host: process.env.DB_HOST, user: process.env.DB_USER, password: String(process.env.DB_PASSWORD), port: +process.env.DB_PORT, database: process.env.DB_DATABASE });
const j = async (m, p, b, w) => {
  const r = await fetch(BASE + p, { method: m, headers: { 'Content-Type': 'application/json', ...(w ? { 'x-worker-id': w } : {}) }, body: b ? JSON.stringify(b) : undefined });
  let d; try { d = await r.json(); } catch { d = null; } return { status: r.status, d };
};
const today = new Date().toISOString().slice(0, 10);
const photo = (label, colour) =>
  'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="${colour}"/><text x="160" y="106" font-family="sans-serif" font-size="20" fill="#fff" text-anchor="middle">${label}</text></svg>`
  );

// The 20 real 5S questions from the sample report, mapped to their categories.
const CATS = ['Set In Order', 'Shine', 'Standardize', 'Sustain', 'Sort'];
const Q = [
  ['Floor markings, pedestrian paths and forklift routes and storage identification are maintained', 'Set In Order'],
  ['Frequently used items are easily accessible within designated locations & material stacking follows defined standards (height, FIFO, stability)', 'Set In Order'],
  ['Emergency equipment, spill kits and first aid boxes are identified and easy to access', 'Set In Order'],
  ['Floors, equipment and work surfaces are clean and free from spills', 'Shine'],
  ['No abnormal conditions in equipment (vibration, dust accumulation, damage) and free from oil/adhesive/solvent leaks', 'Shine'],
  ['Cleaning schedules / checklists are available and updated', 'Shine'],
  ['Waste segregation bins and disposal practices are followed regularly', 'Shine'],
  ['SOPs / work instructions, ownership / responsibilities and 5S boards are displayed at point of use', 'Standardize'],
  ['Mandatory PPE and LOTO requirements are displayed and complied with', 'Standardize'],
  ['5S standards and visual controls are maintained', 'Standardize'],
  ['Monthly internal 5S meetings conducted with champions / module leader & MOM shared as evidence', 'Sustain'],
  ['Observation closures are completed within target date', 'Sustain'],
  ['Employees have weekly meetings, training records and awareness of 5S & safety requirements', 'Sustain'],
  ['Improvement activities, best practices and positive observations are implemented and shared', 'Sustain'],
  ['Materials, tools, cylinders and documents have designated locations and are identified', 'Set In Order'],
  ['Safety hazard — aisles, emergency exits and firefighting equipment are free from obstruction', 'Sort'],
  ['No unnecessary items are stored in the workplace', 'Sort'],
  ['Unnecessary items are red-tagged and recorded', 'Sort'],
  ['Obsolete, damaged and excess materials are segregated', 'Sort'],
  ['Open actions and 5S audit findings are tracked and reviewed', 'Standardize'],
];
// One score row per auditor (index 0..2) + the admin (index 3). Deliberately varied.
const SCORES = [
  [2, 3, 4, 3], [3, 3, 3, 3], [3, 4, 3, 3], [3, 2, 3, 3], [3, 3, 2, 3],
  [3, 3, 3, 4], [2, 2, 3, 2], [3, 4, 3, 3], [3, 3, 4, 3], [3, 3, 3, 3],
  [3, 2, 3, 3], [3, 3, 3, 2], [3, 4, 3, 3], [3, 3, 3, 4], [4, 4, 3, 4],
  [4, 4, 4, 4], [4, 3, 4, 4], [4, 4, 4, 3], [4, 4, 4, 4], [3, 3, 2, 3],
];
const REMARKS = {
  0: ['Aisle line near press #3 has faded — repaint needed.', '', 'Storage grid unclear at the SE corner.', ''],
  6: ['Cardboard overflowing from the segregation bin by the exit.', 'Same as noted last round — still open.', '', 'Bin lid missing.'],
  11: ['', '', '', 'Two observations from June still open past target.'],
};
const PHOTOS = { 0: [photo('Faded floor line', '#b45309')], 6: [photo('Overflowing bin', '#b91c1c')] };

async function clean() {
  const t = (await pool.query("SELECT id FROM audit_template WHERE name LIKE $1", [TAG + '%'])).rows.map(r => r.id);
  const z = (await pool.query("SELECT id FROM zone WHERE name LIKE $1", [TAG + '%'])).rows.map(r => r.id);
  if (t.length) {
    const sc = (await pool.query('SELECT id FROM audit_schedule WHERE template_id = ANY($1)', [t])).rows.map(r => r.id);
    const oc = sc.length ? (await pool.query('SELECT id FROM audit_occurrence WHERE schedule_id = ANY($1)', [sc])).rows.map(r => r.id) : [];
    const su = oc.length ? (await pool.query('SELECT id FROM audit_submission WHERE occurrence_id = ANY($1)', [oc])).rows.map(r => r.id) : [];
    if (su.length) {
      await pool.query('DELETE FROM audit_response_photo WHERE response_id IN (SELECT id FROM audit_response WHERE submission_id = ANY($1))', [su]).catch(() => {});
      for (const tbl of ['audit_response', 'audit_submission_category_score']) await pool.query(`DELETE FROM ${tbl} WHERE submission_id = ANY($1)`, [su]).catch(() => {});
      await pool.query('DELETE FROM audit_audit_trail WHERE submission_id = ANY($1)', [su]).catch(() => {});
      await pool.query('DELETE FROM audit_submission WHERE id = ANY($1)', [su]);
    }
    if (oc.length) await pool.query('DELETE FROM audit_occurrence WHERE id = ANY($1)', [oc]);
    if (sc.length) { await pool.query('DELETE FROM audit_schedule_auditor WHERE schedule_id = ANY($1)', [sc]); await pool.query('DELETE FROM audit_schedule WHERE id = ANY($1)', [sc]); }
    await pool.query('DELETE FROM audit_audit_trail WHERE template_id = ANY($1)', [t]).catch(() => {});
    for (const tbl of ['audit_template_admin', 'audit_template_question', 'audit_template_category']) await pool.query(`DELETE FROM ${tbl} WHERE template_id = ANY($1)`, [t]);
    await pool.query('DELETE FROM audit_template WHERE id = ANY($1)', [t]);
  }
  if (z.length) await pool.query('DELETE FROM zone WHERE id = ANY($1)', [z]);
  await pool.query("DELETE FROM notification WHERE module='audit' AND created_at > now() - interval '1 day'").catch(() => {});
  const left = await pool.query("SELECT (SELECT count(*) FROM audit_template WHERE name LIKE $1) t,(SELECT count(*) FROM zone WHERE name LIKE $1) z", [TAG + '%']);
  console.log('cleaned. leftovers:', JSON.stringify(left.rows[0]));
}

async function seed() {
  await clean();  // idempotent — start fresh each run
  const zone = await j('POST', '/api/zones', { name: TAG + 'Print Hall (5S round)' }, BE);
  const tpl = await j('POST', '/api/audit-templates', {
    name: TAG + '5S Audit', structure: 'categories_questions', scoring_mode: 'required',
    score_min: 0, score_max: 4, score_step: 1,
    categories: CATS.map((name) => ({ name, photo_required: false })),
    questions: Q.map(([text, cat]) => ({ question_text: text, photo_required: false, category_index: CATS.indexOf(cat) })),
  }, BE);
  if (tpl.status !== 200) throw new Error('template create failed: ' + JSON.stringify(tpl.d));
  const templateId = tpl.d.id;
  await j('POST', '/api/audit-templates/' + templateId + '/admins', { emp_id: ADMIN }, BE);

  const qRows = (await pool.query('SELECT id, question_order, category_id FROM audit_template_question WHERE template_id=$1 ORDER BY question_order', [templateId])).rows;

  const sched = await j('POST', '/api/audit-schedules', {
    template_id: templateId, zone_id: zone.d.id, admin_emp_id: ADMIN,
    freq: 'once', start_date: today, end_type: 'never', auditor_emp_ids: AUDITORS,
  }, ADMIN);
  const schedId = (sched.d.schedule || sched.d).id;

  const people = [...AUDITORS, ADMIN];
  for (let col = 0; col < people.length; col++) {
    const emp = people[col];
    const start = await j('POST', '/api/audit-submissions', { schedule_id: schedId }, emp);
    if (start.status !== 200) throw new Error('start failed for ' + emp + ': ' + JSON.stringify(start.d));
    const responses = qRows.map((qr, i) => ({
      question_id: qr.id,
      category_id: qr.category_id,
      score: SCORES[i][col],
      remarks: (REMARKS[i] && REMARKS[i][col]) || '',
      photos: (col === 0 && PHOTOS[i]) ? PHOTOS[i].map((u) => ({ photo_url: u })) : [],
    }));
    const put = await j('PUT', '/api/audit-submissions/' + start.d.id, { responses, draft: false }, emp);
    if (put.status !== 200) throw new Error('submit failed for ' + emp + ': ' + JSON.stringify(put.d));
    console.log('  submitted:', emp);
  }

  const occ = (await pool.query('SELECT * FROM audit_occurrence WHERE schedule_id=$1 ORDER BY due_date DESC LIMIT 1', [schedId])).rows[0];
  console.log('\n=== DEMO AUDIT READY ===');
  console.log('  status         :', occ.status, `(${occ.submitted_count}/${occ.expected_count})`);
  console.log('  combined score :', Number(occ.combined_score).toFixed(2), '/', occ.combined_max);
  console.log('  occurrence id  :', occ.id);
  console.log('\n  Open the report at:');
  console.log('    /audits/report/' + occ.id);
  console.log('  (log in as a BE lead / Global Audit Admin / the Audit Admin, then this URL —');
  console.log('   or Audits -> All Audits -> Completed -> Generate Report, or Audits -> Scores -> Report.)');
  console.log('\n  To remove this demo later:  node backend/_seed_demo_audit.mjs clean');
}

try {
  if (process.argv[2] === 'clean') await clean();
  else await seed();
} finally {
  await pool.end();
}
