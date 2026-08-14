import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { roleAtLeast, getSessionContext } from '../lib/auth';
export { roleAtLeast, getSessionContext };
export function useAbnormalities(filters = {}) {
    const ctx = getSessionContext();
    return useQuery({
        queryKey: ['abnormality', 'list', filters, ctx?.factory_id, ctx?.jh_group_id, ctx?.role],
        queryFn: async () => {
            const data = await api.getAbnormalities();
            return data;
        },
    });
}
export function useAbnormality(id) {
    return useQuery({
        queryKey: ['abnormality', id],
        enabled: !!id,
        queryFn: async () => {
            const data = await api.getAbnormality(id);
            return {
                ...data.abnormality,
                assignments: data.assignments || [],
                updates: data.updates || []
            };
        },
    });
}
export function useCreateAbnormality() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (input) => {
            return api.createAbnormality(input);
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['abnormality', 'list'] });
        },
    });
}
export function useUpdateAbnormality() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, status, status_from, note }) => {
            return api.createAbnormality({ id, status, status_from, note });
        },
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({ queryKey: ['abnormality', 'list'] });
            qc.invalidateQueries({ queryKey: ['abnormality', vars.id] });
        },
    });
}
export function useAssignAbnormality() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (input) => {
            return api.createAbnormality(input);
        },
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({ queryKey: ['abnormality', 'list'] });
            qc.invalidateQueries({ queryKey: ['abnormality', vars.abnormality_id] });
        },
    });
}
export function useAddAbnormalityUpdate() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ abnormality_id, note }) => {
            return api.createAbnormality({ abnormality_id, note });
        },
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({ queryKey: ['abnormality', vars.abnormality_id] });
        },
    });
}
export function useWorkersByGroup(jh_group_id) {
    return useQuery({
        queryKey: ['workers-by-group', jh_group_id],
        queryFn: async () => {
            const workers = await api.getWorkers();
            return workers.map((w) => ({
                id: w.id,
                name: w.name,
                tpm_role: w.tpm_role || w.role || 'apprentice',
                employee_id: w.employee_id || ''
            }));
        },
    });
}
export function useMachinesByGroup(jh_group_id) {
    return useQuery({
        queryKey: ['machines-by-group', jh_group_id],
        queryFn: async () => {
            const machines = await api.getMachines(jh_group_id ?? undefined);
            return machines.map((m) => ({
                id: m.id,
                name: m.name,
                jh_group_id: m.jh_group_id || null
            }));
        },
    });
}
export function useMachineSubsections(machine_id) {
    return useQuery({
        queryKey: ['machine-subsections', machine_id],
        queryFn: async () => {
            const subs = await api.getMachineSubsections(machine_id ?? undefined);
            return subs.map((s) => ({ id: s.id, name: s.name }));
        },
    });
}
