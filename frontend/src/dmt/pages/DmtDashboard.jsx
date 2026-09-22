import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
    ListTodo, AlertTriangle, CalendarDays, Wrench, LayoutDashboard, Loader2, AlertCircle, ChevronDown,
    Eye, EyeOff,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../../components/ui/dialog';
import { cn } from '../../lib/utils';
import { dmtApi } from '../lib/dmtApi';
import { useDmtMe } from '../lib/useDmt';
import { useDmtDepartments } from '../lib/useDmtKpi';
import { useDmtWorkers } from '../lib/useDmtTasks';
import { computeRagFromValue, calculateMtd, RAG_BADGE } from '../lib/kpiChart';
import { formatIndianNumber } from '../lib/dmtFormat';
import { todayStr, fmtLong, parseLocal } from '../lib/dmtDates';
import { toIsoDate, daysBetween } from '../lib/pmSchedule';
import { MyDashboardSection } from '../components/MyDashboardSection';
import { Layers } from 'lucide-react';
import { useMyTierKpis, useDmtTiers } from '../lib/useDmtTiers';
import { tierLabel } from '../lib/taskExtras';
import { useWidgetsPosition } from '../lib/useDmtWidgets';

// Tinted card background/text per RAG status — undefined (no thresholds set) falls back
// to a plain white card via the `|| '...'` at each call site.
const RAG_CARD = {
    red: 'border-rose-200 bg-rose-50',
    amber: 'border-amber-200 bg-amber-50',
    green: 'border-emerald-200 bg-emerald-50',
};
const RAG_TEXT = {
    red: 'text-rose-700',
    amber: 'text-amber-700',
    green: 'text-emerald-700',
};

// Combined, deduplicated KPI list from every active tier (T4/T3/T2) the caller belongs to —
// as a member or as its Lead. Hidden entirely when they're in no tier at all, so this card
// never shows for the majority of people who aren't part of any tier.
function MyTierKpisCard({ entryByKpi }) {
    const { data: kpis = [], isLoading } = useMyTierKpis();
    if (!isLoading && kpis.length === 0) return null;
    return (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="mb-3 flex items-center gap-2 text-slate-700">
                <Layers size={16} />
                <h2 className="text-sm font-semibold">My Tier KPIs</h2>
            </div>
            {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
            ) : (
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
                    {kpis.map((k) => {
                        const e = entryByKpi[k.kpi_id];
                        const rag = e?.computed_status
                            || (e?.actual_value != null ? computeRagFromValue(e.actual_value, k) : null);
                        return (
                            <div key={k.kpi_id} className={cn('rounded-lg border p-2.5 shadow-xs', RAG_CARD[rag] || 'border-slate-200 bg-white')}>
                                <p className="truncate text-xs font-bold text-slate-900" title={k.name}>{k.name}</p>
                                {rag && <Badge className={cn('mt-1 text-[9px] font-bold', RAG_BADGE[rag])}>{rag.toUpperCase()}</Badge>}
                                <p className={cn('mt-1 text-lg font-bold', RAG_TEXT[rag] || 'text-slate-900')}>
                                    {e?.actual_value != null ? formatIndianNumber(e.actual_value) : '—'}
                                    {k.unit && <span className="ml-1 text-xs font-medium text-slate-400">{k.unit}</span>}
                                </p>
                                <p className="mt-1 truncate text-[10px] text-slate-400" title={k.via_tiers?.join(', ')}>
                                    via {k.via_tiers?.join(', ')}
                                </p>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function Stat({ icon: Icon, label, value, hint, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={!onClick}
            className={cn('rounded-xl border border-slate-200 bg-white p-4 text-left shadow-xs', onClick && 'hover:border-blue-300')}
        >
            <div className="flex items-center gap-2 text-slate-500"><Icon size={16} /><span className="text-xs font-semibold uppercase tracking-wide">{label}</span></div>
            <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
            {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
        </button>
    );
}

export function DmtDashboard() {
    const navigate = useNavigate();
    const { user } = useDmtMe();
    const [date, setDate] = useState(() => {
        const d = new Date(); d.setDate(d.getDate() - 1);
        return toIsoDate(d);
    });
    const monthStart = useMemo(() => { const d = parseLocal(date); return toIsoDate(new Date(d.getFullYear(), d.getMonth(), 1)); }, [date]);
    const monthEnd = useMemo(() => { const d = parseLocal(date); return toIsoDate(new Date(d.getFullYear(), d.getMonth() + 1, 0)); }, [date]);

    const qc = useQueryClient();
    const workers = useDmtWorkers();
    const departments = useDmtDepartments();
    const [collapsed, setCollapsed] = useState({});
    const [deptFilter, setDeptFilter] = useState('all');
    const [showHidden, setShowHidden] = useState({}); // dept.id -> bool, reveals hidden KPIs there

    // Per-user "hide this KPI from my table" — everyone sees every KPI by default;
    // hiding one only ever affects the person who hid it, never anyone else's view.
    const hiddenKpis = useQuery({
        queryKey: ['dmt', 'hidden-kpis'],
        queryFn: () => dmtApi.list('hidden-kpis'),
    });
    const hiddenKpiIds = new Set((hiddenKpis.data || []).map((h) => h.kpi_id));
    const toggleHidden = useMutation({
        mutationFn: (kpiId) => {
            const existing = (hiddenKpis.data || []).find((h) => h.kpi_id === kpiId);
            return existing ? dmtApi.remove('hidden-kpis', existing.id) : dmtApi.create('hidden-kpis', { kpi_id: kpiId });
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ['dmt', 'hidden-kpis'] }),
        onError: (e) => toast.error(e.message),
    });
    const [taskFor, setTaskFor] = useState(null);
    const [tf, setTf] = useState({ title: '', owner_id: '', priority: 'high', due_date: '', tier_id: '' });
    const [widgetsPosition, setWidgetsPosition] = useWidgetsPosition();
    const myTiers = useDmtTiers();
    const myKpiRows = useMyTierKpis();
    const invitees = useQuery({ queryKey: ['dmt', 'dash-invitees'], queryFn: () => dmtApi.list('meeting-invitees') });

    const allKpis = useQuery({
        queryKey: ['dmt', 'dash-kpis-all'],
        queryFn: async () => (await dmtApi.list('kpi-master', { is_active: 'true' })).filter((k) => k.is_active),
    });
    const kpis = { data: (allKpis.data || []).filter((k) => k.kpi_type !== 'project_tracker'), isLoading: allKpis.isLoading };
    const trackerKpis = (allKpis.data || []).filter((k) => k.kpi_type === 'project_tracker');
    const projectItems = useQuery({ queryKey: ['dmt', 'dash-project-items'], queryFn: () => dmtApi.list('project-tracker-items'), enabled: trackerKpis.length > 0 });
    const dayEntries = useQuery({
        queryKey: ['dmt', 'dash-entries', date],
        queryFn: () => dmtApi.list('kpi-entries', { reporting_date: date }),
    });
    // Unfiltered fetch (also used below to auto-pick the latest date that actually has
    // data, so the single-day table below doesn't default to a day nobody logged yet).
    const allEntries = useQuery({
        queryKey: ['dmt', 'dash-all-entries'],
        queryFn: () => dmtApi.list('kpi-entries'),
    });
    const mtdEntries = {
        data: (allEntries.data || []).filter((e) => {
            const d = e.reporting_date.slice(0, 10);
            return d >= monthStart && d <= date;
        }),
        isLoading: allEntries.isLoading,
    };

    // `dmt_kpi_entries` is returned oldest-first (orderBy reporting_date ASC), so the last
    // row is the latest entered date across all KPIs.
    const latestEntryDate = allEntries.data?.length
        ? allEntries.data[allEntries.data.length - 1].reporting_date.slice(0, 10)
        : null;
    const userPickedDate = useRef(false);
    useEffect(() => {
        if (userPickedDate.current || !latestEntryDate) return;
        setDate(latestEntryDate);
    }, [latestEntryDate]);
    const tasks = useQuery({ queryKey: ['dmt', 'dash-tasks'], queryFn: () => dmtApi.list('tasks') });
    const meetings = useQuery({ queryKey: ['dmt', 'dash-meetings'], queryFn: () => dmtApi.list('meetings') });
    const pmMachines = useQuery({ queryKey: ['dmt', 'dash-pm-machines'], queryFn: () => dmtApi.list('pm-machines', { is_active: 'true' }) });
    const pmPlan = useQuery({ queryKey: ['dmt', 'dash-pm-plan'], queryFn: () => dmtApi.list('pm-plan') });
    const pmActual = useQuery({ queryKey: ['dmt', 'dash-pm-actual'], queryFn: () => dmtApi.list('pm-actual') });

    const entryByKpi = useMemo(() => Object.fromEntries((dayEntries.data || []).map((e) => [e.kpi_id, e])), [dayEntries.data]);
    const mtdByKpi = useMemo(() => {
        const m = {};
        for (const e of mtdEntries.data || []) (m[e.kpi_id] = m[e.kpi_id] || []).push(e);
        return m;
    }, [mtdEntries.data]);

    // Personal numbers: tasks I own, red KPIs of the groups I am in, meetings I take part in.
    // (PM This Month stays plant-wide.)
    const meEmp = user?.emp_id;
    const myKpiIds = useMemo(() => new Set((myKpiRows.data || []).map((k) => k.kpi_id)), [myKpiRows.data]);
    const myTierIds = useMemo(
        () => new Set((myTiers.data || []).filter((t) => t.is_member || t.lead_emp_id === meEmp || t.co_facilitator_emp_id === meEmp).map((t) => t.id)),
        [myTiers.data, meEmp],
    );
    const myInvitedMeetingIds = useMemo(
        () => new Set((invitees.data || []).filter((i) => i.user_id === meEmp).map((i) => i.meeting_id)),
        [invitees.data, meEmp],
    );
    const openTasks = (tasks.data || []).filter((t) => t.owner_id === meEmp && t.status !== 'completed' && t.status !== 'cancelled');
    const overdueTasks = openTasks.filter((t) => t.due_date && t.due_date.slice(0, 10) < todayStr());
    const redToday = (dayEntries.data || []).filter((e) => e.computed_status === 'red' && myKpiIds.has(e.kpi_id)).length;
    const linkedEntryIds = new Set((tasks.data || []).map((t) => t.origin_kpi_entry_id).filter(Boolean));

    const createTask = useMutation({
        mutationFn: async () => {
            const factories = await dmtApi.list('factory');
            return dmtApi.create('tasks', {
                title: tf.title.trim(), owner_id: tf.owner_id,
                assigned_by: user.emp_id, created_by: user.emp_id, priority: tf.priority, due_date: tf.due_date,
                origin_type: 'kpi_red', origin_kpi_entry_id: taskFor.entry?.id || null,
                tier_id: tf.tier_id || null,
            });
        },
        onSuccess: () => { toast.success('Task created'); qc.invalidateQueries({ queryKey: ['dmt', 'dash-tasks'] }); qc.invalidateQueries({ queryKey: ['dmt', 'tasks'] }); setTaskFor(null); },
        onError: (e) => toast.error(e.message),
    });
    const nextMeeting = (meetings.data || [])
        .filter((m) => (m.scheduled_date || '') >= todayStr() && ['scheduled', 'in_progress'].includes(m.status)
            && (m.facilitator_id === meEmp || m.created_by === meEmp || myInvitedMeetingIds.has(m.id) || (m.tier_id && myTierIds.has(m.tier_id))))
        .sort((a, b) => (a.scheduled_date + a.scheduled_start_time).localeCompare(b.scheduled_date + b.scheduled_start_time))[0];

    const pmSummary = useMemo(() => {
        const t = toIsoDate(new Date());
        let done = 0, total = 0, overdue = 0;
        const plans = (pmPlan.data || []).filter((p) => p.planned_date >= monthStart && p.planned_date <= monthEnd);
        const actuals = (pmActual.data || []).filter((a) => a.actual_date >= monthStart && a.actual_date <= monthEnd);
        for (const p of plans) {
            total += 1;
            const matched = actuals.some((a) => a.machine_id === p.machine_id && a.actual_date >= p.planned_date);
            if (matched) done += 1;
            else if (daysBetween(p.planned_date, t) > 2) overdue += 1;
        }
        return { done, total, overdue };
    }, [pmPlan.data, pmActual.data, monthStart, monthEnd]);

    const grouped = useMemo(() => {
        const byDept = {};
        for (const k of kpis.data || []) (byDept[k.department_id] = byDept[k.department_id] || []).push(k);
        return (departments.data || [])
            .map((d) => ({ dept: d, kpis: byDept[d.id] || [] }))
            .filter((g) => g.kpis.length > 0);
    }, [kpis.data, departments.data]);

    const visibleGroups = deptFilter === 'all' ? grouped : grouped.filter((g) => g.dept.id === deptFilter);

    const isToday = date === todayStr();
    const loading = kpis.isLoading || dayEntries.isLoading || departments.isLoading;

    return (
        <div className="mx-auto max-w-6xl space-y-5">
            <header className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white"><LayoutDashboard size={22} /></div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-900">Daily Management</h1>
                        <p className="text-sm text-slate-500">{user?.name ?? ''}</p>
                    </div>
                </div>
                <div>
                    <input type="date" value={date} max={todayStr()} onChange={(e) => { userPickedDate.current = true; setDate(e.target.value || date); }}
                        className="h-10 rounded-md border border-slate-200 px-3 text-sm" />
                    <p className="mt-1 text-xs text-slate-400">
                        {isToday
                            ? "⚠ Today's data may be incomplete"
                            : !userPickedDate.current && latestEntryDate === date
                                ? 'Showing the most recent day with entries'
                                : "Showing the day's KPI performance"}
                    </p>
                </div>
            </header>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <Stat icon={ListTodo} label="Open Tasks" value={tasks.isLoading ? '—' : openTasks.length} onClick={() => navigate('/dmt/tasks')} />
                <Stat icon={AlertTriangle} label="Overdue Tasks" value={tasks.isLoading ? '—' : overdueTasks.length} onClick={() => navigate('/dmt/tasks')} />
                <Stat icon={AlertCircle} label="Red KPIs" value={dayEntries.isLoading ? '—' : redToday} onClick={() => navigate('/dmt/kpi/entry')} />
                <Stat icon={Wrench} label="PM This Month" value={pmPlan.isLoading ? '—' : `${pmSummary.done}/${pmSummary.total}`} hint={pmSummary.overdue ? `${pmSummary.overdue} overdue` : 'on track'} onClick={() => navigate('/dmt/pm-schedule')} />
                <Stat icon={CalendarDays} label="Next Meeting" value={nextMeeting ? nextMeeting.scheduled_start_time?.slice(0, 5) : '—'} hint={nextMeeting ? `${nextMeeting.title} · ${fmtLong(nextMeeting.scheduled_date)}` : 'none scheduled'} onClick={() => navigate('/dmt/meetings')} />
            </div>

            <MyTierKpisCard entryByKpi={entryByKpi} />

            {widgetsPosition === 'above' && (
                <MyDashboardSection
                    allKpis={allKpis.data || []}
                    allTasks={tasks.data || []}
                    entryByKpi={entryByKpi}
                    departments={departments.data || []}
                    position={widgetsPosition}
                    setPosition={setWidgetsPosition}
                />
            )}

            {grouped.length > 0 && (
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-700">KPI Performance</h2>
                    <Select value={deptFilter} onValueChange={setDeptFilter}>
                        <SelectTrigger className="h-9 w-52 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All departments</SelectItem>
                            {grouped.map(({ dept }) => (
                                <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            )}

            {loading ? (
                <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
            ) : grouped.length === 0 ? (
                <p className="py-12 text-center text-sm text-slate-500">No KPIs configured yet.</p>
            ) : (
                visibleGroups.map(({ dept, kpis: deptKpis }) => {
                    const isCol = collapsed[dept.id];
                    const deptTrackers = trackerKpis.filter((k) => k.department_id === dept.id);
                    const shown = deptKpis.filter((k) => !hiddenKpiIds.has(k.id));
                    const hidden = deptKpis.filter((k) => hiddenKpiIds.has(k.id));
                    const revealHidden = !!showHidden[dept.id];
                    return (
                        <div key={dept.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                            <button type="button" onClick={() => setCollapsed({ ...collapsed, [dept.id]: !isCol })}
                                className="flex w-full items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2 text-sm font-semibold">
                                <span>{dept.name}</span>
                                <ChevronDown className={cn('h-4 w-4 transition-transform', isCol && '-rotate-90')} />
                            </button>
                            {!isCol && (
                                <>
                                    <div className="grid grid-cols-2 gap-2.5 p-3 sm:grid-cols-3 lg:grid-cols-5">
                                        {(revealHidden ? deptKpis : shown).map((k) => {
                                            const e = entryByKpi[k.id];
                                            const isNumeric = k.kpi_type === 'numeric';
                                            const rag = e?.computed_status
                                                || (isNumeric && e?.actual_value != null ? computeRagFromValue(e.actual_value, k) : null);
                                            const mtd = isNumeric ? calculateMtd(mtdByKpi[k.id] || [], k.mtd_aggregation || 'sum', parseLocal(date)) : null;
                                            const isHidden = hiddenKpiIds.has(k.id);
                                            return (
                                                <div
                                                    key={k.id}
                                                    className={cn(
                                                        'rounded-lg border p-2.5 shadow-xs',
                                                        RAG_CARD[rag] || 'border-slate-200 bg-white',
                                                        isHidden && 'opacity-50',
                                                    )}
                                                >
                                                    <div className="flex items-start justify-between gap-1">
                                                        <p className="min-w-0 flex-1 truncate text-xs font-bold text-slate-900" title={k.name}>
                                                            {k.name}
                                                        </p>
                                                        <button
                                                            type="button"
                                                            title={isHidden ? 'Show this KPI' : 'Hide this KPI from my view'}
                                                            onClick={() => toggleHidden.mutate(k.id)}
                                                            className="shrink-0 text-slate-400 hover:text-slate-700"
                                                        >
                                                            {isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                                        </button>
                                                    </div>
                                                    {rag && (
                                                        <Badge className={cn('mt-1 text-[9px] font-bold', RAG_BADGE[rag])}>{rag.toUpperCase()}</Badge>
                                                    )}

                                                    <p className="mt-1.5 text-2xs font-semibold uppercase tracking-wide text-slate-400">
                                                        Actual{k.unit ? ` (${k.unit})` : ''}
                                                    </p>
                                                    <p className={cn('text-xl font-extrabold leading-tight', RAG_TEXT[rag] || 'text-slate-900')}>
                                                        {isNumeric ? (e?.actual_value != null ? formatIndianNumber(e.actual_value) : '—') : (e?.text_value || '—')}
                                                    </p>

                                                    <div className="mt-1.5 flex items-center justify-between border-t border-black/5 pt-1.5 text-2xs">
                                                        <span className="text-slate-500">{isNumeric && k.target_value != null ? `Tgt ${formatIndianNumber(k.target_value)}` : ''}</span>
                                                        <span className="font-semibold text-slate-700">MTD {mtd != null ? formatIndianNumber(mtd) : '—'}</span>
                                                    </div>

                                                    {rag === 'red' && (
                                                        <div className="mt-1.5">
                                                            {e && linkedEntryIds.has(e.id)
                                                                ? <span className="text-2xs font-semibold text-emerald-600">task ✓</span>
                                                                : <Button size="sm" variant="outline" className="h-6 w-full text-2xs" onClick={() => { setTaskFor({ kpi: k, entry: e }); setTf({ title: `Action for Red KPI: ${k.name}`, owner_id: '', priority: 'high', due_date: '', tier_id: '' }); }}>Create Task</Button>}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {hidden.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setShowHidden({ ...showHidden, [dept.id]: !revealHidden })}
                                            className="flex w-full items-center gap-1.5 border-t border-slate-100 px-4 py-2 text-xs text-slate-400 hover:text-slate-600"
                                        >
                                            {revealHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                            {revealHidden ? 'Hide hidden KPIs again' : `${hidden.length} hidden KPI${hidden.length === 1 ? '' : 's'} — show`}
                                        </button>
                                    )}
                                    {deptTrackers.map((tk) => {
                                        const items = (projectItems.data || []).filter((i) => i.kpi_id === tk.id);
                                        if (!items.length) return null;
                                        return (
                                            <div key={tk.id} className="border-t border-slate-100 px-4 py-2">
                                                <p className="text-xs font-semibold text-slate-500">{tk.name}</p>
                                                <div className="mt-1 space-y-0.5">
                                                    {items.map((i) => (
                                                        <div key={i.id} className="flex items-center justify-between text-xs">
                                                            <span className={cn(i.status === 'completed' && 'line-through text-slate-400')}>{i.title}</span>
                                                            <Badge variant="outline" className="text-[10px]">{i.status.replace('_', ' ')}</Badge>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </>
                            )}
                        </div>
                    );
                })
            )}

            {widgetsPosition === 'below' && (
                <MyDashboardSection
                    allKpis={allKpis.data || []}
                    allTasks={tasks.data || []}
                    entryByKpi={entryByKpi}
                    departments={departments.data || []}
                    position={widgetsPosition}
                    setPosition={setWidgetsPosition}
                />
            )}

            <Dialog open={!!taskFor} onOpenChange={(v) => !v && setTaskFor(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader><DialogTitle>Create Task from Red KPI</DialogTitle></DialogHeader>
                    {taskFor && <p className="text-xs text-slate-500">Origin: {taskFor.kpi.name}</p>}
                    <div className="space-y-3">
                        <Input value={tf.title} onChange={(e) => setTf({ ...tf, title: e.target.value })} className="h-11" placeholder="Title *" />
                        <Select value={tf.owner_id} onValueChange={(v) => setTf({ ...tf, owner_id: v })}>
                            <SelectTrigger className="h-11"><SelectValue placeholder="Owner *" /></SelectTrigger>
                            <SelectContent>{(workers.data || []).map((w) => <SelectItem key={w.id || w.emp_id} value={w.id || w.emp_id}>{w.name}</SelectItem>)}</SelectContent>
                        </Select>
                        <div className="grid grid-cols-2 gap-3">
                            <Select value={tf.priority} onValueChange={(v) => setTf({ ...tf, priority: v })}>
                                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                                <SelectContent>{['low', 'medium', 'high', 'critical'].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                            </Select>
                            <input type="date" min={todayStr()} value={tf.due_date} onChange={(e) => setTf({ ...tf, due_date: e.target.value })} className="h-11 rounded-md border border-slate-200 px-3 text-sm" />
                        </div>
                        <Select value={tf.tier_id || undefined} onValueChange={(v) => setTf({ ...tf, tier_id: v })}>
                            <SelectTrigger className="h-11"><SelectValue placeholder="Tier (who sees this task)" /></SelectTrigger>
                            <SelectContent>
                                {(myTiers.data || []).map((t) => <SelectItem key={t.id} value={t.id}>{tierLabel(t)}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-slate-400">Leave blank to make this task visible to everyone.</p>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setTaskFor(null)}>Cancel</Button>
                        <Button disabled={!tf.title.trim() || !tf.owner_id || !tf.due_date || createTask.isPending} onClick={() => createTask.mutate()}>Create Task</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
