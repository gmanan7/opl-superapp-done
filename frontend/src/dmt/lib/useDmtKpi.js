import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dmtApi } from './dmtApi';

export function useDmtDepartments() {
    return useQuery({
        queryKey: ['dmt', 'department', 'active'],
        queryFn: async () => {
            const rows = await dmtApi.list('department', { is_active: 'true' });
            return rows.filter((d) => d.is_active);
        },
    });
}

// KPI master list, department name resolved client-side from the departments list.
export function useDmtKpiMaster(deptFilter = 'all') {
    const departments = useDmtDepartments();
    const kpis = useQuery({
        queryKey: ['dmt', 'kpi-master', deptFilter],
        queryFn: () => dmtApi.list('kpi-master', deptFilter !== 'all' ? { department_id: deptFilter } : undefined),
    });
    const deptById = Object.fromEntries((departments.data || []).map((d) => [d.id, d]));
    const rows = (kpis.data || []).map((k) => ({ ...k, department: deptById[k.department_id] || null }));
    return { departments, kpis: { ...kpis, rows } };
}

export function useDmtKpiMutations() {
    const qc = useQueryClient();
    const invalidate = () => qc.invalidateQueries({ queryKey: ['dmt', 'kpi-master'] });

    return {
        save: useMutation({
            mutationFn: ({ id, payload }) =>
                id ? dmtApi.update('kpi-master', id, payload) : dmtApi.create('kpi-master', payload),
            onSuccess: invalidate,
        }),
        remove: useMutation({
            mutationFn: async (id) => {
                const entries = await dmtApi.list('kpi-entries', { kpi_id: id, limit: 1 });
                if (entries.length > 0) {
                    if (!window.confirm('This KPI has entries. Deactivate it instead of deleting?')) {
                        throw new Error('Cannot delete a KPI with existing entries');
                    }
                    return dmtApi.update('kpi-master', id, { is_active: false });
                }
                return dmtApi.remove('kpi-master', id);
            },
            onSuccess: invalidate,
        }),
    };
}
