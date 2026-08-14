// worker-validator — THE single worker-row validation used by BOTH
// manage-user (single create) and bulk-import (Step 8). Pure functions over a
// prefetched context; dependency-free; Vitest-tested via relative import.
import { normalizeRow } from './row-hash.js';
export const ROLE_ORDER = [
    'operator', 'apprentice', 'on_roll', 'jh_lead', 'jh_leader', 'dmt_member', 'module_lead',
    'dmt_leader', 'area_champion_5s', 'auditor_pool', 'admin_5s', 'be_lead', 'pillar_champion',
    'be_team', 'it_lead', 'leadership', 'admin',
];
export function roleAtLeast(role, minimum) {
    return (ROLE_ORDER.indexOf(role) >= ROLE_ORDER.indexOf(minimum));
}
/** Name rule shared by single-create and bulk: non-empty, ≤100 chars
 *  (Step 8 spec; tightened from manage-user's historical 120 — longest live
 *  name is 36 chars, verified 2026-06-11). */
export function validName(name) {
    const t = name.trim();
    return t.length > 0 && t.length <= 100;
}
export const PIN_ROLES = new Set(['operator', 'apprentice', 'on_roll']);
export const EMPLOYEE_ID_RE = /^[A-Za-z0-9\-_/]{1,30}$/i;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const LANG_PREFS = new Set(['en', 'hi', 'gu', 'ta']); // 'ta' accepted server-side (D-008; UI gating separate)
export const APPRENTICE_TYPES = new Set(['NAPS', 'CAT']);
export function validateWorkerRow(raw, ctx, callerRole) {
    const row = normalizeRow(raw);
    const codes = [];
    const err = (field, code) => codes.push({ field, code });
    // name
    const name = row.name ?? '';
    if (!name)
        err('name', 'required_field_missing');
    else if (name.length > 100)
        err('name', 'name_invalid');
    // role
    const role = (row.role ?? '');
    if (!row.role)
        err('role', 'required_field_missing');
    else if (!ROLE_ORDER.includes(role) || role === 'admin')
        err('role', 'invalid_role');
    else if (ROLE_ORDER.indexOf(role) > ROLE_ORDER.indexOf(callerRole))
        err('role', 'role_above_caller');
    const isPinRole = PIN_ROLES.has(role);
    // jh_group_code — required for shop floor
    let jhGroup;
    if (row.jh_group_code) {
        jhGroup = ctx.jhGroupsByCode.get(row.jh_group_code);
        if (!jhGroup)
            err('jh_group_code', 'jh_group_not_found');
        else if (!jhGroup.active)
            err('jh_group_code', 'jh_group_inactive');
    }
    else if (isPinRole) {
        err('jh_group_code', 'required_field_missing');
    }
    // dmt_code — optional; must be consistent with the group's dmt when both present
    let dmtId = jhGroup?.dmtId ?? null;
    if (row.dmt_code) {
        const dmt = ctx.dmtsByCode.get(row.dmt_code);
        if (!dmt)
            err('dmt_code', 'dmt_not_found');
        else if (jhGroup && jhGroup.dmtId !== dmt.id)
            err('dmt_code', 'dmt_inconsistent_with_jh_group');
        else
            dmtId = dmt.id;
    }
    // employee_id — optional (contract §3.6); format + uniqueness vs ALL factory rows
    const employeeId = row.employee_id ?? null;
    if (employeeId) {
        if (!EMPLOYEE_ID_RE.test(employeeId))
            err('employee_id', 'employee_id_invalid_format');
        else if (ctx.existingEmployeeIds.has(employeeId))
            err('employee_id', 'employee_id_duplicate_in_db');
    }
    // name + group duplicate vs ACTIVE workers
    if (name && jhGroup && ctx.existingNameGroupPairs.has(`${name.toLowerCase()}|${jhGroup.id}`)) {
        err('name', 'name_group_duplicate_in_db');
    }
    // apprentice_type
    const apprenticeType = row.apprentice_type ?? null;
    if (role === 'apprentice' && !apprenticeType)
        err('apprentice_type', 'apprentice_type_required_for_apprentice');
    if (apprenticeType && !APPRENTICE_TYPES.has(apprenticeType.toUpperCase())) {
        err('apprentice_type', 'invalid_apprentice_type');
    }
    // lang_pref
    const langPref = row.lang_pref ?? 'en';
    if (row.lang_pref && !LANG_PREFS.has(row.lang_pref.toLowerCase()))
        err('lang_pref', 'invalid_lang_pref');
    // email — required for leader roles
    const email = row.email ?? null;
    if (!isPinRole && role && ROLE_ORDER.includes(role)) {
        if (!email)
            err('email', 'email_required_for_role');
    }
    if (email) {
        if (!EMAIL_RE.test(email))
            err('email', 'email_invalid_format');
        else if (ctx.existingEmails.has(email))
            err('email', 'email_duplicate');
    }
    // additional memberships
    const additionalJh = [];
    const additionalDmt = [];
    for (const code of splitCodes(row.additional_jh_codes)) {
        const g = ctx.jhGroupsByCode.get(code);
        if (!g || !g.active)
            err('additional_jh_codes', 'additional_membership_resolution_failed');
        else
            additionalJh.push(g.id);
    }
    for (const code of splitCodes(row.additional_dmt_codes)) {
        const d = ctx.dmtsByCode.get(code);
        if (!d)
            err('additional_dmt_codes', 'additional_membership_resolution_failed');
        else
            additionalDmt.push(d.id);
    }
    const tier = codes.length > 0 ? 'error' : 'ok';
    return {
        tier,
        codes,
        normalized: row,
        resolved: tier === 'error' ? undefined : {
            name,
            employee_id: employeeId,
            role,
            apprentice_type: role === 'apprentice' && apprenticeType ? apprenticeType.toUpperCase() : null,
            jh_group_id: jhGroup?.id ?? null,
            dmt_id: dmtId,
            lang_pref: (row.lang_pref ?? 'en').toLowerCase(),
            email,
            additional_jh_group_ids: additionalJh,
            additional_dmt_ids: additionalDmt,
        },
    };
}
function splitCodes(v) {
    if (!v)
        return [];
    return v.split(';').map((s) => s.trim().toLowerCase()).filter(Boolean);
}
/** Bulk wrapper: adds within-file duplicate detection (both rows fail —
 *  ambiguous, per spec). Returns results in row order. */
export function validateWorkerRows(rows, ctx, callerRole) {
    const results = rows.map((r) => validateWorkerRow(r, ctx, callerRole));
    const byEmployeeId = new Map();
    const byNameGroup = new Map();
    const byEmail = new Map();
    results.forEach((res, i) => {
        const n = res.normalized;
        if (n.employee_id)
            push(byEmployeeId, n.employee_id, i);
        if (n.name && n.jh_group_code)
            push(byNameGroup, `${n.name.toLowerCase()}|${n.jh_group_code}`, i);
        if (n.email)
            push(byEmail, n.email, i);
    });
    flagDupes(byEmployeeId, results, 'employee_id', 'employee_id_duplicate_in_file');
    flagDupes(byNameGroup, results, 'name', 'name_group_duplicate_in_file');
    flagDupes(byEmail, results, 'email', 'email_duplicate');
    return results;
}
function push(map, key, i) {
    const list = map.get(key) ?? [];
    list.push(i);
    map.set(key, list);
}
function flagDupes(map, results, field, code) {
    for (const idxs of map.values()) {
        if (idxs.length < 2)
            continue;
        for (const i of idxs) {
            if (!results[i].codes.some((c) => c.code === code && c.field === field)) {
                results[i].codes.push({ field, code });
            }
            results[i].tier = 'error';
            results[i].resolved = undefined;
        }
    }
}
