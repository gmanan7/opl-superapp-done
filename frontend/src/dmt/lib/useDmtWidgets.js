import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dmtApi } from './dmtApi';
import { useDmtDepartments } from './useDmtKpi';
import { useDmtMe } from './useDmt';

export const MAX_WIDGETS = 12;

const WIDGETS_POSITION_KEY = 'dmt_widgets_position';

// Where "My Dashboard" (the widget grid) sits relative to the fixed department KPI
// table below it — a per-browser display preference, same tier as the dashboard's other
// unsaved view toggles (collapsed sections, hidden-KPI reveal), not synced server-side.
export function useWidgetsPosition() {
    const [position, setPositionState] = useState(() => {
        try { return localStorage.getItem(WIDGETS_POSITION_KEY) === 'below' ? 'below' : 'above'; } catch { return 'above'; }
    });
    const setPosition = (v) => {
        setPositionState(v);
        try { localStorage.setItem(WIDGETS_POSITION_KEY, v); } catch { /* private/blocked storage — in-memory only */ }
    };
    return [position, setPosition];
}

export const WIDGET_TYPES = [
    { value: 'kpi_chart', label: 'KPI trend chart', hint: 'One or more KPIs, each with its own target line and MTD' },
    { value: 'multi_kpi_chart', label: 'Multi-KPI chart', hint: 'Several KPIs on one chart — line, bar or composed' },
    { value: 'kpi_stat', label: 'KPI status card', hint: 'How many KPIs are red / amber / green' },
    { value: 'task_count', label: 'My open tasks (counter)', hint: 'A single number — your own open tasks, nobody else\'s' },
    { value: 'task_list', label: 'My open tasks (list)', hint: 'Your own open tasks, nobody else\'s' },
];

export const CHART_TYPES = ['line', 'bar', 'composed'];

const CHART_WIDGETS = new Set(['kpi_chart', 'multi_kpi_chart', 'saved_chart']);
const SELF_SCOPED_WIDGETS = new Set(['task_count', 'task_list']);
// Chart widgets are KPI-scoped; the task widgets are scoped to the logged-in person's own
// tasks (never a department or anyone else's); everything else (kpi_stat) is department-scoped.
export const isDeptWidget = (type) => !CHART_WIDGETS.has(type) && !SELF_SCOPED_WIDGETS.has(type);
export const isChartWidget = (type) => CHART_WIDGETS.has(type);

export function useDmtWidgets() {
    const qc = useQueryClient();
    const { user, tierAtLeast } = useDmtMe();
    const invalidate = () => qc.invalidateQueries({ queryKey: ['dmt', 'dashboard-widgets'] });

    const widgets = useQuery({
        queryKey: ['dmt', 'dashboard-widgets'],
        queryFn: () => dmtApi.list('dashboard-widgets'),
    });
    const kpis = useQuery({
        queryKey: ['dmt', 'widget-kpis'],
        queryFn: async () => {
            const rows = await dmtApi.list('kpi-master', { is_active: 'true' });
            return rows.filter((k) => k.is_active && k.kpi_type === 'numeric');
        },
    });
    // Charts built on Admin → KPI Charts, reusable here as 'saved_chart' widgets.
    const savedCharts = useQuery({
        queryKey: ['dmt', 'widget-saved-charts'],
        queryFn: () => dmtApi.list('kpi-charts'),
    });
    const savedChartKpis = useQuery({
        queryKey: ['dmt', 'widget-saved-chart-kpis'],
        queryFn: () => dmtApi.list('kpi-chart-kpis'),
    });
    const departments = useDmtDepartments();
    const myDepartments = useQuery({
        queryKey: ['dmt', 'my-departments', user?.emp_id],
        queryFn: () => dmtApi.myDepartments(),
        enabled: !!user?.emp_id,
    });

    // Leadership picks any department (and the cross-department "All" view); everyone
    // else is limited to the departments they actually belong to. Mirrors the same rule
    // enforced server-side in dmtValidateWidget().
    const canPickAnyDept = tierAtLeast('leadership');
    const selectableDepartments = canPickAnyDept
        ? (departments.data || [])
        : (departments.data || []).filter((d) => (myDepartments.data || []).some((m) => m.id === d.id));

    const sorted = (widgets.data || []).slice().sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

    const add = useMutation({
        mutationFn: ({ widget_type, config }) => dmtApi.create('dashboard-widgets', {
            widget_type, config, display_order: (widgets.data || []).length,
        }),
        onSuccess: invalidate,
    });
    const remove = useMutation({
        mutationFn: (id) => dmtApi.remove('dashboard-widgets', id),
        onSuccess: invalidate,
    });
    const reorder = useMutation({
        mutationFn: async (rows) => {
            for (const r of rows) await dmtApi.update('dashboard-widgets', r.id, { display_order: r.display_order });
        },
        onSuccess: invalidate,
    });

    return {
        widgets, sorted, kpis, departments, selectableDepartments, canPickAnyDept,
        savedCharts, savedChartKpis, add, remove, reorder,
    };
}
