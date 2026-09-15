import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, ChevronUp, ChevronDown, X, Loader2, LayoutGrid } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
    Select, SelectContent, SelectGroup, SelectLabel, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../../components/ui/dialog';
import { dmtApi } from '../lib/dmtApi';
import { useDmtWidgets, WIDGET_TYPES, CHART_TYPES, isDeptWidget, isChartWidget, MAX_WIDGETS } from '../lib/useDmtWidgets';
import { DashboardWidget } from './DashboardWidget';
import { PERIODS, getDateRange } from '../lib/kpiChart';

const ALL_DEPTS = '__all__';

function AddWidgetDialog({ open, onOpenChange, add, kpis, deptById, savedCharts, selectableDepartments, canPickAnyDept }) {
    const [type, setType] = useState('kpi_chart');
    const [kpiId, setKpiId] = useState('');
    const [kpiIds, setKpiIds] = useState([]);
    const [chartType, setChartType] = useState('composed');
    const [chartName, setChartName] = useState('');
    const [savedChartId, setSavedChartId] = useState('');
    const [deptId, setDeptId] = useState('');
    const [kpiDeptFilter, setKpiDeptFilter] = useState('all');

    // KPIs grouped by department, sorted so untitled/unknown-department KPIs sink to the
    // bottom instead of scattering through the list.
    const kpisByDept = useMemo(() => {
        const groups = {};
        for (const k of kpis.data || []) {
            const name = deptById?.[k.department_id]?.name || 'Other';
            (groups[name] = groups[name] || []).push(k);
        }
        return Object.entries(groups).sort(([a], [b]) => (a === 'Other') - (b === 'Other') || a.localeCompare(b));
    }, [kpis.data, deptById]);

    // The dedicated department filter narrows which groups are shown for the KPI pickers
    // below — it doesn't touch an already-made multi-KPI selection from another department.
    const visibleKpisByDept = kpiDeptFilter === 'all'
        ? kpisByDept
        : kpisByDept.filter(([name]) => name === kpiDeptFilter);

    const needsDept = isDeptWidget(type);
    const ready = {
        kpi_chart: !!kpiId,
        multi_kpi_chart: kpiIds.length > 0,
        saved_chart: !!savedChartId,
    }[type] ?? !!deptId;

    const reset = (v) => {
        setType(v); setKpiId(''); setKpiIds([]); setSavedChartId(''); setDeptId(''); setChartName(''); setKpiDeptFilter('all');
    };

    const toggleKpi = (id) =>
        setKpiIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

    const buildConfig = () => {
        if (type === 'kpi_chart') return { kpi_id: kpiId };
        if (type === 'multi_kpi_chart') {
            return { kpi_ids: kpiIds, chart_type: chartType, name: chartName.trim() || undefined };
        }
        if (type === 'saved_chart') return { chart_id: savedChartId };
        return { department_id: deptId === ALL_DEPTS ? null : deptId };
    };

    const submit = () => {
        add.mutate({ widget_type: type, config: buildConfig() }, {
            onSuccess: () => { toast.success('Widget added'); onOpenChange(false); },
            onError: (e) => toast.error(e.message),
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle>Add a widget</DialogTitle></DialogHeader>
                <div className="space-y-3">
                    <div>
                        <label className="text-xs font-medium text-slate-600">Widget</label>
                        <Select value={type} onValueChange={reset}>
                            <SelectTrigger className="mt-1 h-11"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {WIDGET_TYPES.map((w) => (
                                    <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="mt-1 text-xs text-slate-400">
                            {WIDGET_TYPES.find((w) => w.value === type)?.hint}
                        </p>
                    </div>

                    {needsDept && (
                        <div>
                            <label className="text-xs font-medium text-slate-600">Department</label>
                            <Select value={deptId} onValueChange={setDeptId}>
                                <SelectTrigger className="mt-1 h-11"><SelectValue placeholder="Select a department" /></SelectTrigger>
                                <SelectContent>
                                    {canPickAnyDept && <SelectItem value={ALL_DEPTS}>All departments</SelectItem>}
                                    {selectableDepartments.map((d) => (
                                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {!canPickAnyDept && (
                                <p className="mt-1 text-xs text-slate-400">
                                    You can add widgets for your own department. Leadership can pick any department.
                                </p>
                            )}
                        </div>
                    )}

                    {(type === 'kpi_chart' || type === 'multi_kpi_chart') && kpisByDept.length > 1 && (
                        <div>
                            <label className="text-xs font-medium text-slate-600">Filter by department</label>
                            <Select value={kpiDeptFilter} onValueChange={setKpiDeptFilter}>
                                <SelectTrigger className="mt-1 h-10 text-sm"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All departments</SelectItem>
                                    {kpisByDept.map(([deptName]) => (
                                        <SelectItem key={deptName} value={deptName}>{deptName}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {type === 'kpi_chart' && (
                        <div>
                            <label className="text-xs font-medium text-slate-600">KPI</label>
                            <Select value={kpiId} onValueChange={setKpiId}>
                                <SelectTrigger className="mt-1 h-11"><SelectValue placeholder="Select a KPI" /></SelectTrigger>
                                <SelectContent>
                                    {visibleKpisByDept.map(([deptName, deptKpis]) => (
                                        <SelectGroup key={deptName}>
                                            <SelectLabel>{deptName}</SelectLabel>
                                            {deptKpis.map((k) => (
                                                <SelectItem key={k.id} value={k.id}>{k.name}</SelectItem>
                                            ))}
                                        </SelectGroup>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {type === 'multi_kpi_chart' && (
                        <>
                            <div>
                                <label className="text-xs font-medium text-slate-600">Chart type</label>
                                <Select value={chartType} onValueChange={setChartType}>
                                    <SelectTrigger className="mt-1 h-11"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {CHART_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <p className="mt-1 text-xs text-slate-400">
                                    Composed draws the first KPI as bars and the rest as lines.
                                </p>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-600">
                                    KPIs {kpiIds.length > 0 && <span className="text-slate-400">· {kpiIds.length} selected</span>}
                                </label>
                                <div className="mt-1 max-h-48 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2">
                                    {visibleKpisByDept.map(([deptName, deptKpis]) => (
                                        <div key={deptName}>
                                            <p className="px-1 pt-1 text-2xs font-semibold uppercase tracking-wide text-slate-400">{deptName}</p>
                                            {deptKpis.map((k) => (
                                                <label key={k.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-slate-50">
                                                    <input type="checkbox" checked={kpiIds.includes(k.id)} onChange={() => toggleKpi(k.id)} />
                                                    <span className="text-xs text-slate-700">
                                                        {k.name}{k.unit && <span className="text-slate-400"> ({k.unit})</span>}
                                                    </span>
                                                </label>
                                            ))}
                                        </div>
                                    ))}
                                    {(kpis.data || []).length === 0 && (
                                        <p className="py-2 text-center text-xs text-slate-400">No KPIs available.</p>
                                    )}
                                </div>
                            </div>
                            <Input placeholder="Chart title (optional)" value={chartName} onChange={(e) => setChartName(e.target.value)} className="h-11" />
                        </>
                    )}

                    {type === 'saved_chart' && (
                        <div>
                            <label className="text-xs font-medium text-slate-600">Chart</label>
                            <Select value={savedChartId} onValueChange={setSavedChartId}>
                                <SelectTrigger className="mt-1 h-11"><SelectValue placeholder="Select a saved chart" /></SelectTrigger>
                                <SelectContent>
                                    {(savedCharts.data || []).map((c) => (
                                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {(savedCharts.data || []).length === 0 && (
                                <p className="mt-1 text-xs text-slate-400">
                                    No saved charts yet — leadership can build them on Admin → KPI Charts.
                                </p>
                            )}
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button disabled={!ready || add.isPending} onClick={submit}>
                        {add.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Add
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export function MyDashboardSection({ allKpis, allTasks, entryByKpi, departments }) {
    const {
        widgets, sorted, kpis, selectableDepartments, canPickAnyDept,
        savedCharts, savedChartKpis, add, remove, reorder,
    } = useDmtWidgets();
    const [adding, setAdding] = useState(false);
    const [period, setPeriod] = useState('this_month');
    const [from, to] = useMemo(() => getDateRange(period), [period]);

    const kpiById = useMemo(() => Object.fromEntries((kpis.data || []).map((k) => [k.id, k])), [kpis.data]);
    const deptById = useMemo(() => Object.fromEntries((departments || []).map((d) => [d.id, d])), [departments]);
    const savedChartById = useMemo(
        () => Object.fromEntries((savedCharts.data || []).map((c) => [c.id, c])),
        [savedCharts.data],
    );
    const hasCharts = sorted.some((w) => isChartWidget(w.widget_type));

    // Only the chart widgets need the period-ranged entry history.
    const chartRows = useQuery({
        queryKey: ['dmt', 'widget-entries', from, to],
        queryFn: () => dmtApi.list('kpi-entries'),
        enabled: hasCharts,
        select: (rows) => rows.filter((e) => {
            const d = e.reporting_date.slice(0, 10);
            return d >= from && d <= to;
        }),
    });
    const chartEntries = useMemo(() => {
        const m = {};
        for (const e of chartRows.data || []) (m[e.kpi_id] = m[e.kpi_id] || []).push(e);
        return m;
    }, [chartRows.data]);

    const move = (index, dir) => {
        const target = index + dir;
        if (target < 0 || target >= sorted.length) return;
        const a = sorted[index];
        const b = sorted[target];
        reorder.mutate([
            { id: a.id, display_order: b.display_order ?? target },
            { id: b.id, display_order: a.display_order ?? index },
        ]);
    };

    const openAdd = () => {
        if (sorted.length >= MAX_WIDGETS) return toast.warning(`Maximum ${MAX_WIDGETS} widgets. Remove one first.`);
        setAdding(true);
    };

    return (
        <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <LayoutGrid size={16} className="text-slate-400" /> My Dashboard
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                    {hasCharts && (
                        <div className="flex gap-1">
                            {PERIODS.map((p) => (
                                <Button key={p.value} size="sm" variant={period === p.value ? 'default' : 'outline'}
                                    className="h-8 text-xs" onClick={() => setPeriod(p.value)}>
                                    {p.label}
                                </Button>
                            ))}
                        </div>
                    )}
                    {sorted.length > 0 && (
                        <Button size="sm" variant="outline" className="gap-1.5" onClick={openAdd}>
                            <Plus className="h-3.5 w-3.5" /> Add widget
                        </Button>
                    )}
                </div>
            </div>

            {widgets.isLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
            ) : sorted.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white py-8 text-center">
                    <p className="text-sm text-slate-500">Build your own view — pin KPI charts, status cards or your open tasks.</p>
                    <Button size="sm" className="mt-3 gap-1.5" onClick={openAdd}><Plus className="h-3.5 w-3.5" /> Add widget</Button>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {sorted.map((w, index) => (
                        <div key={w.id}>
                            <div className="mb-1 flex justify-end gap-0.5">
                                <Button variant="ghost" size="icon" className="h-6 w-6" disabled={index === 0} onClick={() => move(index, -1)}><ChevronUp className="h-3.5 w-3.5" /></Button>
                                <Button variant="ghost" size="icon" className="h-6 w-6" disabled={index === sorted.length - 1} onClick={() => move(index, 1)}><ChevronDown className="h-3.5 w-3.5" /></Button>
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-rose-500" onClick={() => remove.mutate(w.id)}><X className="h-3.5 w-3.5" /></Button>
                            </div>
                            <DashboardWidget
                                widget={w}
                                kpiById={kpiById}
                                deptById={deptById}
                                entryByKpi={entryByKpi}
                                allKpis={allKpis}
                                allTasks={allTasks}
                                chartEntries={chartEntries}
                                savedChartById={savedChartById}
                                savedChartLinks={savedChartKpis.data || []}
                            />
                        </div>
                    ))}
                </div>
            )}

            {adding && (
                <AddWidgetDialog
                    open
                    onOpenChange={setAdding}
                    add={add}
                    kpis={kpis}
                    deptById={deptById}
                    savedCharts={savedCharts}
                    selectableDepartments={selectableDepartments}
                    canPickAnyDept={canPickAnyDept}
                />
            )}
        </section>
    );
}
