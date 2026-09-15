import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dmtApi } from './dmtApi';

export function useDmtTiers() {
    return useQuery({ queryKey: ['dmt', 'tiers'], queryFn: dmtApi.listTiers });
}

export function useDmtTierMembers(tierId) {
    return useQuery({
        queryKey: ['dmt', 'tier-members', tierId],
        queryFn: () => dmtApi.listTierMembers(tierId),
        enabled: !!tierId,
    });
}

export function useDmtTierKpis(tierId) {
    return useQuery({
        queryKey: ['dmt', 'tier-kpis', tierId],
        queryFn: () => dmtApi.listTierKpis(tierId),
        enabled: !!tierId,
    });
}

export function useDmtTierMutations() {
    const qc = useQueryClient();
    const invalidateTiers = () => qc.invalidateQueries({ queryKey: ['dmt', 'tiers'] });

    const createTier = useMutation({
        mutationFn: (name) => dmtApi.createTier(name),
        onSuccess: invalidateTiers,
    });
    const updateTier = useMutation({
        mutationFn: ({ id, ...body }) => dmtApi.updateTier(id, body),
        onSuccess: invalidateTiers,
    });
    const addMember = useMutation({
        mutationFn: ({ tierId, empId }) => dmtApi.addTierMember(tierId, empId),
        onSuccess: (_, { tierId }) => {
            qc.invalidateQueries({ queryKey: ['dmt', 'tier-members', tierId] });
            invalidateTiers();
        },
    });
    const removeMember = useMutation({
        mutationFn: ({ tierId, empId }) => dmtApi.removeTierMember(tierId, empId),
        onSuccess: (_, { tierId }) => {
            qc.invalidateQueries({ queryKey: ['dmt', 'tier-members', tierId] });
            invalidateTiers();
        },
    });
    const setKpis = useMutation({
        mutationFn: ({ tierId, kpiIds }) => dmtApi.setTierKpis(tierId, kpiIds),
        onSuccess: (_, { tierId }) => {
            qc.invalidateQueries({ queryKey: ['dmt', 'tier-kpis', tierId] });
            invalidateTiers();
        },
    });

    return { createTier, updateTier, addMember, removeMember, setKpis };
}
