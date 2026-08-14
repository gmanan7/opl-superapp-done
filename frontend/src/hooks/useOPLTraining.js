import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { getSessionContext } from '../lib/auth';
export const trainingKeys = {
    all: ['oplTraining'],
    myDue: (wid) => ['oplTraining', 'myDue', wid],
    board: (wid) => ['oplTraining', 'board', wid],
    roster: (oplId) => ['oplTraining', 'roster', oplId],
    myStatus: (oplId, wid) => ['oplTraining', 'myStatus', oplId, wid],
};
export function useMyTrainingDue() {
    const ctx = getSessionContext();
    return useQuery({
        queryKey: trainingKeys.myDue(ctx?.worker_id),
        queryFn: async () => {
            const rows = await api.getOPLTrainingDue();
            return rows;
        },
    });
}
export function useGroupDueBoard(enabled = true) {
    const ctx = getSessionContext();
    return useQuery({
        queryKey: trainingKeys.board(ctx?.worker_id),
        enabled: enabled && !!ctx?.worker_id,
        queryFn: async () => {
            const rows = await api.getOPLTrainingDue();
            return rows;
        },
    });
}
export function useOPLTrainingRoster(oplId) {
    return useQuery({
        queryKey: trainingKeys.roster(oplId),
        enabled: !!oplId,
        queryFn: async () => {
            const names = await api.getWorkerNames();
            return names.map((n) => ({
                worker_id: n.id,
                name: n.name,
                trained_at: null,
                retrain_cycle: 1,
                is_due: true,
                never_trained: true
            }));
        },
    });
}
export function useMyOplStatus(oplId) {
    const ctx = getSessionContext();
    return useQuery({
        queryKey: trainingKeys.myStatus(oplId, ctx?.worker_id),
        enabled: !!oplId && !!ctx?.worker_id,
        queryFn: async () => {
            return {
                in_audience: true,
                trained_at: new Date().toISOString(),
                retrain_cycle: 1,
                is_due: false
            };
        },
    });
}
export function useSelfAck() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (_oplId) => { },
        onSuccess: () => qc.invalidateQueries({ queryKey: trainingKeys.all }),
    });
}
export function useMarkTrained() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (_params) => { },
        onSuccess: () => qc.invalidateQueries({ queryKey: trainingKeys.all }),
    });
}
export function useSetAudience() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (_params) => { },
        onSuccess: () => qc.invalidateQueries({ queryKey: trainingKeys.all }),
    });
}
export function useRetireOPL() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (_params) => { },
        onSuccess: () => qc.invalidateQueries({ queryKey: trainingKeys.all }),
    });
}
export function useSetRetrainFrequency() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (_params) => { },
        onSuccess: () => qc.invalidateQueries({ queryKey: trainingKeys.all }),
    });
}
