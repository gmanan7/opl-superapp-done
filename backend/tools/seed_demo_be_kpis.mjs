// Seeds 6 dummy KPI templates + 4 days of dummy daily entries each, for the
// Business Excellence department only (per owner reference screenshot).
// Identified for cleanup by (department = Business Excellence, name in the list below).
//
//   node backend/tools/seed_demo_be_kpis.mjs         -> (re)create the 6 BE KPIs + entries
//   node backend/tools/seed_demo_be_kpis.mjs clean   -> remove them, create nothing
//
// Idempotent: every run first deletes entries + KPI rows matching these names under BE,
// then re-inserts, so values always match this script.
import { config } from 'dotenv';
config({ path: 'C:/Users/HP Pavilion/Documents/ITC/opl-done-superapp/opl-superapp-done/.env' });
import pg from 'pg';

const pool = new pg.Pool({
  host: process.env.DB_HOST, user: process.env.DB_USER,
  password: String(process.env.DB_PASSWORD), port: +process.env.DB_PORT, database: process.env.DB_DATABASE,
});

const SUBMITTER = '111111';
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const DATES = Array.from({ length: 4 }, (_, i) => daysAgo(4 - i)); // oldest -> yesterday

const KPIS = [
  {
    name: 'FIP - SFM Wastage KPI (MTD)', unit: '%', target: 6, green: null, amber: null,
    aggregation: 'average',
    series: [null, null, null, null],
    status: () => null,
  },
  {
    name: 'FIP - RFM Process Wastage KPI (MTD)', unit: '%', target: null, green: null, amber: null,
    aggregation: 'average',
    series: [7, 11, 8, 11],
    status: () => null,
  },
  {
    name: 'FIP - RFM OEE KPI', unit: '%', target: 85, green: 83, amber: 55,
    aggregation: 'average',
    series: [83, 50, 50, 13],
    status: (v, i) => (i === 0 ? 'green' : 'red'),
  },
  {
    name: 'Training Hours', unit: 'Hrs', target: null, green: null, amber: null,
    aggregation: 'sum',
    series: [0, 0, 10, 0],
    status: () => null,
  },
  {
    name: 'Fulcrum Meeting Compliance', unit: 'Nos', target: null, green: null, amber: null,
    aggregation: 'sum',
    series: [0, 1, 2, 1],
    status: () => null,
  },
  {
    name: 'JH Audit Score', unit: 'Score', target: null, green: null, amber: null,
    aggregation: 'average',
    series: [null, 63, null, null],
    status: () => null,
  },
];

async function main() {
  const clean = process.argv[2] === 'clean';
  const names = KPIS.map((k) => k.name);

  const deptRows = await pool.query(`SELECT id FROM departments WHERE name = 'Business Excellence' LIMIT 1`);
  if (!deptRows.rows.length) throw new Error('No Business Excellence department found');
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
  console.log(`Removed ${existingIds.length} existing BE demo KPI(s).`);

  if (clean) { console.log('Clean only — done.'); await pool.end(); return; }

  let order = 0;
  for (const k of KPIS) {
    const kpiRes = await pool.query(
      `INSERT INTO dmt_kpi_master
         (department_id, name, unit, kpi_type, frequency, direction, target_value,
          green_threshold, amber_threshold, display_order, is_active, mtd_aggregation)
       VALUES ($1,$2,$3,'numeric','daily','higher_is_better',$4,$5,$6,$7,true,$8)
       RETURNING id`,
      [deptId, k.name, k.unit, k.target, k.green, k.amber, order++, k.aggregation]
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

  console.log(`Done — ${KPIS.length} Business Excellence KPIs seeded with dummy data.`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
