import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Play, Square, ArrowLeft, Plus, ArrowUp, ArrowDown, ChevronDown, ChevronUp, AlertTriangle, History, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Badge } from '../../components/ui/badge';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../../components/ui/dialog';
import { cn } from '../../lib/utils';
import { useDmtMe } from '../lib/useDmt';
import { useDmtWorkers } from '../lib/useDmtTasks';
import { useDmtDepartments } from '../lib/useDmtKpi';
import { useDmtMeeting, useMeetingChildren, useMeetingMutations } from '../lib/useDmtMeetings';
import { useDmtTiers, useDmtTierMembers } from '../lib/useDmtTiers';
import { tierLabel } from '../lib/taskExtras';
import { dmtApi } from '../lib/dmtApi';
import { fmtLong, todayStr } from '../lib/dmtDates';
import { computeRagFromValue, calculateMtd, RAG_BADGE } from '../lib/kpiChart';
import { formatIndianNumber } from '../lib/dmtFormat';

const STATUS_CLS = {
    scheduled: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-amber-100 text-amber-700',
    completed: 'bg-emerald-100 text-emerald-700',
    cancelled: 'bg-slate-100 text-slate-500',
};
const ATT_CLS = { present: 'bg-emerald-600 text-white', absent: 'bg-rose-600 text-white', excused: 'bg-amber-500 text-white' };

// The attendance sheet = the meeting's group (members, Lead, Co-facilitator, facilitator), listed automatically, plus people
// the facilitator / co-facilitator added from outside the group for THIS meeting only. The facilitator and co-facilitator
// mark anyone; everyone else marks only their own name. Once marked, a row is locked behind an Edit button.
function AttendanceTab({ meeting, me, canManage, closed, isParticipant }) {
    const qc = useQueryClient();
    const { invitees, attendance } = useMeetingChildren(meeting.id);
    const { addInvitee, markAttendance } = useMeetingMutations(meeting.id);
    const workers = useDmtWorkers();
    const myTiers = useDmtTiers();
    const groupMembers = useDmtTierMembers(meeting.tier_id);
    const tier = (myTiers.data || []).find((t) => t.id === meeting.tier_id);
    const [addUserId, setAddUserId] = useState('');
    const [editingId, setEditingId] = useState(null); // invitee whose already-marked attendance is being changed
    const nameById = Object.fromEntries((workers.data || []).map((w) => [w.id || w.emp_id, w.name]));

    // Bring the list in line with the group once per meeting (new members since it was created, people who left).
    const synced = useRef(null);
    useEffect(() => {
        if (closed || !isParticipant || synced.current === meeting.id) return;
        synced.current = meeting.id;
        dmtApi.syncMeetingAttendees(meeting.id)
            .then(() => qc.invalidateQueries({ queryKey: ['dmt', 'meeting-invitees', meeting.id] }))
            .catch(() => { /* the list still shows what is stored */ });
    }, [meeting.id, closed, isParticipant, qc]);
    const removeExtra = useMutation({
        mutationFn: (id) => dmtApi.remove('meeting-invitees', id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['dmt', 'meeting-invitees', meeting.id] }),
        onError: (e) => toast.error(e.message),
    });

    const attByInvitee = Object.fromEntries((attendance.data || []).map((a) => [a.invitee_id, a]));
    const present = (attendance.data || []).filter((a) => a.status === 'present').length;
    const nameOf = (inv) => (inv.user_id ? (nameById[inv.user_id] || inv.user_id) : (inv.guest_name || 'Unknown'));
    const sheet = (invitees.data || []).slice().sort((a, b) => (a.source === 'extra') - (b.source === 'extra') || nameOf(a).localeCompare(nameOf(b)));
    // "Add person" is only for people OUTSIDE this meeting's group: hide everyone already on the sheet or in the group.
    const inGroup = new Set([
        ...(groupMembers.data || []).map((m) => m.emp_id), tier?.lead_emp_id, tier?.co_facilitator_emp_id, meeting.facilitator_id,
        ...(invitees.data || []).map((i) => i.user_id),
    ].filter(Boolean));
    const canMark = (inv) => !closed && (canManage || (!!inv.user_id && inv.user_id === me));

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge variant="secondary" className="text-xs">{present} present / {sheet.length} on the list</Badge>
                {canManage && !closed && (
                    <div className="flex items-center gap-2">
                        <Select value={addUserId} onValueChange={setAddUserId}>
                            <SelectTrigger className="h-9 w-52 text-sm"><SelectValue placeholder="Add person…" /></SelectTrigger>
                            <SelectContent>
                                {(workers.data || []).filter((w) => w.is_active && !inGroup.has(w.id || w.emp_id))
                                    .map((w) => <SelectItem key={w.id || w.emp_id} value={w.id || w.emp_id}>{w.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Button size="sm" disabled={!addUserId || addInvitee.isPending} onClick={() => {
                            addInvitee.mutate({ user_id: addUserId }, { onSuccess: () => setAddUserId(''), onError: (e) => toast.error(e.message) });
                        }}><Plus className="h-4 w-4" /></Button>
                    </div>
                )}
            </div>
            <p className="-mt-2 text-xs text-slate-500">
                {canManage
                    ? "Your group's people are listed automatically. Use Add person for someone outside the group — they are added to this meeting only, not to the rest of a recurring series."
                    : 'You can mark your own attendance; the facilitator and co-facilitator mark the rest.'}
            </p>

            {invitees.isLoading ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : (
                <div className="space-y-2">
                    {sheet.map((inv) => {
                        const att = attByInvitee[inv.id];
                        const name = nameOf(inv);
                        const mine = !!inv.user_id && inv.user_id === me;
                        return (
                            <div key={inv.id} className="rounded-lg border border-slate-200 bg-white p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                        <p className="text-sm font-medium">{name}{mine && <span className="ml-1 text-xs font-normal text-slate-400">(you)</span>}</p>
                                        <div className="mt-0.5 flex flex-wrap items-center gap-1">
                                            {inv.source === 'extra' && <Badge className="bg-violet-100 text-[10px] text-violet-700">Added for this meeting</Badge>}
                                            {inv.source === 'extra' && canManage && !closed && !att && (
                                                <button type="button" onClick={() => removeExtra.mutate(inv.id)} className="text-[11px] text-slate-400 underline hover:text-rose-600">Remove</button>
                                            )}
                                        </div>
                                    </div>
                                    {!canMark(inv) ? (
                                        <Badge className={cn('text-[10px]', ATT_CLS[att?.status] || 'bg-slate-100 text-slate-500')}>{att?.status || 'Not marked'}</Badge>
                                    ) : att && editingId !== inv.id ? (
                                        // Once marked, attendance is locked; the Edit button is the only way to change it.
                                        <div className="flex items-center gap-2">
                                            <Badge className={cn('text-xs capitalize', ATT_CLS[att.status])}>{att.status}</Badge>
                                            <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => setEditingId(inv.id)}>
                                                <Pencil className="h-3 w-3" /> Edit
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="flex flex-wrap items-center gap-1">
                                            {['present', 'absent', 'excused'].map((s) => (
                                                <Button
                                                    key={s}
                                                    size="sm"
                                                    variant={att?.status === s ? 'default' : 'outline'}
                                                    className={cn('h-8 text-xs capitalize', att?.status === s && ATT_CLS[s])}
                                                    disabled={markAttendance.isPending}
                                                    onClick={() => {
                                                        if (att?.status === s) { setEditingId(null); return; } // unchanged
                                                        markAttendance.mutate(
                                                            { existing: att, inviteeId: inv.id, status: s, marked_by: me },
                                                            { onSuccess: () => setEditingId(null), onError: (e) => toast.error(e.message) },
                                                        );
                                                    }}
                                                >
                                                    {s}
                                                </Button>
                                            ))}
                                            {att && <Button size="sm" variant="ghost" className="h-8 text-xs text-slate-500" onClick={() => setEditingId(null)}>Cancel</Button>}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    {sheet.length === 0 && <p className="text-sm text-slate-400">No one is on the list yet — the group has no members.</p>}
                </div>
            )}
        </div>
    );
}

// readOnly = can't add/reorder at all. canEditNotes = this person added the point (or it has no recorded author), so only
// they may edit its notes; everyone else can read them.
function PointCard({ point, readOnly, canEditNotes, authorName, onNotes, onMove, isFirst, isLast }) {
    const [expanded, setExpanded] = useState(false);
    const [notes, setNotes] = useState(point.notes || '');
    const deb = useRef(null);
    const change = (v) => {
        setNotes(v);
        clearTimeout(deb.current);
        deb.current = setTimeout(() => onNotes(v), 800);
    };
    return (
        <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between gap-2">
                <button type="button" className="flex min-w-0 flex-1 items-center gap-1 text-left text-sm font-medium" onClick={() => setExpanded(!expanded)}>
                    {expanded ? <ChevronUp className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
                    <span className="truncate">{point.title}</span>
                </button>
                {!readOnly && (
                    <div className="flex shrink-0 gap-0.5">
                        <Button size="icon" variant="ghost" className="h-7 w-7" disabled={isFirst} onClick={() => onMove('up')}><ArrowUp className="h-3 w-3" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" disabled={isLast} onClick={() => onMove('down')}><ArrowDown className="h-3 w-3" /></Button>
                    </div>
                )}
            </div>
            {expanded && (
                <>
                    <Textarea value={notes} onChange={(e) => change(e.target.value)} placeholder="Notes…" rows={2} disabled={readOnly || !canEditNotes} className="mt-2 text-sm" />
                    {authorName && <p className="mt-1 text-xs text-slate-500">Added by {authorName}{canEditNotes ? '' : ' — only they can edit these notes'}</p>}
                </>
            )}
        </div>
    );
}

function NotesTab({ meeting, readOnly, me }) {
    const { points } = useMeetingChildren(meeting.id);
    const { setMeeting, addPoint, updatePoint } = useMeetingMutations(meeting.id);
    const workers = useDmtWorkers();
    const nameById = Object.fromEntries((workers.data || []).map((w) => [w.id || w.emp_id, w.name]));
    // The meeting notes belong to whoever wrote them: once written, only that person can edit them.
    const notesLocked = !!(meeting.summary || '').trim() && !!meeting.summary_by && meeting.summary_by !== me;
    const [summary, setSummary] = useState(meeting.summary || '');
    const [newTitle, setNewTitle] = useState('');
    const [savedTick, setSavedTick] = useState(false);
    useEffect(() => { setSummary(meeting.summary || ''); }, [meeting.id]);

    const ordered = (points.data || []).slice().sort((a, b) => (a.sequence || 0) - (b.sequence || 0));

    const move = (id, dir) => {
        const idx = ordered.findIndex((p) => p.id === id);
        const swap = dir === 'up' ? idx - 1 : idx + 1;
        if (swap < 0 || swap >= ordered.length) return;
        updatePoint.mutate({ id: ordered[idx].id, sequence: ordered[swap].sequence });
        updatePoint.mutate({ id: ordered[swap].id, sequence: ordered[idx].sequence });
    };

    return (
        <div className="space-y-6">
            <div>
                <div className="mb-1 flex items-center justify-between">
                    <label className="text-sm font-semibold">Meeting Notes</label>
                    <Button
                        size="sm"
                        disabled={readOnly || notesLocked || setMeeting.isPending}
                        className={cn('h-8', savedTick && 'bg-emerald-600 text-white hover:bg-emerald-700')}
                        onClick={() => setMeeting.mutate({ summary }, { onSuccess: () => { setSavedTick(true); setTimeout(() => setSavedTick(false), 1500); }, onError: (e) => toast.error(e.message) })}
                    >
                        {savedTick ? 'Saved' : 'Save'}
                    </Button>
                </div>
                <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} disabled={readOnly || notesLocked} rows={4} placeholder="Overall meeting notes…" />
                {notesLocked && <p className="mt-1 text-xs text-slate-500">Written by {nameById[meeting.summary_by] || meeting.summary_by} — only they can edit these notes.</p>}
            </div>

            <div className="space-y-2">
                <label className="text-sm font-semibold">Discussion Points</label>
                {ordered.map((p, i) => (
                    <PointCard
                        key={p.id}
                        point={p}
                        readOnly={readOnly}
                        canEditNotes={!p.created_by || p.created_by === me}
                        authorName={p.created_by ? (nameById[p.created_by] || p.created_by) : null}
                        onNotes={(notes) => updatePoint.mutate({ id: p.id, notes })}
                        onMove={(dir) => move(p.id, dir)}
                        isFirst={i === 0}
                        isLast={i === ordered.length - 1}
                    />
                ))}
                {!readOnly && (
                    <div className="flex gap-2">
                        <Input
                            value={newTitle}
                            onChange={(e) => setNewTitle(e.target.value)}
                            placeholder="Add discussion point…"
                            className="h-10"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && newTitle.trim()) {
                                    addPoint.mutate({ title: newTitle.trim(), sequence: ordered.length + 1 }, { onSuccess: () => setNewTitle('') });
                                }
                            }}
                        />
                        <Button size="sm" className="h-10" disabled={!newTitle.trim()}
                            onClick={() => addPoint.mutate({ title: newTitle.trim(), sequence: ordered.length + 1 }, { onSuccess: () => setNewTitle('') })}>
                            <Plus className="h-4 w-4" />
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}

function DecisionsTab({ meeting, readOnly, me }) {
    const { decisions, points } = useMeetingChildren(meeting.id);
    const { addDecision } = useMeetingMutations(meeting.id);
    const workers = useDmtWorkers();
    const nameById = Object.fromEntries((workers.data || []).map((w) => [w.id || w.emp_id, w.name]));
    const [text, setText] = useState('');
    const [linkedPoint, setLinkedPoint] = useState('');

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                {(decisions.data || []).map((d) => (
                    <div key={d.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                        <p>{d.decision_text}</p>
                        {d.discussion_point_id && (
                            <p className="mt-1 text-xs text-slate-400">
                                On: {(points.data || []).find((p) => p.id === d.discussion_point_id)?.title || '—'}
                            </p>
                        )}
                        {d.created_by && <p className="mt-1 text-xs text-slate-400">Added by {nameById[d.created_by] || d.created_by}</p>}
                    </div>
                ))}
                {(decisions.data || []).length === 0 && <p className="text-sm text-slate-400">No decisions recorded.</p>}
            </div>

            {!readOnly && (
                <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Record a decision…" />
                    <Select value={linkedPoint} onValueChange={setLinkedPoint}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Link to discussion point (optional)" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {(points.data || []).map((p) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Button size="sm" disabled={!text.trim() || addDecision.isPending} onClick={() => {
                        addDecision.mutate(
                            { decision_text: text.trim(), discussion_point_id: linkedPoint && linkedPoint !== 'none' ? linkedPoint : null, created_by: me },
                            { onSuccess: () => { setText(''); setLinkedPoint(''); toast.success('Decision recorded'); }, onError: (e) => toast.error(e.message) },
                        );
                    }}>Add Decision</Button>
                </div>
            )}
        </div>
    );
}

// ------- KPI Snapshot tab -------
function KpiSnapshotTab({ meeting, readOnly, me }) {
    const qc = useQueryClient();
    const departments = useDmtDepartments();
    const workers = useDmtWorkers();
    // T4 meetings review the previous day's performance
    const kpiDate = useMemo(() => {
        const d = new Date(`${meeting.scheduled_date}T00:00:00`);
        d.setDate(d.getDate() - 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }, [meeting.scheduled_date]);
    const monthStart = `${kpiDate.slice(0, 7)}-01`;

    const kpis = useQuery({
        queryKey: ['dmt', 'mw-kpis'],
        queryFn: async () => (await dmtApi.list('kpi-master', { is_active: 'true' })).filter((k) => k.is_active && k.kpi_type !== 'project_tracker'),
    });
    const dayEntries = useQuery({ queryKey: ['dmt', 'mw-entries', kpiDate], queryFn: () => dmtApi.list('kpi-entries', { reporting_date: kpiDate }) });
    const mtdEntries = useQuery({ queryKey: ['dmt', 'mw-mtd', monthStart], queryFn: () => dmtApi.list('kpi-entries'), select: (r) => r.filter((e) => e.reporting_date >= monthStart && e.reporting_date <= kpiDate) });
    const meetingTasks = useQuery({ queryKey: ['dmt', 'mw-tasks', meeting.id], queryFn: () => dmtApi.list('tasks', { origin_meeting_id: meeting.id }) });

    const [taskFor, setTaskFor] = useState(null); // { kpi, entry }
    const [tf, setTf] = useState({ title: '', owner_id: '', priority: 'high', due_date: '', tier_id: '' });
    const myTiers = useDmtTiers();

    const entryByKpi = Object.fromEntries((dayEntries.data || []).map((e) => [e.kpi_id, e]));
    const mtdByKpi = useMemo(() => {
        const m = {};
        for (const e of mtdEntries.data || []) (m[e.kpi_id] = m[e.kpi_id] || []).push(e);
        return m;
    }, [mtdEntries.data]);
    const linkedEntryIds = new Set((meetingTasks.data || []).map((t) => t.origin_kpi_entry_id).filter(Boolean));
    const deptName = Object.fromEntries((departments.data || []).map((d) => [d.id, d.name]));

    const grouped = useMemo(() => {
        const byDept = {};
        for (const k of kpis.data || []) (byDept[k.department_id] = byDept[k.department_id] || []).push(k);
        return (departments.data || []).map((d) => ({ dept: d, kpis: byDept[d.id] || [] })).filter((g) => g.kpis.length);
    }, [kpis.data, departments.data]);

    const createTask = useMutation({
        mutationFn: async () => {
            const factories = await dmtApi.list('factory');
            return dmtApi.create('tasks', {
                title: tf.title.trim(),
                owner_id: tf.owner_id,
                assigned_by: me,
                created_by: me,
                priority: tf.priority,
                due_date: tf.due_date,
                origin_type: 'kpi_red',
                origin_meeting_id: meeting.id,
                origin_kpi_entry_id: taskFor.entry?.id || null,
                tier_id: tf.tier_id || null,
            });
        },
        onSuccess: () => {
            toast.success('Task created');
            qc.invalidateQueries({ queryKey: ['dmt', 'mw-tasks', meeting.id] });
            qc.invalidateQueries({ queryKey: ['dmt', 'tasks'] });
            setTaskFor(null);
        },
        onError: (e) => toast.error(e.message),
    });

    if (kpis.isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;

    return (
        <div className="space-y-4">
            <p className="text-xs text-slate-500">Showing KPI performance for {fmtLong(kpiDate)} (the day before this meeting).</p>
            {grouped.map(({ dept, kpis: dk }) => (
                <div key={dept.id} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                    <div className="border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-sm font-semibold">{dept.name}</div>
                    <table className="w-full text-sm">
                        <tbody>
                            {dk.map((k) => {
                                const e = entryByKpi[k.id];
                                const isNum = k.kpi_type === 'numeric';
                                const rag = e?.computed_status || (isNum && e?.actual_value != null ? computeRagFromValue(e.actual_value, k) : null);
                                const mtd = isNum ? calculateMtd(mtdByKpi[k.id] || [], k.mtd_aggregation || 'sum') : null;
                                const linked = e && linkedEntryIds.has(e.id);
                                return (
                                    <tr key={k.id} className="border-b last:border-0">
                                        <td className="px-3 py-2 font-medium">{k.name}{k.unit && <span className="text-slate-400"> ({k.unit})</span>}</td>
                                        <td className="px-3 py-2">{isNum ? (e?.actual_value != null ? formatIndianNumber(e.actual_value) : '—') : (e?.text_value || '—')}</td>
                                        <td className="px-3 py-2">{rag ? <Badge className={cn('text-[10px]', RAG_BADGE[rag])}>{rag.toUpperCase()}</Badge> : <span className="text-xs text-slate-300">—</span>}</td>
                                        <td className="px-3 py-2 text-slate-500">MTD {mtd != null ? formatIndianNumber(mtd) : '—'}</td>
                                        <td className="px-3 py-2 text-right">
                                            {rag === 'red' && !readOnly && (
                                                linked
                                                    ? <span className="text-xs text-emerald-600">task created</span>
                                                    : <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setTaskFor({ kpi: k, entry: e }); setTf({ title: `Action for Red KPI: ${k.name}`, owner_id: '', priority: 'high', due_date: '', tier_id: '' }); }}>Create Task</Button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            ))}
            {grouped.length === 0 && <p className="text-sm text-slate-400">No KPIs configured.</p>}

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

// ------- Tasks tab -------
function MeetingTasksTab({ meeting }) {
    const navigate = useNavigate();
    const workers = useDmtWorkers();
    const nameById = Object.fromEntries((workers.data || []).map((w) => [w.id || w.emp_id, w.name]));
    const tasks = useQuery({ queryKey: ['dmt', 'mw-tasks', meeting.id], queryFn: () => dmtApi.list('tasks', { origin_meeting_id: meeting.id }) });
    const S = { open: 'bg-blue-100 text-blue-700', in_progress: 'bg-amber-100 text-amber-700', blocked: 'bg-rose-100 text-rose-700', completed: 'bg-emerald-100 text-emerald-700', cancelled: 'bg-slate-100 text-slate-500' };
    return (
        <div className="space-y-2">
            {tasks.isLoading ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : !tasks.data?.length ? (
                <p className="text-sm text-slate-400">No tasks were raised from this meeting.</p>
            ) : tasks.data.map((t) => (
                <button key={t.id} type="button" onClick={() => navigate('/dmt/tasks')} className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white p-3 text-left">
                    <div className="min-w-0">
                        <p className="truncate text-sm font-medium">#{t.task_number} {t.title}</p>
                        <p className="text-xs text-slate-400">{nameById[t.owner_id] || t.owner_id}{t.due_date ? ` · due ${t.due_date.slice(0, 10)}` : ''}{t.origin_type === 'kpi_red' ? ' · from red KPI' : ''}</p>
                    </div>
                    <Badge className={cn('text-[10px]', S[t.status])}>{t.status.replace('_', ' ')}</Badge>
                </button>
            ))}
        </div>
    );
}

export function DmtMeetingWorkspace() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user, tierAtLeast } = useDmtMe();
    const me = user?.emp_id;
    const meeting = useDmtMeeting(id);
    const { setMeeting } = useMeetingMutations(id);
    const myTiers = useDmtTiers();
    const [tab, setTab] = useState('kpi');
    const [endWarn, setEndWarn] = useState(null); // count of unaddressed red KPIs

    const mm = meeting.data;
    const kpiDate = mm ? (() => { const d = new Date(`${mm.scheduled_date}T00:00:00`); d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })() : null;
    const redCheck = useQuery({
        queryKey: ['dmt', 'mw-redcheck', id, kpiDate],
        queryFn: async () => {
            const [entries, tasks] = await Promise.all([
                dmtApi.list('kpi-entries', { reporting_date: kpiDate, computed_status: 'red' }),
                dmtApi.list('tasks', { origin_meeting_id: id }),
            ]);
            const linked = new Set(tasks.map((t) => t.origin_kpi_entry_id).filter(Boolean));
            return entries.filter((e) => !linked.has(e.id)).length;
        },
        enabled: !!kpiDate,
    });

    if (meeting.isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
    if (meeting.isError || !meeting.data) return <p className="py-16 text-center text-sm text-slate-500">Meeting not found.</p>;

    const m = meeting.data;
    const myGroup = (myTiers.data || []).find((t) => t.id === m.tier_id);
    // Managers run the meeting (details, attendance, extra people): the facilitator, the group's Co-facilitator, the
    // creator, and module lead and above.
    const canManage = tierAtLeast('module_lead') || m.facilitator_id === me || m.created_by === me || myGroup?.co_facilitator_emp_id === me;
    const closed = m.status === 'completed' || m.status === 'cancelled';
    const readOnly = !canManage || closed;
    // Anyone who is part of the meeting — a member, Lead or Co-facilitator of its group, or a manager — can ADD notes,
    // discussion points and decisions while it is open; what one person added can only be edited by that person.
    const isParticipant = canManage || (!!myGroup && (myGroup.is_member || myGroup.lead_emp_id === me));
    const writeReadOnly = !isParticipant || closed;

    const TABS = [
        { key: 'kpi', label: 'KPI Snapshot' },
        { key: 'attendance', label: 'Attendance' },
        { key: 'notes', label: 'Notes & Discussion' },
        { key: 'decisions', label: 'Decisions' },
        { key: 'tasks', label: 'Tasks' },
    ];

    const doComplete = () => setMeeting.mutate(
        { status: 'completed', actual_end: new Date().toISOString() },
        { onSuccess: () => { toast.success('Meeting completed'); setEndWarn(null); } },
    );

    return (
        <div className="mx-auto max-w-4xl space-y-4">
            <button type="button" onClick={() => navigate('/dmt/meetings')} className="flex items-center gap-1 text-xs text-slate-500">
                <ArrowLeft className="h-3.5 w-3.5" /> All meetings
            </button>

            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="text-lg font-bold text-slate-900">{m.title}</h1>
                        <Badge className={cn('text-[10px]', STATUS_CLS[m.status])}>{m.status.replace('_', ' ')}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                        {fmtLong(m.scheduled_date)} · {m.scheduled_start_time?.slice(0, 5)}–{m.scheduled_end_time?.slice(0, 5)}
                        {m.location ? ` · ${m.location}` : ''}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                {tierAtLeast('leadership') && (
                    <Button size="sm" variant="ghost" className="gap-1 text-slate-600" onClick={() => navigate(`/dmt/organisation?tab=meeting-audit&meeting=${m.id}`)}>
                        <History className="h-4 w-4" /> Audit trail
                    </Button>
                )}
                {canManage && m.status === 'scheduled' && (
                    <Button size="sm" className="gap-1" onClick={() => setMeeting.mutate({ status: 'in_progress', actual_start: new Date().toISOString() }, { onSuccess: () => toast.success('Meeting started') })}>
                        <Play className="h-4 w-4" /> Start
                    </Button>
                )}
                {canManage && m.status === 'in_progress' && (
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => {
                        if (redCheck.data > 0) setEndWarn(redCheck.data);
                        else doComplete();
                    }}>
                        <Square className="h-4 w-4" /> Complete
                    </Button>
                )}
                </div>
            </div>

            <Dialog open={endWarn != null} onOpenChange={(v) => !v && setEndWarn(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /> Unaddressed red KPIs</DialogTitle></DialogHeader>
                    <p className="text-sm text-slate-600">
                        {endWarn} red KPI{endWarn === 1 ? ' has' : 's have'} no task attached from this meeting.
                        Complete the meeting anyway, or go to the KPI Snapshot tab to raise tasks first.
                    </p>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => { setEndWarn(null); setTab('kpi'); }}>Review KPIs</Button>
                        <Button onClick={doComplete}>Complete anyway</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <div className="flex gap-1 border-b border-slate-200">
                {TABS.map((t) => (
                    <button
                        key={t.key}
                        type="button"
                        onClick={() => setTab(t.key)}
                        className={cn('border-b-2 px-3 py-2 text-sm font-medium', tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500')}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Raising tasks has no restriction (any status), so the KPI tab is never read-only for it */}
            {tab === 'kpi' && <KpiSnapshotTab meeting={m} readOnly={false} me={me} />}
            {tab === 'attendance' && <AttendanceTab meeting={m} me={me} canManage={canManage} closed={closed} isParticipant={isParticipant} />}
            {tab === 'notes' && <NotesTab meeting={m} readOnly={writeReadOnly} me={me} />}
            {tab === 'decisions' && <DecisionsTab meeting={m} readOnly={writeReadOnly} me={me} />}
            {tab === 'tasks' && <MeetingTasksTab meeting={m} />}
        </div>
    );
}
