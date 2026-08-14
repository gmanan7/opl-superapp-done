import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { mdmKeys } from './keys';

export function useOrgStructure() {
    return useQuery({
        queryKey: mdmKeys.orgStructure(),
        queryFn: async () => {
            const [groups, factories, moduleNames, workers, jhGroups, plantAccess, jhGroupsList, dmtMembersList, approvalRoutings] = await Promise.all([
                api.getModuleGroups(),
                api.getFactories(),
                api.getModuleNames(),
                api.getWorkers(),
                api.getJhGroups(),
                api.getUserPlantAccess(),
                api.getJhGroupsList().catch(() => []),
                api.getDmtMembersList().catch(() => []),
                api.getApprovalRouting().catch(() => [])
            ]);
            const dmts = (groups || []).map((g) => ({
                ...g,
                jhGroups: (jhGroups || []).filter((jh) => jh.module_group_id === g.id || jh.dmt_id === g.id)
            }));
            const unassignedJhGroups = (jhGroups || []).filter((jh) => !jh.module_group_id && !jh.dmt_id);
            return {
                groups,
                factories,
                moduleNames,
                workers,
                jhGroups,
                plantAccess,
                jhGroupsList: jhGroupsList || [],
                dmtMembersList: dmtMembersList || [],
                approvalRoutings: approvalRoutings || [],
                dmts,
                unassignedJhGroups
            };
        },
    });
}

function useOrgMutation(mutationFn) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: mdmKeys.orgStructure() });
        },
    });
}

export function useCreateModuleGroup() {
    return useOrgMutation(async (data) => {
        return api.createModuleGroup(data);
    });
}

export function useDeleteModuleGroup() {
    return useOrgMutation(async (id) => {
        return api.deleteModuleGroup(id);
    });
}

export function useCreateJhGroup() {
    return useOrgMutation(async (data) => {
        return api.createJhGroup(data);
    });
}

export function useDeleteJhGroup() {
    return useOrgMutation(async (id) => {
        return api.deleteJhGroup(id);
    });
}
export function useCreateArea() { return useOrgMutation(async () => { }); }
export function useUpdateArea() { return useOrgMutation(async () => { }); }
export function useSetAreaActive() { return useOrgMutation(async () => { }); }

export function useGrantUserPlantAccess() {
    return useOrgMutation(async ({ emp_id, factory_id }) => {
        return api.grantUserPlantAccess(emp_id, factory_id);
    });
}

export function useRevokeUserPlantAccess() {
    return useOrgMutation(async (id) => {
        return api.revokeUserPlantAccess(id);
    });
}

export function useAddJhGroupMember() {
    return useOrgMutation(async (data) => {
        return api.addJhGroupMember(data);
    });
}

export function useRemoveJhGroupMember() {
    return useOrgMutation(async (id) => {
        return api.removeJhGroupMember(id);
    });
}

export function useAddDmtMember() {
    return useOrgMutation(async (data) => {
        return api.addDmtMember(data);
    });
}

export function useRemoveDmtMember() {
    return useOrgMutation(async (id) => {
        return api.removeDmtMember(id);
    });
}

export function useSaveApprovalRouting() {
    return useOrgMutation(async (data) => {
        return api.saveApprovalRouting(data);
    });
}

