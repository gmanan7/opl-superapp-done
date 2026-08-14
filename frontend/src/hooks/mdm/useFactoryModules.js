import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { mdmKeys } from './keys';
export function useFactoryModules() {
    return useQuery({
        queryKey: mdmKeys.modules(),
        queryFn: async () => {
            const data = await api.getModules();
            return data;
        },
    });
}
export function buildEnabledSet(rows) {
    return new Set((rows ?? []).filter((r) => r.is_enabled).map((r) => r.module_key));
}
export function useToggleModule() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (input) => {
            const res = await api.toggleModule(input.module_key || input.id, input.is_enabled);
            return res;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: mdmKeys.modules() });
        },
    });
}
