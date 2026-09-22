// Demo data for CloseLoop Meetings and the Meeting Audit Trail: 7 dummy meetings (completed, in progress, scheduled,
// cancelled) with invitees, attendance (some changed afterwards), meeting notes, discussion points with notes, and
// decisions — all made through the real API, so every change also lands in the audit trail. The audit rows are then
// spread over the days of each meeting so the date range, paging and filters have something to work on.
// Every title starts with "[DEMO] ".
//
//   node backend/tools/seed_demo_meetings.mjs          create (needs the backend running, restarted with the audit code)
//   node backend/tools/seed_demo_meetings.mjs clean    remove everything this script made
//
// Point it at another backend with DEMO_API=http://localhost:3111/api.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../.env') });
dotenv.config({ path: path.resolve(here, '../.env') });

const ROOT = process.env.DEMO_API || 'http://localhost:3000/api';
const API = ROOT + '/dmt';
const BE = '444444';
const OP = '222222';
const PREFIX = '[DEMO] ';

const pool = new pg.Pool(process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : { host: process.env.DB_HOST, user: process.env.DB_USER, password: String(process.env.DB_PASSWORD), port: process.env.DB_PORT, database: process.env.DB_DATABASE });

if (process.argv[2] === 'clean') {
    const meetings = (await pool.query('SELECT id FROM dmt_meetings WHERE title LIKE $1', [`${PREFIX}%`])).rows.map((r) => r.id);
    const decisions = (await pool.query('SELECT id FROM dmt_meeting_decisions WHERE meeting_id = ANY($1::uuid[])', [meetings])).rows.map((r) => r.id);
    await pool.query('DELETE FROM dmt_meeting_log WHERE meeting_title LIKE $1 OR meeting_id = ANY($2::uuid[])', [`${PREFIX}%`, meetings]);
    await pool.query('DELETE FROM dmt_meeting_decisions WHERE meeting_id = ANY($1::uuid[])', [meetings]);
    await pool.query('DELETE FROM dmt_meeting_discussion_points WHERE meeting_id = ANY($1::uuid[])', [meetings]);
    await pool.query('DELETE FROM dmt_meeting_attendance WHERE meeting_id = ANY($1::uuid[])', [meetings]);
    await pool.query('DELETE FROM dmt_meeting_invitees WHERE meeting_id = ANY($1::uuid[])', [meetings]);
    const r = await pool.query('DELETE FROM dmt_meetings WHERE id = ANY($1::uuid[])', [meetings]);
    await pool.query('DELETE FROM dmt_audit_logs WHERE record_id = ANY($1::uuid[])', [[...meetings, ...decisions]]);
    await pool.end();
    console.log(`Removed ${r.rowCount} demo meetings (with their invitees, attendance, points, decisions and audit rows).`);
    process.exit(0);
}

async function call(user, method, url, body, root = API) {
    const res = await fetch(root + url, { method, headers: { 'x-worker-id': user, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
    if (!res.ok) throw new Error(`${method} ${url} -> ${res.status} ${json?.error || text}`);
    return json;
}

const me = await call(BE, 'GET', '/me');
const factory = (await call(BE, 'GET', '/factory')).find((f) => f.code === me.factory_code);
if (!factory) throw new Error('Could not resolve the plant');
const tiers = (await call(BE, 'GET', '/tiers')).filter((t) => t.is_active);
if (!tiers.length) throw new Error('Create at least one active group (Organisation → Tiers) first — every meeting belongs to a group.');
const people = (await call(BE, 'GET', '/worker-names', null, ROOT)).filter((p) => p.is_active !== false && String(p.id || p.emp_id) !== BE).slice(0, 12);
const pid = (p) => String(p.id || p.emp_id);

const day = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const iso = (offset, hm) => new Date(`${day(offset)}T${hm}:00`).toISOString();

// [title, day offset, status, start, end, topics]
const plan = [
    ['Daily T4 review', -20, 'completed', '09:00', '09:30', ['Safety incidents', 'Yesterday output vs plan']],
    ['Daily T4 review', -13, 'completed', '09:00', '09:30', ['Quality complaints', 'Machine downtime', 'Customer escalations']],
    ['Weekly production sync', -6, 'completed', '14:00', '15:00', ['Line 3 changeover', 'Material shortages']],
    ['Daily T4 review', -2, 'completed', '09:00', '09:30', ['Open red KPIs']],
    ['Weekly production sync', 0, 'in_progress', '14:00', '15:00', ['Maintenance plan', 'Trial results']],
    ['Monthly review', 3, 'scheduled', '11:00', '12:00', ['Targets for next month']],
    ['Vendor meeting', 10, 'scheduled', '16:00', '16:45', []],
    ['Cancelled offsite', -4, 'cancelled', '10:00', '11:00', []],
];
const attendanceMix = ['present', 'present', 'present', 'absent', 'excused', 'present', 'present', 'absent'];

let n = 0;
const made = [];
for (const [title, off, status, start, end, topics] of plan) {
    const tier = tiers[n % tiers.length];
    const m = await call(BE, 'POST', '/meetings', {
        title: `${PREFIX}${title}`, scheduled_date: day(off), scheduled_start_time: start, scheduled_end_time: end,
        facilitator_id: BE, factory_id: factory.id, location: ['Conference room', 'Shop floor', 'Board room'][n % 3],
        tier_id: tier.id, created_by: BE,
    });
    // The group's people are on the attendance sheet from the start (the server puts them there). Add one or two people
    // from outside the group for this one meeting, the way a facilitator would.
    const invitees = await call(BE, 'GET', `/meeting-invitees?meeting_id=${m.id}`);
    const onSheet = new Set(invitees.map((i) => i.user_id));
    for (const p of people.filter((x) => !onSheet.has(pid(x))).slice(0, 1 + (n % 2))) {
        try { invitees.push(await call(BE, 'POST', '/meeting-invitees', { meeting_id: m.id, user_id: pid(p) })); } catch { /* already in the group */ }
    }

    if (status === 'in_progress' || status === 'completed') {
        await call(BE, 'PATCH', `/meetings/${m.id}`, { status: 'in_progress', actual_start: iso(off, start) });
        const att = [];
        for (let i = 0; i < invitees.length; i++) {
            // the facilitator (BE) marks everyone; the operator marks only their own name
            const own = invitees[i].user_id === OP;
            att.push(await call(own ? OP : BE, 'POST', '/meeting-attendance', { meeting_id: m.id, invitee_id: invitees[i].id, status: attendanceMix[(i + n) % attendanceMix.length] }));
        }
        // a correction or two afterwards (this is what the audit trail is really for)
        if (att[1]) await call(BE, 'PATCH', `/meeting-attendance/${att[1].id}`, { status: att[1].status === 'present' ? 'absent' : 'present' });
        if (att[2] && n % 2 === 0) await call(BE, 'PATCH', `/meeting-attendance/${att[2].id}`, { status: 'excused' });

        const points = [];
        for (let i = 0; i < topics.length; i++) points.push(await call(BE, 'POST', '/meeting-discussion-points', { meeting_id: m.id, title: topics[i], sequence: i + 1, created_by: BE }));
        for (let i = 0; i < points.length; i++) await call(BE, 'PATCH', `/meeting-discussion-points/${points[i].id}`, { notes: `Discussed ${topics[i].toLowerCase()} — actions agreed with the team.` });
        if (points.length > 1) {
            await call(BE, 'PATCH', `/meeting-discussion-points/${points[0].id}`, { sequence: 2 });
            await call(BE, 'PATCH', `/meeting-discussion-points/${points[1].id}`, { sequence: 1 });
        }
        await call(BE, 'PATCH', `/meetings/${m.id}`, { summary: `Draft notes for ${title}.` });
        await call(BE, 'PATCH', `/meetings/${m.id}`, { summary: `${title}: attendance was ${invitees.length ? 'good' : 'low'}. Key follow-ups captured under decisions.` });
        const dec = points[0]
            ? await call(BE, 'POST', '/meeting-decisions', { meeting_id: m.id, discussion_point_id: points[0].id, decision_text: `Owner to close ${topics[0].toLowerCase()} by Friday`, created_by: BE })
            : null;
        if (dec) await call(BE, 'PATCH', `/meeting-decisions/${dec.id}`, { decision_text: `Owner to close ${topics[0].toLowerCase()} by next Monday` });
        if (points[1]) await call(BE, 'POST', '/meeting-decisions', { meeting_id: m.id, discussion_point_id: points[1].id, decision_text: `Review ${topics[1].toLowerCase()} again next week`, created_by: BE });
        await call(BE, 'PATCH', `/meetings/${m.id}`, { location: 'Video call', scheduled_start_time: start });
    }
    if (status === 'completed') await call(BE, 'PATCH', `/meetings/${m.id}`, { status: 'completed', actual_end: iso(off, end) });
    if (status === 'cancelled') await call(BE, 'PATCH', `/meetings/${m.id}`, { status: 'cancelled' });
    if (status === 'scheduled' && invitees.length > 2) await call(BE, 'PATCH', `/meetings/${m.id}`, { title: `${PREFIX}${title} (rescheduled)` });
    made.push(m.id);
    n++;
}

// Spread each past meeting's audit rows over its own day (08:30 onwards, two minutes apart) instead of all "now".
await pool.query(`
    UPDATE dmt_meeting_log l
       SET changed_at = LEAST(now(), (m.scheduled_date::timestamp + interval '08:30') + x.rn * interval '2 minutes')
      FROM (SELECT id, meeting_id, row_number() OVER (PARTITION BY meeting_id ORDER BY changed_at) rn
              FROM dmt_meeting_log WHERE meeting_id = ANY($1::uuid[])) x
      JOIN dmt_meetings m ON m.id = x.meeting_id
     WHERE l.id = x.id AND m.scheduled_date <= CURRENT_DATE`, [made]);
await pool.query("UPDATE dmt_meetings SET created_at = scheduled_date::timestamp - interval '1 day' WHERE id = ANY($1::uuid[]) AND scheduled_date <= CURRENT_DATE", [made]);

const counts = (await pool.query("SELECT event, count(*)::int c FROM dmt_meeting_log WHERE meeting_title LIKE $1 GROUP BY 1 ORDER BY 2 DESC", [`${PREFIX}%`])).rows;
await pool.end();
console.log(`Created ${made.length} demo meetings.`);
console.log('Audit entries by type:', Object.fromEntries(counts.map((r) => [r.event, r.c])));
console.log('Remove them any time with:  node backend/tools/seed_demo_meetings.mjs clean');
