import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Save, AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Badge } from '../../components/ui/badge';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import { dmtApi } from '../lib/dmtApi';
import { useDmtMe } from '../lib/useDmt';
import { useDmtDepartments } from '../lib/useDmtKpi';
import { computeRag, RAG_CLASSES } from '../lib/dmtRag';
import { formatIndianNumber } from '../lib/dmtFormat';
import { todayStr, diffDays, fmtLong } from '../lib/dmtDates';

function useEntryDepartments() {
    const { user, tierAtLeast } = useDmtMe();
    const all = useDmtDepartments();
    const mine = useQuery({
        queryKey: ['dmt', 'my-departments', user?.emp_id],
        queryFn: () => dmtApi.myDepartments(),
        enabled: !!user && !tierAtLeast('leadership'),
    });
    if (tierAtLeast('leadership')) return all;
    return mine;
}

function NumericSection({ departmentId, reportingDate }) {
    const qc = useQueryClient();
    const late = diffDays(todayStr(), reportingDate) >= 2;

    const kpis = useQuery({
        queryKey: ['dmt', 'kpis-for-entry', departmentId],
        queryFn: async () => {
            const rows = await dmtApi.list('kpi-master', { department_id: departmentId, is_active: 'true' });
            return rows.filter((k) => k.is_active && (k.kpi_type === 'numeric' || k.kpi_type === 'descriptive'));
        },
    });

    const existing = useQuery({
        queryKey: ['dmt', 'kpi-entries', departmentId, reportingDate],
        queryFn: () => dmtApi.list('kpi-entries', { reporting_date: reportingDate }),
        enabled: !!kpis.data?.length,
    });

    const [entries, setEntries] = useState({});
    useEffect(() => {
        if (!kpis.data) return;
        const byKpi = Object.fromEntries((existing.data || []).map((e) => [e.kpi_id, e]));
        const next = {};
        kpis.data.forEach((k) => {
            const e = byKpi[k.id];
            next[k.id] = {
                actual_value: e?.actual_value?.toString() ?? '',
                text_value: e?.text_value ?? '',
                remarks: e?.remarks ?? '',
            };
        });
        setEntries(next);
    }, [kpis.data, existing.data]);

    const set = (id, field, value) => setEntries((p) => ({ ...p, [id]: { ...p[id], [field]: value } }));

    const save = useMutation({
        mutationFn: () => {
            const rows = (kpis.data || []).map((k) => {
                const e = entries[k.id] || {};
                const actual = e.actual_value ? parseFloat(e.actual_value) : null;
                return {
                    kpi_id: k.id,
                    reporting_date: reportingDate,
                    actual_value: actual,
                    text_value: e.text_value || null,
                    computed_status: k.kpi_type === 'numeric'
                        ? computeRag(actual, k.green_threshold, k.amber_threshold, k.direction, k.target_value)
                        : null,
                    is_late_entry: late,
                    remarks: e.remarks || null,
                };
            });
            return dmtApi.upsertKpiEntries(rows);
        },
        onSuccess: () => {
            toast.success('Saved');
            qc.invalidateQueries({ queryKey: ['dmt', 'kpi-entries'] });
        },
        onError: (e) => toast.error(e.message),
    });

    if (kpis.isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;
    if (!kpis.data?.length) return <p className="py-4 text-sm text-slate-500">No numeric / descriptive KPIs for this department.</p>;

    return (
        <div className="space-y-4">
            <h2 className="text-base font-semibold text-slate-900">Numeric &amp; Descriptive KPIs</h2>
            {late && (
                <div className="flex items-center gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-700">
                    <AlertTriangle className="h-4 w-4 shrink-0" /> Back-dated entry — this will be flagged as late.
                </div>
            )}
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="w-full">
                    <thead>
                        <tr className="border-b bg-slate-50 text-left text-sm text-slate-500">
                            <th className="p-3 font-medium">KPI</th>
                            <th className="w-24 p-3 font-medium">Target</th>
                            <th className="w-40 p-3 font-medium">Actual / Value</th>
                            <th className="w-20 p-3 text-center font-medium">Status</th>
                            <th className="w-48 p-3 font-medium">Remarks</th>
                        </tr>
                    </thead>
                    <tbody>
                        {kpis.data.map((k) => {
                            const e = entries[k.id] || {};
                            const isNumeric = k.kpi_type === 'numeric';
                            const rag = isNumeric
                                ? computeRag(e.actual_value, k.green_threshold, k.amber_threshold, k.direction, k.target_value)
                                : null;
                            return (
                                <tr key={k.id} className="border-b last:border-0">
                                    <td className="p-3">
                                        <p className="text-sm font-medium">{k.name}</p>
                                        {k.unit && <p className="text-xs text-slate-400">{k.unit}</p>}
                                    </td>
                                    <td className="p-3 text-sm text-slate-500">{isNumeric ? formatIndianNumber(k.target_value) : '—'}</td>
                                    <td className="p-3">
                                        {isNumeric ? (
                                            <Input type="number" step="any" value={e.actual_value ?? ''} onChange={(ev) => set(k.id, 'actual_value', ev.target.value)} className="h-9" />
                                        ) : (
                                            <Textarea value={e.text_value ?? ''} onChange={(ev) => set(k.id, 'text_value', ev.target.value)} rows={1} className="min-h-[2.25rem] resize-none" />
                                        )}
                                    </td>
                                    <td className="p-3 text-center">
                                        {rag ? <Badge className={`text-xs ${RAG_CLASSES[rag]}`}>{rag.toUpperCase()}</Badge> : <span className="text-xs text-slate-400">—</span>}
                                    </td>
                                    <td className="p-3">
                                        <Input value={e.remarks ?? ''} onChange={(ev) => set(k.id, 'remarks', ev.target.value)} className="h-9 text-sm" placeholder="Remarks" />
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <div className="flex justify-end">
                <Button onClick={() => save.mutate()} disabled={save.isPending} className="gap-2">
                    {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save All
                </Button>
            </div>
        </div>
    );
}

function TrackerItem({ item, reportingDate, names, onStatus, onDelete }) {
    const qc = useQueryClient();
    const [showForm, setShowForm] = useState(false);
    const [stageName, setStageName] = useState('');
    const [note, setNote] = useState('');

    const updates = useQuery({
        queryKey: ['dmt', 'stage-updates', item.id],
        queryFn: () => dmtApi.list('project-item-stage-updates', { item_id: item.id }),
    });

    const addUpdate = useMutation({
        mutationFn: () => dmtApi.create('project-item-stage-updates', {
            item_id: item.id, stage_name: stageName, update_note: note || null, reporting_date: reportingDate,
        }),
        onSuccess: () => {
            toast.success('Update added');
            qc.invalidateQueries({ queryKey: ['dmt', 'stage-updates', item.id] });
            setShowForm(false); setStageName(''); setNote('');
        },
        onError: (e) => toast.error(e.message),
    });

    const STATUSES = ['active', 'completed', 'on_hold', 'dropped'];
    const rows = (updates.data || []).slice().sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

    return (
        <div className={`rounded-lg border border-slate-200 bg-white p-3 ${item.status === 'completed' ? 'opacity-60' : ''}`}>
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium ${item.status === 'completed' ? 'line-through' : ''}`}>{item.title}</p>
                    {item.description && <p className="truncate text-xs text-slate-400">{item.description}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    <select
                        value={item.status}
                        onChange={(e) => onStatus(e.target.value)}
                        className="h-7 rounded border border-slate-200 px-1 text-xs"
                    >
                        {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                    </select>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-600" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
            </div>

            <Button variant="outline" size="sm" className="mt-2 h-8 w-full gap-1 text-xs" onClick={() => setShowForm(!showForm)}>
                <Plus className="h-3 w-3" /> Add Update
            </Button>
            {showForm && (
                <div className="mt-2 space-y-2 rounded-md bg-slate-50 p-2">
                    <Input placeholder="Stage name *" value={stageName} onChange={(e) => setStageName(e.target.value)} className="h-9 text-sm" />
                    <Input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} className="h-9 text-sm" />
                    <div className="flex gap-2">
                        <Button size="sm" className="h-8" onClick={() => addUpdate.mutate()} disabled={!stageName || addUpdate.isPending}>Add</Button>
                        <Button variant="outline" size="sm" className="h-8" onClick={() => setShowForm(false)}>Cancel</Button>
                    </div>
                </div>
            )}
            {rows.length > 0 && (
                <div className="mt-2 space-y-1">
                    {rows.slice(0, 4).map((u) => (
                        <div key={u.id} className="border-l-2 border-blue-200 pl-2 py-0.5 text-xs">
                            <span className="font-medium">{u.stage_name}</span>
                            {u.update_note && <span className="text-slate-500"> — {u.update_note}</span>}
                            <span className="block text-slate-400">{fmtLong(u.created_at)} · {names[u.updated_by] || u.updated_by}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function TrackerSection({ departmentId, reportingDate }) {
    const qc = useQueryClient();
    const [hideDone, setHideDone] = useState(false);
    const [adding, setAdding] = useState(null); // kpiId
    const [title, setTitle] = useState('');
    const [desc, setDesc] = useState('');

    const trackerKpis = useQuery({
        queryKey: ['dmt', 'tracker-kpis', departmentId],
        queryFn: async () => {
            const rows = await dmtApi.list('kpi-master', { department_id: departmentId, is_active: 'true' });
            return rows.filter((k) => k.is_active && k.kpi_type === 'project_tracker');
        },
    });
    const items = useQuery({
        queryKey: ['dmt', 'tracker-items', departmentId],
        queryFn: () => dmtApi.list('project-tracker-items', { department_id: departmentId }),
        enabled: !!trackerKpis.data?.length,
    });
    const names = useQuery({ queryKey: ['dmt', 'worker-names'], queryFn: dmtApi.workerNames, staleTime: 6e5 });
    const nameMap = Object.fromEntries((names.data || []).map((w) => [w.id || w.emp_id, w.name]));

    const addItem = useMutation({
        mutationFn: (kpiId) => dmtApi.create('project-tracker-items', {
            kpi_id: kpiId, department_id: departmentId, title, description: desc || null,
        }),
        onSuccess: () => {
            toast.success('Item added');
            qc.invalidateQueries({ queryKey: ['dmt', 'tracker-items', departmentId] });
            setAdding(null); setTitle(''); setDesc('');
        },
        onError: (e) => toast.error(e.message),
    });
    const setStatus = useMutation({
        mutationFn: ({ id, status }) => dmtApi.update('project-tracker-items', id, { status }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['dmt', 'tracker-items', departmentId] }),
        onError: (e) => toast.error(e.message),
    });
    const delItem = useMutation({
        mutationFn: (id) => dmtApi.remove('project-tracker-items', id),
        onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['dmt', 'tracker-items', departmentId] }); },
        onError: (e) => toast.error(e.message),
    });

    if (!trackerKpis.data?.length) return null;

    return (
        <div className="mt-6 space-y-6 border-t pt-6">
            <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900">Project Tracker KPIs</h2>
                <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-500">
                    <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} /> Hide completed
                </label>
            </div>
            {trackerKpis.data.map((kpi) => {
                const kItems = (items.data || [])
                    .filter((i) => i.kpi_id === kpi.id)
                    .filter((i) => !hideDone || i.status !== 'completed');
                return (
                    <div key={kpi.id} className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold">{kpi.name}</h3>
                            <Button variant="outline" size="sm" className="h-8 gap-1" onClick={() => setAdding(kpi.id)}>
                                <Plus className="h-3 w-3" /> Add Item
                            </Button>
                        </div>
                        {adding === kpi.id && (
                            <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
                                <Input placeholder="Title *" value={title} onChange={(e) => setTitle(e.target.value)} className="h-10" />
                                <Input placeholder="Description (optional)" value={desc} onChange={(e) => setDesc(e.target.value)} className="h-10" />
                                <div className="flex gap-2">
                                    <Button size="sm" className="h-9" disabled={!title || addItem.isPending} onClick={() => addItem.mutate(kpi.id)}>Add</Button>
                                    <Button variant="outline" size="sm" className="h-9" onClick={() => setAdding(null)}>Cancel</Button>
                                </div>
                            </div>
                        )}
                        <div className="space-y-2">
                            {kItems.map((it) => (
                                <TrackerItem
                                    key={it.id}
                                    item={it}
                                    reportingDate={reportingDate}
                                    names={nameMap}
                                    onStatus={(status) => setStatus.mutate({ id: it.id, status })}
                                    onDelete={() => delItem.mutate(it.id)}
                                />
                            ))}
                            {kItems.length === 0 && <p className="py-2 text-xs text-slate-400">No items yet.</p>}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export function DmtKpiEntry() {
    const [date, setDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    const [dept, setDept] = useState('');
    const departments = useEntryDepartments();

    useEffect(() => {
        if (departments.data?.length === 1 && !dept) setDept(departments.data[0].id);
    }, [departments.data, dept]);

    // Dispatch dept ('DISP') may enter today; everyone else is capped at yesterday.
    const isDispatch = (departments.data || []).some((d) => d.code === 'DISP');
    const maxDate = isDispatch ? todayStr() : (() => { const d = new Date(); d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
    const isToday = date === todayStr();

    return (
        <div className="mx-auto max-w-5xl space-y-4">
            <h1 className="text-xl font-bold text-slate-900">Enter KPIs</h1>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Reporting Date</label>
                    <input
                        type="date"
                        value={date}
                        max={maxDate}
                        onChange={(e) => setDate(e.target.value || date)}
                        className="block h-11 w-full rounded-md border border-slate-200 px-3 text-sm sm:w-48"
                    />
                    <p className="text-xs text-slate-400">Defaults to yesterday. {isDispatch && isToday && "Dispatch: today's entry appears in tomorrow's review."}</p>
                </div>
                <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Department</label>
                    <Select value={dept} onValueChange={setDept}>
                        <SelectTrigger className="h-11 w-full sm:w-56"><SelectValue placeholder="Select department" /></SelectTrigger>
                        <SelectContent>
                            {(departments.data || []).map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {!dept ? (
                <p className="py-8 text-center text-sm text-slate-500">Select a department to begin entering KPIs.</p>
            ) : (
                <>
                    <NumericSection departmentId={dept} reportingDate={date} />
                    <TrackerSection departmentId={dept} reportingDate={date} />
                </>
            )}
        </div>
    );
}
