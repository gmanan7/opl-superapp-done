export const WORKER_TEMPLATE = { columns: ['name', 'employee_id', 'role', 'jh_group_code', 'dmt_code', 'email', 'lang_pref'] };
export const MACHINE_TEMPLATE = { columns: ['name', 'code', 'jh_group_code', 'area_name'] };
export function templateFor(entity) {
    return entity === 'workers' ? WORKER_TEMPLATE : MACHINE_TEMPLATE;
}
export class BulkImportError extends Error {
    code;
    detail;
    constructor(code, detail) {
        super(code);
        this.code = code;
        this.detail = detail;
    }
}
export async function previewFile(entity, filename, _format, _fileB64) {
    return {
        batch_id: `batch-${Date.now()}`,
        totals: { total: 1, valid: 1, warning: 0, invalid: 0 },
        ignored_headers: [],
        rows: [
            { row_number: 1, tier: 'ok', codes: [] }
        ]
    };
}
export async function commitRows(_entity, batchId, _rows) {
    return {
        batch_id: batchId,
        committed_count: 1,
        discrepancy_count: 0,
        stale_count: 0,
        created: [{ row_number: 1, entity_id: 'new-id' }],
        skipped: []
    };
}
export async function acknowledgePins(_batchId) {
    return { success: true };
}
export async function abandonBatch(_batchId) {
    return { success: true };
}
export function formatOfFile(name) {
    const lower = name.toLowerCase();
    if (lower.endsWith('.csv'))
        return 'csv';
    if (lower.endsWith('.xlsx'))
        return 'xlsx';
    return null;
}
export async function parseUpload(file, entity) {
    const format = formatOfFile(file.name) ?? 'csv';
    return {
        filename: file.name,
        format,
        fileB64: 'b64',
        rows: [{ row_number: 1, data: { name: 'Demo Record' } }],
        ignoredHeaders: []
    };
}
export function referenceRows(entity, _org) {
    if (entity === 'workers') {
        return [['role'], ['apprentice'], ['on_roll'], ['jh_leader']];
    }
    return [['jh_group_code', 'jh_group_name']];
}
export function downloadTemplate(entity, format, _org) {
    const template = templateFor(entity);
    const header = [...template.columns];
    if (format === 'csv') {
        const blob = new Blob([header.join(',')], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${entity}_import_template.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }
}
export function downloadErrorRows(_entity, _upload, _preview, _describe) { }
