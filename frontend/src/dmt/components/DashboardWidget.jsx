import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ListTodo } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { cn } from '../../lib/utils';
import { KpiTrendChart } from './KpiTrendChart';
import { ComposedKpiChart } from './ComposedKpiChart';
import { computeRagFromValue } from '../lib/kpiChart';
import { todayStr } from '../lib/dmtDates';

const SERIES_COLORS = ['#2563eb', '#e11d48', '#10b981', '#f59e0b', '#8b5cf6', '#0ea5e9'];

// A user-built multi-KPI widget stores only the KPIs and one chart type; expand that into
// the per-series shape ComposedKpiChart wants. 'composed' = first KPI as bars, rest lines.
function linksFromConfig(kpiIds, chartType) {
    return kpiIds.map((kpi_id, i) => ({
        kpi_id,
        render_as: chartType === 'bar' || (chartType === 'composed' && i === 0) ? 'bar' : 'line',
        axis: 'primary',
        color: SERIES_COLORS[i % SERIES_COLORS.length],
    }));
}

const RAG_TILE = {
    red: 'bg-rose-50 text-rose-700 border-rose-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

function Shell({ title, subtitle, children }) {
    return (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="truncate text-sm font-medium text-slate-900">{title}</p>
            {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
            <div className="mt-2">{children}</div>
        </div>
    );
}

// How many of this scope's KPIs landed red / amber / green on the selected day.
function KpiStatWidget({ deptName, kpis, entryByKpi }) {
    const counts = useMemo(() => {
        const c = { red: 0, amber: 0, green: 0, pending: 0 };
        for (const k of kpis) {
            const e = entryByKpi[k.id];
            const rag = e?.computed_status
                || (k.kpi_type === 'numeric' && e?.actual_value != null ? computeRagFromValue(e.actual_value, k) : null);
            if (rag) c[rag] += 1; else c.pending += 1;
        }
        return c;
    }, [kpis, entryByKpi]);

    return (
        <Shell title="KPI status" subtitle={`${deptName} · ${kpis.length} KPI${kpis.length === 1 ? '' : 's'}`}>
            <div className="grid grid-cols-3 gap-2">
                {['red', 'amber', 'green'].map((rag) => (
                    <div key={rag} className={cn('rounded-lg border p-2 text-center', RAG_TILE[rag])}>
                        <p className="text-xl font-bold">{counts[rag]}</p>
                        <p className="text-2xs font-semibold uppercase tracking-wide">{rag}</p>
                    </div>
                ))}
            </div>
            {counts.pending > 0 && (
                <p className="mt-1.5 text-xs text-slate-400">{counts.pending} not entered yet</p>
            )}
        </Shell>
    );
}

function TaskCountWidget({ tasks }) {
    const navigate = useNavigate();
    const open = tasks.filter((t) => t.status !== 'completed' && t.status !== 'cancelled');
    const overdue = open.filter((t) => t.due_date && t.due_date.slice(0, 10) < todayStr());
    return (
        <Shell title="My open tasks" subtitle="Just yours">
            <button type="button" onClick={() => navigate('/dmt/tasks')} className="w-full text-left">
                <div className="flex items-center gap-2 text-slate-900">
                    <ListTodo size={18} className="text-slate-400" />
                    <span className="text-3xl font-bold">{open.length}</span>
                </div>
                <p className={cn('mt-1 text-xs', overdue.length ? 'text-rose-600' : 'text-slate-400')}>
                    {overdue.length ? `${overdue.length} overdue` : 'none overdue'}
                </p>
            </button>
        </Shell>
    );
}

function TaskListWidget({ tasks }) {
    const navigate = useNavigate();
    const open = tasks
        .filter((t) => t.status !== 'completed' && t.status !== 'cancelled')
        .sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'))
        .slice(0, 8);
    return (
        <Shell title="My open tasks" subtitle="Just yours">
            {open.length === 0 ? (
                <p className="py-3 text-center text-xs text-slate-400">Nothing open.</p>
            ) : (
                <ul className="divide-y divide-slate-100">
                    {open.map((t) => {
                        const overdue = t.due_date && t.due_date.slice(0, 10) < todayStr();
                        return (
                            <li key={t.id}>
                                <button
                                    type="button"
                                    onClick={() => navigate('/dmt/tasks')}
                                    className="flex w-full items-center justify-between gap-2 py-1.5 text-left hover:bg-slate-50"
                                >
                                    <span className="min-w-0 flex-1 truncate text-xs text-slate-700">{t.title}</span>
                                    <span className={cn('shrink-0 text-2xs', overdue ? 'text-rose-600' : 'text-slate-400')}>
                                        {t.due_date ? t.due_date.slice(0, 10) : '—'}
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </Shell>
    );
}

export function DashboardWidget({
    widget, kpiById, deptById, entryByKpi, allKpis, allTasks, chartEntries,
    savedChartById, savedChartLinks, myEmpId,
}) {
    const cfg = widget.config || {};
    const deptId = cfg.department_id || null;
    const deptName = deptId ? (deptById[deptId]?.name || 'Unknown department') : 'All departments';
    const inScope = (row) => !deptId || String(row.department_id) === String(deptId);
    const mine = (row) => !!myEmpId && String(row.owner_id) === String(myEmpId);

    switch (widget.widget_type) {
        case 'kpi_chart': {
            const kpi = kpiById[cfg.kpi_id];
            if (!kpi) {
                return (
                    <Shell title="KPI trend">
                        <p className="flex items-center gap-1.5 py-3 text-xs text-slate-400">
                            <AlertCircle size={14} /> That KPI is no longer available.
                        </p>
                    </Shell>
                );
            }
            return <KpiTrendChart kpi={kpi} entries={chartEntries[kpi.id] || []} />;
        }
        case 'multi_kpi_chart': {
            const kpiIds = (cfg.kpi_ids || []).filter((id) => kpiById[id]);
            if (!kpiIds.length) {
                return (
                    <Shell title={cfg.name || 'Multi-KPI chart'}>
                        <p className="flex items-center gap-1.5 py-3 text-xs text-slate-400">
                            <AlertCircle size={14} /> None of these KPIs are available any more.
                        </p>
                    </Shell>
                );
            }
            const name = cfg.name
                || kpiIds.map((id) => kpiById[id].name).slice(0, 3).join(' · ') + (kpiIds.length > 3 ? '…' : '');
            return (
                <ComposedKpiChart
                    chart={{ name }}
                    links={linksFromConfig(kpiIds, cfg.chart_type || 'composed')}
                    kpiById={kpiById}
                    entriesByKpi={chartEntries}
                />
            );
        }
        case 'saved_chart': {
            const chart = savedChartById?.[cfg.chart_id];
            const links = (savedChartLinks || [])
                .filter((l) => String(l.chart_id) === String(cfg.chart_id))
                .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
            if (!chart || !links.length) {
                return (
                    <Shell title="Saved chart">
                        <p className="flex items-center gap-1.5 py-3 text-xs text-slate-400">
                            <AlertCircle size={14} /> That chart no longer exists.
                        </p>
                    </Shell>
                );
            }
            return <ComposedKpiChart chart={chart} links={links} kpiById={kpiById} entriesByKpi={chartEntries} />;
        }
        case 'kpi_stat':
            return <KpiStatWidget deptName={deptName} kpis={allKpis.filter(inScope)} entryByKpi={entryByKpi} />;
        case 'task_count':
            return <TaskCountWidget tasks={allTasks.filter(mine)} />;
        case 'task_list':
            return <TaskListWidget tasks={allTasks.filter(mine)} />;
        default:
            return (
                <Shell title="Unknown widget">
                    <Badge variant="outline" className="text-2xs">{widget.widget_type}</Badge>
                </Shell>
            );
    }
}
