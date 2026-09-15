// Shared MDM query keys + error sanitization (D5: no raw DB errors to users).
export const ROLE_GROUP_MAP = {
    shop_floor: ['apprentice', 'on_roll'],
    leaders: ['jh_leader', 'dmt_member', 'dmt_leader'],
    champions_teams: ['pillar_champion', 'be_team'],
    admin: ['admin'],
};
// null = no role filter on the wire.
export function expandRoleGroup(group) {
    if (group === 'all')
        return null;
    return ROLE_GROUP_MAP[group];
}
export const WORKERS_PAGE_SIZE = 50;
// Deterministic filter serialization: sorted keys, undefined dropped — the
// same filters always produce the same query key regardless of object order.
export function normalizeFilters(filters) {
    const entries = Object.entries(filters)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return JSON.stringify(entries);
}
export const mdmKeys = {
    all: ['mdm'],
    modules: () => [...mdmKeys.all, 'modules'],
    orgStructure: () => [...mdmKeys.all, 'org'],
    oplWorkflowStages: (factoryId) => [...mdmKeys.all, 'oplWorkflowStages', factoryId ?? null],
    workflowStages: (factoryId, module, phase) => [...mdmKeys.all, 'workflowStages', factoryId ?? null, module, phase],
    machines: (f = {}) => [...mdmKeys.all, 'machines', normalizeFilters(f)],
    workers: (f = {}) => [...mdmKeys.all, 'workers', normalizeFilters(f)],
    memberships: (workerId) => [...mdmKeys.all, 'memberships', workerId],
};
export class MdmError extends Error {
    code;
    constructor(code) {
        // The message is the CODE, not DB text — screens translate codes via i18n.
        super(code);
        this.name = 'MdmError';
        this.code = code;
    }
}
// Maps a backend/database error to a clean coded error. Raw DB detail never
// crosses this boundary (it may carry schema/constraint internals).
export function toMdmError(err) {
    if (err instanceof MdmError)
        return err;
    const e = err;
    const pgCode = e?.code ?? '';
    if (pgCode === '23505')
        return new MdmError('duplicate');
    if (pgCode === '23503')
        return new MdmError('fk_violation');
    if (pgCode === '23514')
        return new MdmError('check_violation');
    if (pgCode === '42501' || e?.status === 401 || e?.status === 403)
        return new MdmError('denied');
    // The backend returns denials as plain Error messages with these prefixes.
    if (/^(Forbidden|Admin only|Unauthorized|User is outside your management scope)/i.test(e?.message ?? '')) {
        return new MdmError('denied');
    }
    if (/not found/i.test(e?.message ?? ''))
        return new MdmError('not_found');
    return new MdmError('unknown');
}
// RLS-filtered writes "succeed" with zero rows: every mutation chains
// .select() and runs its result through this guard.
export function requireRows(rows) {
    if (!rows || rows.length === 0)
        throw new MdmError('denied');
    return rows;
}
// Strip commas/parens from a free-text search term before it reaches the backend.
export function sanitizeSearchTerm(term) {
    return term.replace(/[,()]/g, '').trim();
}
