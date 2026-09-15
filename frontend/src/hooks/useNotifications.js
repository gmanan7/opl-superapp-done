import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

// Poll-based — no websockets, keeps the app fully offline-capable. Every workflow
// mutation (approve / reject / forward / submit …) also invalidates ['notifications']
// on success, so the panel updates immediately after your own action; the poll just
// catches things other people did.
export function useNotifications() {
    return useQuery({
        queryKey: ['notifications'],
        queryFn: async () => api.getNotifications(),
        refetchInterval: 15 * 1000,
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: true,
        refetchOnMount: 'always',
        retry: false,
        staleTime: 3 * 1000,
    });
}

export function useMarkNotificationRead() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id) => api.markNotificationRead(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
    });
}

export function useMarkAllNotificationsRead() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async () => api.markAllNotificationsRead(),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
    });
}

export function useDismissNotification() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id) => api.dismissNotification(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
    });
}

export function useRemindTraining() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (data) => api.remindTraining(data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['opl-jh-group-analytics'] });
            qc.invalidateQueries({ queryKey: ['notifications'] });
        },
    });
}
