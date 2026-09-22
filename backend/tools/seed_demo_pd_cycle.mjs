// Demo data for the DMT PD Cycle page: ~30 dummy PD jobs spread over every stage, all four categories, several
// customers, overdue and future target dates, a few comments, a few jobs moved back a stage, and a respawn.
// Every title starts with "[DEMO] " so it can't be mistaken for real work.
//
//   node backend/tools/seed_demo_pd_cycle.mjs          create the demo jobs (needs the backend running)
//   node backend/tools/seed_demo_pd_cycle.mjs clean    remove everything this script made
//
// Uses the real API (so stage rules, history and the audit trail are exercised exactly as in the app) as BE Admin
// 444444 and operator 222222. Point it at another backend with DEMO_API=http://localhost:3111/api.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../.env') });
dotenv.config({ path: path.resolve(here, '../.env') });

const API = (process.env.DEMO_API || 'http://localhost:3000/api') + '/dmt';
const BE = '444444';
const OP = '222222';
const PREFIX = '[DEMO] ';

const pool = () => new pg.Pool(process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : { host: process.env.DB_HOST, user: process.env.DB_USER, password: String(process.env.DB_PASSWORD), port: process.env.DB_PORT, database: process.env.DB_DATABASE });

if (process.argv[2] === 'clean') {
    const p = pool();
    const ids = (await p.query('SELECT id FROM dmt_pd_jobs WHERE title LIKE $1', [`${PREFIX}%`])).rows.map((r) => r.id);
    await p.query('DELETE FROM dmt_pd_log WHERE job_title LIKE $1', [`${PREFIX}%`]);
    await p.query('DELETE FROM dmt_pd_jobs WHERE title LIKE $1 AND previous_job_id IS NOT NULL', [`${PREFIX}%`]);
    const r = await p.query('DELETE FROM dmt_pd_jobs WHERE title LIKE $1', [`${PREFIX}%`]);
    await p.query("DELETE FROM dmt_audit_logs WHERE table_name = 'dmt_pd_jobs' AND record_id = ANY($1::uuid[])", [ids]);
    await p.end();
    console.log(`Removed ${r.rowCount + 0} demo PD jobs (and their comments, history and audit rows).`);
    process.exit(0);
}

async function call(user, method, url, body) {
    const res = await fetch(API + url, { method, headers: { 'x-worker-id': user, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
    if (!res.ok) throw new Error(`${method} ${url} -> ${res.status} ${json?.error || text}`);
    return json;
}

const me = await call(BE, 'GET', '/me');
const factory = (await call(BE, 'GET', '/factory')).find((f) => f.code === me.factory_code);
if (!factory) throw new Error('Could not resolve the plant');
const cats = await call(BE, 'GET', '/pd-categories');
const stages = await call(BE, 'GET', '/pd-stages');
const active = stages.filter((s) => !s.is_removed && s.kind === 'active');
const closing = stages.filter((s) => !s.is_removed && s.kind === 'closing');
const catId = (name) => cats.find((c) => c.name === name && c.is_active)?.id || cats.find((c) => c.is_active).id;

const day = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); };
const customers = ['Acme Foods', 'Bright Tobacco Co', 'Crest Labels', 'Delta Packaging', 'Everest Spirits', 'Fusion Snacks'];
const products = ['Folding carton', 'Cigarette pack', 'Pouch', 'Wet-glue label', 'Sleeve', 'Lidding film'];
const substrates = ['SBS 300gsm', 'FBB 350gsm', 'BOPP 30mic', 'PET 12mic', 'Paper 80gsm'];
const catNames = ['Cartons', 'Tobacco', 'Flexibles', 'Labels'];

// [count, how far along it gets]: `to` = index of the in-progress stage it stops in, `end` = index of the closing stage
// it finishes in. Built from the stage list as it is right now, so every column gets jobs however many stages BE Admin set up.
const plan = [
    ...active.map((_, i) => [i === 0 ? 6 : 5, { to: i, comments: i % 2 ? 2 : 0 }]),
    ...(active.length > 1 ? [[2, { to: 1, backOnce: true }]] : []),
    ...closing.map((_, i) => [i === closing.length - 1 ? 2 : 3, { end: i }]),
];

let n = 0;
const created = [];
for (const [count, how] of plan) {
    for (let i = 0; i < count; i++, n++) {
        const cat = catNames[n % catNames.length];
        const job = await call(n % 5 === 4 ? OP : BE, 'POST', '/pd-jobs', {
            factory_id: factory.id,
            title: `${PREFIX}${products[n % products.length]} — ${customers[n % customers.length]} #${n + 1}`,
            customer: customers[n % customers.length],
            product: products[n % products.length],
            substrate: substrates[n % substrates.length],
            target_dispatch_date: day([-20, -7, -2, 5, 12, 30, 60][n % 7]),
            category_id: catId(cat),
            created_by: n % 5 === 4 ? OP : BE,
        });
        // walk it forward through the in-progress stages
        const lastActive = how.end !== undefined ? active.length - 1 : how.to;
        for (let s = 1; s <= lastActive; s++) await call(BE, 'POST', `/pd-jobs/${job.id}/stage`, { new_stage: active[s].key, note: s === 1 ? 'Started trial' : null });
        if (how.backOnce) {
            await call(BE, 'POST', `/pd-jobs/${job.id}/stage`, { new_stage: active[lastActive - 1].key, note: 'Customer changed the artwork — redo trial' });
            await call(BE, 'POST', `/pd-jobs/${job.id}/stage`, { new_stage: active[lastActive].key, note: 'Back on track' });
        }
        if (how.end !== undefined) {
            const c = closing[how.end];
            await call(BE, 'POST', `/pd-jobs/${job.id}/stage`, { new_stage: c.key, feedback_note: c.requires_note ? 'Demo: customer feedback recorded' : null });
        }
        for (let k = 0; k < (how.comments || 0); k++) {
            await call(BE, 'POST', '/pd-job-comments', { job_id: job.id, author_id: BE, body: ['Sample sent to customer', 'Waiting for approval on colour match', 'Press trial booked for Monday'][k % 3] });
        }
        created.push({ id: job.id, end: how.end, closingKey: how.end !== undefined ? closing[how.end].key : null });
    }
}

// a respawn from the first job that ended in a "needs a note" closing stage
const dead = created.find((c) => c.closingKey && closing.find((s) => s.key === c.closingKey)?.requires_note);
if (dead) await call(BE, 'POST', `/pd-jobs/${dead.id}/spawn`, { respawn_reason: 'Demo: trying again with new substrate' });

const counts = {};
for (const j of await call(BE, 'GET', '/pd-jobs')) if (j.title.startsWith(PREFIX)) counts[j.stage] = (counts[j.stage] || 0) + 1;
console.log(`Created ${n}${dead ? ' + 1 respawn' : ''} demo PD jobs.`, counts);
console.log('Remove them any time with:  node backend/tools/seed_demo_pd_cycle.mjs clean');
