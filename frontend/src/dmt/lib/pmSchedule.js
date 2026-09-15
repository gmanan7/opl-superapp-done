// Pure logic helpers for the PM Schedule grid (ported from dmt/src/lib/pmSchedule.ts).

export function toIsoDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export function daysBetween(a, b) {
    const da = new Date(`${a}T00:00:00`);
    const db = new Date(`${b}T00:00:00`);
    return Math.round((db - da) / 86400000);
}

export function daysOfMonth(ref) {
    const y = ref.getFullYear();
    const m = ref.getMonth();
    const last = new Date(y, m + 1, 0).getDate();
    const out = [];
    for (let d = 1; d <= last; d++) out.push(new Date(y, m, d));
    return out;
}

// 'empty' | 'planned-future' | 'planned-past' | 'overdue' | 'done-on-time' | 'done-delayed-minor' | 'done-delayed-major'
export function getCellState(plan, actual, date, today) {
    if (!plan && !actual) return 'empty';
    if (plan && actual) {
        const delay = daysBetween(plan.planned_date, actual.actual_date);
        if (delay <= 0) return 'done-on-time';
        if (delay <= 2) return 'done-delayed-minor';
        return 'done-delayed-major';
    }
    if (plan && !actual) {
        const overdueBy = daysBetween(plan.planned_date, today);
        if (overdueBy > 2) return 'overdue';
        if (overdueBy < 0) return 'planned-future';
        return 'planned-past';
    }
    return 'done-on-time';
}

export function filterMachinesByLine(machines, line) {
    return line === 'All' ? machines : machines.filter((m) => m.line === line);
}

export function filterMachinesByCriticality(machines, filter) {
    if (filter === 'All') return machines;
    if (filter === 'CriticalOnly') return machines.filter((m) => m.is_critical);
    return machines.filter((m) => !m.is_critical);
}

export function groupMachinesByGroup(machines) {
    const sorted = [...machines].sort(
        (a, b) =>
            a.line.localeCompare(b.line) ||
            a.group_name.localeCompare(b.group_name) ||
            a.display_order - b.display_order,
    );
    const out = {};
    for (const m of sorted) {
        const key = `${m.line} — ${m.group_name}`;
        (out[key] = out[key] || []).push(m);
    }
    return out;
}

export const CELL_CLASS = {
    'empty': 'bg-white hover:bg-slate-100',
    'planned-future': 'bg-white ring-2 ring-inset ring-blue-400 hover:bg-blue-50',
    'planned-past': 'bg-blue-100 ring-2 ring-inset ring-blue-400 hover:bg-blue-200',
    'overdue': 'bg-rose-500 text-white hover:bg-rose-600',
    'done-on-time': 'bg-emerald-500 text-white hover:bg-emerald-600',
    'done-delayed-minor': 'bg-amber-400 text-white hover:bg-amber-500',
    'done-delayed-major': 'bg-amber-600 text-white hover:bg-amber-700',
};
