// Dry run for the task-status rules, via the REAL API (self-cleaning; all titles start "DEMO Flow"):
//   * an Open task moves to In Progress by itself when its OWNER comments, edits it, or changes its
//     due date - and only then (not for someone else, not on reassignment, not once it is past Open)
//   * blocking a task needs a reason
//   node backend/tools/test_task_flow.mjs        (DEMO_API=http://localhost:3111/api to aim it elsewhere)
import { config } from 'dotenv';
config({ path: 'C:/Users/HP Pavilion/Documents/ITC/opl-done-superapp/opl-superapp-done/.env' });
import pg from 'pg';

const pool = new pg.Pool({
  host: process.env.DB_HOST, user: process.env.DB_USER,
  password: String(process.env.DB_PASSWORD), port: +process.env.DB_PORT, database: process.env.DB_DATABASE,
});
const BASE = process.env.DEMO_API || 'http://localhost:3000/api';
const OWNER = '222222'; const OTHER = '333333'; const BE = '444444';
const daysFrom = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

async function raw(method, path, body, who) {
  const res = await fetch(`${BASE}${path}`, { method, headers: { 'Content-Type': 'application/json', 'x-worker-id': who }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await res.json(); } catch { /* empty */ }
  return { status: res.status, data };
}
let pass = 0; let fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass += 1; console.log(`  PASS  ${name}`); } else { fail += 1; console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`); } };
const statusOf = async (id) => (await pool.query('SELECT status FROM dmt_tasks WHERE id = $1', [id])).rows[0].status;
const autoRows = async (id) => (await pool.query(`SELECT count(*)::int n FROM dmt_task_updates WHERE task_id = $1 AND update_type = 'status_change' AND update_note LIKE 'Started automatically%'`, [id])).rows[0].n;

async function clean() {
  const t = (await pool.query(`SELECT id FROM dmt_tasks WHERE title LIKE 'DEMO Flow%'`)).rows.map((r) => r.id);
  if (t.length) {
    await pool.query('DELETE FROM dmt_task_updates WHERE task_id = ANY($1)', [t]);
    await pool.query('DELETE FROM dmt_task_due_date_history WHERE task_id = ANY($1)', [t]);
    await pool.query('DELETE FROM dmt_tasks WHERE id = ANY($1)', [t]);
  }
  await pool.query(`DELETE FROM dmt_tier WHERE display_name LIKE 'DEMO Flow%'`);
  return t.length;
}

async function main() {
  await clean();
  const mk = async (name, extra = {}) => (await raw('POST', '/dmt/tasks', {
    title: `DEMO Flow ${name}`, owner_id: OWNER, assigned_by: OWNER, created_by: OWNER,
    priority: 'medium', due_date: daysFrom(5), tier_id: null, ...extra,
  }, OWNER)).data;

  console.log('\n== Tasks have no department, only a group ==');
  const nd = await mk('N no department');
  check('a task can be created with no department at all', !!nd?.id, JSON.stringify(nd));
  check('...and it really has none stored', (await pool.query('SELECT department_id FROM dmt_tasks WHERE id = $1', [nd.id])).rows[0].department_id === null);
  const sneaky = await mk('N2 sneaky', { department_id: (await pool.query('SELECT id FROM departments LIMIT 1')).rows[0].id });
  check('a department sent anyway is ignored', (await pool.query('SELECT department_id FROM dmt_tasks WHERE id = $1', [sneaky.id])).rows[0].department_id === null);
  await raw('POST', `/dmt/tasks/${nd.id}/fields`, { title: 'DEMO Flow N no department (edited)', department_id: (await pool.query('SELECT id FROM departments LIMIT 1')).rows[0].id }, OWNER);
  check('editing a task never sets a department either', (await pool.query('SELECT department_id FROM dmt_tasks WHERE id = $1', [nd.id])).rows[0].department_id === null);

  console.log('\n== Automatic In Progress ==');
  const a = await mk('A comment');
  await raw('POST', `/dmt/tasks/${a.id}/comment`, { text: 'looking at this' }, OTHER);
  check('someone else commenting does NOT start it', (await statusOf(a.id)) === 'open');
  await raw('POST', `/dmt/tasks/${a.id}/comment`, { text: 'on it' }, BE);
  check('BE Admin (not the owner) commenting does NOT start it', (await statusOf(a.id)) === 'open');
  await raw('POST', `/dmt/tasks/${a.id}/comment`, { text: 'starting now' }, OWNER);
  check('the owner commenting starts it', (await statusOf(a.id)) === 'in_progress');
  check('...and the history says it was automatic (once)', (await autoRows(a.id)) === 1);
  await raw('POST', `/dmt/tasks/${a.id}/comment`, { text: 'second comment' }, OWNER);
  check('a second owner comment does not repeat it', (await autoRows(a.id)) === 1 && (await statusOf(a.id)) === 'in_progress');

  const b = await mk('B due date');
  await raw('POST', `/dmt/tasks/${b.id}/due-date`, { new_due_date: daysFrom(9), reason: 'need more time' }, OWNER);
  check('the owner changing the due date starts it', (await statusOf(b.id)) === 'in_progress');

  const c = await mk('C edit');
  await raw('POST', `/dmt/tasks/${c.id}/fields`, { description: 'added detail' }, OWNER);
  check('the owner editing it starts it', (await statusOf(c.id)) === 'in_progress');

  const d = await mk('D reassign');
  await raw('POST', `/dmt/tasks/${d.id}/fields`, { owner_id: OTHER }, OWNER);
  check('the owner handing it to someone else does NOT start it', (await statusOf(d.id)) === 'open');

  const e = await mk('E edited by BE');
  await raw('POST', `/dmt/tasks/${e.id}/fields`, { description: 'boss note' }, BE);
  check('BE Admin editing it does NOT start it', (await statusOf(e.id)) === 'open');

  const f = await mk('F done');
  await raw('POST', `/dmt/tasks/${f.id}/status`, { new_status: 'completed', note: 'done' }, OWNER);
  await raw('POST', `/dmt/tasks/${f.id}/comment`, { text: 'thanks' }, OWNER);
  check('a finished task is not reopened by an owner comment', (await statusOf(f.id)) === 'completed');

  console.log('\n== Blocked needs a reason ==');
  const g = await mk('G block');
  let r = await raw('POST', `/dmt/tasks/${g.id}/status`, { new_status: 'blocked' }, OWNER);
  check('blocking with no reason is refused (400)', r.status === 400, `got ${r.status}`);
  r = await raw('POST', `/dmt/tasks/${g.id}/status`, { new_status: 'blocked', note: '   ' }, OWNER);
  check('blocking with a blank reason is refused (400)', r.status === 400, `got ${r.status}`);
  check('...and the task is unchanged', (await statusOf(g.id)) === 'open');
  r = await raw('POST', `/dmt/tasks/${g.id}/status`, { new_status: 'blocked', note: 'waiting for parts' }, OWNER);
  check('blocking with a reason works (200)', r.status === 200 && r.data.status === 'blocked', `got ${r.status}`);
  const why = (await pool.query(`SELECT update_note FROM dmt_task_updates WHERE task_id = $1 AND new_status = 'blocked'`, [g.id])).rows[0];
  check('the reason is kept in the history', why?.update_note === 'waiting for parts');
  await raw('POST', `/dmt/tasks/${g.id}/comment`, { text: 'still waiting' }, OWNER);
  check('an owner comment does not un-block it', (await statusOf(g.id)) === 'blocked');
  r = await raw('POST', `/dmt/tasks/${g.id}/status`, { new_status: 'in_progress' }, OWNER);
  check('Start / Resume still works on a blocked task with no reason needed', r.status === 200 && r.data.status === 'in_progress', `got ${r.status}`);

  console.log('\n== Only the assigner and the assignee can act ==');
  const MODLEAD = '555555';
  const h = await mk('H actors', { assigned_by: OTHER });   // owner OWNER, assigned by OTHER
  const who = { BE, MODLEAD };
  for (const [label, id] of Object.entries(who)) {
    let r = await raw('POST', `/dmt/tasks/${h.id}/status`, { new_status: 'in_progress' }, id);
    check(`${label} (not assigner/assignee) cannot change status (403)`, r.status === 403, `got ${r.status}`);
    r = await raw('POST', `/dmt/tasks/${h.id}/comment`, { text: 'hi' }, id);
    check(`${label} cannot comment (403)`, r.status === 403, `got ${r.status}`);
    r = await raw('POST', `/dmt/tasks/${h.id}/due-date`, { new_due_date: daysFrom(20), reason: 'x' }, id);
    check(`${label} cannot change the due date (403)`, r.status === 403, `got ${r.status}`);
    r = await raw('POST', `/dmt/tasks/${h.id}/fields`, { description: 'x' }, id);
    check(`${label} cannot edit it (403)`, r.status === 403, `got ${r.status}`);
    r = await raw('POST', `/dmt/tasks/${h.id}/escalate`, { to_emp_id: '666666' }, id);
    check(`${label} cannot escalate it (403)`, r.status === 403, `got ${r.status}`);
  }
  r = await raw('PATCH', `/dmt/tasks/${h.id}`, { title: 'DEMO Flow hijacked' }, BE);
  check('BE cannot change it through the generic edit route either (403)', r.status === 403, `got ${r.status}`);
  r = await raw('DELETE', `/dmt/tasks/${h.id}`, null, BE);
  check('BE cannot delete it (403)', r.status === 403, `got ${r.status}`);
  check('...and it is untouched', (await pool.query('SELECT title, status FROM dmt_tasks WHERE id = $1', [h.id])).rows[0].title === 'DEMO Flow H actors');
  r = await raw('POST', `/dmt/tasks/${h.id}/comment`, { text: 'assigner here' }, OTHER);
  check('the ASSIGNER can comment (201)', r.status === 201, `got ${r.status}`);
  check('...which does not auto-start it (only the owner does)', (await statusOf(h.id)) === 'open');
  r = await raw('POST', `/dmt/tasks/${h.id}/status`, { new_status: 'in_progress' }, OTHER);
  check('the ASSIGNER can change the status (200)', r.status === 200, `got ${r.status}`);
  r = await raw('POST', `/dmt/tasks/${h.id}/comment`, { text: 'assignee here' }, OWNER);
  check('the ASSIGNEE (owner) can comment (201)', r.status === 201, `got ${r.status}`);
  r = await raw('POST', `/dmt/tasks/${h.id}/escalate`, { to_emp_id: '666666', note: 'assigner escalates' }, OTHER);
  check('the ASSIGNER can escalate it (200)', r.status === 200 && r.data.owner_id === '666666', `got ${r.status}`);
  r = await raw('POST', `/dmt/tasks/${h.id}/status`, { new_status: 'completed', note: 'done' }, OWNER);
  check('the previous owner can no longer act once it has been handed on (403), the assigner still can', r.status === 403);
  r = await raw('POST', `/dmt/tasks/${h.id}/status`, { new_status: 'completed', note: 'done' }, OTHER);
  check('...assigner completes it (200)', r.status === 200, `got ${r.status}`);

  console.log('\n== Editing a task\'s group ==');
  const mkGroup = async (n) => (await raw('POST', '/dmt/tiers', { name: 'T2', display_name: `DEMO Flow Group ${n}`, lead_emp_id: '666666' }, BE)).data;
  const gA = await mkGroup('A'); const gB = await mkGroup('B'); const gC = await mkGroup('C');
  for (const g of [gA, gB]) await raw('POST', `/dmt/tiers/${g.id}/members`, { emp_id: OWNER }, BE);   // OWNER is in A and B, not C
  const gt = await mk('P group edit', { tier_id: gA.id });
  r = await raw('POST', `/dmt/tasks/${gt.id}/fields`, { tier_id: gB.id }, OWNER);
  check('the owner can move the task to another group they are in (200)', r.status === 200 && r.data.tier_id === gB.id, `got ${r.status} ${JSON.stringify(r.data)}`);
  r = await raw('POST', `/dmt/tasks/${gt.id}/fields`, { tier_id: gC.id }, OWNER);
  check('...but not to a group the owner is not in (refused)', r.status === 400 || r.status === 403, `got ${r.status}`);
  r = await raw('POST', `/dmt/tasks/${gt.id}/fields`, { tier_id: null }, OWNER);
  check('removing the group without making it private is refused (400)', r.status === 400, `got ${r.status}`);
  r = await raw('POST', `/dmt/tasks/${gt.id}/fields`, { tier_id: null, is_private: true }, OWNER);
  check('removing the group and making it private works (200)', r.status === 200 && r.data.tier_id === null && r.data.is_private === true, `got ${r.status}`);
  r = await raw('POST', `/dmt/tasks/${gt.id}/fields`, { tier_id: gA.id }, BE);
  check('BE Admin still cannot change it (403)', r.status === 403, `got ${r.status}`);
  const ge = await mk('P2 escalated', { tier_id: gA.id });
  await raw('POST', `/dmt/tasks/${ge.id}/escalate`, { to_emp_id: '666666' }, OWNER);
  r = await raw('POST', `/dmt/tasks/${ge.id}/fields`, { tier_id: gB.id }, '666666');
  check('an escalated task\'s group cannot be changed (400)', r.status === 400, `got ${r.status}`);
  r = await raw('POST', `/dmt/tasks/${gt.id}/fields`, { title: 'DEMO Flow P group edit (retitled)' }, OWNER);
  check('editing only the title leaves the group alone', r.status === 200 && r.data.tier_id === null, `got ${r.status}`);

  const removed = await clean();
  console.log(`\nCleaned up ${removed} test tasks.\n${pass} passed, ${fail} failed.`);
  await pool.end();
  process.exit(fail ? 1 : 0);
}
main().catch(async (e) => { console.error('ERROR:', e.message); await clean().catch(() => {}); await pool.end(); process.exit(2); });
