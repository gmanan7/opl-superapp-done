// Centralized API client for the Express + PostgreSQL backend.
// Every call is a plain HTTP REST request to /api.
import { safeStorage } from './safeStorage';

async function apiFetch(endpoint, options = {}) {
    const sessionStr = safeStorage.getItem('tpm_session');
    const session = sessionStr ? JSON.parse(sessionStr) : null;
    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };
    const workerId = session?.emp_id || session?.userId || session?.worker_id;
    if (workerId) {
        headers['x-worker-id'] = workerId;
    }
    const factoryId = session?.factory_id;
    if (factoryId) {
        headers['x-factory-id'] = factoryId;
    }
    const res = await fetch(`/api${endpoint}`, {
        ...options,
        headers
    });
    if (!res.ok) {
        const errText = await res.text();
        let message = errText;
        try {
            const parsed = JSON.parse(errText);
            if (parsed?.error) message = parsed.error;
        } catch { /* not JSON, use raw text */ }
        throw new Error(message);
    }
    return res.json();
}
export const api = {
    // Auth
    login: (emailOrEmployeeId, password) => apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: emailOrEmployeeId, employee_id: emailOrEmployeeId, password })
    }),
    getWorkerContext: () => apiFetch('/auth/me'),
    setLanguage: (lang, workerId) => apiFetch('/auth/set-language', {
        method: 'POST',
        body: JSON.stringify({ lang, worker_id: workerId })
    }),
    // Workers / MDM
    getWorkers: () => apiFetch('/workers'),
    getDepartments: () => apiFetch('/departments'),
    getWorkerNames: () => apiFetch('/worker-names'),
    createWorker: (data) => apiFetch('/workers', {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    updateWorker: (id, updates) => apiFetch(`/workers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates)
    }),
    // People onboarding (BE lead tier)
    peopleMeta: () => apiFetch('/people/meta'),
    peopleOnboard: (rows, dryRun = false) => apiFetch('/people/onboard', {
        method: 'POST',
        body: JSON.stringify({ rows, dry_run: dryRun })
    }),
    peopleUpdate: (empId, fields) => apiFetch(`/people/${encodeURIComponent(empId)}`, {
        method: 'PATCH',
        body: JSON.stringify(fields)
    }),
    peopleResetPassword: (empId) => apiFetch(`/people/${encodeURIComponent(empId)}/reset-password`, { method: 'POST' }),
    // Org Structure & Modules
    getFactories: () => apiFetch('/org/factories'),
    getAreas: () => apiFetch('/org/areas'),
    getJhGroups: (module_group_id) => apiFetch(`/org/jh-groups${module_group_id ? `?module_group_id=${module_group_id}` : ''}`),
    createJhGroup: (data) => apiFetch('/org/jh-groups', {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    updateJhGroup: (id, data) => apiFetch(`/org/jh-groups/${id}`, {
        method: 'PATCH',
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
    getOplWorkflowStages: (factory_id) => {
        const queryParams = new URLSearchParams();
        if (factory_id) queryParams.set('factory_id', factory_id);
        const qs = queryParams.toString();
        return apiFetch(`/org/opl-workflow-stages${qs ? `?${qs}` : ''}`);
    },
    saveOplWorkflowStages: (data) => apiFetch('/org/opl-workflow-stages', {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    // Generalized version for Kaizen/Abnormality's two review phases each.
    getWorkflowStages: (factory_id, module, phase) => {
        const queryParams = new URLSearchParams();
        if (factory_id) queryParams.set('factory_id', factory_id);
        queryParams.set('module', module);
        queryParams.set('phase', phase);
        return apiFetch(`/org/workflow-stages?${queryParams.toString()}`);
    },
    saveWorkflowStages: (data) => apiFetch('/org/workflow-stages', {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    getModuleNames: () => apiFetch('/org/module-names'),
    getModuleGroups: () => apiFetch('/org/module-groups'),
    createModuleGroup: (data) => apiFetch('/org/module-groups', {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    updateModuleGroup: (id, data) => apiFetch(`/org/module-groups/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data)
    }),
    deleteModuleGroup: (id) => apiFetch(`/org/module-groups/${id}`, {
        method: 'DELETE'
    }),
    getRoles: () => apiFetch('/roles'),
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
    getMachines: (jh_group_id, includeInactive) => {
        const params = new URLSearchParams();
        if (jh_group_id) params.set('jh_group_id', jh_group_id);
        if (includeInactive) params.set('include_inactive', 'true');
        const qs = params.toString();
        return apiFetch(`/machines${qs ? `?${qs}` : ''}`);
    },
    createMachine: (data) => apiFetch('/machines', {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    updateMachine: (id, data) => apiFetch(`/machines/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
    }),
    setMachineActive: (id, is_active) => apiFetch(`/machines/${id}/active`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active })
    }),
    getMachineSubsections: (machine_id) => apiFetch(`/machine-subsections${machine_id ? `?machine_id=${machine_id}` : ''}`),
    // Abnormalities Details (mirrors kaizen_details/opl_details)
    getAbnormalityDetails: () => apiFetch('/abnormalities-details'),
    getAbnormalityDetail: (id) => apiFetch(`/abnormalities-details/${id}`),
    createAbnormalityDetail: (data) => apiFetch('/abnormalities-details', {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    reviewAbnormalityDetail: (id, data) => apiFetch(`/abnormalities-details/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
    }),
    getAbnormalityResponsibilities: () => apiFetch('/abnormality-responsibilities'),
    // OPL
    getOplDetails: () => apiFetch('/opl-details'),
    createOplDetail: (data) => apiFetch('/opl-details', {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    updateOplDetail: (id, data) => apiFetch(`/opl-details/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
    }),
    getNotifications: () => apiFetch('/notifications'),
    markNotificationRead: (id) => apiFetch(`/notifications/${id}/read`, { method: 'POST' }),
    markAllNotificationsRead: () => apiFetch('/notifications/read-all', { method: 'POST' }),
    dismissNotification: (id) => apiFetch(`/notifications/${id}`, { method: 'DELETE' }),
    remindTraining: (data) => apiFetch('/opl-training/remind', { method: 'POST', body: JSON.stringify(data) }),
    getOplJhGroupAnalytics: (params = {}) => {
        const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString();
        return apiFetch(`/opl-analytics/jh-group${qs ? `?${qs}` : ''}`);
    },
    getKaizenJhGroupAnalytics: (params = {}) => {
        const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString();
        return apiFetch(`/kaizen-analytics/jh-group${qs ? `?${qs}` : ''}`);
    },
    getAbnormalityJhGroupAnalytics: (params = {}) => {
        const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString();
        return apiFetch(`/abnormality-analytics/jh-group${qs ? `?${qs}` : ''}`);
    },
    getOplTrainingSchedules: () => apiFetch('/opl-training/schedules'),
    createOplTrainingSchedule: (data) => apiFetch('/opl-training/schedules', { method: 'POST', body: JSON.stringify(data) }),
    updateOplTrainingSchedule: (id, data) => apiFetch(`/opl-training/schedules/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteOplTrainingSchedule: (id) => apiFetch(`/opl-training/schedules/${id}`, { method: 'DELETE' }),
    runOplTrainingSchedule: (id) => apiFetch(`/opl-training/schedules/${id}/run`, { method: 'POST' }),
    getOplTrainingScheduleRuns: (id) => apiFetch(`/opl-training/schedules/${id}/runs`),
    getOplRepositorySetting: () => apiFetch('/opl-repository-setting'),
    updateOplRepositorySetting: (extra_factory_ids) => apiFetch('/opl-repository-setting', {
        method: 'POST',
        body: JSON.stringify({ extra_factory_ids })
    }),
    getKaizenRepositorySetting: () => apiFetch('/kaizen-repository-setting'),
    updateKaizenRepositorySetting: (extra_factory_ids) => apiFetch('/kaizen-repository-setting', {
        method: 'POST',
        body: JSON.stringify({ extra_factory_ids })
    }),
    getAbnormalityRepositorySetting: () => apiFetch('/abnormality-repository-setting'),
    updateAbnormalityRepositorySetting: (extra_factory_ids) => apiFetch('/abnormality-repository-setting', {
        method: 'POST',
        body: JSON.stringify({ extra_factory_ids })
    }),
    getOplAuditTrail: (opl_id) => apiFetch(`/opl-audit-trail${opl_id ? `?opl_id=${opl_id}` : ''}`),
    createOplAuditTrail: (data) => apiFetch('/opl-audit-trail', {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    pushOplTraining: (data) => apiFetch('/opl-training/push', {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    getOplTrainingAssignments: (params = {}) => {
        const qs = new URLSearchParams(params).toString();
        return apiFetch(`/opl-training/assignments${qs ? `?${qs}` : ''}`);
    },
    completeOplTrainingAssignment: (id) => apiFetch(`/opl-training/assignments/${id}`, {
        method: 'PATCH'
    }),
    getOplAnalytics: (params = {}) => {
        const qs = new URLSearchParams(params).toString();
        return apiFetch(`/opl-analytics${qs ? `?${qs}` : ''}`);
    },
    getOplAnalyticsTrend: (params = {}) => {
        const qs = new URLSearchParams(params).toString();
        return apiFetch(`/opl-analytics/trend${qs ? `?${qs}` : ''}`);
    },
    getAbnormalityAnalytics: (params = {}) => {
        const qs = new URLSearchParams(params).toString();
        return apiFetch(`/abnormality-analytics${qs ? `?${qs}` : ''}`);
    },
    getAbnormalityAnalyticsTrend: (params = {}) => {
        const qs = new URLSearchParams(params).toString();
        return apiFetch(`/abnormality-analytics/trend${qs ? `?${qs}` : ''}`);
    },
    getAbnormalityAuditTrail: (abnormalityId) => apiFetch(`/abnormality-audit-trail${abnormalityId ? `?abnormality_id=${abnormalityId}` : ''}`),
    // Kaizens
    getKaizenDetails: () => apiFetch('/kaizen-details'),
    createKaizenDetail: (data) => apiFetch('/kaizen-details', {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    reviewKaizenDetail: (id, data) => apiFetch(`/kaizen-details/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
    }),
    getKaizenAuditTrail: (kaizen_id) => apiFetch(`/kaizen-audit-trail${kaizen_id ? `?kaizen_id=${kaizen_id}` : ''}`),
    getKaizenAnalytics: (params = {}) => {
        const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString();
        return apiFetch(`/kaizen-analytics${qs ? `?${qs}` : ''}`);
    },
    getKaizenAnalyticsTrend: (params = {}) => {
        const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString();
        return apiFetch(`/kaizen-analytics/trend${qs ? `?${qs}` : ''}`);
    },
    // Audits
    getZones: () => apiFetch('/zones'),
    createZone: (data) => apiFetch('/zones', {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    deleteZone: (id) => apiFetch(`/zones/${id}`, { method: 'DELETE' }),
    getAuditHomeZones: () => apiFetch('/audit-home-zones'),
    setAuditHomeZone: (empId, zoneId) => apiFetch('/audit-home-zones', {
        method: 'POST',
        body: JSON.stringify({ emp_id: empId, zone_id: zoneId })
    }),
    removeAuditHomeZone: (empId) => apiFetch(`/audit-home-zones/${empId}`, { method: 'DELETE' }),
    getAuditTemplates: () => apiFetch('/audit-templates'),
    createAuditTemplate: (data) => apiFetch('/audit-templates', {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    updateAuditTemplate: (id, data) => apiFetch(`/audit-templates/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
    }),
    deleteAuditTemplate: (id) => apiFetch(`/audit-templates/${id}`, { method: 'DELETE' }),
    addAuditTemplateQuestion: (templateId, data) => apiFetch(`/audit-templates/${templateId}/questions`, {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    updateAuditTemplateQuestion: (id, data) => apiFetch(`/audit-template-questions/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
    }),
    addAuditTemplateCategory: (templateId, data) => apiFetch(`/audit-templates/${templateId}/categories`, {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    updateAuditTemplateCategory: (id, data) => apiFetch(`/audit-template-categories/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
    }),
    getAuditSchedules: () => apiFetch('/audit-schedules'),
    createAuditSchedule: (data) => apiFetch('/audit-schedules', {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    updateAuditSchedule: (id, data) => apiFetch(`/audit-schedules/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
    }),
    deleteAuditSchedule: (id) => apiFetch(`/audit-schedules/${id}`, { method: 'DELETE' }),
    addAuditScheduleAuditor: (scheduleId, empId) => apiFetch(`/audit-schedules/${scheduleId}/auditors`, {
        method: 'POST',
        body: JSON.stringify({ emp_id: empId })
    }),
    copyAuditScheduleAuditors: (scheduleId, fromScheduleId) => apiFetch(`/audit-schedules/${scheduleId}/auditors`, {
        method: 'POST',
        body: JSON.stringify({ copy_from_schedule_id: fromScheduleId })
    }),
    removeAuditScheduleAuditor: (scheduleId, empId) => apiFetch(`/audit-schedules/${scheduleId}/auditors/${empId}`, {
        method: 'DELETE'
    }),
    getMyAuditAdminStatus: () => apiFetch('/audit-admins/me'),
    getAuditTemplateAdmins: (templateId) => apiFetch(`/audit-templates/${templateId}/admins`),
    addAuditTemplateAdmin: (templateId, empId) => apiFetch(`/audit-templates/${templateId}/admins`, {
        method: 'POST',
        body: JSON.stringify({ emp_id: empId })
    }),
    removeAuditTemplateAdmin: (templateId, empId) => apiFetch(`/audit-templates/${templateId}/admins/${empId}`, { method: 'DELETE' }),
    getAuditGlobalAdmins: () => apiFetch('/audit-global-admins'),
    addAuditGlobalAdmin: (empId) => apiFetch('/audit-global-admins', {
        method: 'POST',
        body: JSON.stringify({ emp_id: empId })
    }),
    removeAuditGlobalAdmin: (empId) => apiFetch(`/audit-global-admins/${empId}`, { method: 'DELETE' }),
    getAuditSubmissions: () => apiFetch('/audit-submissions'),
    getAuditScores: () => apiFetch('/audit-scores'),
    getAuditOccurrences: () => apiFetch('/audit-occurrences'),
    // Closes an occurrence now; whoever hasn't submitted simply drops out of the score.
    // The audit's own Audit Admin can do this (as can a BE-lead / Global Audit Admin).
    closeAuditOccurrence: (id) => apiFetch(`/audit-occurrences/${id}/close`, { method: 'POST' }),
    getAuditReport: (occurrenceId) => apiFetch(`/audit-occurrences/${occurrenceId}/report`),
    startAuditSubmission: (data) => apiFetch('/audit-submissions', {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    getAuditSubmission: (id) => apiFetch(`/audit-submissions/${id}`),
    deleteAuditSubmission: (id) => apiFetch(`/audit-submissions/${id}`, { method: 'DELETE' }),
    submitAuditResponses: (id, responses) => apiFetch(`/audit-submissions/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ responses })
    }),
    saveAuditDraft: (id, responses) => apiFetch(`/audit-submissions/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ responses, draft: true })
    }),
    addAuditSubmissionAuditor: (submissionId, empId) => apiFetch(`/audit-submissions/${submissionId}/auditors`, {
        method: 'POST',
        body: JSON.stringify({ emp_id: empId })
    }),
    removeAuditSubmissionAuditor: (submissionId, empId) => apiFetch(`/audit-submissions/${submissionId}/auditors/${empId}`, {
        method: 'DELETE'
    }),
    createAuditChangeRequest: (data) => apiFetch('/audit-change-requests', {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    getAuditChangeRequests: (submissionId) => apiFetch(`/audit-change-requests${submissionId ? `?submission_id=${submissionId}` : ''}`),
    reviewAuditChangeRequest: (id, action, reviewNote) => apiFetch(`/audit-change-requests/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ action, review_note: reviewNote })
    }),
    getAuditAuditTrail: () => apiFetch('/audit-audit-trail'),
    // File Upload
    uploadImage: (imageBase64, filename) => apiFetch('/upload', {
        method: 'POST',
        body: JSON.stringify({ imageBase64, filename })
    })
};
