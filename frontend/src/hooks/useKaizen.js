import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export function useCreateKaizenDetail() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ title, content, category, before_image, submitted_by, status, jh_group_id }) => api.createKaizenDetail({ title, content, category, before_image, submitted_by, status, jh_group_id }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['kaizenDetails'] });
            qc.invalidateQueries({ queryKey: ['notifications'] });
        },
    });
}
export function useKaizenDetails() {
    return useQuery({
        queryKey: ['kaizenDetails'],
        staleTime: 1000 * 30,
        queryFn: async () => api.getKaizenDetails(),
    });
}
export function useKaizenRepositorySetting() {
    return useQuery({
        queryKey: ['kaizen-repository-setting'],
        staleTime: 1000 * 60 * 5,
        queryFn: async () => api.getKaizenRepositorySetting(),
    });
}
export function useUpdateKaizenRepositorySetting() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (extra_factory_ids) => api.updateKaizenRepositorySetting(extra_factory_ids),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['kaizen-repository-setting'] }),
    });
}
export function useKaizenAuditTrail(kaizenId) {
    return useQuery({
        queryKey: ['kaizenAuditTrail', kaizenId],
        enabled: !!kaizenId,
        queryFn: async () => api.getKaizenAuditTrail(kaizenId),
    });
}
export function useKaizenAnalytics(params = {}) {
    return useQuery({
        queryKey: ['kaizen-analytics', params],
        staleTime: 1000 * 60,
        queryFn: async () => api.getKaizenAnalytics(params),
    });
}
export function useKaizenAnalyticsTrend(params = {}, options = {}) {
    return useQuery({
        queryKey: ['kaizen-analytics-trend', params],
        staleTime: 1000 * 60,
        enabled: options.enabled !== false,
        queryFn: async () => api.getKaizenAnalyticsTrend(params),
    });
}
export function useReviewKaizenDetail() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, ...fields }) => api.reviewKaizenDetail(id, fields),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['kaizenDetails'] });
            qc.invalidateQueries({ queryKey: ['kaizenAuditTrail'] });
            qc.invalidateQueries({ queryKey: ['notifications'] });
        },
    });
}
export function useKaizenJhGroupAnalytics(params = {}, enabled = true) {
    return useQuery({
        queryKey: ['kaizen-jh-group-analytics', params],
        enabled,
        retry: false,
        staleTime: 1000 * 60,
        queryFn: async () => api.getKaizenJhGroupAnalytics(params),
    });
}
