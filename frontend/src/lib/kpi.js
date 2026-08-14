// Pure KPI domain logic — no React, no Supabase. Shared by the data hook
// (useKPIs), the capture row (KpiCaptureRow), the trend view, and the tests.
// Numbers are Latin / Western-Arabic throughout (Law Q2). Handles all THREE
// kpi_direction values (higher_better / lower_better / target_exact) and NULL
// targets (JH-level rollup KPIs frequently have no target).
// ─── Local-date helpers (timezone-naive YYYY-MM-DD in the user's locale) ───────
export function localDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function yesterdayStr() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return localDateStr(d);
}
export function todayStr() {
    return localDateStr(new Date());
}
export function monthBounds(year, month) {
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { start, end };
}
export function daysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
}
/** Whole days between two YYYY-MM-DD strings (b - a), local midnight. */
export function dayDiff(aStr, bStr) {
    const a = new Date(aStr + 'T00:00:00');
    const b = new Date(bStr + 'T00:00:00');
    return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}
// ─── Missing-day detection (days 1..yesterday with no entry) ───────────────────
export function computeMissingDates(entries, year, month, yesterday) {
    const entered = new Set(entries.map((e) => e.entry_date));
    const missing = [];
    const total = daysInMonth(year, month);
    for (let day = 1; day <= total; day++) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        if (dateStr > yesterday)
            break;
        if (!entered.has(dateStr))
            missing.push(dateStr);
    }
    return missing;
}
// ─── Targets & deviation ───────────────────────────────────────────────────────
/** Comparison glyph for the target hint — same signal across all locales (§9). */
export function targetSymbol(direction) {
    if (direction === 'higher_better')
        return '≥';
    if (direction === 'lower_better')
        return '≤';
    return '=';
}
/**
 * Out-of-target classification for a captured value. NON-blocking by contract —
 * ugly data is real data (KPI_ENTRY §5). NULL target or empty/non-numeric input
 * → 'none'. 'over' = above an upper-bound target; 'under' = below a lower-bound
 * target; 'off' = differs from an exact target.
 */
export function deviationLevel(direction, target, valueStr) {
    if (target == null)
        return 'none';
    const v = parseFloat(valueStr);
    if (valueStr.trim() === '' || Number.isNaN(v))
        return 'none';
    if (direction === 'higher_better')
        return v < target ? 'under' : 'none';
    if (direction === 'lower_better')
        return v > target ? 'over' : 'none';
    return v !== target ? 'off' : 'none'; // target_exact
}
/** MTD average vs target, for trend coloring. NULL target → null (no verdict). */
export function isOnTarget(direction, avg, target) {
    if (target == null)
        return null;
    if (direction === 'higher_better')
        return avg >= target;
    if (direction === 'lower_better')
        return avg <= target;
    return Math.abs(avg - target) < 1e-9; // target_exact
}
