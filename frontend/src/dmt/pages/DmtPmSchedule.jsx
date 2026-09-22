import { useState, useMemo, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ChevronDown, Pencil, Check, Info, Plus, X, Loader2, Search } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent } from '../../components/ui/dropdown-menu';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../../components/ui/dialog';
import { cn } from '../../lib/utils';
import { dmtApi } from '../lib/dmtApi';
import { useDmtMe } from '../lib/useDmt';
import {
    toIsoDate, daysBetween, daysOfMonth, getCellState,
    filterMachinesByModule, filterMachinesByCriticality, groupMachinesByGroup, CELL_CLASS, PM_GRACE_DAYS,
} from '../lib/pmSchedule';

// What each square colour means. Swatches reuse CELL_CLASS and the day counts come from
// PM_GRACE_DAYS, so this key can never drift from what the grid actually paints.
const G = PM_GRACE_DAYS;
const CELL_KEY = [
    { state: 'empty', title: 'Nothing planned', text: 'No PM is planned or recorded for this machine on this day.' },
    { state: 'planned-future', title: 'Planned', text: 'PM is planned for a future date.' },
    { state: 'planned-past', title: 'Due now', text: `Planned for today, or up to ${G} days ago, and not marked done yet.` },
    { state: 'overdue', title: 'Overdue', text: `Planned more than ${G} days ago and still not marked done.` },
    { state: 'done-on-time', title: 'Done on time', text: 'Marked done on the planned day (or earlier), or done without a plan.' },
    { state: 'done-delayed-minor', title: `Done — 1 to ${G} days late`, text: `Marked done 1 to ${G} days after the planned day.` },
    { state: 'done-delayed-major', title: `Done — ${G + 1} or more days late`, text: `Marked done ${G + 1} or more days after the planned day.` },
];

// The key sits behind an "i" button so it stays out of the way until someone wants it.
function LegendButton() {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-9 w-9" aria-label="How to read this calendar" title="How to read this calendar">
                    <Info className="h-4 w-4 text-blue-600" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[340px] space-y-2.5 p-3">
                {CELL_KEY.map((k) => (
                    <div key={k.state} className="flex items-start gap-2.5">
                        <span className={cn('mt-0.5 inline-block h-5 w-6 shrink-0 rounded-sm border border-slate-200', CELL_CLASS[k.state])} />
                        <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-800">{k.title}</p>
                            <p className="text-xs text-slate-500">{k.text}</p>
                        </div>
                    </div>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

// Picker: machines come from the master list; people with edit access choose which ones appear on
// this calendar. Only machines not already on it are offered.
function AddMachinesDialog({ open, onClose }) {
    const qc = useQueryClient();
    const [search, setSearch] = useState('');
    const [moduleFilter, setModuleFilter] = useState('All');
    const [picked, setPicked] = useState(new Set());
    const master = useQuery({ queryKey: ['dmt', 'pm-machine-master'], queryFn: dmtApi.pmMachineMaster, enabled: open });

    const available = (master.data || []).filter((m) => !m.in_schedule);
    const shown = available.filter((m) =>
        (moduleFilter === 'All' || (moduleFilter === 'None' ? !m.module : m.module === moduleFilter))
        && (!search || `${m.name} ${m.machine_type || ''} ${m.module || ''}`.toLowerCase().includes(search.trim().toLowerCase())));
    const moduleChips = ['All', ...[...new Set(available.map((m) => m.module).filter(Boolean))].sort(), ...(available.some((m) => !m.module) ? ['None'] : [])];

    const close = () => { setPicked(new Set()); setSearch(''); setModuleFilter('All'); onClose(); };
    const toggle = (id) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const allShownPicked = shown.length > 0 && shown.every((m) => picked.has(m.id));
    const toggleAllShown = () => setPicked((p) => {
        const n = new Set(p);
        if (allShownPicked) shown.forEach((m) => n.delete(m.id)); else shown.forEach((m) => n.add(m.id));
        return n;
    });

    const add = useMutation({
        mutationFn: () => dmtApi.addPmMachines([...picked]),
        onSuccess: (r) => {
            toast.success(`${r.added} machine${r.added === 1 ? '' : 's'} added to the PM Schedule`);
            qc.invalidateQueries({ queryKey: ['dmt', 'pm-machine-list'] });
            qc.invalidateQueries({ queryKey: ['dmt', 'pm-machine-master'] });
            close();
        },
        onError: (e) => toast.error(e.message),
    });

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
            <DialogContent className="sm:max-w-[520px]">
                <DialogHeader><DialogTitle>Add machines to the PM Schedule</DialogTitle></DialogHeader>
                <p className="text-xs text-slate-500">
                    Pick from the master machine list (MDM → Machines). Only machines not already on the calendar are shown.
                    A machine’s module, machine type and critical flag are set in the master list.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative min-w-[160px] flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search machines…"
                            className="h-9 w-full rounded-md border border-slate-200 pl-9 pr-3 text-sm" />
                    </div>
                    <div className="inline-flex flex-wrap overflow-hidden rounded-md border border-slate-200 bg-white">
                        {moduleChips.map((l) => (
                            <button key={l} type="button" onClick={() => setModuleFilter(l)}
                                className={cn('h-9 px-2.5 text-xs font-medium', moduleFilter === l ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-100')}>
                                {l === 'None' ? 'No module' : l}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                    {master.isLoading && <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>}
                    {master.error && <p className="p-2 text-sm text-rose-600">{master.error.message}</p>}
                    {master.data && available.length === 0 && (
                        <p className="p-3 text-sm text-slate-500">Every active machine in the master list is already on the calendar.</p>
                    )}
                    {master.data && available.length > 0 && shown.length === 0 && (
                        <p className="p-3 text-sm text-slate-500">No machines match.</p>
                    )}
                    {shown.length > 0 && (
                        <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">
                            <input type="checkbox" checked={allShownPicked} onChange={toggleAllShown} className="h-3.5 w-3.5 rounded border-slate-300" />
                            Select all shown ({shown.length})
                        </label>
                    )}
                    {shown.map((m) => (
                        <label key={m.id} className={cn('flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm', picked.has(m.id) ? 'border-blue-600/40 bg-blue-50' : 'border-transparent hover:bg-slate-50')}>
                            <input type="checkbox" checked={picked.has(m.id)} onChange={() => toggle(m.id)} className="h-3.5 w-3.5 rounded border-slate-300" />
                            <span className="flex-1 truncate">{m.name}{m.is_critical === false && <span className="ml-1 text-slate-300">·</span>}</span>
                            <span className="text-xs text-slate-400">{[m.module, m.machine_type].filter(Boolean).join(' · ') || 'no module / machine type yet'}</span>
                        </label>
                    ))}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={close}>Cancel</Button>
                    <Button disabled={picked.size === 0 || add.isPending} onClick={() => add.mutate()}>
                        {add.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {picked.size ? `Add ${picked.size} machine${picked.size > 1 ? 's' : ''}` : 'Add machines'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export function DmtPmSchedule() {
    const { user } = useDmtMe();
    const me = user?.emp_id;
    const qc = useQueryClient();

    // Everyone can view; only people BE Admin listed (PM Schedule Edit Access tab) can edit.
    const accessQ = useQuery({ queryKey: ['dmt', 'pm-edit-access', me], queryFn: dmtApi.pmEditAccessMe, enabled: !!me });
    const canEditAccess = !!accessQ.data?.can_edit;
    const [editing, setEditing] = useState(false);
    const editMode = canEditAccess && editing;

    const [refDate, setRefDate] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
    const [mode, setMode] = useState('plan');
    const [moduleFilter, setModuleFilter] = useState('All');
    const [critFilter, setCritFilter] = useState('All');
    const [collapsed, setCollapsed] = useState({});
    const [remarks, setRemarks] = useState(null); // { machine, date, existing }
    const [remarksText, setRemarksText] = useState('');
    const [confirmRemove, setConfirmRemove] = useState(false);
    const [addOpen, setAddOpen] = useState(false);
    const [removeMachine, setRemoveMachine] = useState(null); // machine being taken off the calendar

    const today = useMemo(() => toIsoDate(new Date()), []);
    const monthDays = useMemo(() => daysOfMonth(refDate), [refDate]);
    const monthStart = monthDays.length ? toIsoDate(monthDays[0]) : '';
    const monthEnd = monthDays.length ? toIsoDate(monthDays[monthDays.length - 1]) : '';

    const machinesQ = useQuery({
        queryKey: ['dmt', 'pm-machine-list'],
        queryFn: dmtApi.pmMachines,
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

    const machines = (machinesQ.data || []).filter((m) => m.is_active);
    const moduleTabs = ['All', ...[...new Set(machines.map((m) => m.module).filter(Boolean))].sort()];
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
        () => filterMachinesByCriticality(filterMachinesByModule(machines, moduleFilter), critFilter),
        [machines, moduleFilter, critFilter],
    );
    const grouped = useMemo(() => groupMachinesByGroup(visible), [visible]);

    const invalidate = () => {
        qc.invalidateQueries({ queryKey: ['dmt', 'pm-plan'] });
        qc.invalidateQueries({ queryKey: ['dmt', 'pm-actual'] });
    };
    // A refused save usually means access was just removed — re-check so the Edit button goes away.
    const onWriteError = (e) => {
        toast.error(e.message);
        qc.invalidateQueries({ queryKey: ['dmt', 'pm-edit-access'] });
    };

    const removeFromSchedule = useMutation({
        mutationFn: (machineId) => dmtApi.removePmMachine(machineId),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['dmt', 'pm-machine-list'] });
            qc.invalidateQueries({ queryKey: ['dmt', 'pm-machine-master'] });
            setRemoveMachine(null);
            toast.success('Machine removed from the PM Schedule');
        },
        onError: onWriteError,
    });

    const togglePlan = useMutation({
        mutationFn: async ({ machine, date }) => {
            const existing = planMap.get(`${machine.id}|${date}`);
            if (existing) return dmtApi.remove('pm-plan', existing.id);
            return dmtApi.create('pm-plan', { machine_id: machine.id, planned_date: date, created_by: me });
        },
        onSuccess: invalidate,
        onError: onWriteError,
    });
    const upsertActual = useMutation({
        mutationFn: async ({ machine, date, text }) => {
            const existing = actualMap.get(`${machine.id}|${date}`);
            if (existing) return dmtApi.update('pm-actual', existing.id, { remarks: text || null });
            return dmtApi.create('pm-actual', { machine_id: machine.id, actual_date: date, remarks: text || null, recorded_by: me });
        },
        onSuccess: () => { invalidate(); setRemarks(null); setRemarksText(''); toast.success('PM actual saved'); },
        onError: onWriteError,
    });
    const removeActual = useMutation({
        mutationFn: (id) => dmtApi.remove('pm-actual', id),
        onSuccess: () => { invalidate(); setRemarks(null); setRemarksText(''); setConfirmRemove(false); toast.success('PM actual removed'); },
        onError: onWriteError,
    });

    const cellClick = (machine, date) => {
        if (!editMode) return; // view mode: nothing happens on click
        const isPast = daysBetween(date, today) > 0;
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
                        {moduleTabs.map((l) => (
                            <button key={l} type="button" onClick={() => setModuleFilter(l)}
                                className={cn('h-9 px-3 text-sm font-medium', moduleFilter === l ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-100')}>
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
                    <LegendButton />
                    {canEditAccess && !editing && (
                        <Button size="sm" className="h-9 gap-1.5" onClick={() => setEditing(true)}>
                            <Pencil className="h-4 w-4" /> Edit
                        </Button>
                    )}
                </div>
            </div>

            {/* Mode banner: makes it obvious whether clicks will change anything */}
            {editMode ? (
                <div className="flex flex-col gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-3">
                        <span className="text-sm font-semibold text-blue-800">Editing</span>
                        <div className="inline-flex overflow-hidden rounded-md border border-blue-200 bg-white">
                            {['plan', 'actual'].map((m) => (
                                <button key={m} type="button" onClick={() => setMode(m)}
                                    className={cn('h-8 px-4 text-sm font-medium capitalize', mode === m ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-100')}>
                                    {m}
                                </button>
                            ))}
                        </div>
                        <span className="text-xs text-blue-800">
                            {mode === 'plan' ? 'Click a day to plan PM, click again to remove it. Changes save immediately.' : 'Click a day to record the PM as done. Changes save immediately.'}
                        </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Button size="sm" variant="outline" className="h-8 gap-1.5 bg-white" onClick={() => setAddOpen(true)}>
                            <Plus className="h-4 w-4" /> Add machines
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 gap-1.5 bg-white" onClick={() => setEditing(false)}>
                            <Check className="h-4 w-4" /> Done editing
                        </Button>
                    </div>
                </div>
            ) : null}

            <div className="text-xs text-slate-500">{visible.length} machines · {monthDays.length} days</div>

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
                        {!loading && machines.length === 0 && (
                            <tr><td colSpan={monthDays.length + 1} className="p-6 text-center text-sm text-slate-500">
                                {canEditAccess
                                    ? 'No machines on the PM Schedule yet. Press Edit, then Add machines to pick them from the master machine list.'
                                    : 'No machines on the PM Schedule yet. Someone with PM edit access needs to add them from the master machine list.'}
                            </td></tr>
                        )}
                        {!loading && machines.length > 0 && Object.keys(grouped).length === 0 && (
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
                                                <span className="flex items-center justify-between gap-1">
                                                    <span>{m.name}{!m.is_critical && <span className="ml-1 text-slate-300">·</span>}</span>
                                                    {editMode && (
                                                        <button type="button" title="Remove from the PM Schedule" aria-label={`Remove ${m.name} from the PM Schedule`}
                                                            onClick={() => setRemoveMachine(m)} className="rounded p-0.5 text-slate-300 hover:bg-rose-50 hover:text-rose-600">
                                                            <X className="h-3.5 w-3.5" />
                                                        </button>
                                                    )}
                                                </span>
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
                                                            className={cn('h-7 w-8', CELL_CLASS[state], !editMode && 'cursor-default hover:!bg-inherit')}
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

            <AddMachinesDialog open={addOpen} onClose={() => setAddOpen(false)} />

            <Dialog open={!!removeMachine} onOpenChange={(o) => { if (!o) setRemoveMachine(null); }}>
                <DialogContent className="sm:max-w-[420px]">
                    <DialogHeader><DialogTitle>Remove from the PM Schedule?</DialogTitle></DialogHeader>
                    <p className="text-sm text-slate-600">
                        <strong>{removeMachine?.name}</strong> will disappear from this calendar. Its plans and completed records are kept,
                        and adding the machine back later brings them back. The machine itself stays in the master list.
                    </p>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRemoveMachine(null)}>Cancel</Button>
                        <Button variant="destructive" disabled={removeFromSchedule.isPending} onClick={() => removeFromSchedule.mutate(removeMachine.id)}>
                            Remove
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

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
