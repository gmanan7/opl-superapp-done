// machine-validator — single machine-row validation for bulk-import (Step 8).
// Pure functions over a prefetched context; dependency-free.
// NOTE: machine.code has NO unique constraint in the DB (verified 2026-06-11)
// — this validator is the only duplicate enforcement; checked vs ACTIVE
// machines per spec. DB-level partial unique index = Phase-2 hardening backlog.
import { normalizeRow } from './row-hash.js';
export const MACHINE_CODE_RE = /^[A-Za-z0-9\-_/. ]{1,30}$/i;
export function validateMachineRow(raw, ctx) {
    const row = normalizeRow(raw);
    const codes = [];
    const err = (field, code) => codes.push({ field, code });
    const name = row.name ?? '';
    if (!name)
        err('name', 'required_field_missing');
    else if (name.length > 100)
        err('name', 'name_invalid');
    // jh_group_code — required
    let jhGroup;
    if (!row.jh_group_code)
        err('jh_group_code', 'required_field_missing');
    else {
        jhGroup = ctx.jhGroupsByCode.get(row.jh_group_code);
        if (!jhGroup)
            err('jh_group_code', 'jh_group_not_found');
        else if (!jhGroup.active)
            err('jh_group_code', 'jh_group_inactive');
    }
    // code — optional; format + duplicate vs ACTIVE machines (validator-only check)
    const code = row.code ?? null;
    if (code) {
        if (!MACHINE_CODE_RE.test(code))
            err('code', 'machine_code_invalid_format');
        else if (ctx.existingMachineCodes.has(code))
            err('code', 'machine_code_duplicate_in_db');
    }
    // area_name — optional; must resolve within the resolved group (no create-on-the-fly)
    let areaId = null;
    if (row.area_name && jhGroup) {
        areaId = ctx.areasByGroup.get(jhGroup.id)?.get(row.area_name.toLowerCase()) ?? null;
        if (!areaId)
            err('area_name', 'area_not_found_in_jh_group');
    }
    // (name, group, area) duplicate vs ACTIVE machines
    if (name && jhGroup) {
        const triple = `${name.toLowerCase()}|${jhGroup.id}|${(row.area_name ?? '').toLowerCase()}`;
        if (ctx.existingNameGroupAreaTriples.has(triple))
            err('name', 'name_group_duplicate_in_db');
    }
    // machine_type — free text; NEW values are a WARNING tier, row still commits
    const machineType = row.machine_type ?? null;
    const isNewType = !!machineType && !ctx.knownMachineTypes.has(machineType.toLowerCase());
    if (codes.length > 0)
        return { tier: 'error', codes, normalized: row };
    if (isNewType)
        codes.push({ field: 'machine_type', code: 'new_machine_type_warning' });
    return {
        tier: isNewType ? 'warning' : 'ok',
        codes,
        normalized: row,
        resolved: {
            name,
            code,
            machine_type: machineType,
            new_machine_type: isNewType,
            jh_group_id: jhGroup.id,
            area_id: areaId,
        },
    };
}
/** Bulk wrapper with within-file duplicate detection (both rows fail). */
export function validateMachineRows(rows, ctx) {
    const results = rows.map((r) => validateMachineRow(r, ctx));
    const byCode = new Map();
    const byTriple = new Map();
    results.forEach((res, i) => {
        const n = res.normalized;
        if (n.code)
            pushIdx(byCode, n.code, i);
        if (n.name && n.jh_group_code) {
            pushIdx(byTriple, `${n.name.toLowerCase()}|${n.jh_group_code}|${(n.area_name ?? '').toLowerCase()}`, i);
        }
    });
    flag(byCode, results, 'code', 'machine_code_duplicate_in_file');
    flag(byTriple, results, 'name', 'name_group_duplicate_in_file');
    return results;
}
function pushIdx(map, key, i) {
    const list = map.get(key) ?? [];
    list.push(i);
    map.set(key, list);
}
function flag(map, results, field, code) {
    for (const idxs of map.values()) {
        if (idxs.length < 2)
            continue;
        for (const i of idxs) {
            results[i].codes.push({ field, code });
            results[i].tier = 'error';
            results[i].resolved = undefined;
        }
    }
}
