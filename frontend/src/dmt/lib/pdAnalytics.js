// PD Cycle analytics, all based on a job's target dispatch date. Pure functions over the jobs already on the page.

const pad = (n) => String(n).padStart(2, '0');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Local calendar date as YYYY-MM-DD (not UTC, so "today" doesn't flip early in the morning in IST).
export const localIso = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const target = (j) => (j.target_dispatch_date ? String(j.target_dispatch_date).slice(0, 10) : null);

export const DUE_LABEL = {
    overdue: 'Overdue',
    week: 'Due in 7 days',
    month: 'Due rest of this month',
    none: 'No target date',
};

// One definition of each bucket, used by both the tiles and the board filter so the numbers always agree.
// Only jobs that are still open count (closed jobs are done, so they're never "overdue").
export function matchesDue(kind, job, isClosing, now = new Date()) {
    if (isClosing(job.stage)) return false;
    const t = target(job);
    const today = localIso(now);
    if (kind === 'none') return !t;
    if (!t) return false;
    if (kind === 'overdue') return t < today;
    if (kind === 'week') { const w = new Date(now); w.setDate(w.getDate() + 7); return t >= today && t <= localIso(w); }
    if (kind === 'month') return t >= today && t.slice(0, 7) === today.slice(0, 7);
    return false;
}

export function computePdAnalytics(jobs, isClosing, now = new Date()) {
    const today = localIso(now);
    const open = jobs.filter((j) => !isClosing(j.stage));
    const tiles = Object.fromEntries(Object.keys(DUE_LABEL).map((k) => [k, jobs.filter((j) => matchesDue(k, j, isClosing, now)).length]));

    // open jobs due per month: overdue first, then the next six months, then everything later
    const months = [];
    for (let i = 0; i < 6; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
        months.push({ key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, name: `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, value: 0 });
    }
    let later = 0;
    for (const j of open) {
        const t = target(j);
        if (!t || t < today) continue;
        const m = months.find((x) => x.key === t.slice(0, 7));
        if (m) m.value += 1; else later += 1;
    }
    const perMonth = [
        { name: 'Overdue', value: tiles.overdue, overdue: true },
        ...months.map(({ name, value }) => ({ name, value })),
        { name: 'Later', value: later },
    ];

    const overdueByStage = {};
    for (const j of open) if (matchesDue('overdue', j, isClosing, now)) overdueByStage[j.stage] = (overdueByStage[j.stage] || 0) + 1;

    // closed jobs: finished on or before the target date, or after it
    const closed = jobs.filter((j) => isClosing(j.stage));
    let onTime = 0; let late = 0; let noDate = 0;
    for (const j of closed) {
        const t = target(j);
        if (!t || !j.closed_at) { noDate += 1; continue; }
        if (localIso(new Date(j.closed_at)) <= t) onTime += 1; else late += 1;
    }

    return { total: jobs.length, open: open.length, tiles, perMonth, overdueByStage, closed: { total: closed.length, onTime, late, noDate } };
}
