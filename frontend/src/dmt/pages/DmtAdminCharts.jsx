import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Loader2, LineChart as LineChartIcon, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../../components/ui/table';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../../components/ui/dialog';
import { dmtApi } from '../lib/dmtApi';
import { useDmtMe } from '../lib/useDmt';
import { useDmtDepartments } from '../lib/useDmtKpi';

const COLORS = ['#2563eb', '#e11d48', '#10b981', '#f59e0b', '#8b5cf6', '#0ea5e9'];

function ChartForm({ open, onClose, chart, me }) {
    const qc = useQueryClient();
    const departments = useDmtDepartments();
    const kpis = useQuery({
        queryKey: ['dmt', 'chart-form-kpis'],
        queryFn: async () => (await dmtApi.list('kpi-master', { is_active: 'true' })).filter((k) => k.kpi_type === 'numeric'),
        enabled: open,
    });
    const [f, setF] = useState({ name: '', department_id: '', chart_type: 'composed', size_width: 2, size_height: 1 });
    const [lines, setLines] = useState([]); // {kpi_id, render_as, axis, color}

    useEffect(() => {
        if (!open) return;
        if (chart) {
            setF({
                name: chart.name, department_id: chart.department_id || '',
                chart_type: chart.chart_type, size_width: chart.size_width, size_height: chart.size_height,
            });
            dmtApi.list('kpi-chart-kpis', { chart_id: chart.id }).then((rows) =>
                setLines(rows.sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
                    .map((r) => ({ kpi_id: r.kpi_id, render_as: r.render_as, axis: r.axis, color: r.color || COLORS[0] }))));
        } else {
            setF({ name: '', department_id: '', chart_type: 'composed', size_width: 2, size_height: 1 });
            setLines([]);
        }
    }, [open, chart]);

    const save = useMutation({
        mutationFn: async () => {
            const factory = await dmtApi.myFactory();
            const payload = {
                name: f.name.trim(),
                department_id: f.department_id || null,
                factory_id: factory?.id,
                chart_type: f.chart_type,
                size_width: Number(f.size_width),
                size_height: Number(f.size_height),
            };
            let chartId = chart?.id;
            if (chartId) await dmtApi.update('kpi-charts', chartId, payload);
            else { chartId = (await dmtApi.create('kpi-charts', { ...payload, created_by: me })).id; }
            // replace kpi links
            await dmtApi.remove('kpi-chart-kpis', chartId).catch(() => {});
            let i = 0;
            for (const l of lines) {
                if (!l.kpi_id) continue;
                await dmtApi.create('kpi-chart-kpis', {
                    chart_id: chartId, kpi_id: l.kpi_id, render_as: l.render_as, axis: l.axis, color: l.color, display_order: i++,
                });
            }
        },
        onSuccess: () => { toast.success(chart ? 'Chart updated' : 'Chart created'); qc.invalidateQueries({ queryKey: ['dmt', 'admin-charts'] }); onClose(); },
        onError: (e) => toast.error(e.message),
    });

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader><DialogTitle>{chart ? 'Edit Chart' : 'New Chart'}</DialogTitle></DialogHeader>
                <div className="max-h-[65vh] space-y-3 overflow-y-auto">
                    <Input placeholder="Chart name *" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="h-11" />
                    <div className="grid grid-cols-2 gap-3">
                        <Select value={f.department_id || 'none'} onValueChange={(v) => setF({ ...f, department_id: v === 'none' ? '' : v })}>
                            <SelectTrigger className="h-11"><SelectValue placeholder="Department" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">Unassigned</SelectItem>
                                {(departments.data || []).map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Select value={f.chart_type} onValueChange={(v) => setF({ ...f, chart_type: v })}>
                            <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                            <SelectContent>{['line', 'bar', 'composed'].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">KPIs on this chart</p>
                            <Button size="sm" variant="outline" className="h-7 gap-1"
                                onClick={() => setLines([...lines, { kpi_id: '', render_as: 'line', axis: 'primary', color: COLORS[lines.length % COLORS.length] }])}>
                                <Plus className="h-3 w-3" /> Add
                            </Button>
                        </div>
                        {lines.map((l, i) => (
                            <div key={i} className="flex items-center gap-1.5 rounded-md border border-slate-200 p-1.5">
                                <select value={l.kpi_id} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, kpi_id: e.target.value } : x))}
                                    className="h-8 flex-1 rounded border border-slate-200 px-1 text-xs">
                                    <option value="">Select KPI…</option>
                                    {(kpis.data || []).map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                                </select>
                                <select value={l.render_as} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, render_as: e.target.value } : x))} className="h-8 rounded border border-slate-200 text-xs">
                                    <option value="line">line</option><option value="bar">bar</option>
                                </select>
                                <select value={l.axis} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, axis: e.target.value } : x))} className="h-8 rounded border border-slate-200 text-xs">
                                    <option value="primary">L</option><option value="secondary">R</option>
                                </select>
                                <input type="color" value={l.color} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, color: e.target.value } : x))} className="h-8 w-8" />
                                <button type="button" onClick={() => setLines(lines.filter((_, j) => j !== i))} className="text-rose-500"><X className="h-3.5 w-3.5" /></button>
                            </div>
                        ))}
                    </div>
                </div>
                <DialogFooter>
                    <Button disabled={!f.name.trim() || lines.filter((l) => l.kpi_id).length === 0 || save.isPending} onClick={() => save.mutate()}>
                        {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {chart ? 'Save' : 'Create'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export function DmtAdminCharts() {
    const qc = useQueryClient();
    const { user, tierAtLeast } = useDmtMe();
    const canEdit = tierAtLeast('leadership');
    const [form, setForm] = useState({ open: false, chart: null });

    const charts = useQuery({
        queryKey: ['dmt', 'admin-charts'],
        queryFn: async () => (await dmtApi.list('kpi-charts')).sort((a, b) => (a.display_order || 0) - (b.display_order || 0)),
    });
    const chartKpis = useQuery({ queryKey: ['dmt', 'admin-chart-kpis'], queryFn: () => dmtApi.list('kpi-chart-kpis') });
    const kpiNameById = useQuery({
        queryKey: ['dmt', 'chart-kpi-names'],
        queryFn: async () => Object.fromEntries((await dmtApi.list('kpi-master')).map((k) => [k.id, k.name])),
    });
    const del = useMutation({
        mutationFn: (id) => dmtApi.remove('kpi-charts', id),
        onSuccess: () => { toast.success('Chart deleted'); qc.invalidateQueries({ queryKey: ['dmt', 'admin-charts'] }); },
        onError: (e) => toast.error(e.message),
    });

    const kpiCount = (chartId) => (chartKpis.data || []).filter((r) => r.chart_id === chartId);

    return (
        <div className="mx-auto max-w-5xl space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold text-slate-900">KPI Charts</h1>
                    <p className="text-sm text-slate-500">Combine multiple KPIs into one chart on the KPI Trends page.</p>
                </div>
                {canEdit && <Button className="gap-1.5" onClick={() => setForm({ open: true, chart: null })}><Plus className="h-4 w-4" /> New Chart</Button>}
            </div>

            {charts.isLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
            ) : !charts.data?.length ? (
                <div className="rounded-xl border border-slate-200 bg-white py-12 text-center text-slate-500">
                    <LineChartIcon className="mx-auto mb-2 h-8 w-8 opacity-50" />
                    <p>No charts yet.</p>
                </div>
            ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>KPIs</TableHead>
                                {canEdit && <TableHead className="text-right">Actions</TableHead>}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {charts.data.map((c) => {
                                const links = kpiCount(c.id);
                                const names = links.map((l) => kpiNameById.data?.[l.kpi_id]).filter(Boolean);
                                return (
                                    <TableRow key={c.id}>
                                        <TableCell className="font-medium">{c.name}</TableCell>
                                        <TableCell><Badge variant="outline" className="capitalize">{c.chart_type}</Badge></TableCell>
                                        <TableCell className="text-sm">
                                            {links.length}
                                            {names.length > 0 && <span className="ml-1 text-xs text-slate-400">· {names.slice(0, 2).join(', ')}{names.length > 2 ? '…' : ''}</span>}
                                        </TableCell>
                                        {canEdit && (
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-1">
                                                    <Button variant="ghost" size="icon" onClick={() => setForm({ open: true, chart: c })}><Pencil className="h-4 w-4" /></Button>
                                                    <Button variant="ghost" size="icon" className="text-rose-600" onClick={() => { if (window.confirm(`Delete "${c.name}"?`)) del.mutate(c.id); }}><Trash2 className="h-4 w-4" /></Button>
                                                </div>
                                            </TableCell>
                                        )}
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            )}

            <ChartForm open={form.open} chart={form.chart} me={user?.emp_id} onClose={() => setForm({ open: false, chart: null })} />
        </div>
    );
}
