// import-templates — THE template column definitions for Step 8 bulk import,
// shared by the Edge parser (header mapping, projection) and the client
// (template generation, error-file regeneration). One source, no drift.
//
// Projection happens BEFORE validation and hashing on BOTH preview and
// commit: extra columns can never enter a row hash, so a file with stray
// columns still commits its rows idempotently.
export const WORKER_TEMPLATE = {
    entity: 'workers',
    columns: [
        'name',
        'role',
        'jh_group_code',
        'dmt_code',
        'employee_id',
        'apprentice_type',
        'lang_pref',
        'email',
        'additional_jh_codes',
        'additional_dmt_codes',
    ],
    required: ['name', 'role'],
};
export const MACHINE_TEMPLATE = {
    entity: 'machines',
    columns: ['name', 'code', 'machine_type', 'jh_group_code', 'area_name'],
    required: ['name', 'jh_group_code'],
};
function normalizeHeader(h) {
    return String(h ?? '').trim().replace(/\s+/g, '_').toLowerCase();
}
/** Case/whitespace-insensitive header match against a template.
 *  Approved Step 8 semantics: unknown headers are non-fatal (rows get
 *  extra_columns_warning); a file where NO required header maps at all is
 *  rejected file-level with unknown_column (wrong file / wrong template). */
export function mapHeaders(headerRow, template) {
    const byIndex = new Map();
    const unknownHeaders = [];
    const seen = new Set();
    headerRow.forEach((raw, i) => {
        const norm = normalizeHeader(raw);
        if (norm === '')
            return;
        if (template.columns.includes(norm) && !seen.has(norm)) {
            byIndex.set(i, norm);
            seen.add(norm);
        }
        else {
            unknownHeaders.push(String(raw).trim());
        }
    });
    const unusable = !template.required.some((r) => seen.has(r));
    return { byIndex, unknownHeaders, unusable };
}
/** Project one data row (array form) onto template columns. */
export function projectRow(row, mapping) {
    const out = {};
    for (const [idx, col] of mapping.byIndex) {
        const v = row[idx];
        if (v === null || v === undefined)
            continue;
        const s = String(v);
        if (s.trim() === '')
            continue;
        out[col] = s;
    }
    return out;
}
/** Project an already-keyed object (commit path) onto template columns —
 *  strips any keys outside the template before re-validation and re-hashing. */
export function projectObject(row, template) {
    const out = {};
    for (const col of template.columns) {
        const v = row[col];
        if (v === null || v === undefined)
            continue;
        const s = String(v);
        if (s.trim() === '')
            continue;
        out[col] = s;
    }
    return out;
}
/** AOA (header row + data rows) → projected row objects, skipping rows that
 *  are entirely empty. Returns 1-based row numbers (first data row = 1). */
export function rowsFromAoa(aoa, template) {
    const [header = [], ...dataRows] = aoa;
    const mapping = mapHeaders(header, template);
    const rows = [];
    dataRows.forEach((r, i) => {
        const data = projectRow(r ?? [], mapping);
        const hasAnyCell = (r ?? []).some((c) => String(c ?? '').trim() !== '');
        if (!hasAnyCell)
            return; // fully blank line — not a row at all
        rows.push({ row_number: i + 1, data });
    });
    return { mapping, rows };
}
