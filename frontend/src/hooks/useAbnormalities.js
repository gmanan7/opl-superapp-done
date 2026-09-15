import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { roleAtLeast, getSessionContext } from '../lib/auth';
export { roleAtLeast, getSessionContext };
export function useAbnormalityDetails() {
    const ctx = getSessionContext();
    return useQuery({
        queryKey: ['abnormality-details', 'list', ctx?.factory_id, ctx?.jh_group_id, ctx?.role],
        queryFn: async () => api.getAbnormalityDetails(),
    });
}
export function useAbnormalityDetail(id) {
    return useQuery({
        queryKey: ['abnormality-details', id],
        enabled: !!id,
        queryFn: async () => api.getAbnormalityDetail(id),
    });
}
export function useCreateAbnormalityDetail() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (input) => api.createAbnormalityDetail(input),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['abnormality-details', 'list'] });
            qc.invalidateQueries({ queryKey: ['notifications'] });
        },
    });
}
export function useAbnormalityResponsibilities() {
    return useQuery({
        queryKey: ['abnormality-responsibilities'],
        queryFn: async () => api.getAbnormalityResponsibilities(),
    });
}
export function useReviewAbnormalityDetail() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, ...data }) => api.reviewAbnormalityDetail(id, data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['abnormality-details', 'list'] });
            qc.invalidateQueries({ queryKey: ['notifications'] });
        },
    });
}
export function useAbnormalityAnalytics(params = {}) {
    return useQuery({
        queryKey: ['abnormality-analytics', params],
        staleTime: 1000 * 60,
        queryFn: async () => api.getAbnormalityAnalytics(params),
    });
}
export function useAbnormalityAnalyticsTrend(params = {}, options = {}) {
    return useQuery({
        queryKey: ['abnormality-analytics-trend', params],
        staleTime: 1000 * 60,
        enabled: options.enabled !== false,
        queryFn: async () => api.getAbnormalityAnalyticsTrend(params),
    });
}
export function useAbnormalityAuditTrail(abnormalityId) {
    return useQuery({
        queryKey: ['abnormality-audit-trail', abnormalityId],
        enabled: Boolean(abnormalityId),
        queryFn: async () => api.getAbnormalityAuditTrail(abnormalityId),
    });
}

export function useAbnormalityRepositorySetting() {
    return useQuery({
        queryKey: ['abnormality-repository-setting'],
        staleTime: 1000 * 60 * 5,
        queryFn: async () => api.getAbnormalityRepositorySetting(),
    });
}
export function useUpdateAbnormalityRepositorySetting() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (extra_factory_ids) => api.updateAbnormalityRepositorySetting(extra_factory_ids),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['abnormality-repository-setting'] }),
    });
}
export function useAbnormalityJhGroupAnalytics(params = {}, enabled = true) {
    return useQuery({
        queryKey: ['abnormality-jh-group-analytics', params],
        enabled,
        retry: false,
        staleTime: 1000 * 60,
        queryFn: async () => api.getAbnormalityJhGroupAnalytics(params),
    });
}
