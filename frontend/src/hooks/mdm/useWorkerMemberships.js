import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mdmKeys } from './keys';
export function useWorkerMemberships(workerId) {
    return useQuery({
        queryKey: mdmKeys.memberships(workerId ?? ''),
        enabled: !!workerId,
        queryFn: async () => {
            return [];
        },
    });
}
export function useMembershipsByWorkers(workerIds) {
    return useQuery({
        queryKey: [...mdmKeys.all, 'memberships-batch', [...workerIds].sort().join(',')],
        enabled: workerIds.length > 0,
        queryFn: async () => {
            return new Map();
        },
    });
}
export function useAddMembership() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (input) => {
            return {
                id: 'new-membership',
                factory_id: '00000000-0000-0000-0000-000000000001',
                worker_profile_id: input.workerId,
                jh_group_id: input.jhGroupId ?? null,
                dmt_id: input.dmtId ?? null,
                is_active: true,
                created_at: new Date().toISOString(),
                jh_group: null,
                dmt: null
            };
        },
        onSuccess: (_data, input) => {
            queryClient.invalidateQueries({ queryKey: mdmKeys.memberships(input.workerId) });
            queryClient.invalidateQueries({ queryKey: [...mdmKeys.all, 'memberships-batch'] });
            queryClient.invalidateQueries({ queryKey: [...mdmKeys.all, 'workers'] });
        },
    });
}
export function useRemoveMembership() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (input) => {
            return { id: input.membershipId };
        },
        onSuccess: (_data, input) => {
            queryClient.invalidateQueries({ queryKey: mdmKeys.memberships(input.workerId) });
            queryClient.invalidateQueries({ queryKey: [...mdmKeys.all, 'memberships-batch'] });
            queryClient.invalidateQueries({ queryKey: [...mdmKeys.all, 'workers'] });
        },
    });
}
