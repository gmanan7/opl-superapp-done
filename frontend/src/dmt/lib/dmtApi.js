// DMT REST client — talks to /api/dmt/* on the shared Express backend.
// Identity is the shared TPM session (x-worker-id header), same as lib/api.js.
import { safeStorage } from '../../lib/safeStorage';

async function dmtFetch(endpoint, options = {}) {
    const sessionStr = safeStorage.getItem('tpm_session');
    const session = sessionStr ? JSON.parse(sessionStr) : null;
    const workerId = session?.emp_id || session?.userId || session?.worker_id;
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (workerId) headers['x-worker-id'] = workerId;

    const res = await fetch(`/api/dmt${endpoint}`, { ...options, headers });
    if (!res.ok) {
        const text = await res.text();
        let message = text;
        try {
            const p = JSON.parse(text);
            if (p?.error) message = p.detail ? `${p.error}: ${p.detail}` : p.error;
        } catch { /* raw */ }
        throw new Error(message || `Request failed (${res.status})`);
    }
    if (res.status === 204) return null;
    return res.json();
}

const qs = (params) => {
    if (!params) return '';
    const s = new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== undefined && v !== null)
    ).toString();
    return s ? `?${s}` : '';
};

export const dmtApi = {
    fetch: dmtFetch,

    // identity
    me: () => dmtFetch('/me'),
    audit: (params) => dmtFetch(`/audit${qs(params)}`),
    myDepartments: (empId) => dmtFetch(`/my-departments${qs({ emp_id: empId })}`),

    // The caller's own plant — resolved from their real TPM identity (user_details
    // .default_plant), same as everywhere else in the app. `factory` is the shared,
    // multi-plant TPM table; never assume a fixed row/code/index belongs to "DMT's plant".
    myFactory: async () => {
        const [me, rows] = await Promise.all([dmtFetch('/me'), dmtFetch('/factory')]);
        return rows.find((f) => f.code === me.factory_code) || null;
    },

    // generic resource CRUD (resource = 'tasks', 'meetings', 'kpi-master', ...)
    list: (resource, params) => dmtFetch(`/${resource}${qs(params)}`),
    get: (resource, id) => dmtFetch(`/${resource}/${id}`),
    create: (resource, body) => dmtFetch(`/${resource}`, { method: 'POST', body: JSON.stringify(body) }),
    update: (resource, id, body) => dmtFetch(`/${resource}/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    remove: (resource, id) => dmtFetch(`/${resource}/${id}`, { method: 'DELETE' }),

    // planner
    clearCompletedPlanner: () => dmtFetch('/planner-items/clear-completed', { method: 'POST' }),

    // kpi entries batch upsert (keyed on kpi_id + reporting_date)
    upsertKpiEntries: (rows) => dmtFetch('/kpi-entries/upsert', { method: 'POST', body: JSON.stringify(rows) }),

    // shared worker-name lookup (non-DMT endpoint on the same backend)
    workerNames: async () => {
        const sessionStr = safeStorage.getItem('tpm_session');
        const session = sessionStr ? JSON.parse(sessionStr) : null;
        const workerId = session?.emp_id || session?.userId || session?.worker_id;
        const res = await fetch('/api/worker-names', { headers: workerId ? { 'x-worker-id': workerId } : {} });
        return res.ok ? res.json() : [];
    },

    // the real DMTs (TPM's module_groups) — non-DMT-prefixed endpoint on the same backend
    moduleGroups: async () => {
        const sessionStr = safeStorage.getItem('tpm_session');
        const session = sessionStr ? JSON.parse(sessionStr) : null;
        const workerId = session?.emp_id || session?.userId || session?.worker_id;
        const res = await fetch('/api/org/module-groups', { headers: workerId ? { 'x-worker-id': workerId } : {} });
        return res.ok ? res.json() : [];
    },

    // the plant's modules (SFM/RFM/Labels/Flexibles/PPB) — non-DMT-prefixed endpoint
    moduleNames: async () => {
        const sessionStr = safeStorage.getItem('tpm_session');
        const session = sessionStr ? JSON.parse(sessionStr) : null;
        const workerId = session?.emp_id || session?.userId || session?.worker_id;
        const res = await fetch('/api/org/module-names', { headers: workerId ? { 'x-worker-id': workerId } : {} });
        return res.ok ? res.json() : [];
    },

    // the plant's JH groups — non-DMT-prefixed endpoint
    jhGroups: async () => {
        const sessionStr = safeStorage.getItem('tpm_session');
        const session = sessionStr ? JSON.parse(sessionStr) : null;
        const workerId = session?.emp_id || session?.userId || session?.worker_id;
        const res = await fetch('/api/org/jh-groups', { headers: workerId ? { 'x-worker-id': workerId } : {} });
        return res.ok ? res.json() : [];
    },

    // task operations (former Supabase RPCs)
    setTaskStatus: (id, new_status, note) =>
        dmtFetch(`/tasks/${id}/status`, { method: 'POST', body: JSON.stringify({ new_status, note }) }),
    setTaskDueDate: (id, new_due_date, reason) =>
        dmtFetch(`/tasks/${id}/due-date`, { method: 'POST', body: JSON.stringify({ new_due_date, reason }) }),
    setTaskFields: (id, fields) =>
        dmtFetch(`/tasks/${id}/fields`, { method: 'POST', body: JSON.stringify(fields) }),
    addTaskComment: (id, text) =>
        dmtFetch(`/tasks/${id}/comment`, { method: 'POST', body: JSON.stringify({ text }) }),

    // Tiers (T4/T3/T2) — per-factory review tiers
    listTiers: () => dmtFetch('/tiers'),
    createTier: (name, dmtId, jhGroupId, extra) => dmtFetch('/tiers', { method: 'POST', body: JSON.stringify({ name, dmt_id: dmtId || null, jh_group_id: jhGroupId || null, ...extra }) }),
    updateTier: (id, body) => dmtFetch(`/tiers/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    deleteTier: (id) => dmtFetch(`/tiers/${id}`, { method: 'DELETE' }),
    listTierMembers: (id) => dmtFetch(`/tiers/${id}/members`),
    tiersForPerson: (empId) => dmtFetch(`/tiers/for-person/${empId}`),
    escalationTargets: () => dmtFetch('/escalation-targets'),
    escalateTask: (id, body) => dmtFetch(`/tasks/${id}/escalate`, { method: 'POST', body: JSON.stringify(body) }),
    addTierMember: (id, empId) => dmtFetch(`/tiers/${id}/members`, { method: 'POST', body: JSON.stringify({ emp_id: empId }) }),
    removeTierMember: (id, empId) => dmtFetch(`/tiers/${id}/members/${empId}`, { method: 'DELETE' }),
    listTierTaskViewers: (id) => dmtFetch(`/tiers/${id}/task-viewers`),
    addTierTaskViewer: (id, empId) => dmtFetch(`/tiers/${id}/task-viewers`, { method: 'POST', body: JSON.stringify({ emp_id: empId }) }),
    removeTierTaskViewer: (id, empId) => dmtFetch(`/tiers/${id}/task-viewers/${empId}`, { method: 'DELETE' }),
    listTierKpis: (id) => dmtFetch(`/tiers/${id}/kpis`),
    setTierKpis: (id, kpiIds) => dmtFetch(`/tiers/${id}/kpis`, { method: 'PUT', body: JSON.stringify({ kpi_ids: kpiIds }) }),
    myTierKpis: () => dmtFetch('/my-tier-kpis'),
    kpiOwners: () => dmtFetch('/kpi-owners'),
    // PM Schedule: machine list (shared `machine` table) + who may edit
    pmMachines: () => dmtFetch('/pm-machine-list'),
    pmMachineMaster: () => dmtFetch('/pm-machine-master'),
    addPmMachines: (machine_ids) => dmtFetch('/pm-machine-select', { method: 'POST', body: JSON.stringify({ machine_ids }) }),
    removePmMachine: (machineId) => dmtFetch(`/pm-machine-select/${encodeURIComponent(machineId)}`, { method: 'DELETE' }),
    pmEditAccessMe: () => dmtFetch('/pm-editors/me'),
    pmEditors: () => dmtFetch('/pm-editors'),
    pmAudit: (from, to) => dmtFetch(`/pm-audit${qs({ from, to })}`),
    addPmEditor: (emp_id) => dmtFetch('/pm-editors', { method: 'POST', body: JSON.stringify({ emp_id }) }),
    removePmEditor: (empId) => dmtFetch(`/pm-editors/${encodeURIComponent(empId)}`, { method: 'DELETE' }),
    // PD Cycle: who may edit + audit trail
    pdEditAccessMe: () => dmtFetch('/pd-editors/me'),
    pdEditors: () => dmtFetch('/pd-editors'),
    // bring an open meeting's attendance list in line with its group's people
    syncMeetingAttendees: (id) => dmtFetch(`/meetings/${id}/sync-attendees`, { method: 'POST' }),
    meetingAudit: (from, to, meeting_id) => dmtFetch(`/meeting-audit${qs({ from, to, meeting_id })}`),
    pdStages: () => dmtFetch('/pd-stages'),
    addPdStage: (body) => dmtFetch('/pd-stages', { method: 'POST', body: JSON.stringify(body) }),
    updatePdStage: (key, body) => dmtFetch(`/pd-stages/${encodeURIComponent(key)}`, { method: 'PATCH', body: JSON.stringify(body) }),
    removePdStage: (key) => dmtFetch(`/pd-stages/${encodeURIComponent(key)}`, { method: 'DELETE' }),
    pdCategories: () => dmtFetch('/pd-categories'),
    addPdCategory: (name) => dmtFetch('/pd-categories', { method: 'POST', body: JSON.stringify({ name }) }),
    updatePdCategory: (id, patch) => dmtFetch(`/pd-categories/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    pdAudit: (from, to) => dmtFetch(`/pd-audit${qs({ from, to })}`),
    addPdEditor: (emp_id) => dmtFetch('/pd-editors', { method: 'POST', body: JSON.stringify({ emp_id }) }),
    removePdEditor: (empId) => dmtFetch(`/pd-editors/${encodeURIComponent(empId)}`, { method: 'DELETE' }),
    kpiEntryStatus: (date) => dmtFetch(`/kpi-entry-status${qs({ date })}`),
    kpiEntryAudit: (date) => dmtFetch(`/kpi-entry-audit${qs({ date })}`),

    // Factory-wide Task Board visibility grant (Task Board Overview tab, BE Lead only)
    listGlobalTaskViewers: () => dmtFetch('/global-task-viewers'),
    addGlobalTaskViewer: (empId) => dmtFetch('/global-task-viewers', { method: 'POST', body: JSON.stringify({ emp_id: empId }) }),
    removeGlobalTaskViewer: (empId) => dmtFetch(`/global-task-viewers/${empId}`, { method: 'DELETE' }),

    // PD job operations
    setPdStage: (id, new_stage, note, feedback_note) =>
        dmtFetch(`/pd-jobs/${id}/stage`, { method: 'POST', body: JSON.stringify({ new_stage, note, feedback_note }) }),
    spawnPdJob: (id, respawn_reason, new_title, new_target_dispatch_date) =>
        dmtFetch(`/pd-jobs/${id}/spawn`, { method: 'POST', body: JSON.stringify({ respawn_reason, new_title, new_target_dispatch_date }) }),
};

// DMT permission tiers (mirror of the backend DMT_TIER_ORDER)
export const DMT_TIERS = ['jh_lead', 'module_lead', 'leadership', 'be_lead'];
export const dmtTierAtLeast = (tier, min) =>
    DMT_TIERS.indexOf(tier || 'jh_lead') >= DMT_TIERS.indexOf(min);
