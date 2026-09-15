import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { deactivateUser, reactivateUser, generatePin, createPinUser, createEmailUser, updateUser, } from '../../lib/manageUser';
import { mdmKeys, } from './keys';
export function useWorkers(filters = {}) {
    return useQuery({
        queryKey: mdmKeys.workers(filters),
        queryFn: async () => {
            const data = await api.getWorkers();
            const rows = data.map((w) => ({
                id: w.id,
                factory_id: w.factory_id || null,
                employee_id: w.employee_id || '',
                name: w.name,
                role: w.role || w.tpm_role || 'apprentice',
                apprentice_type: w.apprentice_type || null,
                jh_group_id: w.jh_group_id || null,
                dmt_id: w.dmt_id || null,
                lang_pref: w.lang_pref || 'en',
                is_active: w.is_active !== false,
                created_at: w.created_at || new Date().toISOString(),
                last_login_at: w.last_login_at || null,
                deactivated_at: null,
                jh_group: w.jh_group || null,
                dmt: w.dmt || null,
            }));
            return { rows, total: rows.length };
        },
    });
}
export function useDeactivateWorker() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (input) => {
            return deactivateUser(input.workerId, input.reason, input.reasonText);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [...mdmKeys.all, 'workers'] });
        },
    });
}
export function useReactivateWorker() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (input) => {
            return reactivateUser(input.workerId);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [...mdmKeys.all, 'workers'] });
        },
    });
}
export function useInvitePinWorker() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (payload) => {
            const res = await createPinUser(payload);
            return { pin: res.pin, profile: res };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [...mdmKeys.all, 'workers'] });
        },
    });
}
export function useInviteEmailWorker() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (payload) => {
            return createEmailUser(payload);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [...mdmKeys.all, 'workers'] });
        },
    });
}
export function useUpdateWorker() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (input) => {
            return updateUser(input.workerId, input.fields);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [...mdmKeys.all, 'workers'] });
        },
    });
}
export function useGeneratePin() {
    return useMutation({
        mutationFn: async (input) => {
            const res = await generatePin(input.workerId, input.reason, input.reasonText);
            return { pin: res.pin };
        },
    });
}
