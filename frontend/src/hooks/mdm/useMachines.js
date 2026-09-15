import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { mdmKeys } from './keys';
export function useMachines(filters = {}) {
    return useQuery({
        queryKey: mdmKeys.machines(filters),
        queryFn: async () => {
            const data = await api.getMachines(filters.jhGroupId, filters.includeInactive);
            return data;
        },
    });
}
function useMachineMutation(mutationFn) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [...mdmKeys.all, 'machines'] });
        },
    });
}
export function useCreateMachine() {
    return useMachineMutation(async (input) => {
        return api.createMachine(input);
    });
}
export function useUpdateMachine() {
    return useMachineMutation(async ({ id, ...data }) => {
        return api.updateMachine(id, data);
    });
}
export function useSetMachineActive() {
    return useMachineMutation(async ({ id, is_active }) => {
        return api.setMachineActive(id, is_active);
    });
}
