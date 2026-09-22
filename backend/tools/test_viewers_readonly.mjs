// Dry run: people who can SEE every task (BE Admin, an IT admin, someone added to the Task Board
// Overview list) - and the Lead of the task's own group - must be READ-ONLY on a task they are
// neither assigned to nor the assigner of. Real API, self-cleaning (all names start "DEMO View").
//   node backend/tools/test_viewers_readonly.mjs      (DEMO_API=http://localhost:3111/api to aim it elsewhere)
import { config } from 'dotenv';
config({ path: 'C:/Users/HP Pavilion/Documents/ITC/opl-done-superapp/opl-superapp-done/.env' });
import pg from 'pg';

const pool = new pg.Pool({
  host: process.env.DB_HOST, user: process.env.DB_USER,
  password: String(process.env.DB_PASSWORD), port: +process.env.DB_PORT, database: process.env.DB_DATABASE,
});
const BASE = process.env.DEMO_API || 'http://localhost:3000/api';
const BE = '444444';        // BE Admin
const IT = '111111';        // IT Admin (BE-tier role)
const GLOBAL_VIEWER = '777777';   // will be added to the Task Board Overview list
const GROUP_LEAD = '666666';      // Lead of the task's own group
const OWNER = '222222';           // assignee AND assigner of the task
const daysFrom = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

async function raw(method, path, body, who) {
  const res = await fetch(`${BASE}${path}`, { method, headers: { 'Content-Type': 'application/json', 'x-worker-id': who }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await res.json(); } catch { /* empty */ }
  return { status: res.status, data };
}
let pass = 0; let fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass += 1; console.log(`  PASS  ${name}`); } else { fail += 1; console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`); } };

let addedViewer = false;
async function clean() {
  const t = (await pool.query(`SELECT id FROM dmt_tasks WHERE title LIKE 'DEMO View%'`)).rows.map((r) => r.id);
  if (t.length) {
    await pool.query('DELETE FROM dmt_task_updates WHERE task_id = ANY($1)', [t]);
    await pool.query('DELETE FROM dmt_task_due_date_history WHERE task_id = ANY($1)', [t]);
    await pool.query('DELETE FROM dmt_tasks WHERE id = ANY($1)', [t]);
  }
  await pool.query(`DELETE FROM dmt_tier WHERE display_name LIKE 'DEMO View%'`);
  if (addedViewer) await pool.query('DELETE FROM dmt_global_task_viewer WHERE emp_id = $1', [GLOBAL_VIEWER]);
}

async function main() {
  await clean();

  // a group with its own Lead and one member (the task's owner); the viewers below belong to nothing
  const tier = (await raw('POST', '/dmt/tiers', { name: 'T2', display_name: 'DEMO View Group', lead_emp_id: GROUP_LEAD }, BE)).data;
  await raw('POST', `/dmt/tiers/${tier.id}/members`, { emp_id: OWNER }, BE);
  const wasViewer = (await pool.query('SELECT 1 FROM dmt_global_task_viewer WHERE emp_id = $1', [GLOBAL_VIEWER])).rows.length > 0;
  if (!wasViewer) { await raw('POST', '/dmt/global-task-viewers', { emp_id: GLOBAL_VIEWER }, BE); addedViewer = true; }
  const task = (await raw('POST', '/dmt/tasks', {
    title: 'DEMO View task', owner_id: OWNER, assigned_by: OWNER, created_by: OWNER,
    priority: 'medium', due_date: daysFrom(5), tier_id: tier.id,
  }, OWNER)).data;
  const before = (await pool.query('SELECT * FROM dmt_tasks WHERE id = $1', [task.id])).rows[0];

  const viewers = [
    ['BE Admin (sees everything)', BE],
    ['IT Admin (BE-level role)', IT],
    ['a person on the Task Board Overview list', GLOBAL_VIEWER],
    ["the Lead of the task's own group", GROUP_LEAD],
  ];
  for (const [label, who] of viewers) {
    console.log(`\n== ${label} ==`);
    const list = (await raw('GET', '/dmt/tasks', null, who)).data || [];
    check('can SEE the task', list.some((x) => x.id === task.id));
    const acts = [
      ['change its status', 'POST', `/dmt/tasks/${task.id}/status`, { new_status: 'in_progress' }],
      ['block it', 'POST', `/dmt/tasks/${task.id}/status`, { new_status: 'blocked', note: 'x' }],
      ['complete it', 'POST', `/dmt/tasks/${task.id}/status`, { new_status: 'completed', note: 'x' }],
      ['change the due date', 'POST', `/dmt/tasks/${task.id}/due-date`, { new_due_date: daysFrom(30), reason: 'x' }],
      ['edit it', 'POST', `/dmt/tasks/${task.id}/fields`, { title: 'DEMO View hijack', description: 'x' }],
      ['reassign it', 'POST', `/dmt/tasks/${task.id}/fields`, { owner_id: who }],
      ['comment on it', 'POST', `/dmt/tasks/${task.id}/comment`, { text: 'hello' }],
      ['escalate it', 'POST', `/dmt/tasks/${task.id}/escalate`, { to_emp_id: '333333' }],
      ['edit it another way (generic route)', 'PATCH', `/dmt/tasks/${task.id}`, { status: 'completed' }],
      ['delete it', 'DELETE', `/dmt/tasks/${task.id}`, null],
    ];
    for (const [what, method, path, body] of acts) {
      const r = await raw(method, path, body, who);
      check(`cannot ${what} (403)`, r.status === 403, `got ${r.status}`);
    }
  }

  console.log('\n== Nothing changed ==');
  const after = (await pool.query('SELECT * FROM dmt_tasks WHERE id = $1', [task.id])).rows[0];
  check('the task is exactly as it was (status, title, owner, due date)',
    after && after.status === before.status && after.title === before.title && after.owner_id === before.owner_id && String(after.due_date) === String(before.due_date));
  const trace = (await pool.query('SELECT count(*)::int n FROM dmt_task_updates WHERE task_id = $1', [task.id])).rows[0].n;
  check('no history entries were created by any of the attempts', trace === 0, `${trace} rows`);

  console.log('\n== Control: the assignee CAN act ==');
  let r = await raw('POST', `/dmt/tasks/${task.id}/comment`, { text: 'mine' }, OWNER);
  check('the assignee/assigner can comment (201)', r.status === 201, `got ${r.status}`);
  r = await raw('POST', `/dmt/tasks/${task.id}/status`, { new_status: 'completed', note: 'done' }, OWNER);
  check('the assignee/assigner can complete it (200)', r.status === 200, `got ${r.status}`);

  await clean();
  console.log(`\nCleaned up.\n${pass} passed, ${fail} failed.`);
  await pool.end();
  process.exit(fail ? 1 : 0);
}
main().catch(async (e) => { console.error('ERROR:', e.message); await clean().catch(() => {}); await pool.end(); process.exit(2); });
