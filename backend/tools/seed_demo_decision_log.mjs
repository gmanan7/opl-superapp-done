// Seeds Decision Log test data via the REAL API — one small demo DMT + JH group (T3 + T2
// tiers), one T4/T3/T2-tagged meeting each, a few decisions per meeting (mixing linked-task
// and no-task, some overdue), so tier-scoped Decision Log visibility can be seen working end
// to end. Reuses the real factory-wide T4 tier if one already exists.
// Everything is prefixed "DEMO " so it's easy to spot and to clean up. Needs the backend running.
//
//   node backend/tools/seed_demo_decision_log.mjs         -> (re)create everything
//   node backend/tools/seed_demo_decision_log.mjs clean   -> remove it all, create nothing
import { config } from 'dotenv';
config({ path: 'C:/Users/HP Pavilion/Documents/ITC/opl-done-superapp/opl-superapp-done/.env' });
import pg from 'pg';

const pool = new pg.Pool({
  host: process.env.DB_HOST, user: process.env.DB_USER,
  password: String(process.env.DB_PASSWORD), port: +process.env.DB_PORT, database: process.env.DB_DATABASE,
});

const BASE = 'http://localhost:3000/api';
const BE = '444444'; // BE Admin — used to perform all admin-level creates
const DMT_NAME = 'DEMO Decision-Log DMT';
const JH_NAME = 'DEMO Decision-Log JH';
const PEOPLE = ['111111', '222222', '333333', '555555'];
const daysFrom = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

async function api(method, path, body, who = BE) {
  const res = await fetch(`${BASE}${path}`, {
    method, headers: { 'Content-Type': 'application/json', 'x-worker-id': who },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function cleanDb() {
  const meetingRows = await pool.query(`SELECT id FROM dmt_meetings WHERE title LIKE 'DEMO %'`);
  const meetingIds = meetingRows.rows.map((r) => r.id);
  if (meetingIds.length) {
    await pool.query(`DELETE FROM dmt_meeting_decisions WHERE meeting_id = ANY($1)`, [meetingIds]);
    await pool.query(`DELETE FROM dmt_meeting_discussion_points WHERE meeting_id = ANY($1)`, [meetingIds]);
    await pool.query(`DELETE FROM dmt_meetings WHERE id = ANY($1)`, [meetingIds]);
  }
  const taskRows = await pool.query(`SELECT id FROM dmt_tasks WHERE title LIKE 'DEMO Decision Task %'`);
  const taskIds = taskRows.rows.map((r) => r.id);
  if (taskIds.length) await pool.query(`DELETE FROM dmt_tasks WHERE id = ANY($1)`, [taskIds]);

  const dmtRows = await pool.query(`SELECT id FROM module_groups WHERE module = $1`, [DMT_NAME]);
  const dmtIds = dmtRows.rows.map((r) => r.id);
  const jhRows = dmtIds.length ? await pool.query(`SELECT id FROM jh_group WHERE module_group_id = ANY($1)`, [dmtIds]) : { rows: [] };
  const jhIds = jhRows.rows.map((r) => r.id);
  const tierRows = await pool.query(
    `SELECT id FROM dmt_tier WHERE dmt_id = ANY($1) OR jh_group_id = ANY($2)`,
    [dmtIds.length ? dmtIds : [null], jhIds.length ? jhIds : [null]]
  );
  const tierIds = tierRows.rows.map((r) => r.id);
  if (tierIds.length) await pool.query(`DELETE FROM dmt_tier WHERE id = ANY($1)`, [tierIds]);
  for (const id of jhIds) await api('DELETE', `/org/jh-groups/${id}`).catch(() => {});
  for (const id of dmtIds) await api('DELETE', `/org/module-groups/${id}`).catch(() => {});

  console.log(`Removed ${meetingIds.length} demo meetings, ${taskIds.length} demo tasks, ${tierIds.length} demo tiers, ${jhIds.length} demo JH group(s), ${dmtIds.length} demo DMT(s).`);
}

async function main() {
  const isClean = process.argv[2] === 'clean';
  await cleanDb();
  if (isClean) { console.log('Clean only — done.'); await pool.end(); return; }

  const factoryRows = await pool.query(`SELECT id FROM factory ORDER BY id LIMIT 1`);
  const factoryId = factoryRows.rows[0].id;
  const deptRows = await pool.query(`SELECT id FROM departments ORDER BY display_order LIMIT 1`);
  const deptId = deptRows.rows[0].id;

  const mg = await api('POST', '/org/module-groups', { module: DMT_NAME, factory_id: factoryId, module_lead_emp_id: '555555' });
  const t3 = await api('POST', '/dmt/tiers', { name: 'T3', dmt_id: mg.id });
  await api('PATCH', `/dmt/tiers/${t3.id}`, { is_active: true });
  const jg = await api('POST', '/org/jh-groups', { name: JH_NAME, module_group_id: mg.id, factory_id: factoryId, leader_emp_id: '333333' });
  const t2 = await api('POST', '/dmt/tiers', { name: 'T2', jh_group_id: jg.id });
  await api('PATCH', `/dmt/tiers/${t2.id}`, { is_active: true });
  await api('POST', `/dmt/tiers/${t2.id}/members`, { emp_id: '222222' });

  const tiers = await api('GET', '/dmt/tiers');
  let t4 = tiers.find((t) => t.name === 'T4' && !t.dmt_id && !t.jh_group_id);
  if (!t4) t4 = await api('POST', '/dmt/tiers', { name: 'T4' });
  await api('PATCH', `/dmt/tiers/${t4.id}`, { is_active: true });

  const rounds = [
    { tier: t4, label: 'T4', facilitator: '444444' },
    { tier: t3, label: 'T3', facilitator: '555555' },
    { tier: t2, label: 'T2', facilitator: '333333' },
  ];

  let taskCount = 0, decisionCount = 0;
  for (const [i, r] of rounds.entries()) {
    const meeting = await api('POST', '/dmt/meetings', {
      title: `DEMO ${r.label} Review — Decision Log Test`,
      scheduled_date: daysFrom(-i),
      scheduled_start_time: '09:00', scheduled_end_time: '09:30',
      facilitator_id: r.facilitator, factory_id: factoryId,
      tier_id: r.tier.id, created_by: r.facilitator,
    }, r.facilitator);

    // One decision with an overdue linked task, one with a linked completed task, one with no task.
    const overdueTask = await api('POST', '/dmt/tasks', {
      title: `DEMO Decision Task ${++taskCount}`, description: 'Follow-up from a logged decision.',
      department_id: deptId, owner_id: r.facilitator, assigned_by: r.facilitator, priority: 'high',
      status: 'open', due_date: daysFrom(-3), tier_id: r.tier.id, origin_type: 'standalone',
    }, r.facilitator);
    const doneTask = await api('POST', '/dmt/tasks', {
      title: `DEMO Decision Task ${++taskCount}`, description: 'Follow-up from a logged decision, already done.',
      department_id: deptId, owner_id: r.facilitator, assigned_by: r.facilitator, priority: 'medium',
      status: 'completed', due_date: daysFrom(-1), tier_id: r.tier.id, origin_type: 'standalone',
    }, r.facilitator);

    const d1 = await api('POST', '/dmt/meeting-decisions', {
      meeting_id: meeting.id, decision_text: `[${r.label}] Escalate the recurring downtime issue to maintenance.`, created_by: r.facilitator,
    }, r.facilitator);
    await api('PATCH', `/dmt/meeting-decisions/${d1.id}`, { linked_task_id: overdueTask.id }, r.facilitator);
    decisionCount++;

    const d2 = await api('POST', '/dmt/meeting-decisions', {
      meeting_id: meeting.id, decision_text: `[${r.label}] Confirm revised shift handover checklist.`, created_by: r.facilitator,
    }, r.facilitator);
    await api('PATCH', `/dmt/meeting-decisions/${d2.id}`, { linked_task_id: doneTask.id }, r.facilitator);
    decisionCount++;

    await api('POST', '/dmt/meeting-decisions', {
      meeting_id: meeting.id, decision_text: `[${r.label}] Noted — no further action needed this cycle.`, created_by: r.facilitator,
    }, r.facilitator);
    decisionCount++;
  }

  console.log(`Created 1 demo DMT, 1 demo JH group, T4/T3/T2-tagged meetings (${rounds.length}), ${taskCount} demo tasks, ${decisionCount} demo decisions.`);
  console.log('Log in as 222222 (T2 member only) to see just the T2 meeting under "My Tiers"; 333333/555555/444444 (Leads) to see cascaded/all.');
  await pool.end();
}

main().catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });
