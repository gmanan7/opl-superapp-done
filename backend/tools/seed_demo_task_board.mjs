// Seeds a realistic multi-tier Task Board test bed via the REAL API (not raw SQL inserts) —
// 5 dummy DMTs (module_groups), each with 4 JH groups (20 JH groups total), a T3 tier per DMT
// + a T2 tier per JH group (all active, with Leads + a couple of plain members), and ~50 dummy
// tasks spread across them with varied due dates (overdue / due today / future) and a few
// pushed once via the real due-date-change endpoint so they show up under "Carryover".
// Everything is prefixed "DEMO " so it's easy to spot and to clean up. Needs the backend running.
//
//   node backend/tools/seed_demo_task_board.mjs         -> (re)create everything
//   node backend/tools/seed_demo_task_board.mjs clean   -> remove it all, create nothing
import { config } from 'dotenv';
config({ path: 'C:/Users/HP Pavilion/Documents/ITC/opl-done-superapp/opl-superapp-done/.env' });
import pg from 'pg';

const pool = new pg.Pool({
  host: process.env.DB_HOST, user: process.env.DB_USER,
  password: String(process.env.DB_PASSWORD), port: +process.env.DB_PORT, database: process.env.DB_DATABASE,
});

const BASE = 'http://localhost:3000/api';
const BE = '444444'; // BE Admin — used to perform all admin-level creates
const DMT_PREFIX = 'DEMO DMT ';
const N_DMTS = 5;
const JH_PER_DMT = 4; // -> 20 JH groups total
const PEOPLE = ['111111', '222222', '333333', '444444', '555555']; // real seeded users
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
  const dmtRows = await pool.query(`SELECT id FROM module_groups WHERE module LIKE $1`, [`${DMT_PREFIX}%`]);
  const dmtIds = dmtRows.rows.map((r) => r.id);
  const jhRows = dmtIds.length ? await pool.query(`SELECT id FROM jh_group WHERE module_group_id = ANY($1)`, [dmtIds]) : { rows: [] };
  const jhIds = jhRows.rows.map((r) => r.id);
  const tierRows = await pool.query(
    `SELECT id FROM dmt_tier WHERE dmt_id = ANY($1) OR jh_group_id = ANY($2)`,
    [dmtIds.length ? dmtIds : [null], jhIds.length ? jhIds : [null]]
  );
  const tierIds = tierRows.rows.map((r) => r.id);
  const taskRows = await pool.query(`SELECT id FROM dmt_tasks WHERE title LIKE 'DEMO %'`);
  const taskIds = taskRows.rows.map((r) => r.id);

  if (taskIds.length) {
    await pool.query(`DELETE FROM dmt_task_updates WHERE task_id = ANY($1)`, [taskIds]);
    await pool.query(`DELETE FROM dmt_task_due_date_history WHERE task_id = ANY($1)`, [taskIds]);
    await pool.query(`DELETE FROM dmt_tasks WHERE id = ANY($1)`, [taskIds]);
  }
  if (tierIds.length) await pool.query(`DELETE FROM dmt_tier WHERE id = ANY($1)`, [tierIds]); // cascades member/kpi/task_viewer rows
  for (const id of jhIds) await api('DELETE', `/org/jh-groups/${id}`).catch(() => {});
  for (const id of dmtIds) await api('DELETE', `/org/module-groups/${id}`).catch(() => {});

  console.log(`Removed ${taskIds.length} demo tasks, ${tierIds.length} demo tiers, ${jhIds.length} demo JH groups, ${dmtIds.length} demo DMTs.`);
}

async function main() {
  const isClean = process.argv[2] === 'clean';
  await cleanDb();
  if (isClean) { console.log('Clean only — done.'); await pool.end(); return; }

  const factoryRows = await pool.query(`SELECT id FROM factory ORDER BY id LIMIT 1`);
  const factoryId = factoryRows.rows[0].id;
  const deptRows = await pool.query(`SELECT id FROM departments ORDER BY display_order LIMIT 1`);
  const deptId = deptRows.rows[0].id;

  let personIdx = 0;
  const nextPerson = () => PEOPLE[personIdx++ % PEOPLE.length];

  const jhTierIds = [];
  const dmtTierIds = [];

  for (let d = 1; d <= N_DMTS; d++) {
    const dmtLead = nextPerson();
    const dmtName = `${DMT_PREFIX}${d}`;
    const mg = await api('POST', '/org/module-groups', { module: dmtName, factory_id: factoryId, module_lead_emp_id: dmtLead });
    const t3 = await api('POST', '/dmt/tiers', { name: 'T3', dmt_id: mg.id });
    dmtTierIds.push(t3.id);

    for (let j = 1; j <= JH_PER_DMT; j++) {
      const jhLead = nextPerson();
      const jg = await api('POST', '/org/jh-groups', { name: `${dmtName} - JH ${String.fromCharCode(64 + j)}`, module_group_id: mg.id, factory_id: factoryId, leader_emp_id: jhLead });
      const t2 = await api('POST', '/dmt/tiers', { name: 'T2', jh_group_id: jg.id });
      jhTierIds.push(t2.id);
      // A couple of plain (non-lead) members, so member-level (not just Lead) visibility is testable too.
      await api('POST', `/dmt/tiers/${t2.id}/members`, { emp_id: nextPerson() });
      await api('POST', `/dmt/tiers/${t2.id}/members`, { emp_id: nextPerson() });
    }
  }
  console.log(`Created ${N_DMTS} DMTs (T3 tiers) and ${jhTierIds.length} JH groups (T2 tiers).`);

  // Reuse T4 if it already exists (real factory-wide tier), else create it; ensure active.
  const tiers = await api('GET', '/dmt/tiers');
  let t4 = tiers.find((t) => t.name === 'T4' && !t.dmt_id && !t.jh_group_id);
  if (!t4) t4 = await api('POST', '/dmt/tiers', { name: 'T4' });
  await api('PATCH', `/dmt/tiers/${t4.id}`, { is_active: true });

  const allTierIds = [t4.id, ...dmtTierIds, ...jhTierIds];
  const dueOffsets = [-5, -2, -1, 0, 0, 1, 3, 7, 14]; // negative = overdue, 0 = due today
  const priorities = ['low', 'medium', 'high', 'critical'];
  const statuses = ['open', 'open', 'in_progress', 'blocked', 'completed', 'cancelled'];
  let created = 0, carryover = 0;

  for (const tierId of allTierIds) {
    const nTasks = tierId === t4.id ? 6 : 2;
    for (let i = 0; i < nTasks; i++) {
      const owner = nextPerson();
      const offset = dueOffsets[(created + i) % dueOffsets.length];
      const status = statuses[(created + i) % statuses.length];
      const priority = priorities[(created + i) % priorities.length];
      const task = await api('POST', '/dmt/tasks', {
        title: `DEMO Task ${created + 1}`,
        description: `Dummy task for Task Board testing — due offset ${offset}d, status ${status}.`,
        department_id: deptId, owner_id: owner, assigned_by: owner, priority, status, due_date: daysFrom(offset),
        tier_id: tierId, origin_type: 'standalone',
      });
      created++;
      if (created % 4 === 0 && !['completed', 'cancelled'].includes(status)) {
        await api('POST', `/dmt/tasks/${task.id}/due-date`, { new_due_date: daysFrom(offset), reason: 'Pushed for demo/testing' });
        carryover++;
      }
    }
  }
  console.log(`Created ${created} demo tasks across ${allTierIds.length} tiers (${carryover} flagged as carryover).`);
  console.log('Demo people used as owners/leads (log in as any to test "My Tasks"): ' + PEOPLE.join(', '));
  await pool.end();
}

main().catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });
