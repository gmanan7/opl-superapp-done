import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { getSessionContext } from './useAbnormalities';
const FIXED_GROUP_ROLES = ['apprentice', 'on_roll', 'jh_leader'];
export function useJhGroupSelector() {
    const ctx = getSessionContext();
    const role = ctx?.role;
    const sessionJhGroupId = ctx?.jh_group_id ?? '';
    const needsGroupSelector = !!role && !FIXED_GROUP_ROLES.includes(role);
    const [selectedJhGroupIds, setSelectedJhGroupIds] = useState(needsGroupSelector ? [] : sessionJhGroupId ? [sessionJhGroupId] : []);
    const { data: jhGroups = [], isLoading } = useQuery({
        queryKey: ['jh-groups-selector', ctx?.factory_id, ctx?.dmt_id, role],
        enabled: needsGroupSelector,
        staleTime: 1000 * 60 * 10,
        queryFn: async () => {
            const data = await api.getJhGroups();
            return data.map((g) => ({ id: g.id, name: g.name }));
        },
    });
    useEffect(() => {
        if (needsGroupSelector && selectedJhGroupIds.length === 0 && jhGroups.length > 0) {
            setSelectedJhGroupIds(jhGroups.map((g) => g.id));
        }
    }, [needsGroupSelector, selectedJhGroupIds.length, jhGroups]);
    const selectedJhGroupId = selectedJhGroupIds[0] ?? '';
    const setSelectedJhGroupId = (id) => {
        setSelectedJhGroupIds(id ? [id] : []);
    };
    return {
        selectedJhGroupId,
        setSelectedJhGroupId,
        selectedJhGroupIds,
        setSelectedJhGroupIds,
        needsGroupSelector,
        jhGroups,
        isLoading: needsGroupSelector && isLoading,
    };
}
