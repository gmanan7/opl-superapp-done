import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { roleAtLeast } from '../lib/auth';
export function useOplDetails() {
    return useQuery({
        queryKey: ['opl-details'],
        staleTime: 1000 * 60 * 2,
        queryFn: async () => {
            const data = await api.getOplDetails();
            return data;
        },
    });
}
export function useOplJhGroupAnalytics(params = {}, enabled = true) {
    return useQuery({
        queryKey: ['opl-jh-group-analytics', params],
        enabled,
        retry: false,
        staleTime: 1000 * 60,
        queryFn: async () => api.getOplJhGroupAnalytics(params),
    });
}
export function useOplTrainingSchedules(enabled = true) {
    return useQuery({
        queryKey: ['opl-training-schedules'],
        enabled,
        staleTime: 1000 * 30,
        retry: false,
        queryFn: async () => api.getOplTrainingSchedules(),
    });
}
function useTrainingScheduleMutation(fn) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: fn,
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['opl-training-schedules'] });
            qc.invalidateQueries({ queryKey: ['opl-training-assignments'] });
        },
    });
}
export function useCreateOplTrainingSchedule() {
    return useTrainingScheduleMutation((data) => api.createOplTrainingSchedule(data));
}
export function useUpdateOplTrainingSchedule() {
    return useTrainingScheduleMutation(({ id, ...data }) => api.updateOplTrainingSchedule(id, data));
}
export function useDeleteOplTrainingSchedule() {
    return useTrainingScheduleMutation((id) => api.deleteOplTrainingSchedule(id));
}
export function useRunOplTrainingSchedule() {
    return useTrainingScheduleMutation((id) => api.runOplTrainingSchedule(id));
}

export function useOplRepositorySetting() {
    return useQuery({
        queryKey: ['opl-repository-setting'],
        staleTime: 1000 * 60 * 5,
        queryFn: async () => api.getOplRepositorySetting(),
    });
}
export function useUpdateOplRepositorySetting() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (extra_factory_ids) => api.updateOplRepositorySetting(extra_factory_ids),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['opl-repository-setting'] });
        }
    });
}
export function useCreateOplDetail() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (data) => {
            return api.createOplDetail(data);
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['opl-details'] });
            qc.invalidateQueries({ queryKey: ['opl-audit-trail'] });
            qc.invalidateQueries({ queryKey: ['notifications'] });
        }
    });
}
export function useUpdateOplDetail() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, ...data }) => {
            return api.updateOplDetail(id, data);
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['opl-details'] });
            qc.invalidateQueries({ queryKey: ['opl-audit-trail'] });
            qc.invalidateQueries({ queryKey: ['notifications'] });
        }
    });
}
export function useOplAuditTrail(oplId) {
    return useQuery({
        queryKey: ['opl-audit-trail', oplId],
        queryFn: async () => {
            return api.getOplAuditTrail(oplId);
        }
    });
}
export function useCreateOplAuditTrail() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (data) => {
            return api.createOplAuditTrail(data);
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['opl-audit-trail'] });
        }
    });
}
export function useSubmitOPL() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, performed_by }) => {
            return api.updateOplDetail(id, {
                status: 'pending_jh_review',
                action: 'submitted_for_review',
                comments: 'Submitted for JH Group Lead review',
                performed_by
            });
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['opl-details'] });
            qc.invalidateQueries({ queryKey: ['opl-audit-trail'] });
            qc.invalidateQueries({ queryKey: ['notifications'] });
        }
    });
}

export function useJhAcceptOPL() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, classification, is_star, comments, performed_by, edits }) => {
            return api.updateOplDetail(id, {
                status: 'approved',
                classification,
                is_star: is_star !== undefined ? Boolean(is_star) : false,
                action: 'jh_accepted',
                // Optional reviewer edits applied at approval time — only send keys that were provided.
                ...(edits || {}),
                comments: comments || (is_star ? 'Approved as Critical OPL by JH Group Lead' : 'Approved by JH Group Lead'),
                performed_by
            });
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['opl-details'] });
            qc.invalidateQueries({ queryKey: ['opl-audit-trail'] });
            qc.invalidateQueries({ queryKey: ['notifications'] });
        }
    });
}

export function useJhRejectOPL() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, reason, performed_by }) => {
            return api.updateOplDetail(id, {
                status: 'rejected',
                rejection_reason: reason,
                action: 'jh_rejected',
                comments: reason,
                performed_by
            });
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['opl-details'] });
            qc.invalidateQueries({ queryKey: ['opl-audit-trail'] });
            qc.invalidateQueries({ queryKey: ['notifications'] });
        }
    });
}

export function useBeAcceptOPL() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, classification, comments, performed_by }) => {
            return api.updateOplDetail(id, {
                status: 'approved',
                classification,
                action: 'be_accepted',
                comments: comments || 'Approved by Plant BE Lead',
                performed_by
            });
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['opl-details'] });
            qc.invalidateQueries({ queryKey: ['opl-audit-trail'] });
            qc.invalidateQueries({ queryKey: ['notifications'] });
        }
    });
}

export function useBeRejectOPL() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, reason, performed_by }) => {
            return api.updateOplDetail(id, {
                status: 'rejected',
                rejection_reason: reason,
                action: 'be_rejected',
                comments: reason,
                performed_by
            });
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['opl-details'] });
            qc.invalidateQueries({ queryKey: ['opl-audit-trail'] });
            qc.invalidateQueries({ queryKey: ['notifications'] });
        }
    });
}

export function useSetStarOPL() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, is_star, performed_by }) => {
            return api.updateOplDetail(id, {
                is_star,
                action: is_star ? 'starred' : 'unstarred',
                comments: is_star ? 'Star marked OPL' : 'Removed star mark',
                performed_by
            });
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['opl-details'] });
            qc.invalidateQueries({ queryKey: ['opl-audit-trail'] });
            qc.invalidateQueries({ queryKey: ['notifications'] });
        }
    });
}

export function useUpdateOplClassification() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, classification, performed_by }) => {
            return api.updateOplDetail(id, {
                classification,
                action: 'classification_changed',
                comments: `Updated classification to "${classification}"`,
                performed_by
            });
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['opl-details'] });
            qc.invalidateQueries({ queryKey: ['opl-audit-trail'] });
            qc.invalidateQueries({ queryKey: ['notifications'] });
        }
    });
}

export function usePushOplTraining() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (data) => {
            return api.pushOplTraining(data);
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['opl-training-assignments'] });
            qc.invalidateQueries({ queryKey: ['notifications'] });
        }
    });
}

export function useOplTrainingAssignments(params = {}, options = {}) {
    return useQuery({
        queryKey: ['opl-training-assignments', params],
        staleTime: 1000 * 30,
        refetchInterval: 1000 * 45,
        enabled: options.enabled !== false,
        queryFn: async () => {
            return api.getOplTrainingAssignments(params);
        }
    });
}

export function useCompleteOplTrainingAssignment() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id) => {
            return api.completeOplTrainingAssignment(id);
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['opl-training-assignments'] });
            qc.invalidateQueries({ queryKey: ['notifications'] });
        }
    });
}

export function useOplAnalytics(params = {}) {
    return useQuery({
        queryKey: ['opl-analytics', params],
        staleTime: 1000 * 60,
        queryFn: async () => {
            return api.getOplAnalytics(params);
        }
    });
}

export function useOplAnalyticsTrend(params = {}, options = {}) {
    return useQuery({
        queryKey: ['opl-analytics-trend', params],
        staleTime: 1000 * 60,
        enabled: options.enabled !== false,
        queryFn: async () => {
            return api.getOplAnalyticsTrend(params);
        }
    });
}

export { roleAtLeast };
