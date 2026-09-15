// Number formatting for the DMT module (Indian grouping), replacing lib/formatNumber.

export function formatIndianNumber(value) {
    if (value === null || value === undefined || value === '') return '—';
    const n = typeof value === 'number' ? value : Number(value);
    if (Number.isNaN(n)) return '—';
    return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}
