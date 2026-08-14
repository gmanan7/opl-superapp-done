// row-hash — THE single normalization + hash implementation used at BOTH
// preview and commit (Step 8). Drift here breaks idempotency silently, so
// there is exactly one copy, dependency-free, isomorphic (Deno + Node 22
// WebCrypto). Unit-tested from Vitest via relative import.
// Case-insensitive fields: codes, emails, ids-by-convention.
const LOWERCASE_FIELDS = new Set([
    'employee_id', 'email', 'code',
    'jh_group_code', 'dmt_code',
    'additional_jh_codes', 'additional_dmt_codes',
]);
/** Trim, NFC-normalize, lowercase case-insensitive fields, drop empties. */
export function normalizeRow(raw) {
    const out = {};
    for (const [k, v] of Object.entries(raw)) {
        if (v === null || v === undefined)
            continue;
        let s = String(v).trim().replace(/\s+/g, ' ');
        if (s === '')
            continue;
        s = s.normalize('NFC');
        if (LOWERCASE_FIELDS.has(k))
            s = s.toLowerCase();
        out[k] = s;
    }
    return out;
}
/** Deterministic JSON: keys sorted. */
export function canonicalJson(row) {
    return JSON.stringify(Object.fromEntries(Object.entries(row).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))));
}
export async function rowHash(raw) {
    const data = new TextEncoder().encode(canonicalJson(normalizeRow(raw)));
    const digest = await crypto.subtle.digest('SHA-256', data);
    return 'sha256:' + [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
