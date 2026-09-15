import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export function useZones() {
    return useQuery({
        queryKey: ['zones'],
        staleTime: 1000 * 60,
        queryFn: async () => api.getZones(),
    });
}
export function useCreateZone() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (name) => api.createZone({ name }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['zones'] }),
    });
}
export function useDeleteZone() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id) => api.deleteZone(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['zones'] }),
    });
}

export function useAuditHomeZones() {
    return useQuery({
        queryKey: ['auditHomeZones'],
        staleTime: 1000 * 60,
        queryFn: async () => api.getAuditHomeZones(),
    });
}
export function useSetAuditHomeZone() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ empId, zoneId }) => api.setAuditHomeZone(empId, zoneId),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['auditHomeZones'] }),
    });
}
export function useRemoveAuditHomeZone() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (empId) => api.removeAuditHomeZone(empId),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['auditHomeZones'] }),
    });
}

export function useAuditTemplates() {
    return useQuery({
        queryKey: ['auditTemplates'],
        staleTime: 1000 * 60,
        queryFn: async () => api.getAuditTemplates(),
    });
}
export function useCreateAuditTemplate() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (payload) => api.createAuditTemplate(payload),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['auditTemplates'] }),
    });
}
export function useUpdateAuditTemplate() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, ...data }) => api.updateAuditTemplate(id, data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['auditTemplates'] }),
    });
}
export function useAddAuditTemplateCategory() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ templateId, ...data }) => api.addAuditTemplateCategory(templateId, data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['auditTemplates'] }),
    });
}
export function useUpdateAuditTemplateCategory() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, ...data }) => api.updateAuditTemplateCategory(id, data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['auditTemplates'] }),
    });
}
export function useDeleteAuditTemplate() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id) => api.deleteAuditTemplate(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['auditTemplates'] });
            qc.invalidateQueries({ queryKey: ['auditSchedules'] });
        },
    });
}
export function useAddAuditTemplateQuestion() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ templateId, ...data }) => api.addAuditTemplateQuestion(templateId, data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['auditTemplates'] }),
    });
}
export function useUpdateAuditTemplateQuestion() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, ...data }) => api.updateAuditTemplateQuestion(id, data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['auditTemplates'] }),
    });
}

export function useAuditSchedules() {
    return useQuery({
        queryKey: ['auditSchedules'],
        staleTime: 1000 * 30,
        queryFn: async () => api.getAuditSchedules(),
    });
}
export function useCreateAuditSchedule() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (data) => api.createAuditSchedule(data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['auditSchedules'] }),
    });
}
export function useUpdateAuditSchedule() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, ...data }) => api.updateAuditSchedule(id, data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['auditSchedules'] }),
    });
}
export function useDeleteAuditSchedule() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id) => api.deleteAuditSchedule(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['auditSchedules'] });
            qc.invalidateQueries({ queryKey: ['auditSubmissions'] });
        },
    });
}
export function useAddAuditScheduleAuditor() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ scheduleId, empId }) => api.addAuditScheduleAuditor(scheduleId, empId),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['auditSchedules'] }),
    });
}
export function useCopyAuditScheduleAuditors() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ scheduleId, fromScheduleId }) => api.copyAuditScheduleAuditors(scheduleId, fromScheduleId),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['auditSchedules'] }),
    });
}
export function useRemoveAuditScheduleAuditor() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ scheduleId, empId }) => api.removeAuditScheduleAuditor(scheduleId, empId),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['auditSchedules'] }),
    });
}

export function useAuditScores(enabled = true) {
    return useQuery({
        queryKey: ['auditScores'],
        enabled,
        staleTime: 1000 * 30,
        queryFn: async () => api.getAuditScores(),
    });
}
export function useAuditOccurrences(enabled = true) {
    return useQuery({
        queryKey: ['auditOccurrences'],
        enabled,
        staleTime: 1000 * 20,
        queryFn: async () => api.getAuditOccurrences(),
    });
}
export function useAuditReport(occurrenceId) {
    return useQuery({
        queryKey: ['auditReport', occurrenceId],
        enabled: Boolean(occurrenceId),
        queryFn: async () => api.getAuditReport(occurrenceId),
    });
}
export function useCloseAuditOccurrence() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id) => api.closeAuditOccurrence(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['auditOccurrences'] });
            qc.invalidateQueries({ queryKey: ['auditScores'] });
            qc.invalidateQueries({ queryKey: ['auditSubmissions'] });
        },
    });
}
export function useAuditSubmissions() {
    return useQuery({
        queryKey: ['auditSubmissions'],
        staleTime: 1000 * 15,
        queryFn: async () => api.getAuditSubmissions(),
    });
}
export function useStartAuditSubmission() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ scheduleId, dueDate }) => api.startAuditSubmission({ schedule_id: scheduleId, due_date: dueDate }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['auditSubmissions'] }),
    });
}
export function useDeleteAuditSubmission() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id) => api.deleteAuditSubmission(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['auditSubmissions'] });
            qc.invalidateQueries({ queryKey: ['auditAuditTrail'] });
        },
    });
}
export function useAuditSubmission(id) {
    return useQuery({
        queryKey: ['auditSubmission', id],
        enabled: !!id,
        queryFn: async () => api.getAuditSubmission(id),
    });
}
export function useSubmitAuditResponses() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, responses }) => api.submitAuditResponses(id, responses),
        onSuccess: (_d, { id }) => {
            qc.invalidateQueries({ queryKey: ['auditSubmission', id] });
            qc.invalidateQueries({ queryKey: ['auditSubmissions'] });
        },
    });
}
export function useSaveAuditDraft() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, responses }) => api.saveAuditDraft(id, responses),
        onSuccess: (_d, { id }) => {
            qc.invalidateQueries({ queryKey: ['auditSubmission', id] });
            qc.invalidateQueries({ queryKey: ['auditSubmissions'] });
        },
    });
}
export function useAddAuditSubmissionAuditor() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ submissionId, empId }) => api.addAuditSubmissionAuditor(submissionId, empId),
        onSuccess: (_d, { submissionId }) => {
            qc.invalidateQueries({ queryKey: ['auditSubmission', submissionId] });
            qc.invalidateQueries({ queryKey: ['auditSubmissions'] });
        },
    });
}
export function useRemoveAuditSubmissionAuditor() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ submissionId, empId }) => api.removeAuditSubmissionAuditor(submissionId, empId),
        onSuccess: (_d, { submissionId }) => {
            qc.invalidateQueries({ queryKey: ['auditSubmission', submissionId] });
            qc.invalidateQueries({ queryKey: ['auditSubmissions'] });
        },
    });
}

export function useAuditChangeRequests(submissionId) {
    return useQuery({
        queryKey: ['auditChangeRequests', submissionId || 'all'],
        staleTime: 1000 * 15,
        queryFn: async () => api.getAuditChangeRequests(submissionId),
    });
}
export function useCreateAuditChangeRequest() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (data) => api.createAuditChangeRequest(data),
        onSuccess: (_d, { submission_id }) => {
            qc.invalidateQueries({ queryKey: ['auditChangeRequests'] });
            qc.invalidateQueries({ queryKey: ['auditSubmission', submission_id] });
        },
    });
}
export function useReviewAuditChangeRequest() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, action, reviewNote }) => api.reviewAuditChangeRequest(id, action, reviewNote),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['auditChangeRequests'] });
            qc.invalidateQueries({ queryKey: ['auditSubmissions'] });
            qc.invalidateQueries({ queryKey: ['auditAuditTrail'] });
        },
    });
}

export function useAuditAuditTrail() {
    return useQuery({
        queryKey: ['auditAuditTrail'],
        staleTime: 1000 * 30,
        queryFn: async () => api.getAuditAuditTrail(),
    });
}

export function useMyAuditAdminStatus() {
    return useQuery({
        queryKey: ['myAuditAdminStatus'],
        staleTime: 1000 * 60,
        queryFn: async () => api.getMyAuditAdminStatus(),
    });
}
export function useAuditTemplateAdmins(templateId) {
    return useQuery({
        queryKey: ['auditTemplateAdmins', templateId],
        enabled: !!templateId,
        staleTime: 1000 * 60,
        queryFn: async () => api.getAuditTemplateAdmins(templateId),
    });
}
export function useAddAuditTemplateAdmin() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ templateId, empId }) => api.addAuditTemplateAdmin(templateId, empId),
        onSuccess: (_d, { templateId }) => qc.invalidateQueries({ queryKey: ['auditTemplateAdmins', templateId] }),
    });
}
export function useRemoveAuditTemplateAdmin() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ templateId, empId }) => api.removeAuditTemplateAdmin(templateId, empId),
        onSuccess: (_d, { templateId }) => qc.invalidateQueries({ queryKey: ['auditTemplateAdmins', templateId] }),
    });
}

export function useAuditGlobalAdmins() {
    return useQuery({
        queryKey: ['auditGlobalAdmins'],
        staleTime: 1000 * 60,
        queryFn: async () => api.getAuditGlobalAdmins(),
    });
}
export function useAddAuditGlobalAdmin() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (empId) => api.addAuditGlobalAdmin(empId),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['auditGlobalAdmins'] }),
    });
}
export function useRemoveAuditGlobalAdmin() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (empId) => api.removeAuditGlobalAdmin(empId),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['auditGlobalAdmins'] }),
    });
}
