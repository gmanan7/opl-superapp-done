import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { computeMissingDates, yesterdayStr } from '../lib/kpi';
export const JH_TARGET = '__jh__';
export function resolveKpiName(def, lang) {
    if (lang === 'hi' && def.kpi_name_hi)
        return def.kpi_name_hi;
    if (lang === 'gu' && def.kpi_name_gu)
        return def.kpi_name_gu;
    return def.kpi_name;
}
export function useGroupDefinitions(jhGroupId) {
    return useQuery({
        queryKey: ['kpi', 'group-defs', jhGroupId],
        enabled: !!jhGroupId,
        staleTime: 1000 * 60 * 10,
        queryFn: async () => {
            const defs = await api.getKpiDefinitions();
            return defs;
        },
    });
}
export function buildTargets(defs, groupName, groupId) {
    const machineMap = new Map();
    let jhCount = 0;
    for (const d of defs) {
        if (d.machine_id) {
            const existing = machineMap.get(d.machine_id);
            if (existing)
                existing.kpiCount += 1;
            else
                machineMap.set(d.machine_id, {
                    kind: 'machine',
                    id: d.machine_id,
                    machineId: d.machine_id,
                    jhGroupId: d.jh_group_id,
                    name: d.machine?.name || 'Machine',
                    type: d.machine?.machine_type || null,
                    path: [],
                    kpiCount: 1,
                });
        }
        else {
            jhCount += 1;
        }
    }
    const targets = [...machineMap.values()];
    if (jhCount > 0 || targets.length === 0) {
        targets.push({
            kind: 'jh',
            id: JH_TARGET,
            machineId: null,
            jhGroupId: groupId,
            name: groupName,
            type: null,
            path: [groupName],
            kpiCount: Math.max(jhCount, 1),
        });
    }
    return targets;
}
export function useJhGroupInfo(jhGroupId) {
    return useQuery({
        queryKey: ['kpi', 'group-info', jhGroupId],
        enabled: !!jhGroupId,
        staleTime: 1000 * 60 * 30,
        queryFn: async () => {
            const groups = await api.getJhGroups();
            const found = groups.find((g) => g.id === jhGroupId);
            if (!found)
                return null;
            return { id: found.id, name: found.name, code: found.code || 'JH', dmtCode: null };
        },
    });
}
export function useGroupEntries(jhGroupId, date) {
    return useQuery({
        queryKey: ['kpi', 'group-entries', jhGroupId, date],
        enabled: !!jhGroupId && !!date,
        queryFn: async () => {
            const entries = await api.getKpiEntries();
            return entries;
        },
    });
}
export function entriesByTarget(rows) {
    return new Map(rows.map((r) => [r.machine_id ?? JH_TARGET, r]));
}
export function useUpsertKpiEntry() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (input) => {
            return api.recordKpiEntry(input);
        },
        onSuccess: (_d, input) => {
            qc.invalidateQueries({ queryKey: ['kpi', 'group-entries', input.jhGroupId] });
            qc.invalidateQueries({ queryKey: ['kpi', 'trend', input.jhGroupId] });
        },
    });
}
export function useKpiTrend(jhGroupId, _year, _month) {
    return useQuery({
        queryKey: ['kpi', 'trend', jhGroupId],
        enabled: !!jhGroupId,
        queryFn: async () => {
            const entries = await api.getKpiEntries();
            return entries.map((e) => ({
                entry_date: e.entry_date,
                machine_id: e.machine_id,
                kpi_values: e.kpi_values
            }));
        },
    });
}
export function useMissingKpiDates(jhGroupId, year, month) {
    const { data: entries = [] } = useKpiTrend(jhGroupId, year, month);
    return computeMissingDates(entries, year, month, yesterdayStr());
}
