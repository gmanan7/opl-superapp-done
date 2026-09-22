// PD Cycle pure logic. The stages themselves (names, order, which are closing) live in the database and are
// managed by BE Admin (Organisation → PD Cycle Stages); this file only turns that list into what the page needs.

// Colours a stage can have. Full class strings on purpose so Tailwind keeps them.
export const PD_TONES = {
    blue: { pill: 'bg-blue-100 text-blue-700', bar: 'border-l-blue-400' },
    amber: { pill: 'bg-amber-100 text-amber-700', bar: 'border-l-amber-400' },
    purple: { pill: 'bg-purple-100 text-purple-700', bar: 'border-l-purple-400' },
    emerald: { pill: 'bg-emerald-100 text-emerald-700', bar: 'border-l-emerald-400' },
    rose: { pill: 'bg-rose-100 text-rose-700', bar: 'border-l-rose-400' },
    slate: { pill: 'bg-slate-100 text-slate-500', bar: 'border-l-slate-300' },
    teal: { pill: 'bg-teal-100 text-teal-700', bar: 'border-l-teal-400' },
    indigo: { pill: 'bg-indigo-100 text-indigo-700', bar: 'border-l-indigo-400' },
    orange: { pill: 'bg-orange-100 text-orange-700', bar: 'border-l-orange-400' },
    cyan: { pill: 'bg-cyan-100 text-cyan-700', bar: 'border-l-cyan-400' },
};

// rows = GET /api/dmt/pd-stages (every stage incl. removed ones, so old history keeps its label).
export function buildStages(rows = []) {
    const byKey = Object.fromEntries(rows.map((s) => [s.key, s]));
    const live = rows.filter((s) => !s.is_removed);
    const active = live.filter((s) => s.kind === 'active');
    const closing = live.filter((s) => s.kind === 'closing');
    const tone = (key) => PD_TONES[byKey[key]?.tone] || PD_TONES.slate;
    const columns = [
        ...active.map((s) => ({ key: s.key, label: s.label, stages: [s.key] })),
        { key: 'closed', label: 'Customer Feedback & Closed', stages: closing.map((s) => s.key) },
    ];
    return {
        all: rows, live, active, closing, columns, byKey,
        label: (key) => byKey[key]?.label || key || '',
        pill: (key) => tone(key).pill,
        bar: (key) => tone(key).bar,
        isClosing: (key) => byKey[key]?.kind === 'closing',
        // what a job in `key` may move to: forward stages (in order) and the previous in-progress stage
        forward: (key) => byKey[key]?.forward || [],
        backTo: (key) => byKey[key]?.back_to || null,
        // which kanban column a stage belongs in (unknown stages fall into the first column)
        columnFor: (key) => {
            if (byKey[key]?.kind === 'closing') return 'closed';
            return active.find((s) => s.key === key)?.key ?? active[0]?.key ?? 'closed';
        },
    };
}

export function ageInDays(fromIso, now = new Date()) {
    if (!fromIso) return 0;
    const t = new Date(fromIso).getTime();
    if (Number.isNaN(t)) return 0;
    return Math.max(0, Math.floor((now.getTime() - t) / 86400000));
}

export function pdJobMatchesQuery(job, query) {
    if (!query || !query.trim()) return true;
    const q = query.trim().toLowerCase();
    const num = q.match(/^(?:pd[-#\s]*)?#?(\d+)$/);
    if (num && job.job_number === parseInt(num[1], 10)) return true;
    return [job.title, job.customer, job.product].some((f) => typeof f === 'string' && f.toLowerCase().includes(q));
}
