import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { getSessionContext, roleAtLeast } from '../lib/auth';
export function useKaizens(filter = 'all') {
    const ctx = getSessionContext();
    return useQuery({
        queryKey: ['kaizens', filter, ctx?.worker_id],
        staleTime: 1000 * 60 * 2,
        queryFn: async () => {
            const data = await api.getKaizens();
            return data;
        },
    });
}
export function useKaizen(id) {
    return useQuery({
        queryKey: ['kaizen', id],
        enabled: !!id,
        staleTime: 1000 * 60 * 2,
        queryFn: async () => {
            const data = await api.getKaizens();
            const found = data.find((d) => d.id === id);
            return found ? found : null;
        },
    });
}
export function useCreateKaizenIdea() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (input) => {
            return api.createKaizen(input);
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ['kaizens'] }),
    });
}
export function useUpdateKaizen() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, ...fields }) => {
            return api.createKaizen({ id, ...fields });
        },
        onSuccess: (_d, { id }) => {
            qc.invalidateQueries({ queryKey: ['kaizen', id] });
            qc.invalidateQueries({ queryKey: ['kaizens'] });
        },
    });
}
export function useSubmitKaizen() { return useMutation({ mutationFn: async () => { } }); }
export function useApproveKaizen() { return useMutation({ mutationFn: async () => { } }); }
export function useRejectKaizen() { return useMutation({ mutationFn: async () => { } }); }
export function useKaizenWorkerSearch(q) {
    return useQuery({
        queryKey: ['kaizenWorkerSearch', q.trim()],
        queryFn: async () => {
            const names = await api.getWorkerNames();
            return names.filter((n) => n.name.toLowerCase().includes(q.toLowerCase())).map((n) => ({
                id: n.id,
                name: n.name,
                jh_group: null
            }));
        },
    });
}
export function useTeamMemberNames(ids) {
    const key = [...ids].sort().join(',');
    return useQuery({
        queryKey: ['kaizenTeamNames', key],
        enabled: ids.length > 0,
        queryFn: async () => {
            const names = await api.getWorkerNames();
            const m = {};
            for (const n of names) {
                if (ids.includes(n.id))
                    m[n.id] = n.name;
            }
            return m;
        },
    });
}
export { roleAtLeast };
