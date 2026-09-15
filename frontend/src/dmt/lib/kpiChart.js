// KPI chart helpers for the DMT Trends / My View pages (no date-fns).

export const PERIODS = [
    { value: 'this_week', label: 'This Week' },
    { value: 'last_week', label: 'Last Week' },
    { value: 'this_month', label: 'This Month' },
    { value: 'last_month', label: 'Last Month' },
    { value: 'this_year', label: 'This Year' },
];

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function startOfWeekMon(d) {
    const x = new Date(d);
    const day = (x.getDay() + 6) % 7; // Mon=0
    x.setDate(x.getDate() - day);
    x.setHours(0, 0, 0, 0);
    return x;
}

// Returns [startIso, endIso] for a named period.
export function getDateRange(period) {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    switch (period) {
        case 'this_week': return [iso(startOfWeekMon(now)), iso(now)];
        case 'last_week': {
            const s = startOfWeekMon(now); s.setDate(s.getDate() - 7);
            const e = new Date(s); e.setDate(e.getDate() + 6);
            return [iso(s), iso(e)];
        }
        case 'this_month': return [iso(new Date(y, m, 1)), iso(now)];
        case 'last_month': return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))];
        case 'this_year': return [iso(new Date(y, 0, 1)), iso(now)];
        default: return [iso(new Date(y, m, 1)), iso(now)];
    }
}

export function formatAxisDate(dateStr) {
    const [y, m, d] = dateStr.slice(0, 10).split('-');
    return `${d}/${m}`;
}

export function calculateYMax(values, target) {
    const nums = values.filter((v) => v !== null && v !== undefined && !Number.isNaN(v));
    const highest = nums.length ? Math.max(...nums) : 0;
    const candidates = [highest * 1.2];
    if (target != null) candidates.push(Number(target) * 1.2);
    const max = Math.max(1, ...candidates);
    return Math.ceil(max);
}

export function calculateMtd(entries, aggregation, ref = null) {
    const r = ref || (() => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 1); return d; })();
    const monthStart = new Date(r.getFullYear(), r.getMonth(), 1);
    const inMonth = entries.filter((e) => {
        const v = e.actual_value;
        if (v === null || v === undefined || Number.isNaN(Number(v))) return false;
        const d = new Date(`${e.reporting_date.slice(0, 10)}T00:00:00`);
        return d >= monthStart && d <= r;
    });
    if (!inMonth.length) return null;
    const total = inMonth.reduce((a, e) => a + Number(e.actual_value), 0);
    return aggregation === 'sum' ? total : total / inMonth.length;
}

export function computeRagFromValue(value, kpi) {
    const target = kpi.target_value != null ? Number(kpi.target_value) : null;
    let green = kpi.green_threshold != null ? Number(kpi.green_threshold) : target;
    let amber = kpi.amber_threshold != null ? Number(kpi.amber_threshold) : null;
    if (amber == null && target != null) amber = kpi.direction === 'lower_is_better' ? target * 1.15 : target * 0.85;
    if (green == null) return null;
    const v = Number(value);
    if (kpi.direction === 'higher_is_better') {
        if (v >= green) return 'green';
        if (amber != null && v >= amber) return 'amber';
        return 'red';
    }
    if (kpi.direction === 'lower_is_better') {
        if (v <= green) return 'green';
        if (amber != null && v <= amber) return 'amber';
        return 'red';
    }
    if (v === green) return 'green';
    if (amber != null && Math.abs(v - green) <= Math.abs(amber - green)) return 'amber';
    return 'red';
}

export const RAG_HEX = { red: '#e11d48', amber: '#f59e0b', green: '#10b981' };
export const RAG_BADGE = {
    green: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-700',
    red: 'bg-rose-100 text-rose-700',
};
