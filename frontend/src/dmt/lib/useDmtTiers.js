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

export function useDmtTierTaskViewers(tierId) {
    return useQuery({
        queryKey: ['dmt', 'tier-task-viewers', tierId],
        queryFn: () => dmtApi.listTierTaskViewers(tierId),
        enabled: !!tierId,
    });
}

export function useMyTierKpis() {
    return useQuery({ queryKey: ['dmt', 'my-tier-kpis'], queryFn: dmtApi.myTierKpis });
}

// kpi_id -> the one group it belongs to (a KPI can belong to only one group).
export function useKpiOwners() {
    return useQuery({ queryKey: ['dmt', 'kpi-owners'], queryFn: dmtApi.kpiOwners });
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
        mutationFn: ({ name, dmtId, jhGroupId, displayName, leadEmpId, parentTierId, isPrivate }) => dmtApi.createTier(name, dmtId, jhGroupId, {
            display_name: displayName || undefined,
            lead_emp_id: leadEmpId || undefined,
            parent_tier_id: parentTierId || undefined,
            is_private: isPrivate ? true : undefined,
        }),
        onSuccess: invalidateTiers,
    });
    const updateTier = useMutation({
        mutationFn: ({ id, ...body }) => dmtApi.updateTier(id, body),
        onSuccess: invalidateTiers,
    });
    const deleteTier = useMutation({
        mutationFn: (id) => dmtApi.deleteTier(id),
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
    const addTaskViewer = useMutation({
        mutationFn: ({ tierId, empId }) => dmtApi.addTierTaskViewer(tierId, empId),
        onSuccess: (_, { tierId }) => qc.invalidateQueries({ queryKey: ['dmt', 'tier-task-viewers', tierId] }),
    });
    const removeTaskViewer = useMutation({
        mutationFn: ({ tierId, empId }) => dmtApi.removeTierTaskViewer(tierId, empId),
        onSuccess: (_, { tierId }) => qc.invalidateQueries({ queryKey: ['dmt', 'tier-task-viewers', tierId] }),
    });
    const setKpis = useMutation({
        mutationFn: ({ tierId, kpiIds }) => dmtApi.setTierKpis(tierId, kpiIds),
        onSuccess: (_, { tierId }) => {
            qc.invalidateQueries({ queryKey: ['dmt', 'tier-kpis', tierId] });
            qc.invalidateQueries({ queryKey: ['dmt', 'kpi-owners'] });
            qc.invalidateQueries({ queryKey: ['dmt', 'my-tier-kpis'] });
            invalidateTiers();
        },
    });

    return { createTier, updateTier, deleteTier, addMember, removeMember, addTaskViewer, removeTaskViewer, setKpis };
}
