async function jhGroupsByCode(db, factoryId) {
    const { data, error } = await db
        .from('jh_group')
        .select('id, code, dmt_id, is_active')
        .eq('factory_id', factoryId);
    if (error)
        throw new Error('context_fetch_failed');
    const map = new Map();
    for (const g of data ?? []) {
        map.set(String(g.code).toLowerCase(), { id: g.id, dmtId: g.dmt_id, active: g.is_active !== false });
    }
    return map;
}
export async function buildWorkerContext(db, factoryId) {
    const [groups, dmts, workers] = await Promise.all([
        jhGroupsByCode(db, factoryId),
        db.from('dmt').select('id, code').eq('factory_id', factoryId),
        db.from('worker_profile').select('name, employee_id, jh_group_id, is_active').eq('factory_id', factoryId),
    ]);
    if (dmts.error || workers.error)
        throw new Error('context_fetch_failed');
    const dmtsByCode = new Map();
    for (const d of dmts.data ?? [])
        dmtsByCode.set(String(d.code).toLowerCase(), { id: d.id });
    // Real DB constraint is (factory_id, employee_id) across ALL rows.
    const existingEmployeeIds = new Set();
    // Name+group pairs vs ACTIVE workers only.
    const existingNameGroupPairs = new Set();
    for (const w of workers.data ?? []) {
        if (w.employee_id)
            existingEmployeeIds.add(String(w.employee_id).toLowerCase());
        if (w.is_active !== false && w.name && w.jh_group_id) {
            existingNameGroupPairs.add(`${String(w.name).trim().replace(/\s+/g, ' ').toLowerCase()}|${w.jh_group_id}`);
        }
    }
    return {
        factoryId,
        jhGroupsByCode: groups,
        dmtsByCode,
        existingEmployeeIds,
        existingNameGroupPairs,
        existingEmails: new Set(), // filled by addEmailExistence when rows carry emails
    };
}
/** Bulk email-existence via the SECURITY DEFINER check_emails_exist()
 *  (service-role EXECUTE only) — one atomic auth.users lookup. */
export async function addEmailExistence(db, ctx, emails) {
    const unique = [...new Set(emails.map((e) => e.toLowerCase()))].filter(Boolean);
    if (unique.length === 0)
        return;
    const { data, error } = await db.rpc('check_emails_exist', { emails: unique });
    if (error)
        throw new Error('context_fetch_failed');
    for (const e of (data ?? []))
        ctx.existingEmails.add(e);
}
export async function buildMachineContext(db, factoryId) {
    const [groups, areas, machines] = await Promise.all([
        jhGroupsByCode(db, factoryId),
        db.from('area').select('id, jh_group_id, name, is_active').eq('factory_id', factoryId),
        db.from('machine').select('name, code, machine_type, jh_group_id, area_id, is_active').eq('factory_id', factoryId),
    ]);
    if (areas.error || machines.error)
        throw new Error('context_fetch_failed');
    const areasByGroup = new Map();
    const areaNameById = new Map();
    for (const a of areas.data ?? []) {
        areaNameById.set(a.id, String(a.name).trim().replace(/\s+/g, ' ').toLowerCase());
        if (a.is_active === false)
            continue;
        const m = areasByGroup.get(a.jh_group_id) ?? new Map();
        m.set(String(a.name).trim().replace(/\s+/g, ' ').toLowerCase(), a.id);
        areasByGroup.set(a.jh_group_id, m);
    }
    const existingMachineCodes = new Set();
    const existingNameGroupAreaTriples = new Set();
    const knownMachineTypes = new Set();
    for (const m of machines.data ?? []) {
        if (m.machine_type)
            knownMachineTypes.add(String(m.machine_type).toLowerCase());
        if (m.is_active === false)
            continue;
        if (m.code)
            existingMachineCodes.add(String(m.code).toLowerCase());
        if (m.name && m.jh_group_id) {
            const areaName = m.area_id ? (areaNameById.get(m.area_id) ?? '') : '';
            existingNameGroupAreaTriples.add(`${String(m.name).trim().replace(/\s+/g, ' ').toLowerCase()}|${m.jh_group_id}|${areaName}`);
        }
    }
    return { factoryId, jhGroupsByCode: groups, areasByGroup, existingMachineCodes, existingNameGroupAreaTriples, knownMachineTypes };
}
