// Dry run + demo data for task ESCALATION, via the REAL API (and direct DB reads for checks).
// Builds a small DEMO T4 > T3 > T2 chain (plus an unlinked group and a private group), each with
// its own per-group escalation days, and a set of tasks that exercise every path: auto-escalation
// (overdue past the group's N days), not-yet-due, no "Reports to" link, private group, manual
// escalation to a group / to a person (incl. from a private group), reassignment inside the
// escalated-to group, and the refusals (non-owner, private task, finished task).
//
// Everything is prefixed "DEMO Esc" so it is easy to spot and remove. Needs the backend running.
//
//   node backend/tools/seed_demo_escalation.mjs          -> (re)create data + run the pre-sweep checks
//   node backend/tools/seed_demo_escalation.mjs verify   -> after the hourly sweep has run: check auto-escalation + visibility
//   node backend/tools/seed_demo_escalation.mjs clean    -> remove it all
//
// Point it at another instance with DEMO_API=http://localhost:3111/api
import { config } from 'dotenv';
config({ path: 'C:/Users/HP Pavilion/Documents/ITC/opl-done-superapp/opl-superapp-done/.env' });
import pg from 'pg';

const pool = new pg.Pool({
  host: process.env.DB_HOST, user: process.env.DB_USER,
  password: String(process.env.DB_PASSWORD), port: +process.env.DB_PORT, database: process.env.DB_DATABASE,
});
const BASE = process.env.DEMO_API || 'http://localhost:3000/api';

const BE = '444444';       // BE Admin
const T4_LEAD = '555555';  // Module Leader
const T3_LEAD = '333333';  // JH Leader
const T3_MEMBER = '777777';
const T2_LEAD = '666666';
const OWNER = '222222';    // the person whose tasks go overdue
const PREFIX = 'DEMO Esc';
const daysFrom = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

async function raw(method, path, body, who = BE) {
  const res = await fetch(`${BASE}${path}`, {
    method, headers: { 'Content-Type': 'application/json', 'x-worker-id': who },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  return { status: res.status, data };
}
async function api(method, path, body, who = BE) {
  const r = await raw(method, path, body, who);
  if (r.status >= 300) throw new Error(`${method} ${path} -> ${r.status}: ${JSON.stringify(r.data)}`);
  return r.data;
}

let pass = 0; let fail = 0;
function check(name, ok, detail = '') {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); } else { fail += 1; console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`); }
}

async function cleanDb() {
  const t = await pool.query(`SELECT id FROM dmt_tasks WHERE title LIKE $1`, [`${PREFIX}%`]);
  const ids = t.rows.map((r) => r.id);
  if (ids.length) {
    await pool.query(`DELETE FROM dmt_task_updates WHERE task_id = ANY($1)`, [ids]);
    await pool.query(`DELETE FROM dmt_task_due_date_history WHERE task_id = ANY($1)`, [ids]);
    await pool.query(`DELETE FROM notification WHERE module = 'dmt' AND entity_id = ANY($1::text[])`, [ids.map(String)]);
    await pool.query(`DELETE FROM dmt_tasks WHERE id = ANY($1)`, [ids]);
  }
  await pool.query(`DELETE FROM dmt_meetings WHERE title LIKE $1`, [`${PREFIX}%`]);
  const tiers = await pool.query(`SELECT id FROM dmt_tier WHERE display_name LIKE $1`, [`${PREFIX}%`]);
  const tierIds = tiers.rows.map((r) => r.id);
  if (tierIds.length) {
    // children first (parent_tier_id is a self FK)
    await pool.query(`UPDATE dmt_tier SET parent_tier_id = NULL WHERE id = ANY($1)`, [tierIds]);
    await pool.query(`DELETE FROM dmt_tier WHERE id = ANY($1)`, [tierIds]);
  }
  console.log(`Removed ${ids.length} demo tasks and ${tierIds.length} demo groups.`);
}

async function findDemo() {
  const tiers = (await pool.query(`SELECT * FROM dmt_tier WHERE display_name LIKE $1`, [`${PREFIX}%`])).rows;
  const byName = Object.fromEntries(tiers.map((t) => [t.display_name, t]));
  const tasks = (await pool.query(`SELECT * FROM dmt_tasks WHERE title LIKE $1`, [`${PREFIX}%`])).rows;
  const byTitle = Object.fromEntries(tasks.map((t) => [t.title.replace(`${PREFIX} `, '').split(' ')[0], t]));
  return { byName, byTitle };
}

async function seed() {
  await cleanDb();

  console.log('\n== Groups ==');
  const mk = async (name, level, lead, parent, extra = {}) => api('POST', '/dmt/tiers', {
    name: level, display_name: `${PREFIX} ${name}`, lead_emp_id: lead, parent_tier_id: parent || undefined, ...extra,
  });
  const t4 = await mk('T4', 'T4', T4_LEAD);
  const t3 = await mk('T3', 'T3', T3_LEAD, t4.id);
  const t2 = await mk('T2', 'T2', T2_LEAD, t3.id);
  const unlinked = await mk('Unlinked T2', 'T2', T2_LEAD, null);
  const priv = await mk('Private T2', 'T2', T2_LEAD, t3.id, { is_private: true });
  for (const [tier, emps] of [[t3, [T3_MEMBER, BE]], [t2, [OWNER]], [unlinked, [OWNER]], [priv, [OWNER]]]) {
    for (const e of emps) await api('POST', `/dmt/tiers/${tier.id}/members`, { emp_id: e });
  }
  check('private group flagged private', priv.is_private === true);
  const nonBePrivate = await raw('POST', '/dmt/tiers', { name: 'T2', display_name: `${PREFIX} nope`, lead_emp_id: T2_LEAD, is_private: true }, T3_LEAD);
  check('non-BE cannot create a private group (403)', nonBePrivate.status === 403, `got ${nonBePrivate.status}`);

  console.log('\n== Per-group auto-escalation setting ==');
  let r = await raw('PATCH', `/dmt/tiers/${t2.id}`, { escalation_days: 2 }, OWNER);
  check('non-BE cannot set escalation days (403)', r.status === 403, `got ${r.status}`);
  r = await raw('PATCH', `/dmt/tiers/${t2.id}`, { escalation_days: 0 });
  check('0 days rejected (400)', r.status === 400, `got ${r.status}`);
  r = await raw('PATCH', `/dmt/tiers/${t4.id}`, { escalation_days: 2 });
  check('T4 cannot auto-escalate (400)', r.status === 400, `got ${r.status}`);
  r = await raw('PATCH', `/dmt/tiers/${priv.id}`, { escalation_days: 2 });
  check('private group cannot auto-escalate (400)', r.status === 400, `got ${r.status}`);
  r = await raw('PATCH', `/dmt/tiers/${t2.id}`, { escalation_days: 2 });
  check('BE sets T2 = 2 days', r.status === 200 && r.data.escalation_days === 2, `got ${r.status}`);
  r = await raw('PATCH', `/dmt/tiers/${t3.id}`, { escalation_days: 3 });
  check('BE sets T3 = 3 days (per-group, different value)', r.status === 200 && r.data.escalation_days === 3, `got ${r.status}`);
  r = await raw('PATCH', `/dmt/tiers/${unlinked.id}`, { escalation_days: 2 });
  check('BE sets Unlinked T2 = 2 days', r.status === 200, `got ${r.status}`);

  console.log('\n== Tasks ==');
  const mkTask = async (key, title, tierId, owner, due, extra = {}) => api('POST', '/dmt/tasks', {
    title: `${PREFIX} ${key} ${title}`, owner_id: owner, assigned_by: owner, created_by: owner,
    priority: 'medium', due_date: due, tier_id: tierId || null, ...extra,
  }, owner);
  await mkTask('A', 'overdue 5d in T2 (auto -> T3 Lead)', t2.id, OWNER, daysFrom(-5));
  await mkTask('B', 'overdue 1d in T2 (not yet)', t2.id, OWNER, daysFrom(-1));
  await mkTask('C', 'overdue 10d, group has no link (no auto)', unlinked.id, OWNER, daysFrom(-10));
  await mkTask('D', 'overdue 10d in private group (no auto)', priv.id, OWNER, daysFrom(-10));
  await mkTask('E', 'overdue 6d in T3 (auto -> T4 Lead)', t3.id, T3_MEMBER, daysFrom(-6));
  const F = await mkTask('F', 'manual to a group', t2.id, OWNER, daysFrom(3));
  const G = await mkTask('G', 'manual from private group to a person', priv.id, OWNER, daysFrom(2));
  const H = await mkTask('H', 'private task', null, OWNER, daysFrom(2), { is_private: true });
  const I = await mkTask('I', 'completed task', t2.id, OWNER, daysFrom(2));
  const J = await mkTask('J', 'manual from private group to a group', priv.id, OWNER, daysFrom(2));

  console.log('\n== Tasks that came from a meeting ==');
  const meeting = await api('POST', '/dmt/meetings', {
    title: `${PREFIX} Weekly Review`, scheduled_date: daysFrom(-9), scheduled_start_time: '10:00', scheduled_end_time: '11:00',
    facilitator_id: T2_LEAD, factory_id: t2.factory_id, tier_id: t2.id, created_by: BE,
  });
  const fromMeeting = { origin_type: 'meeting', origin_meeting_id: meeting.id };
  await mkTask('M1', 'from meeting, still on track', t2.id, OWNER, daysFrom(4), fromMeeting);
  await mkTask('M2', 'from meeting, overdue (auto -> T3 Lead)', t2.id, OWNER, daysFrom(-8), fromMeeting);
  const M3 = await mkTask('M3', 'from meeting, escalated by hand', t2.id, OWNER, daysFrom(5), fromMeeting);
  r = await raw('POST', `/dmt/tasks/${M3.id}/escalate`, { to_tier_id: t3.id, note: 'needs a decision' }, OWNER);
  check('meeting-origin task M3 escalated by hand and keeps its meeting', r.status === 200 && r.data.origin_meeting_id === meeting.id, JSON.stringify(r.data));

  console.log('\n== Manual escalation ==');
  r = await raw('POST', `/dmt/tasks/${F.id}/escalate`, { to_tier_id: t3.id }, T2_LEAD);
  check('non-owner cannot escalate (403)', r.status === 403, `got ${r.status}`);
  r = await raw('POST', `/dmt/tasks/${F.id}/escalate`, { note: 'blocked on materials' }, OWNER);
  check('must pick a group or person (400)', r.status === 400, `got ${r.status}`);
  r = await raw('POST', `/dmt/tasks/${F.id}/escalate`, { to_tier_id: t3.id, note: 'blocked on materials' }, OWNER);
  check('owner escalates F to the T3 group -> goes to its Lead', r.status === 200 && r.data.owner_id === T3_LEAD && r.data.escalated_to_tier_id === t3.id && r.data.escalation_type === 'manual' && r.data.escalated_from_owner_id === OWNER, JSON.stringify(r.data));
  r = await raw('POST', `/dmt/tasks/${G.id}/escalate`, { to_emp_id: T3_MEMBER }, OWNER);
  check('private-group task G escalated by hand to a person (allowed)', r.status === 200 && r.data.owner_id === T3_MEMBER && r.data.escalated_to_tier_id === null, JSON.stringify(r.data));
  r = await raw('POST', `/dmt/tasks/${J.id}/escalate`, { to_tier_id: t3.id }, OWNER);
  check('private-group task J escalated by hand to a group (allowed)', r.status === 200 && r.data.owner_id === T3_LEAD, JSON.stringify(r.data));
  r = await raw('POST', `/dmt/tasks/${H.id}/escalate`, { to_tier_id: t3.id }, OWNER);
  check('a private TASK cannot be escalated (400)', r.status === 400, `got ${r.status}`);
  await api('POST', `/dmt/tasks/${I.id}/status`, { new_status: 'completed', note: 'done' }, OWNER);
  r = await raw('POST', `/dmt/tasks/${I.id}/escalate`, { to_tier_id: t3.id }, OWNER);
  check('a finished task cannot be escalated (409)', r.status === 409, `got ${r.status}`);
  check('a private group is not offered as a target', !(await raw('GET', '/dmt/escalation-targets', null, OWNER)).data.some((g) => g.id === priv.id));

  console.log('\n== Extra cards (Escalated column paging + equal card size) ==');
  for (let i = 1; i <= 8; i += 1) {
    const title = i === 5 ? 'extra escalated card with a very very long title that must be cut off to one line, never growing the card' : `extra escalated card ${i}`;
    const k = await mkTask(`K${i}`, title, t2.id, OWNER, daysFrom(1 + i));
    await api('POST', `/dmt/tasks/${k.id}/escalate`, { to_tier_id: t3.id, note: `demo ${i}` }, OWNER);
  }
  await mkTask('L1', 'a task with no group and a very long title that also has to stay on a single line', null, OWNER, daysFrom(-3));
  const esc = (await api('GET', '/dmt/tasks', null, BE)).filter((x) => x.title.startsWith(`${PREFIX} `) && x.escalated_at && !['completed', 'cancelled'].includes(x.status));
  check('Escalated column has more than 5 cards (so it pages)', esc.length > 5, `only ${esc.length}`);

  console.log('\n== Reassign inside the escalated-to group ==');
  r = await raw('POST', `/dmt/tasks/${F.id}/fields`, { owner_id: T3_MEMBER }, T2_LEAD);
  check('someone who is not the current owner cannot reassign (403)', r.status === 403, `got ${r.status}`);
  r = await raw('POST', `/dmt/tasks/${F.id}/fields`, { owner_id: T4_LEAD }, T3_LEAD);
  check('cannot reassign to someone outside the escalated-to group (400)', r.status === 400, `got ${r.status}`);
  r = await raw('POST', `/dmt/tasks/${F.id}/fields`, { owner_id: T3_MEMBER }, T3_LEAD);
  check('Lead reassigns to a member of their group (200)', r.status === 200 && r.data.owner_id === T3_MEMBER, `got ${r.status}`);

  console.log(`\nSeeded. Auto-escalation of A and E happens on the hourly sweep (or ~20s after a backend restart).`);
}

async function verify() {
  const { byTitle: t } = await findDemo();
  console.log('\n== After the sweep: auto-escalation ==');
  check('A (5d overdue, T2 limit 2d, linked) escalated automatically to the T3 Lead',
    !!t.A?.escalated_at && t.A.escalation_type === 'auto' && t.A.owner_id === T3_LEAD && t.A.escalated_from_owner_id === OWNER,
    JSON.stringify({ e: t.A?.escalated_at, type: t.A?.escalation_type, owner: t.A?.owner_id }));
  check('E (6d overdue, T3 limit 3d) escalated automatically to the T4 Lead',
    !!t.E?.escalated_at && t.E.escalation_type === 'auto' && t.E.owner_id === T4_LEAD, JSON.stringify({ e: t.E?.escalated_at, owner: t.E?.owner_id }));
  check('M2 (from a meeting, 8d overdue) escalated automatically and still points at its meeting', !!t.M2?.escalated_at && t.M2.escalation_type === 'auto' && !!t.M2.origin_meeting_id, JSON.stringify({ e: t.M2?.escalated_at, m: t.M2?.origin_meeting_id }));
  const mtgs = await api('GET', '/dmt/meetings', null, BE);
  check('the source meeting can be looked up (name + date)', mtgs.some((m) => m.id === t.M2?.origin_meeting_id && m.title.startsWith(PREFIX) && !!m.scheduled_date));
  check('B (1d overdue, limit 2d) NOT escalated yet', !t.B?.escalated_at);
  check('C (group has no Reports-to link) NOT escalated', !t.C?.escalated_at);
  check('D (private group) NOT escalated automatically', !t.D?.escalated_at);
  check('H (private task) and I (finished) untouched', !t.H?.escalated_at && !t.I?.escalated_at);

  const upd = await pool.query(`SELECT 1 FROM dmt_task_updates WHERE task_id = $1 AND update_type = 'escalation'`, [t.A.id]);
  check('history row recorded for A', upd.rows.length === 1);
  const note = await pool.query(`SELECT 1 FROM notification WHERE module = 'dmt' AND kind = 'dmt_task_escalated' AND entity_id = $1 AND recipient_emp_id = $2`, [String(t.A.id), T3_LEAD]);
  check('T3 Lead was notified about A', note.rows.length === 1);

  console.log('\n== Visibility (each person\'s own Task Board list) ==');
  const titlesFor = async (who) => (await api('GET', '/dmt/tasks', null, who)).map((x) => x.title.replace(`${PREFIX} `, '').split(' ')[0]).filter((k) => /^[A-J]$/.test(k)).sort().join('');
  const v333 = await titlesFor(T3_LEAD);
  check('T3 Lead sees escalated A and J, and NOT un-escalated B/C/D', v333.includes('A') && v333.includes('J') && !/[BCD]/.test(v333), v333);
  const v555 = await titlesFor(T4_LEAD);
  check('T4 Lead sees E (escalated to them) but NOT A/B/C/D (no downward cascade)', v555.includes('E') && !/[ABCD]/.test(v555), v555);
  const v777 = await titlesFor(T3_MEMBER);
  check('T3 member sees A (escalated to their group) and E (their own group)', v777.includes('A') && v777.includes('E'), v777);
  const v222 = await titlesFor(OWNER);
  check('original owner still sees B, C, D, and the escalated A on their own group board', /B/.test(v222) && /C/.test(v222) && /D/.test(v222) && v222.includes('A'), v222);
  const v666 = await titlesFor(T2_LEAD);
  check('T2 Lead (not a T3 member) does not see T3-only task E', !v666.includes('E'), v666);

  console.log(`\n${pass} passed, ${fail} failed.`);
}

async function main() {
  const mode = process.argv[2];
  if (mode === 'clean') { await cleanDb(); }
  else if (mode === 'verify') { await verify(); }
  else { await seed(); console.log(`\n${pass} passed, ${fail} failed (pre-sweep checks).`); }
  await pool.end();
  process.exit(fail ? 1 : 0);
}
main().catch(async (e) => { console.error('ERROR:', e.message); await pool.end(); process.exit(2); });
