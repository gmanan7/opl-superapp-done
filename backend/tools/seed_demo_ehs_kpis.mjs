// Seeds 10 dummy KPI templates + 10 days of dummy daily entries each, for the EHS
// department only (per owner request — reference screenshots of an EHS KPI board).
// Identified for cleanup by (department = EHS, name in the list below) — no other
// department or KPI is touched.
//
//   node backend/tools/seed_demo_ehs_kpis.mjs         -> (re)create the 10 EHS KPIs + entries
//   node backend/tools/seed_demo_ehs_kpis.mjs clean   -> remove them, create nothing
//
// Idempotent: every run first deletes entries + KPI rows matching these names under EHS,
// then re-inserts, so values always match this script.
import { config } from 'dotenv';
config({ path: 'C:/Users/HP Pavilion/Documents/ITC/opl-done-superapp/opl-superapp-done/.env' });
import pg from 'pg';

const pool = new pg.Pool({
  host: process.env.DB_HOST, user: process.env.DB_USER,
  password: String(process.env.DB_PASSWORD), port: +process.env.DB_PORT, database: process.env.DB_DATABASE,
});

const SUBMITTER = '111111'; // whoever the dev/test worker id is

const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const DATES = Array.from({ length: 10 }, (_, i) => daysAgo(10 - i)); // oldest -> yesterday

// Each KPI: name, unit, target, green/amber thresholds (display only — status is set
// explicitly per entry below, not derived), and a fixed per-day [value, status] series.
const KPIS = [
  {
    name: 'PJO', unit: 'Nos', target: 0, green: 0, amber: 0,
    series: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    status: (v, i) => (i === DATES.length - 1 ? 'red' : 'green'),
  },
  {
    name: 'EHS Training Man-Hours', unit: 'Man-Hrs', target: null, green: null, amber: null,
    series: [0, 0, 0, 0, 8, 32, 38, 34, 2, 6],
    status: () => null,
  },
  {
    name: 'Hazards Spotted', unit: 'Nos', target: 2, green: 2, amber: 1,
    series: [0, 0, 0, 1, 0, 0, 0, 1, 3, 4],
    status: (v) => (v >= 2 ? 'green' : v >= 1 ? 'amber' : 'red'),
  },
  {
    name: 'Near Miss Reported', unit: 'Nos', target: 1, green: 1, amber: 0,
    series: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    status: () => 'red',
  },
  {
    name: 'Gemba Rounds - Dept Heads', unit: 'Nos', target: 1, green: 1, amber: 0,
    series: [0, 0, 0, 1, 0, 0, 0, 0, 0, 0],
    status: (v, i) => (i === 3 ? 'green' : 'amber'),
  },
  {
    name: 'PSI by EHS', unit: 'Nos', target: 0, green: 0, amber: 0,
    series: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    status: () => 'amber',
  },
  {
    name: 'LTI (Lost Time Incidents)', unit: 'Nos', target: 0, green: 0, amber: 1,
    series: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    status: () => 'green',
  },
  {
    name: 'First Aid Cases', unit: 'Nos', target: 0, green: 0, amber: 1,
    series: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    status: () => 'green',
  },
  {
    name: 'Fire-Related Incidents', unit: 'Nos', target: 0, green: 0, amber: 1,
    series: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    status: () => 'green',
  },
  {
    name: 'Man Hours Lost', unit: 'Hrs', target: 0, green: 0, amber: 8,
    series: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    status: () => 'green',
  },
];

async function main() {
  const clean = process.argv[2] === 'clean';
  const names = KPIS.map((k) => k.name);

  const deptRows = await pool.query(`SELECT id FROM departments WHERE name = 'EHS' LIMIT 1`);
  if (!deptRows.rows.length) throw new Error('No EHS department found');
  const deptId = deptRows.rows[0].id;

  const existing = await pool.query(
    `SELECT id FROM dmt_kpi_master WHERE department_id = $1 AND name = ANY($2)`,
    [deptId, names]
  );
  const existingIds = existing.rows.map((r) => r.id);
  if (existingIds.length) {
    await pool.query(`DELETE FROM dmt_kpi_entries WHERE kpi_id = ANY($1)`, [existingIds]);
    await pool.query(`DELETE FROM dmt_kpi_master WHERE id = ANY($1)`, [existingIds]);
  }
  console.log(`Removed ${existingIds.length} existing EHS demo KPI(s).`);

  if (clean) { console.log('Clean only — done.'); await pool.end(); return; }

  let order = 0;
  for (const k of KPIS) {
    const kpiRes = await pool.query(
      `INSERT INTO dmt_kpi_master
         (department_id, name, unit, kpi_type, frequency, direction, target_value,
          green_threshold, amber_threshold, display_order, is_active)
       VALUES ($1,$2,$3,'numeric','daily','higher_is_better',$4,$5,$6,$7,true)
       RETURNING id`,
      [deptId, k.name, k.unit, k.target, k.green, k.amber, order++]
    );
    const kpiId = kpiRes.rows[0].id;
    for (let i = 0; i < DATES.length; i++) {
      const value = k.series[i];
      const status = k.status(value, i);
      await pool.query(
        `INSERT INTO dmt_kpi_entries
           (kpi_id, reporting_date, actual_value, computed_status, submitted_by)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (kpi_id, reporting_date) DO UPDATE
           SET actual_value = EXCLUDED.actual_value, computed_status = EXCLUDED.computed_status`,
        [kpiId, DATES[i], value, status, SUBMITTER]
      );
    }
    console.log(`Seeded "${k.name}" (${DATES.length} entries).`);
  }

  console.log(`Done — ${KPIS.length} EHS KPIs seeded with dummy data.`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
