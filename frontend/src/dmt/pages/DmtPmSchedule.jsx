import { useState, useMemo, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ChevronDown, Settings, Plus, Pencil, Trash2, Pause, Play, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../../components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../../components/ui/sheet';
import { cn } from '../../lib/utils';
import { dmtApi } from '../lib/dmtApi';
import { useDmtMe } from '../lib/useDmt';
import {
    toIsoDate, daysBetween, daysOfMonth, getCellState,
    filterMachinesByLine, filterMachinesByCriticality, groupMachinesByGroup, CELL_CLASS,
} from '../lib/pmSchedule';

function ManageMachinesSheet({ open, onClose, machines }) {
    const qc = useQueryClient();
    const [form, setForm] = useState(null); // {id?, line, group_name, name, is_critical}
    const refresh = () => qc.invalidateQueries({ queryKey: ['dmt', 'pm-machines'] });
    const save = useMutation({
        mutationFn: async () => {
            if (form.id) return dmtApi.update('pm-machines', form.id, { line: form.line, group_name: form.group_name, name: form.name, is_critical: form.is_critical });
            const factory = await dmtApi.myFactory();
            return dmtApi.create('pm-machines', { line: form.line, group_name: form.group_name, name: form.name, is_critical: form.is_critical, factory_id: factory?.id });
        },
        onSuccess: () => { toast.success('Saved'); refresh(); setForm(null); },
        onError: (e) => toast.error(e.message),
    });
    const setActive = useMutation({
        mutationFn: ({ id, v }) => dmtApi.update('pm-machines', id, { is_active: v }),
        onSuccess: () => { refresh(); toast.success('Updated'); },
        onError: (e) => toast.error(e.message),
    });
    return (
        <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
            <SheetContent className="w-full overflow-y-auto sm:max-w-md">
                <SheetHeader><SheetTitle>Manage Machines</SheetTitle></SheetHeader>
                <div className="mt-4 space-y-3">
                    <Button size="sm" className="gap-1" onClick={() => setForm({ line: 'SFM', group_name: '', name: '', is_critical: true })}><Plus className="h-4 w-4" /> Add Machine</Button>
                    {form && (
                        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                            <div className="grid grid-cols-2 gap-2">
                                <Select value={form.line} onValueChange={(v) => setForm({ ...form, line: v })}>
                                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                                    <SelectContent><SelectItem value="SFM">SFM</SelectItem><SelectItem value="RFM">RFM</SelectItem></SelectContent>
                                </Select>
                                <Input placeholder="Group" value={form.group_name} onChange={(e) => setForm({ ...form, group_name: e.target.value })} className="h-9 text-sm" />
                            </div>
                            <Input placeholder="Machine name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-9 text-sm" />
                            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={form.is_critical} onChange={(e) => setForm({ ...form, is_critical: e.target.checked })} /> Critical</label>
                            <div className="flex gap-2">
                                <Button size="sm" disabled={!form.name || !form.group_name || save.isPending} onClick={() => save.mutate()}>Save</Button>
                                <Button size="sm" variant="outline" onClick={() => setForm(null)}>Cancel</Button>
                            </div>
                        </div>
                    )}
                    <div className="space-y-1">
                        {machines.map((m) => (
                            <div key={m.id} className={cn('flex items-center justify-between rounded border border-slate-200 p-2 text-sm', !m.is_active && 'opacity-50')}>
                                <span className="truncate">{m.line} · {m.group_name} · {m.name}</span>
                                <div className="flex shrink-0 gap-0.5">
                                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setForm({ id: m.id, line: m.line, group_name: m.group_name, name: m.name, is_critical: m.is_critical })}><Pencil className="h-3.5 w-3.5" /></Button>
                                    {m.is_active
                                        ? <Button size="icon" variant="ghost" className="h-7 w-7 text-amber-500" onClick={() => setActive.mutate({ id: m.id, v: false })}><Pause className="h-3.5 w-3.5" /></Button>
                                        : <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-500" onClick={() => setActive.mutate({ id: m.id, v: true })}><Play className="h-3.5 w-3.5" /></Button>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}

export function DmtPmSchedule() {
    const { user, tierAtLeast } = useDmtMe();
    const me = user?.emp_id;
    const qc = useQueryClient();
    const [manageOpen, setManageOpen] = useState(false);
    const myDepts = useQuery({ queryKey: ['dmt', 'my-departments', me], queryFn: () => dmtApi.myDepartments(), enabled: !!me });
    const inEng = (myDepts.data || []).some((d) => d.code === 'ENG');
    const isAdmin = tierAtLeast('leadership');
    const canEditPlan = tierAtLeast('module_lead');
    const canEditActual = tierAtLeast('module_lead') || inEng;

    const [refDate, setRefDate] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
    const [mode, setMode] = useState('plan');
    const [lineFilter, setLineFilter] = useState('All');
    const [critFilter, setCritFilter] = useState('All');
    const [collapsed, setCollapsed] = useState({});
    const [remarks, setRemarks] = useState(null); // { machine, date, existing }
    const [remarksText, setRemarksText] = useState('');
    const [confirmRemove, setConfirmRemove] = useState(false);

    const today = useMemo(() => toIsoDate(new Date()), []);
    const monthDays = useMemo(() => daysOfMonth(refDate), [refDate]);
    const monthStart = monthDays.length ? toIsoDate(monthDays[0]) : '';
    const monthEnd = monthDays.length ? toIsoDate(monthDays[monthDays.length - 1]) : '';

    const machinesQ = useQuery({
        queryKey: ['dmt', 'pm-machines'],
        queryFn: () => dmtApi.list('pm-machines'),
    });
    const plansQ = useQuery({
        queryKey: ['dmt', 'pm-plan', monthStart],
        queryFn: () => dmtApi.list('pm-plan'),
        enabled: !!monthStart,
        select: (rows) => rows.filter((p) => p.planned_date >= monthStart && p.planned_date <= monthEnd),
    });
    const actualsQ = useQuery({
        queryKey: ['dmt', 'pm-actual', monthStart],
        queryFn: () => dmtApi.list('pm-actual'),
        enabled: !!monthStart,
        select: (rows) => rows.filter((a) => a.actual_date >= monthStart && a.actual_date <= monthEnd),
    });

    const allMachines = machinesQ.data || [];
    const machines = allMachines.filter((m) => m.is_active);
    const planMap = useMemo(() => {
        const m = new Map();
        for (const p of plansQ.data || []) m.set(`${p.machine_id}|${p.planned_date}`, p);
        return m;
    }, [plansQ.data]);
    const actualMap = useMemo(() => {
        const m = new Map();
        for (const a of actualsQ.data || []) m.set(`${a.machine_id}|${a.actual_date}`, a);
        return m;
    }, [actualsQ.data]);

    const visible = useMemo(
        () => filterMachinesByCriticality(filterMachinesByLine(machines, lineFilter), critFilter),
        [machines, lineFilter, critFilter],
    );
    const grouped = useMemo(() => groupMachinesByGroup(visible), [visible]);

    const invalidate = () => {
        qc.invalidateQueries({ queryKey: ['dmt', 'pm-plan'] });
        qc.invalidateQueries({ queryKey: ['dmt', 'pm-actual'] });
    };

    const togglePlan = useMutation({
        mutationFn: async ({ machine, date }) => {
            const existing = planMap.get(`${machine.id}|${date}`);
            if (existing) return dmtApi.remove('pm-plan', existing.id);
            return dmtApi.create('pm-plan', { machine_id: machine.id, planned_date: date, created_by: me });
        },
        onSuccess: invalidate,
        onError: (e) => toast.error(e.message),
    });
    const upsertActual = useMutation({
        mutationFn: async ({ machine, date, text }) => {
            const existing = actualMap.get(`${machine.id}|${date}`);
            if (existing) return dmtApi.update('pm-actual', existing.id, { remarks: text || null });
            return dmtApi.create('pm-actual', { machine_id: machine.id, actual_date: date, remarks: text || null, recorded_by: me });
        },
        onSuccess: () => { invalidate(); setRemarks(null); setRemarksText(''); toast.success('PM actual saved'); },
        onError: (e) => toast.error(e.message),
    });
    const removeActual = useMutation({
        mutationFn: (id) => dmtApi.remove('pm-actual', id),
        onSuccess: () => { invalidate(); setRemarks(null); setRemarksText(''); setConfirmRemove(false); toast.success('PM actual removed'); },
        onError: (e) => toast.error(e.message),
    });

    const canEdit = mode === 'plan' ? canEditPlan : canEditActual;
    const cellClick = (machine, date) => {
        if (mode === 'plan' && !canEditPlan) return;
        if (mode === 'actual' && !canEditActual) return;
        const isPast = daysBetween(date, today) > 0;
        const plan = planMap.get(`${machine.id}|${date}`);
        const actual = actualMap.get(`${machine.id}|${date}`);
        if (mode === 'plan') {
            if (isPast) return toast.error('Plan locked for past dates');
            togglePlan.mutate({ machine, date });
            return;
        }
        if (daysBetween(today, date) > 0) return toast.error('Cannot mark actual on a future date');
        setRemarks({ machine, date, existing: actual || null });
        setRemarksText(actual?.remarks || '');
    };

    const shiftMonth = (delta) => setRefDate(new Date(refDate.getFullYear(), refDate.getMonth() + delta, 1));
    const monthLabel = refDate.toLocaleString('en-US', { month: 'short', year: 'numeric' });
    const loading = machinesQ.isLoading || plansQ.isLoading || actualsQ.isLoading;

    return (
        <div className="mx-auto max-w-[1600px] space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                    <h1 className="text-xl font-bold text-slate-900">PM Schedule</h1>
                    <p className="text-sm text-slate-500">Preventive Maintenance Planning &amp; Tracking</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex items-center rounded-md border border-slate-200 bg-white">
                        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => shiftMonth(-1)}><ChevronLeft className="h-4 w-4" /></Button>
                        <div className="min-w-[88px] px-2 text-center text-sm font-medium">{monthLabel}</div>
                        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => shiftMonth(1)}><ChevronRight className="h-4 w-4" /></Button>
                    </div>
                    <div className="inline-flex overflow-hidden rounded-md border border-slate-200 bg-white">
                        {['plan', 'actual'].map((m) => (
                            <button key={m} type="button" onClick={() => setMode(m)}
                                className={cn('h-9 px-4 text-sm font-medium capitalize', mode === m ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-100')}>
                                {m}
                            </button>
                        ))}
                    </div>
                    <div className="inline-flex overflow-hidden rounded-md border border-slate-200 bg-white">
                        {['All', 'SFM', 'RFM'].map((l) => (
                            <button key={l} type="button" onClick={() => setLineFilter(l)}
                                className={cn('h-9 px-3 text-sm font-medium', lineFilter === l ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-100')}>
                                {l}
                            </button>
                        ))}
                    </div>
                    <Select value={critFilter} onValueChange={setCritFilter}>
                        <SelectTrigger className="h-9 w-[150px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="All">All criticality</SelectItem>
                            <SelectItem value="CriticalOnly">Critical only</SelectItem>
                            <SelectItem value="NonCriticalOnly">Non-critical only</SelectItem>
                        </SelectContent>
                    </Select>
                    {isAdmin && (
                        <Button size="sm" variant="outline" className="h-9 gap-1" onClick={() => setManageOpen(true)}>
                            <Settings className="h-4 w-4" /> Manage
                        </Button>
                    )}
                </div>
            </div>

            {isAdmin && (
                <ManageMachinesSheet open={manageOpen} onClose={() => setManageOpen(false)} machines={allMachines} />
            )}

            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full ring-2 ring-inset ring-blue-400" /> Planned</span>
                <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full bg-emerald-500" /> Done on time</span>
                <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full bg-amber-400" /> Done delayed</span>
                <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full bg-rose-500" /> Overdue</span>
                <span className="ml-2">{visible.length} machines · {monthDays.length} days</span>
                {!canEdit && <span className="text-slate-400">· read-only</span>}
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="border-collapse">
                    <thead>
                        <tr>
                            <th className="sticky left-0 z-20 min-w-[180px] border-b border-r bg-slate-100 px-3 py-2 text-left text-xs font-semibold">Machine</th>
                            {monthDays.map((d) => {
                                const iso = toIsoDate(d);
                                return (
                                    <th key={iso} title={iso}
                                        className={cn('w-8 min-w-8 border-b border-r px-0 py-1.5 text-center text-[11px] font-medium', iso === today && 'bg-blue-100 text-blue-700')}>
                                        {d.getDate()}
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {loading && <tr><td colSpan={monthDays.length + 1} className="p-6 text-center text-sm text-slate-500">Loading…</td></tr>}
                        {!loading && Object.keys(grouped).length === 0 && (
                            <tr><td colSpan={monthDays.length + 1} className="p-6 text-center text-sm text-slate-500">No machines match the filters.</td></tr>
                        )}
                        {Object.entries(grouped).map(([groupKey, list]) => {
                            const isCollapsed = collapsed[groupKey] ?? false;
                            return (
                                <Fragment key={groupKey}>
                                    <tr className="bg-slate-50">
                                        <td colSpan={monthDays.length + 1}
                                            className="sticky left-0 z-10 cursor-pointer select-none border-b px-3 py-1.5 text-xs font-semibold"
                                            onClick={() => setCollapsed({ ...collapsed, [groupKey]: !isCollapsed })}>
                                            <span className="inline-flex items-center gap-1">
                                                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', isCollapsed && '-rotate-90')} />
                                                {groupKey} <span className="font-normal text-slate-400">({list.length})</span>
                                            </span>
                                        </td>
                                    </tr>
                                    {!isCollapsed && list.map((m) => (
                                        <tr key={m.id}>
                                            <td className="sticky left-0 z-10 border-b border-r bg-white px-3 py-1.5 text-xs">
                                                {m.name}{!m.is_critical && <span className="ml-1 text-slate-300">·</span>}
                                            </td>
                                            {monthDays.map((d) => {
                                                const iso = toIsoDate(d);
                                                const plan = planMap.get(`${m.id}|${iso}`);
                                                const actual = actualMap.get(`${m.id}|${iso}`);
                                                const state = getCellState(plan, actual, iso, today);
                                                return (
                                                    <td key={iso} className="border-b border-r p-0">
                                                        <button
                                                            type="button"
                                                            onClick={() => cellClick(m, iso)}
                                                            title={actual?.remarks || iso}
                                                            className={cn('h-7 w-8', CELL_CLASS[state], !canEdit && 'cursor-default')}
                                                        />
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <Dialog open={!!remarks} onOpenChange={(o) => { if (!o) { setRemarks(null); setConfirmRemove(false); } }}>
                <DialogContent className="sm:max-w-[440px]">
                    <DialogHeader><DialogTitle>{remarks?.existing ? 'Edit PM Actual' : 'Mark PM Done'}</DialogTitle></DialogHeader>
                    {remarks && (
                        <div className="space-y-3 text-sm">
                            <div><span className="text-slate-500">Machine:</span> <strong>{remarks.machine.name}</strong></div>
                            <div><span className="text-slate-500">Date:</span> <strong>{remarks.date}</strong></div>
                            <Textarea value={remarksText} onChange={(e) => setRemarksText(e.target.value.slice(0, 500))} rows={4} placeholder="Remarks (optional)" />
                            {confirmRemove && (
                                <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-xs">Remove this PM actual entry? This cannot be undone.</div>
                            )}
                        </div>
                    )}
                    <DialogFooter className="flex-col gap-2 sm:flex-row">
                        {remarks?.existing && !confirmRemove && (
                            <Button variant="destructive" className="sm:mr-auto" onClick={() => setConfirmRemove(true)}>Remove Entry</Button>
                        )}
                        {confirmRemove ? (
                            <>
                                <Button variant="outline" onClick={() => setConfirmRemove(false)}>Cancel</Button>
                                <Button variant="destructive" disabled={removeActual.isPending} onClick={() => removeActual.mutate(remarks.existing.id)}>Yes, Remove</Button>
                            </>
                        ) : (
                            <>
                                <Button variant="outline" onClick={() => setRemarks(null)}>Cancel</Button>
                                <Button disabled={upsertActual.isPending} onClick={() => upsertActual.mutate({ machine: remarks.machine, date: remarks.date, text: remarksText.trim() })}>
                                    {remarks?.existing ? 'Update' : 'Save'}
                                </Button>
                            </>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
