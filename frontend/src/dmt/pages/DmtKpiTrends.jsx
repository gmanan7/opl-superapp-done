import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { Loader2, ChevronDown, Download } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';
import { dmtApi } from '../lib/dmtApi';
import { useDmtDepartments } from '../lib/useDmtKpi';
import { KpiTrendChart } from '../components/KpiTrendChart';
import { ComposedKpiChart } from '../components/ComposedKpiChart';
import { PERIODS, getDateRange } from '../lib/kpiChart';
import { formatIndianNumber } from '../lib/dmtFormat';
import { todayStr } from '../lib/dmtDates';

export function DmtKpiTrends() {
    const [period, setPeriod] = useState('this_month');
    const [collapsed, setCollapsed] = useState({});
    const [custom, setCustom] = useState({ from: '', to: todayStr() });
    const [from, to] = useMemo(
        () => (period === 'custom' && custom.from ? [custom.from, custom.to] : getDateRange(period)),
        [period, custom],
    );

    const departments = useDmtDepartments();
    const trackerKpis = useQuery({
        queryKey: ['dmt', 'trends-tracker-kpis'],
        queryFn: async () => (await dmtApi.list('kpi-master', { is_active: 'true' })).filter((k) => k.is_active && k.kpi_type === 'project_tracker'),
    });
    const trackerItems = useQuery({ queryKey: ['dmt', 'trends-tracker-items'], queryFn: () => dmtApi.list('project-tracker-items') });
    const kpis = useQuery({
        queryKey: ['dmt', 'trends-kpis'],
        queryFn: async () => {
            const rows = await dmtApi.list('kpi-master', { is_active: 'true' });
            return rows.filter((k) => k.is_active && k.kpi_type !== 'project_tracker');
        },
    });
    const entries = useQuery({
        queryKey: ['dmt', 'trends-entries', from, to],
        queryFn: () => dmtApi.list('kpi-entries'),
        select: (rows) => rows.filter((e) => {
            const d = e.reporting_date.slice(0, 10);
            return d >= from && d <= to;
        }),
    });

    const entriesByKpi = useMemo(() => {
        const m = {};
        for (const e of entries.data || []) (m[e.kpi_id] = m[e.kpi_id] || []).push(e);
        return m;
    }, [entries.data]);

    const customCharts = useQuery({ queryKey: ['dmt', 'trends-charts'], queryFn: () => dmtApi.list('kpi-charts') });
    const chartLinks = useQuery({ queryKey: ['dmt', 'trends-chart-kpis'], queryFn: () => dmtApi.list('kpi-chart-kpis') });
    const kpiById = useMemo(() => Object.fromEntries((kpis.data || []).map((k) => [k.id, k])), [kpis.data]);

    const grouped = useMemo(() => {
        const byDept = {};
        for (const k of kpis.data || []) (byDept[k.department_id] = byDept[k.department_id] || []).push(k);
        return (departments.data || [])
            .map((d) => ({ dept: d, kpis: byDept[d.id] || [] }))
            .filter((g) => g.kpis.length > 0);
    }, [kpis.data, departments.data]);

    const loading = kpis.isLoading || entries.isLoading || departments.isLoading;

    const exportXlsx = () => {
        const rows = [];
        for (const { dept, kpis: dk } of grouped) {
            for (const k of dk) {
                for (const e of (entriesByKpi[k.id] || []).slice().sort((a, b) => a.reporting_date.localeCompare(b.reporting_date))) {
                    rows.push({
                        Department: dept.name, KPI: k.name, Unit: k.unit || '',
                        Date: e.reporting_date.slice(0, 10),
                        Actual: k.kpi_type === 'numeric' ? e.actual_value : e.text_value,
                        Status: e.computed_status || '', Remarks: e.remarks || '',
                    });
                }
            }
        }
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'KPI Trends');
        XLSX.writeFile(wb, `dmt-kpi-trends-${from}_to_${to}.xlsx`);
    };

    return (
        <div className="mx-auto max-w-6xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h1 className="text-xl font-bold text-slate-900">KPI Trends</h1>
                <div className="flex flex-wrap items-center gap-1">
                    {[...PERIODS, { value: 'custom', label: 'Custom' }].map((p) => (
                        <Button key={p.value} size="sm" variant={period === p.value ? 'default' : 'outline'} className="h-8 text-xs" onClick={() => setPeriod(p.value)}>
                            {p.label}
                        </Button>
                    ))}
                    <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={exportXlsx}><Download className="h-3.5 w-3.5" /> Export</Button>
                </div>
            </div>

            {period === 'custom' && (
                <div className="flex items-center gap-2 text-sm">
                    <input type="date" value={custom.from} max={custom.to} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className="h-9 rounded-md border border-slate-200 px-2" />
                    <span className="text-slate-400">to</span>
                    <input type="date" value={custom.to} max={todayStr()} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className="h-9 rounded-md border border-slate-200 px-2" />
                </div>
            )}

            {!loading && (customCharts.data || []).length > 0 && (
                <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Custom Charts</p>
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                        {(customCharts.data || []).map((c) => {
                            const links = (chartLinks.data || [])
                                .filter((l) => l.chart_id === c.id)
                                .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
                            if (!links.length) return null;
                            return <ComposedKpiChart key={c.id} chart={c} links={links} kpiById={kpiById} entriesByKpi={entriesByKpi} />;
                        })}
                    </div>
                </div>
            )}

            {loading ? (
                <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
            ) : grouped.length === 0 ? (
                <p className="py-16 text-center text-sm text-slate-500">No KPIs to show. Add KPIs in KPI Master.</p>
            ) : (
                grouped.map(({ dept, kpis: deptKpis }) => {
                    const isCollapsed = collapsed[dept.id] ?? false;
                    return (
                        <div key={dept.id} className="rounded-xl border border-slate-200 bg-slate-50">
                            <button
                                type="button"
                                onClick={() => setCollapsed({ ...collapsed, [dept.id]: !isCollapsed })}
                                className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-semibold"
                            >
                                <span>{dept.name} <span className="font-normal text-slate-400">({deptKpis.length})</span></span>
                                <ChevronDown className={cn('h-4 w-4 transition-transform', isCollapsed && '-rotate-90')} />
                            </button>
                            {!isCollapsed && (
                                <div className="grid grid-cols-1 gap-3 p-3 pt-0 md:grid-cols-2">
                                    {deptKpis.map((k) => (
                                        <KpiTrendChart key={k.id} kpi={k} entries={entriesByKpi[k.id] || []} />
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })
            )}

            {!loading && (trackerKpis.data || []).length > 0 && (
                <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Project Tracker KPIs</p>
                    {(trackerKpis.data || []).map((tk) => {
                        const items = (trackerItems.data || []).filter((i) => i.kpi_id === tk.id);
                        return (
                            <div key={tk.id} className="rounded-xl border border-slate-200 bg-white p-3">
                                <p className="text-sm font-medium">{tk.name}</p>
                                <div className="mt-2 space-y-1">
                                    {items.length === 0 && <p className="text-xs text-slate-400">No items.</p>}
                                    {items.map((i) => (
                                        <div key={i.id} className="flex items-center justify-between border-b border-slate-100 py-1 text-sm last:border-0">
                                            <span className={cn(i.status === 'completed' && 'text-slate-400 line-through')}>{i.title}</span>
                                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] capitalize text-slate-600">{i.status.replace('_', ' ')}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
