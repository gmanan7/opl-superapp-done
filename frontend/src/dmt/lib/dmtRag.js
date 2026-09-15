// RAG (red/amber/green) status computation for numeric KPIs.

export function computeRag(actual, greenRaw, amberRaw, direction, target = null) {
    if (actual === null || actual === undefined || actual === '') return null;
    const a = Number(actual);
    if (Number.isNaN(a)) return null;

    let green = greenRaw != null ? Number(greenRaw) : null;
    let amber = amberRaw != null ? Number(amberRaw) : null;
    const t = target != null ? Number(target) : null;

    if (green == null && t != null) green = t;
    if (amber == null && t != null) {
        if (direction === 'higher_is_better') amber = t * 0.85;
        else if (direction === 'lower_is_better') amber = t * 1.15;
        else amber = t;
    }
    if (green == null || amber == null) return null;

    if (direction === 'higher_is_better') {
        if (a >= green) return 'green';
        if (a >= amber) return 'amber';
        return 'red';
    }
    if (direction === 'lower_is_better') {
        if (a <= green) return 'green';
        if (a <= amber) return 'amber';
        return 'red';
    }
    // target_is_exact
    if (a === green) return 'green';
    const diff = Math.abs(a - green);
    const amberRange = Math.abs(amber - green);
    return diff <= amberRange ? 'amber' : 'red';
}

export const RAG_CLASSES = {
    green: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-700',
    red: 'bg-rose-100 text-rose-700',
};
