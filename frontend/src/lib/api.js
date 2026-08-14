// Centralized API client for TPM Fulcrum Express + PostgreSQL backend.
// Replaces all legacy Supabase SDK calls with clean HTTP REST requests.
import { safeStorage } from './safeStorage';

async function apiFetch(endpoint, options = {}) {
    const sessionStr = safeStorage.getItem('tpm_session');
    const session = sessionStr ? JSON.parse(sessionStr) : null;
    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };
    const workerId = session?.emp_id || session?.userId || session?.worker_id || session?.worker?.id;
    if (workerId) {
        headers['x-worker-id'] = workerId;
    }
    const factoryId = session?.factory_id || session?.worker?.factory_id || '00000000-0000-0000-0000-000000000001';
    if (factoryId) {
        headers['x-factory-id'] = factoryId;
    }
    const res = await fetch(`/api${endpoint}`, {
        ...options,
        headers
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`API Request failed (${res.status}): ${errText}`);
    }
    return res.json();
}
export const api = {
    // Auth
    login: (emailOrEmployeeId) => apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: emailOrEmployeeId, employee_id: emailOrEmployeeId })
    }),
    getWorkerContext: () => apiFetch('/auth/me'),
    setLanguage: (lang, workerId) => apiFetch('/auth/set-language', {
        method: 'POST',
        body: JSON.stringify({ lang, worker_id: workerId })
    }),
    // Workers / MDM
    getWorkers: () => apiFetch('/workers'),
    getWorkerNames: () => apiFetch('/worker-names'),
    createWorker: (data) => apiFetch('/workers', {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    updateWorker: (id, updates) => apiFetch(`/workers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates)
    }),
    // Org Structure & Modules
    getFactories: () => apiFetch('/org/factories'),
    getAreas: () => apiFetch('/org/areas'),
    getJhGroups: (module_group_id) => apiFetch(`/org/jh-groups${module_group_id ? `?module_group_id=${module_group_id}` : ''}`),
    createJhGroup: (data) => apiFetch('/org/jh-groups', {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    deleteJhGroup: (id) => apiFetch(`/org/jh-groups/${id}`, {
        method: 'DELETE'
    }),
    getJhGroupsList: (jh_group_id) => apiFetch(`/org/jh-groups-list${jh_group_id ? `?jh_group_id=${jh_group_id}` : ''}`),
    addJhGroupMember: (data) => apiFetch('/org/jh-groups-list', {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    removeJhGroupMember: (id) => apiFetch(`/org/jh-groups-list/${id}`, {
        method: 'DELETE'
    }),
    getDmtMembersList: (module_group_id) => apiFetch(`/org/dmt-members-list${module_group_id ? `?module_group_id=${module_group_id}` : ''}`),
    addDmtMember: (data) => apiFetch('/org/dmt-members-list', {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    removeDmtMember: (id) => apiFetch(`/org/dmt-members-list/${id}`, {
        method: 'DELETE'
    }),
    getApprovalRouting: (factory_id, jh_group_id) => {
        const queryParams = new URLSearchParams();
        if (factory_id) queryParams.set('factory_id', factory_id);
        if (jh_group_id) queryParams.set('jh_group_id', jh_group_id);
        const qs = queryParams.toString();
        return apiFetch(`/org/approval-routing${qs ? `?${qs}` : ''}`);
    },
    saveApprovalRouting: (data) => apiFetch('/org/approval-routing', {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    getModules: () => apiFetch('/org/modules'),
    getModuleNames: () => apiFetch('/org/module-names'),
    getModuleGroups: () => apiFetch('/org/module-groups'),
    createModuleGroup: (data) => apiFetch('/org/module-groups', {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    deleteModuleGroup: (id) => apiFetch(`/org/module-groups/${id}`, {
        method: 'DELETE'
    }),
    getRoles: () => apiFetch('/roles'),
    toggleModule: (key, is_enabled) => apiFetch(`/org/modules/${key}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_enabled })
    }),
    // User Plant Access
    getUserPlantAccess: (emp_id) => apiFetch(`/user-plant-access${emp_id ? `?emp_id=${emp_id}` : ''}`),
    grantUserPlantAccess: (emp_id, factory_id) => apiFetch('/user-plant-access', {
        method: 'POST',
        body: JSON.stringify({ emp_id, factory_id })
    }),
    revokeUserPlantAccess: (id) => apiFetch(`/user-plant-access/${id}`, {
        method: 'DELETE'
    }),
    // Machines
    getMachines: (jh_group_id) => apiFetch(`/machines${jh_group_id ? `?jh_group_id=${jh_group_id}` : ''}`),
    createMachine: (data) => apiFetch('/machines', {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    getMachineSubsections: (machine_id) => apiFetch(`/machine-subsections${machine_id ? `?machine_id=${machine_id}` : ''}`),
    // Abnormalities
    getAbnormalities: () => apiFetch('/abnormalities'),
    getAbnormality: (id) => apiFetch(`/abnormalities/${id}`),
    createAbnormality: (data) => apiFetch('/abnormalities', {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    // OPL
    getOPLs: () => apiFetch('/opl'),
    getOPLTrainingDue: () => apiFetch('/opl/training-due'),
    createOPL: (data) => apiFetch('/opl', {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    getOplDetails: () => apiFetch('/opl-details'),
    createOplDetail: (data) => apiFetch('/opl-details', {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    updateOplDetail: (id, data) => apiFetch(`/opl-details/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
    }),
    getOplAuditTrail: (opl_id) => apiFetch(`/opl-audit-trail${opl_id ? `?opl_id=${opl_id}` : ''}`),
    createOplAuditTrail: (data) => apiFetch('/opl-audit-trail', {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    // Kaizens
    getKaizens: () => apiFetch('/kaizen'),
    createKaizen: (data) => apiFetch('/kaizen', {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    // KPIs
    getKpiDefinitions: () => apiFetch('/kpis/definitions'),
    getKpiEntries: () => apiFetch('/kpis/entries'),
    recordKpiEntry: (data) => apiFetch('/kpis/entries', {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    // File Upload
    uploadImage: (imageBase64, filename) => apiFetch('/upload', {
        method: 'POST',
        body: JSON.stringify({ imageBase64, filename })
    }),
    // Translation
    translate: (text, targetLang) => apiFetch('/translate', {
        method: 'POST',
        body: JSON.stringify({ text, targetLang })
    })
};
