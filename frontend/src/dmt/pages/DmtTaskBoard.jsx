import { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import {
    Plus, Loader2, Play, Pause, CheckCircle2, XCircle, Search, Calendar as CalendarIcon,
    Columns3, ListTodo, Lock, Download, RotateCcw, ChevronDown, ArrowUpRight, ChevronLeft, ChevronRight, SlidersHorizontal, Users,
} from 'lucide-react';
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
import {
    DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuItem, DropdownMenuSeparator,
    DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuPortal,
} from '../../components/ui/dropdown-menu';
import {
    Sheet, SheetContent, SheetHeader, SheetTitle,
} from '../../components/ui/sheet';
import { cn } from '../../lib/utils';
import { safeStorage } from '../../lib/safeStorage';
import { dmtApi } from '../lib/dmtApi';
import { useDmtMe } from '../lib/useDmt';
import { useDmtTasks, useTaskActivity, useTaskMutations, useEscalationTargets } from '../lib/useDmtTasks';
import { useDmtTiers, useDmtTierMembers } from '../lib/useDmtTiers';
import { resolveDmtHierarchyTree } from '../lib/dmtHierarchyTree';
import { todayStr, diffDays, fmtLong } from '../lib/dmtDates';
import {
    TASK_SORT_OPTIONS, sortTasks, isCarryover, tierLabel,
} from '../lib/taskExtras';
import { DmtTaskCalendar } from '../components/DmtTaskCalendar';

const COLUMNS = [
    { status: 'open', label: 'Open' },
    { status: 'in_progress', label: 'In Progress' },
    { status: 'blocked', label: 'Blocked' },
    { status: 'escalated', label: 'Escalated' },
    { status: 'completed', label: 'Completed' },
    { status: 'cancelled', label: 'Cancelled' },
];
// Kanban shows at most this many cards per column; the rest sit behind that column's pager.
const COL_PAGE_SIZE = 4;
// Static class names so Tailwind keeps them (a template-built class would be purged).
const COL_GRID = {
    1: 'lg:grid-cols-1', 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3',
    4: 'lg:grid-cols-4', 5: 'lg:grid-cols-5', 6: 'lg:grid-cols-6',
};
// incoming = escalated UP TO my group / to me; outgoing = my group's task sent up to a higher group
// or person; other = an escalation between groups I'm not part of (e.g. seen by BE Admin).
const ESC_CARD_CLS = {
    incoming: 'border-amber-300 bg-amber-50',
    outgoing: 'border-sky-300 bg-sky-50',
    other: 'border-violet-300 bg-violet-50',
};
const ESC_TEXT_CLS = { incoming: 'text-amber-700', outgoing: 'text-sky-700', other: 'text-violet-700' };
const PRIORITY_CLS = {
    critical: 'bg-rose-600 text-white',
    high: 'bg-amber-500 text-white',
    medium: 'bg-blue-100 text-blue-700',
    low: 'bg-slate-100 text-slate-600',
};
const STATUS_CLS = {
    open: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-amber-100 text-amber-700',
    blocked: 'bg-rose-100 text-rose-700',
    completed: 'bg-emerald-100 text-emerald-700',
    cancelled: 'bg-slate-100 text-slate-500',
};

const isOverdue = (t) =>
    !['completed', 'cancelled'].includes(t.status) && t.due_date && t.due_date.slice(0, 10) < todayStr();
const isDueToday = (t) =>
    !['completed', 'cancelled'].includes(t.status) && (t.due_date || '').slice(0, 10) === todayStr();
// An escalated, still-unfinished task lives in the Escalated column (on every board that can
// see it) instead of its normal status column; finishing it sends it back to Completed.
const isEscalatedActive = (t) => !!t.escalated_at && !['completed', 'cancelled'].includes(t.status);

// Only the person who assigned a task and the person it is assigned to can act on it (the server
// enforces the same rule); everyone else who can see the card only reads it.
function canAct(task, me) {
    return !!me && (task.owner_id === me || task.assigned_by === me);
}

function dueLabel(t) {
    if (!t.due_date) return null;
    const d = diffDays(t.due_date.slice(0, 10), todayStr());
    if (['completed', 'cancelled'].includes(t.status)) return null;
    if (d < 0) return { text: `${-d}d overdue`, cls: 'text-rose-600' };
    if (d === 0) return { text: 'Due today', cls: 'text-amber-600' };
    return { text: `Due ${fmtLong(t.due_date)}`, cls: 'text-slate-400' };
}

// Cards carry: title, priority + due date (or how overdue), the meeting it came from (if any), and
// either the assignee + group, or - once escalated - a two-column From | To block (person and group
// on each side). Every card is the same fixed size: each line is a fixed-height slot, so a long
// title or a missing meeting can never make one card taller than its neighbours. The escalation
// direction shows as the card's colour.
function TaskCard({ task, onClick, escalation, meeting, group, route }) {
    const dl = dueLabel(task);
    const tip = [
        task.title, group ? `Group: ${group}` : null,
        meeting ? `Meeting: ${meeting.title}${meeting.date ? ` (${fmtLong(meeting.date)})` : ''}` : null,
        route ? `From ${route.fromName} (${route.fromGroup || 'not in any group'}) to ${route.toName} (${route.toGroup || 'a person directly'})` : `Assigned to ${task.owner_name}`,
    ].filter(Boolean).join('\n');
    return (
        <button
            type="button"
            onClick={onClick}
            title={tip}
            className={cn(
                'flex h-[148px] w-full flex-col gap-1 overflow-hidden rounded-lg border p-3 text-left shadow-xs transition-shadow hover:shadow-md',
                escalation
                    ? ESC_CARD_CLS[escalation.dir]
                    : cn('bg-white', isOverdue(task) ? 'border-rose-200' : 'border-slate-200'),
            )}
        >
            <p className="flex h-5 shrink-0 items-center text-sm font-medium leading-tight">
                <span className="truncate">{task.title}</span>
            </p>
            <div className="flex h-5 shrink-0 items-center justify-between gap-2">
                <Badge className={cn('h-4 shrink-0 px-1.5 text-[10px]', PRIORITY_CLS[task.priority])}>{task.priority}</Badge>
                <span className={cn('flex min-w-0 items-center gap-1 truncate text-[11px]', dl?.cls)}>
                    {dl && <><CalendarIcon className="h-3 w-3 shrink-0" /><span className="truncate">{dl.text}</span></>}
                </span>
            </div>
            <p className="flex h-4 shrink-0 items-center gap-1 text-[11px] text-violet-600">
                {meeting && (
                    <>
                        <Users className="h-3 w-3 shrink-0" aria-label="Meeting" />
                        {meeting.date && <span className="shrink-0">{fmtLong(meeting.date)} {'\u00b7'}</span>}
                        <span className="truncate">{meeting.title}</span>
                    </>
                )}
            </p>
            {route ? (
                <div className="grid h-[46px] shrink-0 grid-cols-2 gap-2 text-[11px] leading-[14px]">
                    <div className="min-w-0">
                        <p className="font-semibold uppercase tracking-wide text-slate-400">From</p>
                        <p className="truncate font-medium text-slate-700">{route.fromName}</p>
                        <p className="truncate text-slate-500">{route.fromGroup || 'Not in any group'}</p>
                    </div>
                    <div className="min-w-0 border-l border-black/10 pl-2">
                        <p className="font-semibold uppercase tracking-wide text-slate-400">To</p>
                        <p className="truncate font-medium text-slate-700">{route.toName}</p>
                        <p className="truncate text-slate-500">{route.toGroup || 'Person directly'}</p>
                    </div>
                </div>
            ) : (
                <div className="h-[46px] shrink-0 text-[11px] leading-[14px]">
                    <p className="truncate font-medium text-slate-700">{task.owner_name}</p>
                    <p className="truncate text-slate-500">{group || 'Not in any group'}</p>
                </div>
            )}
        </button>
    );
}

function ActivityFeed({ items, workerName, onComment, adding, canComment = true }) {
    const [text, setText] = useState('');
    const sorted = [...items].sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
    const describe = (u) => {
        if (u.update_type === 'comment') return u.update_note;
        if (u.update_type === 'status_change') return `Status → ${(u.new_status || '').replace('_', ' ')}${u.update_note ? ` — ${u.update_note}` : ''}`;
        if (u.update_type === 'due_date_change') return `Due date → ${u.new_due_date}${u.update_note ? ` (${u.update_note})` : ''}`;
        if (u.update_type === 'title_change') return `Renamed to "${u.new_text}"`;
        if (u.update_type === 'assignee_change') return `Owner changed`;
        if (u.update_type === 'description_change') return 'Description updated';
        if (u.update_type === 'group_change') return `Group changed: ${u.previous_text || 'none'} → ${u.new_text}`;
        if (u.update_type === 'escalation') return `Escalated to ${workerName[u.new_text] || u.new_text}${u.update_note ? ` — ${u.update_note}` : ''}`;
        return u.update_type;
    };
    return (
        <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Activity</h3>
            <div className="space-y-2">
                {sorted.map((u) => (
                    <div key={u.id} className="border-l-2 border-slate-200 pl-2 text-xs">
                        <p>{describe(u)}</p>
                        <p className="text-slate-400">{fmtLong(u.created_at)} · {workerName[u.updated_by] || u.updated_by}</p>
                    </div>
                ))}
                {sorted.length === 0 && <p className="text-xs text-slate-400">No activity yet.</p>}
            </div>
            {canComment && <div className="flex gap-2">
                <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment…" className="h-9 text-sm"
                    onKeyDown={(e) => { if (e.key === 'Enter' && text.trim()) { onComment(text.trim()); setText(''); } }} />
                <Button size="sm" disabled={!text.trim() || adding} onClick={() => { onComment(text.trim()); setText(''); }}>Post</Button>
            </div>}
        </div>
    );
}

// Type-to-filter owner picker — plain Radix Select has no search, and scrolling a long worker
// list by hand doesn't scale. A simple open/closed panel with a text input is enough; no need
// for a combobox library for one field.
function SearchableOwnerPicker({ workers, value, onChange }) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const ref = useRef(null);
    useEffect(() => {
        const onClickOutside = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', onClickOutside);
        return () => document.removeEventListener('mousedown', onClickOutside);
    }, []);
    const selected = workers.find((w) => (w.id || w.emp_id) === value);
    const filtered = q.trim() ? workers.filter((w) => w.name.toLowerCase().includes(q.trim().toLowerCase())) : workers;

    return (
        <div ref={ref} className="relative">
            <button type="button" onClick={() => setOpen((v) => !v)} className="flex h-11 w-full items-center justify-between rounded-md border border-slate-200 px-3 text-sm">
                <span className={selected ? 'text-slate-900' : 'text-slate-400'}>{selected?.name || 'Owner *'}</span>
                <ChevronDown className="h-4 w-4 text-slate-400" />
            </button>
            {open && (
                <div className="absolute z-50 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-md">
                    <div className="p-1.5">
                        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name…" className="h-9 text-sm" />
                    </div>
                    <div className="max-h-56 overflow-y-auto border-t border-slate-100">
                        {filtered.map((w) => (
                            <button
                                key={w.id || w.emp_id} type="button"
                                onClick={() => { onChange(w.id || w.emp_id); setOpen(false); setQ(''); }}
                                className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                            >
                                {w.name}
                            </button>
                        ))}
                        {filtered.length === 0 && <p className="px-3 py-2 text-sm text-slate-400">No match.</p>}
                    </div>
                </div>
            )}
        </div>
    );
}

// Groups a task can actually be tagged to for a given owner: the owner's groups, narrowed to the
// ones the person creating/editing may tag to (server rule: they must be a member/Lead of it —
// BE Admin is exempt). Offering anything else just ends in a 403 "You can only tag this task…".
function useAssignableGroups(ownerId, enabled = true) {
    const { user, tierAtLeast } = useDmtMe();
    const myTiers = useDmtTiers();
    const ownerTiers = useQuery({
        queryKey: ['dmt', 'tiers-for-person', ownerId],
        queryFn: () => dmtApi.tiersForPerson(ownerId),
        enabled: !!ownerId && enabled,
    });
    const isBe = tierAtLeast('be_lead');
    const mine = new Set((myTiers.data || []).filter((t) => t.is_member || t.lead_emp_id === user?.emp_id).map((t) => t.id));
    const all = ownerTiers.data || [];
    const groups = isBe ? all : all.filter((t) => mine.has(t.id));
    return {
        groups,
        all,
        isLoading: ownerTiers.isLoading || (!isBe && myTiers.isLoading),
        // the owner has groups, but none this person may tag to
        noneShared: !isBe && all.length > 0 && groups.length === 0,
    };
}

function CreateTaskModal({ open, onOpenChange, workers, me }) {
    const { create } = useTaskMutations();
    const empty = {
        title: '', description: '', owner_id: '', priority: 'medium', due_date: '',
        tier_id: '', is_private: false,
    };
    const [f, setF] = useState(empty);
    const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
    // Owner comes first — no group/department pre-filtering to wade through. Once picked, we
    // look up which real groups THAT person is actually in and offer those as the visibility
    // pick, instead of making the assignor hunt through the whole hierarchy to find them.
    const assignable = useAssignableGroups(f.owner_id);
    const personTiers = { data: assignable.groups, isLoading: assignable.isLoading };

    // An owner with no group at all has nothing sensible to tag the task to — rather than
    // falling back to "visible to everyone in the factory" (the old default for an untagged
    // task), this forces it private instead: owner + assignor + admins only.
    const noGroup = !!f.owner_id && !personTiers.isLoading && (personTiers.data || []).length === 0;
    const effectivePrivate = f.is_private || noGroup;

    const submit = () => {
        create.mutate(
            {
                title: f.title.trim(),
                description: f.description.trim() || null,
                owner_id: f.owner_id,
                assigned_by: me,
                created_by: me,
                priority: f.priority,
                due_date: f.due_date,
                origin_type: 'standalone',
                is_private: effectivePrivate,
                tier_id: effectivePrivate ? null : (f.tier_id || null),
            },
            {
                onSuccess: () => { toast.success('Task created'); onOpenChange(false); setF(empty); },
                onError: (e) => toast.error(e.message),
            },
        );
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>New Task</DialogTitle></DialogHeader>
                <div className="space-y-3">
                    <div>
                        <label className="text-xs font-medium text-slate-500">Title</label>
                        <Input value={f.title} onChange={(e) => set('title', e.target.value)} className="mt-1 h-11" />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-slate-500">Description</label>
                        <Textarea value={f.description} onChange={(e) => set('description', e.target.value)} rows={2} className="mt-1" />
                    </div>
                    <SearchableOwnerPicker
                        workers={workers}
                        value={f.owner_id}
                        onChange={(v) => {
                            set('owner_id', v);
                            set('tier_id', ''); // a new owner means the old group pick no longer applies
                        }}
                    />
                    {f.owner_id && !personTiers.isLoading && (
                        (personTiers.data || []).length > 0 ? (
                            <Select value={f.tier_id} onValueChange={(v) => set('tier_id', v)}>
                                <SelectTrigger className="h-11"><SelectValue placeholder="Group *" /></SelectTrigger>
                                <SelectContent>
                                    {(personTiers.data || []).map((t) => <SelectItem key={t.id} value={t.id}>{t.display_name || tierLabel(t)}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        ) : (
                            <p className="text-xs text-slate-400">
                                {assignable.noneShared
                                    ? "You and this person don't share a group, so this task will be private (only owner and assignor can see it)."
                                    : "This person isn't in any group yet, so this task will be private (only owner and assignor can see it)."}
                            </p>
                        )
                    )}
                    <div className="grid grid-cols-2 gap-3">
                        <Select value={f.priority} onValueChange={(v) => set('priority', v)}>
                            <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {['low', 'medium', 'high', 'critical'].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <input type="date" min={todayStr()} value={f.due_date} onChange={(e) => set('due_date', e.target.value)}
                            className="h-11 rounded-md border border-slate-200 px-3 text-sm" />
                    </div>
                    {!noGroup && (
                        <label className="flex items-center gap-2 text-sm text-slate-600">
                            <input type="checkbox" checked={f.is_private} onChange={(e) => set('is_private', e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                            Make this private
                        </label>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button
                        disabled={
                            !f.title.trim() || !f.owner_id || !f.due_date
                            || (!effectivePrivate && (personTiers.data || []).length > 0 && !f.tier_id)
                            || create.isPending
                        }
                        onClick={submit}
                    >
                        {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function EscalateDialog({ task, open, onOpenChange, workers, onDone }) {
    const targets = useEscalationTargets();
    const { escalate } = useTaskMutations();
    const [mode, setMode] = useState('group'); // 'group' -> that group's Lead | 'person'
    const [tierId, setTierId] = useState('');
    const [empId, setEmpId] = useState('');
    const [note, setNote] = useState('');
    const groups = (targets.data || []).filter((g) => g.id !== task.tier_id);
    const people = workers.filter((w) => (w.id || w.emp_id) !== task.owner_id);
    const ready = mode === 'group' ? !!tierId : !!empId;

    const submit = () => escalate.mutate(
        { id: task.id, body: { ...(mode === 'group' ? { to_tier_id: tierId } : { to_emp_id: empId }), note: note.trim() || undefined } },
        {
            onSuccess: () => { toast.success('Task escalated'); onOpenChange(false); setTierId(''); setEmpId(''); setNote(''); onDone(); },
            onError: (e) => toast.error(e.message),
        },
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>Escalate Task</DialogTitle></DialogHeader>
                <p className="text-xs text-slate-500">Ownership moves to the person who receives it. They can reassign it within their group.</p>
                <div className="flex gap-1 rounded-md bg-slate-100 p-0.5 text-xs">
                    <button type="button" onClick={() => setMode('group')} className={cn('flex-1 rounded px-3 py-1.5 font-medium', mode === 'group' ? 'bg-white shadow-xs' : 'text-slate-500')}>To a group</button>
                    <button type="button" onClick={() => setMode('person')} className={cn('flex-1 rounded px-3 py-1.5 font-medium', mode === 'person' ? 'bg-white shadow-xs' : 'text-slate-500')}>To a person</button>
                </div>
                {mode === 'group' ? (
                    <Select value={tierId} onValueChange={setTierId}>
                        <SelectTrigger className="h-11"><SelectValue placeholder="Select a group (goes to its Lead)" /></SelectTrigger>
                        <SelectContent>
                            {groups.map((g) => (
                                <SelectItem key={g.id} value={g.id} disabled={!g.lead_emp_id}>
                                    {tierLabel(g)}{g.lead_name ? ` — Lead: ${g.lead_name}` : ' — no Lead'}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                ) : (
                    <Select value={empId} onValueChange={setEmpId}>
                        <SelectTrigger className="h-11"><SelectValue placeholder="Select a person" /></SelectTrigger>
                        <SelectContent>{people.map((w) => <SelectItem key={w.id || w.emp_id} value={w.id || w.emp_id}>{w.name}</SelectItem>)}</SelectContent>
                    </Select>
                )}
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Reason (optional)" />
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Back</Button>
                    <Button disabled={!ready || escalate.isPending} onClick={submit}>
                        {escalate.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Escalate
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function TaskDetailDrawer({ task, onClose, workers, workerName, tierNameById = {}, meetingById = {} }) {
    const { user } = useDmtMe();
    const me = user?.emp_id;
    const activity = useTaskActivity(task.id);
    const { setStatus, setDueDate, setFields, comment } = useTaskMutations();
    const act = canAct(task, me);
    const terminal = ['completed', 'cancelled'].includes(task.status);
    const escTargets = useEscalationTargets();
    const escTierMembers = useDmtTierMembers(task.escalated_to_tier_id);
    const [escalateOpen, setEscalateOpen] = useState(false);
    const canEscalate = !terminal && !task.is_private && act;
    // Once escalated into a group, the owner can only hand the task on to someone in that group.
    const restrictOwner = !!task.escalated_to_tier_id;
    const ownerChoices = useMemo(() => {
        if (!restrictOwner) return workers;
        const ids = new Set((escTierMembers.data || []).map((m) => m.emp_id));
        const lead = (escTargets.data || []).find((g) => g.id === task.escalated_to_tier_id)?.lead_emp_id;
        if (lead) ids.add(lead);
        return workers.filter((w) => ids.has(w.id || w.emp_id));
    }, [restrictOwner, workers, escTierMembers.data, escTargets.data, task.escalated_to_tier_id]);

    const [editMode, setEditMode] = useState(false);
    const [edit, setEdit] = useState({});
    // Same idea as New Task: the group choices are the groups the (new) owner actually belongs to.
    const assignable = useAssignableGroups(edit.owner_id, !task.escalated_at);
    // Keep the task's CURRENT group selectable even if the editor isn't in it — leaving it
    // unchanged sends no tier_id, so the server never re-checks it.
    const keepCurrent = assignable.all.filter((t) => t.id === task.tier_id && !assignable.groups.some((g) => g.id === t.id));
    const personTiers = { data: [...assignable.groups, ...keepCurrent], isLoading: assignable.isLoading };
    const editGroups = personTiers.data || [];
    const editNoGroup = !task.escalated_at && !!edit.owner_id && !personTiers.isLoading && editGroups.length === 0;
    const editNeedsGroup = !task.escalated_at && editGroups.length > 0;
    useEffect(() => {
        if (!edit.tier_id && task.tier_id && editGroups.some((t) => t.id === task.tier_id)) setEdit((e) => ({ ...e, tier_id: task.tier_id }));
    }, [personTiers.data, edit.owner_id, edit.tier_id, task.tier_id]); // eslint-disable-line react-hooks/exhaustive-deps
    const [showDue, setShowDue] = useState(false);
    const [due, setDue] = useState({ date: '', reason: '' });
    const [closing, setClosing] = useState(null); // 'completed' | 'cancelled'
    const [resolution, setResolution] = useState('');

    const enterEdit = () => {
        setEdit({
            title: task.title, description: task.description || '',
            owner_id: task.owner_id, priority: task.priority, tier_id: task.tier_id || '',
        });
        setEditMode(true);
    };

    const saveEdit = () => {
        const { tier_id, ...rest } = edit;
        const fields = { ...rest };
        if (!task.escalated_at && !personTiers.isLoading) {
            if (editGroups.length > 0) {
                if (tier_id && tier_id !== (task.tier_id || '')) fields.tier_id = tier_id;
            } else if (task.tier_id || !task.is_private) {
                fields.tier_id = null; fields.is_private = true; // no group at all -> private, same as New Task
            }
        }
        setFields.mutate(
            { id: task.id, fields },
            { onSuccess: () => { toast.success('Task updated'); setEditMode(false); onClose(); }, onError: (e) => toast.error(e.message) },
        );
    };

    const changeStatus = (status, note) => {
        setStatus.mutate(
            { id: task.id, status, note },
            { onSuccess: () => { toast.success('Status updated'); onClose(); }, onError: (e) => toast.error(e.message) },
        );
    };

    return (
        <Sheet open onOpenChange={(v) => !v && onClose()}>
            <SheetContent className="w-full overflow-y-auto sm:max-w-[480px]">
                <SheetHeader><SheetTitle className="sr-only">Task Detail</SheetTitle></SheetHeader>

                {editMode ? (
                    <div className="space-y-4 pt-2">
                        <h2 className="text-base font-bold">Edit Task #{task.task_number}</h2>
                        <Input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} className="h-11" placeholder="Title *" />
                        <Textarea value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} rows={2} placeholder="Description" />
                        {/* Same fields as New Task (title, description, owner, priority). A task belongs to a
                            group, never to a department. */}
                        <SearchableOwnerPicker
                            workers={ownerChoices}
                            value={edit.owner_id}
                            onChange={(v) => setEdit({ ...edit, owner_id: v, tier_id: '' })}
                        />
                        {task.escalated_at ? (
                            <p className="text-xs text-slate-500">Group: {tierNameById[task.tier_id] || 'Not in any group'} (it can't be changed while the task is escalated)</p>
                        ) : editGroups.length > 0 ? (
                            <Select value={edit.tier_id} onValueChange={(v) => setEdit({ ...edit, tier_id: v })}>
                                <SelectTrigger className="h-11"><SelectValue placeholder="Group *" /></SelectTrigger>
                                <SelectContent>
                                    {editGroups.map((t) => <SelectItem key={t.id} value={t.id}>{t.display_name || tierLabel(t)}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        ) : editNoGroup ? (
                            <p className="text-xs text-slate-400">Not in any group. This person isn't in any group yet, so the task will be private (only owner and assignor can see it).</p>
                        ) : null}
                        <Select value={edit.priority} onValueChange={(v) => setEdit({ ...edit, priority: v })}>
                            <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                            <SelectContent>{['low', 'medium', 'high', 'critical'].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                        </Select>
                        <div className="flex gap-2">
                            <Button className="h-11 flex-1" disabled={!edit.title || (editNeedsGroup && !edit.tier_id) || setFields.isPending} onClick={saveEdit}>Save</Button>
                            <Button variant="outline" className="h-11" onClick={() => setEditMode(false)}>Cancel</Button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-6 pt-2">
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm text-slate-400">#{task.task_number}</span>
                                <Badge className={cn('text-[10px]', STATUS_CLS[task.status])}>{task.status.replace('_', ' ')}</Badge>
                                <Badge className={cn('text-[10px]', PRIORITY_CLS[task.priority])}>{task.priority}</Badge>
                            </div>
                            <div className="mt-1 flex items-center justify-between">
                                <h2 className="text-base font-bold">{task.title}</h2>
                                {act && !terminal && (
                                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={enterEdit}>Edit</Button>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-y-2 text-sm">
                            <div><span className="text-xs text-slate-400">Group</span><p>{tierNameById[task.tier_id] || 'Not in any group'}</p></div>
                            <div><span className="text-xs text-slate-400">Owner</span><p>{task.owner_name}</p></div>
                            <div><span className="text-xs text-slate-400">Assigned by</span><p>{task.assigned_by_name}</p></div>
                            {task.origin_meeting_id && (
                                <div className="col-span-2">
                                    <span className="text-xs text-slate-400">Came from meeting</span>
                                    <p>{meetingById[task.origin_meeting_id]?.title || 'A meeting'}{meetingById[task.origin_meeting_id]?.date ? ` · ${fmtLong(meetingById[task.origin_meeting_id].date)}` : ''}</p>
                                </div>
                            )}
                            <div>
                                <span className="text-xs text-slate-400">Due Date</span>
                                <p className={cn(isOverdue(task) && 'font-medium text-rose-600')}>{task.due_date ? fmtLong(task.due_date) : '—'}</p>
                            </div>
                        </div>

                        {task.escalated_at && (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                                <p className="font-semibold">
                                    Escalated{task.escalation_type === 'auto' ? ' automatically (overdue)' : ''} · {fmtLong(String(task.escalated_at).slice(0, 10))}
                                </p>
                                <p>
                                    From {workerName[task.escalated_from_owner_id] || task.escalated_from_owner_id} ({tierNameById[task.tier_id] || 'not in any group'})
                                    {' '}to {task.owner_name} ({task.escalated_to_tier_id ? (tierNameById[task.escalated_to_tier_id] || 'a group') : 'person directly'})
                                </p>
                                {task.escalation_note && <p className="mt-0.5">{task.escalation_note}</p>}
                            </div>
                        )}

                        {act && !terminal && (
                            <div>
                                <button type="button" className="p-0 text-xs text-blue-600 underline" onClick={() => setShowDue(!showDue)}>Change Due Date</button>
                                {showDue && (
                                    <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                                        <input type="date" min={todayStr()} value={due.date} onChange={(e) => setDue({ ...due, date: e.target.value })}
                                            className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm" />
                                        <Input value={due.reason} onChange={(e) => setDue({ ...due, reason: e.target.value })} placeholder="Reason (required)" className="h-10" />
                                        <Button size="sm" disabled={!due.date || !due.reason || setDueDate.isPending}
                                            onClick={() => setDueDate.mutate({ id: task.id, date: due.date, reason: due.reason }, {
                                                onSuccess: () => { toast.success('Due date changed'); setShowDue(false); onClose(); },
                                                onError: (e) => toast.error(e.message),
                                            })}>Update</Button>
                                    </div>
                                )}
                            </div>
                        )}

                        {task.description && (
                            <div><span className="text-xs text-slate-400">Description</span><p className="mt-0.5 text-sm">{task.description}</p></div>
                        )}

                        {act && !terminal && (
                            <div className="space-y-3">
                                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Actions</h3>
                                <div className="flex flex-wrap gap-2">
                                    {task.status !== 'in_progress' && (
                                        <Button size="sm" className="h-9 gap-1" onClick={() => changeStatus('in_progress')}><Play className="h-3.5 w-3.5" />Start / Resume</Button>
                                    )}
                                    {task.status === 'in_progress' && (
                                        <Button size="sm" variant="outline" className="h-9 gap-1" onClick={() => { setClosing('blocked'); setResolution(''); }}><Pause className="h-3.5 w-3.5" />Block</Button>
                                    )}
                                    <Button size="sm" className="h-9 gap-1 bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => { setClosing('completed'); setResolution(''); }}>
                                        <CheckCircle2 className="h-3.5 w-3.5" />Complete
                                    </Button>
                                    <Button size="sm" variant="outline" className="h-9 gap-1" onClick={() => { setClosing('cancelled'); setResolution(''); }}>
                                        <XCircle className="h-3.5 w-3.5" />Cancel
                                    </Button>
                                    {canEscalate && (
                                        <Button size="sm" variant="outline" className="h-9 gap-1 border-amber-300 text-amber-700 hover:bg-amber-50" onClick={() => setEscalateOpen(true)}>
                                            <ArrowUpRight className="h-3.5 w-3.5" />Escalate
                                        </Button>
                                    )}
                                </div>
                            </div>
                        )}

                        {task.status === 'blocked' && (() => {
                            const b = [...(activity.data || [])].reverse().find((u) => u.update_type === 'status_change' && u.new_status === 'blocked');
                            return b?.update_note ? (
                                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                                    <p className="font-semibold">Blocked</p>
                                    <p className="mt-0.5">{b.update_note}</p>
                                </div>
                            ) : null;
                        })()}

                        {terminal && task.resolution_note && (
                            <div><span className="text-xs text-slate-400">Resolution</span><p className="mt-0.5 text-sm">{task.resolution_note}</p></div>
                        )}

                        <ActivityFeed
                            items={activity.data || []}
                            workerName={workerName}
                            adding={comment.isPending}
                            canComment={act}
                            onComment={(text) => comment.mutate({ id: task.id, text })}
                        />
                    </div>
                )}

                <EscalateDialog task={task} open={escalateOpen} onOpenChange={setEscalateOpen} workers={workers} onDone={onClose} />

                <Dialog open={!!closing} onOpenChange={(v) => !v && setClosing(null)}>
                    <DialogContent className="max-w-md">
                        <DialogHeader><DialogTitle>{{ completed: 'Complete Task', cancelled: 'Cancel Task', blocked: 'Block Task' }[closing]}</DialogTitle></DialogHeader>
                        <Textarea value={resolution} onChange={(e) => setResolution(e.target.value)} rows={3}
                            placeholder={closing === 'blocked' ? 'Why is this task blocked? (required)' : 'What was done / why cancelled? (required)'} />
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setClosing(null)}>Back</Button>
                            <Button disabled={!resolution.trim()} onClick={() => { changeStatus(closing, resolution.trim()); setClosing(null); }}
                                className={closing === 'completed' ? 'bg-emerald-600 text-white hover:bg-emerald-700' : ''}>
                                {{ completed: 'Complete', cancelled: 'Cancel Task', blocked: 'Block Task' }[closing]}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </SheetContent>
        </Sheet>
    );
}

function exportTasksXlsx(rows, tierNameById) {
    const data = rows.map((t) => ({
        '#': t.task_number,
        Title: t.title,
        Owner: t.owner_name || '',
        'Assigned by': t.assigned_by_name || '',
        Priority: t.priority,
        Status: t.status,
        'Due date': t.due_date ? t.due_date.slice(0, 10) : '',
        Tier: t.tier_id ? (tierNameById[t.tier_id] || '') : '',
        Private: t.is_private ? 'Yes' : '',
        Resolution: t.resolution_note || '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tasks');
    XLSX.writeFile(wb, `dmt-tasks-${todayStr()}.xlsx`);
}

export function DmtTaskBoard() {
    const { user, tierAtLeast } = useDmtMe();
    const me = user?.emp_id;
    const [searchParams, setSearchParams] = useSearchParams();
    const [view, setView] = useState('kanban');
    const [filterPriority, setFilterPriority] = useState('all');
    const [chip, setChip] = useState({ mine: false, overdue: false, today: false, carryover: false });
    const [search, setSearch] = useState('');
    const [sortKey, setSortKey] = useState('created_desc');
    // Which kanban columns this person wants to see — remembered per person in this browser.
    const colsKey = `dmt_taskboard_cols_${me || 'anon'}`;
    const [hiddenCols, setHiddenCols] = useState(() => new Set());
    useEffect(() => {
        try {
            const raw = safeStorage.getItem(colsKey);
            setHiddenCols(new Set(raw ? JSON.parse(raw) : []));
        } catch { setHiddenCols(new Set()); }
    }, [colsKey]);
    const toggleCol = (status) => setHiddenCols((prev) => {
        const next = new Set(prev);
        if (next.has(status)) next.delete(status);
        else if (COLUMNS.length - next.size > 1) next.add(status); // always keep at least one column
        else return prev;
        try { safeStorage.setItem(colsKey, JSON.stringify([...next])); } catch { /* storage unavailable */ }
        return next;
    });
    const shownCols = COLUMNS.filter((c) => !hiddenCols.has(c.status));
    const [colPage, setColPage] = useState({});
    const [escFilter, setEscFilter] = useState('all'); // Escalated column: all | incoming | outgoing | other
    // Multi-select group filter — any combination of T4 / DMTs / JH groups can be checked at
    // once (owner request: "yes multiple groups may be selected at once"), OR-ed together.
    const [selectedTierIds, setSelectedTierIds] = useState(() => new Set());
    const [listTab, setListTab] = useState('active');
    const [showCreate, setShowCreate] = useState(false);
    const [selected, setSelected] = useState(null);

    const { tasks, workers, workerName } = useDmtTasks({ priority: filterPriority });
    const myTiers = useDmtTiers();
    const escTargets = useEscalationTargets();
    const meetings = useQuery({ queryKey: ['dmt', 'meetings-for-task-cards'], queryFn: () => dmtApi.list('meetings'), staleTime: 1000 * 60 * 5 });
    const meetingById = useMemo(
        () => Object.fromEntries((meetings.data || []).map((m) => [m.id, { title: m.title, date: (m.scheduled_date || '').slice(0, 10) }])),
        [meetings.data],
    );
    const moduleGroups = useQuery({ queryKey: ['dmt', 'module-groups'], queryFn: dmtApi.moduleGroups, staleTime: 1000 * 60 * 5 });
    const jhGroups = useQuery({ queryKey: ['dmt', 'jh-groups'], queryFn: dmtApi.jhGroups, staleTime: 1000 * 60 * 5 });
    const dueChanges = useQuery({ queryKey: ['dmt', 'task-due-changes'], queryFn: () => dmtApi.list('task-updates', { update_type: 'due_date_change' }) });

    // Deep link from Task Overview (or anywhere else): ?open=<taskId> auto-opens that task's
    // detail sheet once the list has loaded, then clears the param. `openedRef` makes this
    // fire exactly once per link — `tasks.rows` is a brand-new array every render, so without
    // the guard this effect would re-run on every subsequent render (e.g. while `open` is
    // still in the URL, pending its own removal) and reopen the drawer right after closing it.
    const openId = searchParams.get('open');
    const openedRef = useRef(false);
    useEffect(() => {
        if (!openId || tasks.isLoading || openedRef.current) return;
        openedRef.current = true;
        const match = tasks.rows.find((t) => t.id === openId);
        if (match) setSelected(match);
        setSearchParams((p) => { p.delete('open'); return p; }, { replace: true });
    }, [openId, tasks.isLoading]);

    // Names for every active group (not just mine) so an escalated card can say where it came
    // from / went to even when that group isn't one the viewer belongs to.
    const tierNameById = useMemo(
        () => ({
            ...Object.fromEntries((escTargets.data || []).map((t) => [t.id, tierLabel(t)])),
            ...Object.fromEntries((myTiers.data || []).map((t) => [t.id, tierLabel(t)])),
        }),
        [myTiers.data, escTargets.data],
    );
    const historyIds = useMemo(() => new Set((dueChanges.data || []).map((r) => r.task_id)), [dueChanges.data]);

    // The group-filter dropdown mirrors the Hierarchy tab exactly — a group only appears here,
    // nested under its real parent, if it's explicitly linked in Hierarchy. This is deliberate:
    // the old version grouped JH groups under their raw jh_group_dmt_id regardless of Hierarchy
    // links, so a group could show up under a different parent here than where Hierarchy
    // actually placed it. `myOwnTierIds` backs the default "My Tiers" scope (member/Lead of, not
    // the full BE-Lead-sees-everything set) so the board opens onto a manageable slice by default.
    const hierarchyTree = useMemo(
        () => resolveDmtHierarchyTree(myTiers.data || [], moduleGroups.data || [], jhGroups.data || []),
        [myTiers.data, moduleGroups.data, jhGroups.data],
    );
    const myOwnTierIds = useMemo(
        () => new Set((myTiers.data || []).filter((t) => t.is_member || t.lead_emp_id === me).map((t) => t.id)),
        [myTiers.data, me],
    );
    // No more separate "Scope" toggle — the Groups filter below already lets anyone pick
    // exactly which group(s) to look at, so a redundant My-Tiers/All switch just duplicated
    // that. Default (nothing picked in Groups) is "my own tiers + untagged tasks"; someone
    // with no tier membership at all (BE Admin, or a global task viewer who isn't in any group
    // themselves) has no "mine" to default to, so they see everything they can, same as before.
    // BE Admin opens on every task, whether or not they belong to any group; everyone else opens on
    // their own groups' tasks combined (plus untagged ones) and narrows with the Groups filter.
    const belongsToNoTiers = tierAtLeast('be_lead') || (!myTiers.isLoading && myOwnTierIds.size === 0);
    const tierFilterIds = selectedTierIds.size > 0 ? selectedTierIds : null;
    const toggleTierId = (id) => setSelectedTierIds((prev) => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });

    const applyFilters = (list) => {
        let r = list;
        if (chip.mine && me) r = r.filter((t) => t.owner_id === me);
        if (chip.overdue) r = r.filter(isOverdue);
        if (chip.today) r = r.filter(isDueToday);
        if (chip.carryover) r = r.filter((t) => isCarryover(t, historyIds));
        // An escalated task also counts as belonging to the group it was escalated to (or to
        // the person it now sits with), so it shows up on the higher group's board. By default
        // every unfinished escalated task the viewer can see stays in view (the Escalated column
        // is an attention list) — this is what lets BE Admin see escalations from groups they
        // don't belong to; picking groups in the Groups filter still narrows it.
        if (tierFilterIds) {
            r = r.filter((t) => (t.tier_id && tierFilterIds.has(t.tier_id)) || (t.escalated_to_tier_id && tierFilterIds.has(t.escalated_to_tier_id)));
        } else if (!belongsToNoTiers) {
            r = r.filter((t) => !t.tier_id || myOwnTierIds.has(t.tier_id)
                || (t.escalated_to_tier_id && myOwnTierIds.has(t.escalated_to_tier_id))
                || isEscalatedActive(t));
        }
        const q = search.trim().toLowerCase();
        if (q) r = r.filter((t) => `${t.title} ${t.description || ''} #${t.task_number} ${t.owner_name} ${tierNameById[t.tier_id] || ''}`.toLowerCase().includes(q));
        return sortTasks(r, sortKey);
    };

    useEffect(() => { setColPage({}); }, [chip, search, sortKey, tierFilterIds, filterPriority, escFilter]);
    const filterDeps = [tasks.rows, chip, search, sortKey, tierFilterIds, belongsToNoTiers, myOwnTierIds, historyIds, me];
    const activeTasks = useMemo(() => applyFilters(tasks.rows.filter((t) => !['completed', 'cancelled'].includes(t.status))), filterDeps);
    const closedTasks = useMemo(() => {
        const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 14);
        const c = cutoff.toISOString().slice(0, 10);
        return applyFilters(tasks.rows.filter((t) => ['completed', 'cancelled'].includes(t.status) && (t.completed_at || '').slice(0, 10) >= c));
    }, filterDeps);
    const kanbanTasks = useMemo(() => applyFilters(tasks.rows), filterDeps);

    const counts = {
        overdue: tasks.rows.filter(isOverdue).length,
        today: tasks.rows.filter(isDueToday).length,
        mine: tasks.rows.filter((t) => t.owner_id === me).length,
        carryover: tasks.rows.filter((t) => isCarryover(t, historyIds)).length,
    };
    const selectedFresh = selected ? (tasks.rows.find((t) => t.id === selected.id) || selected) : null;

    const chipBtn = (key, label) => (
        <button type="button" onClick={() => setChip((c) => ({ ...c, [key]: !c[key] }))}
            className={cn('rounded-full border px-3 py-1 text-xs font-medium', chip[key] ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-600')}>
            {label} ({counts[key]})
        </button>
    );

    // Amber = escalated UP TO me/my group (from below); blue = a task of my group that was
    // escalated to a higher group or another person.
    const escalationFor = (t) => {
        if (!isEscalatedActive(t)) return undefined;
        const auto = t.escalation_type === 'auto' ? ' \u00b7 auto' : '';
        const toMe = t.owner_id === me || (t.escalated_to_tier_id && myOwnTierIds.has(t.escalated_to_tier_id));
        const fromMyGroup = t.tier_id && myOwnTierIds.has(t.tier_id);
        const fromName = (t.tier_id && tierNameById[t.tier_id]) || workerName[t.escalated_from_owner_id] || 'below';
        const toName = (t.escalated_to_tier_id && tierNameById[t.escalated_to_tier_id]) || t.owner_name;
        if (toMe) return { dir: 'incoming', label: `Escalated from ${fromName}${auto}` };
        if (fromMyGroup) return { dir: 'outgoing', label: `Escalated to ${toName}${auto}` };
        return { dir: 'other', label: `${fromName} \u2192 ${toName}${auto}` };
    };

    const cardFor = (t) => {
        const esc = escalationFor(t);
        const group = t.tier_id ? tierNameById[t.tier_id] : null;
        const route = esc ? {
            fromName: workerName[t.escalated_from_owner_id] || t.escalated_from_owner_id,
            fromGroup: group,
            toName: t.owner_name,
            toGroup: t.escalated_to_tier_id ? tierNameById[t.escalated_to_tier_id] : null,
        } : null;
        const meeting = t.origin_meeting_id ? (meetingById[t.origin_meeting_id] || { title: 'a meeting', date: null }) : null;
        return <TaskCard key={t.id} task={t} onClick={() => setSelected(t)} escalation={esc} meeting={meeting} group={group} route={route} />;
    };

    return (
        <div className="mx-auto -mt-2 max-w-6xl space-y-3 sm:-mt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h1 className="text-xl font-bold text-slate-900">Task Board</h1>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex overflow-hidden rounded-md border border-slate-200">
                        <button type="button" onClick={() => setView('kanban')} className={cn('px-2 py-1.5', view === 'kanban' ? 'bg-slate-900 text-white' : 'bg-white text-slate-500')}><Columns3 className="h-4 w-4" /></button>
                        <button type="button" onClick={() => setView('list')} className={cn('px-2 py-1.5', view === 'list' ? 'bg-slate-900 text-white' : 'bg-white text-slate-500')}><ListTodo className="h-4 w-4" /></button>
                        <button type="button" onClick={() => setView('calendar')} className={cn('px-2 py-1.5', view === 'calendar' ? 'bg-slate-900 text-white' : 'bg-white text-slate-500')}><CalendarIcon className="h-4 w-4" /></button>
                    </div>
                    <Select value={sortKey} onValueChange={setSortKey}>
                        <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{TASK_SORT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}</SelectContent>
                    </Select>
                    {view === 'kanban' && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button size="sm" variant="outline" className="h-8 gap-1"><SlidersHorizontal className="h-3.5 w-3.5" /> Columns</Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                                {COLUMNS.map((c) => (
                                    <DropdownMenuCheckboxItem
                                        key={c.status}
                                        checked={!hiddenCols.has(c.status)}
                                        onCheckedChange={() => toggleCol(c.status)}
                                        onSelect={(e) => e.preventDefault()}
                                    >
                                        {c.label}
                                    </DropdownMenuCheckboxItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                    <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => exportTasksXlsx([...activeTasks, ...closedTasks], tierNameById)}><Download className="h-3.5 w-3.5" /> Export</Button>
                    <Button size="sm" className="gap-1.5" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />New Task</Button>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks…" className="h-9 w-48 pl-8 text-sm" />
                </div>
                <Select value={filterPriority} onValueChange={setFilterPriority}>
                    <SelectTrigger className="h-9 w-32 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Any priority</SelectItem>
                        {['low', 'medium', 'high', 'critical'].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                </Select>
                {chipBtn('mine', 'My Tasks')}
                {chipBtn('overdue', 'Overdue')}
                {chipBtn('today', 'Due Today')}
                {chipBtn('carryover', 'Carryover')}
                {hierarchyTree.t4Tiers.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] uppercase tracking-wider text-slate-400">Groups:</span>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button type="button" className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                                    {selectedTierIds.size > 0 ? `${selectedTierIds.size} group${selectedTierIds.size === 1 ? '' : 's'} selected` : 'Any group'}
                                    <ChevronDown className="h-3 w-3" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="max-h-80 w-64 overflow-y-auto">
                                {hierarchyTree.t4Tiers.map((t4) => {
                                    const t3sHere = hierarchyTree.dmtsUnderT4(t4);
                                    const directJh = hierarchyTree.jhGroupsByT4Id[t4.id] || [];
                                    return (
                                        <div key={t4.id}>
                                            {hierarchyTree.t4Tiers.length > 1 && (
                                                <p className="px-2 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t4.display_name || tierLabel(t4)}</p>
                                            )}
                                            <DropdownMenuCheckboxItem checked={selectedTierIds.has(t4.id)} onCheckedChange={() => toggleTierId(t4.id)}>
                                                {t4.display_name || tierLabel(t4)}
                                            </DropdownMenuCheckboxItem>
                                            {t3sHere.map((node) => {
                                                const jhHere = hierarchyTree.jhGroupsByT3Key[node.nodeKey] || [];
                                                // A DMT with JH groups underneath becomes a hover flyout — its
                                                // own checkbox stays first inside the flyout (pick the whole
                                                // DMT), with its JH groups listed right below it, one hover
                                                // away, instead of a permanently-expanded flat list.
                                                if (jhHere.length === 0) {
                                                    return (
                                                        <DropdownMenuCheckboxItem key={node.nodeKey} checked={selectedTierIds.has(node.tier.id)} onCheckedChange={() => toggleTierId(node.tier.id)}>
                                                            {node.label}
                                                        </DropdownMenuCheckboxItem>
                                                    );
                                                }
                                                return (
                                                    <DropdownMenuSub key={node.nodeKey}>
                                                        <DropdownMenuSubTrigger className={cn(selectedTierIds.has(node.tier.id) && 'font-semibold text-blue-700')}>
                                                            {node.label}
                                                        </DropdownMenuSubTrigger>
                                                        <DropdownMenuPortal>
                                                            <DropdownMenuSubContent className="w-56">
                                                                <DropdownMenuCheckboxItem checked={selectedTierIds.has(node.tier.id)} onCheckedChange={() => toggleTierId(node.tier.id)}>
                                                                    Whole DMT — {node.label}
                                                                </DropdownMenuCheckboxItem>
                                                                <DropdownMenuSeparator />
                                                                {jhHere.map((t2) => {
                                                                    const t2Tier = hierarchyTree.t2ByJhGroupIdAll[t2.id];
                                                                    return (
                                                                        <DropdownMenuCheckboxItem key={t2.id} checked={selectedTierIds.has(t2Tier.id)} onCheckedChange={() => toggleTierId(t2Tier.id)}>
                                                                            {t2.name || t2.jh_group_name}
                                                                        </DropdownMenuCheckboxItem>
                                                                    );
                                                                })}
                                                            </DropdownMenuSubContent>
                                                        </DropdownMenuPortal>
                                                    </DropdownMenuSub>
                                                );
                                            })}
                                            {directJh.map((jg) => {
                                                const t2Tier = hierarchyTree.t2ByJhGroupIdAll[jg.id];
                                                return (
                                                    <DropdownMenuCheckboxItem key={jg.id} checked={selectedTierIds.has(t2Tier.id)} onCheckedChange={() => toggleTierId(t2Tier.id)}>
                                                        {jg.name || jg.jh_group_name} <span className="ml-1 text-[10px] text-slate-400">(direct)</span>
                                                    </DropdownMenuCheckboxItem>
                                                );
                                            })}
                                        </div>
                                    );
                                })}
                                {selectedTierIds.size > 0 && (
                                    <>
                                        <DropdownMenuSeparator />
                                        <button type="button" onClick={() => setSelectedTierIds(new Set())} className="w-full px-2 py-1.5 text-left text-xs text-slate-400 underline">
                                            Clear all
                                        </button>
                                    </>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                )}
            </div>

            {tasks.isLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
            ) : view === 'kanban' ? (
                <div className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2', COL_GRID[shownCols.length])}>
                    {shownCols.map((col) => {
                        const allInCol = kanbanTasks.filter((t) => (col.status === 'escalated'
                            ? isEscalatedActive(t)
                            : t.status === col.status && !isEscalatedActive(t)));
                        const isEsc = col.status === 'escalated';
                        const escCounts = isEsc
                            ? allInCol.reduce((m, t) => { const d = escalationFor(t)?.dir; m[d] = (m[d] || 0) + 1; return m; }, {})
                            : {};
                        const colTasks = isEsc && escFilter !== 'all' ? allInCol.filter((t) => escalationFor(t)?.dir === escFilter) : allInCol;
                        const pages = Math.max(1, Math.ceil(colTasks.length / COL_PAGE_SIZE));
                        const page = Math.min(colPage[col.status] || 0, pages - 1);
                        const goTo = (n) => setColPage((prev) => ({ ...prev, [col.status]: n }));
                        return (
                            <div key={col.status} className="space-y-2">
                                <div className="h-7">
                                    {isEsc && allInCol.length > 0 && (
                                        <select
                                            value={escFilter} onChange={(e) => setEscFilter(e.target.value)}
                                            aria-label="Filter escalated tasks"
                                            className={cn(
                                                'h-7 w-full rounded-md border border-l-4 border-slate-200 bg-white px-1.5 text-[11px] text-slate-700',
                                                { all: 'border-l-slate-300', incoming: 'border-l-amber-400', outgoing: 'border-l-sky-400', other: 'border-l-violet-400' }[escFilter],
                                            )}
                                        >
                                            <option value="all">All escalated ({allInCol.length})</option>
                                            <option value="incoming">Escalated to us ({escCounts.incoming || 0})</option>
                                            <option value="outgoing">Escalated to higher ({escCounts.outgoing || 0})</option>
                                            {escCounts.other ? <option value="other">Between other groups ({escCounts.other})</option> : null}
                                        </select>
                                    )}
                                </div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{col.label} ({colTasks.length})</p>
                                {colTasks.slice(page * COL_PAGE_SIZE, (page + 1) * COL_PAGE_SIZE).map(cardFor)}
                                {colTasks.length > COL_PAGE_SIZE && (
                                    <div className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-1 py-0.5 text-[11px] text-slate-500">
                                        <button type="button" aria-label={`Previous ${col.label} page`} disabled={page === 0} onClick={() => goTo(page - 1)}
                                            className="rounded p-1 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"><ChevronLeft className="h-3.5 w-3.5" /></button>
                                        <span>{page + 1} / {pages}</span>
                                        <button type="button" aria-label={`Next ${col.label} page`} disabled={page >= pages - 1} onClick={() => goTo(page + 1)}
                                            className="rounded p-1 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"><ChevronRight className="h-3.5 w-3.5" /></button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            ) : view === 'calendar' ? (
                <DmtTaskCalendar tasks={kanbanTasks} onTaskClick={setSelected} />
            ) : (
                <div className="space-y-3">
                    <div className="flex gap-1 rounded-md bg-slate-100 p-0.5 text-xs">
                        <button type="button" onClick={() => setListTab('active')} className={cn('rounded px-3 py-1.5 font-medium', listTab === 'active' ? 'bg-white shadow-xs' : 'text-slate-500')}>Active ({activeTasks.length})</button>
                        <button type="button" onClick={() => setListTab('recent')} className={cn('rounded px-3 py-1.5 font-medium', listTab === 'recent' ? 'bg-white shadow-xs' : 'text-slate-500')}>Recently Closed ({closedTasks.length})</button>
                    </div>
                    <div className="space-y-2">
                        {(listTab === 'active' ? activeTasks : closedTasks).length === 0 && <p className="py-8 text-center text-sm text-slate-500">No tasks.</p>}
                        {(listTab === 'active' ? activeTasks : closedTasks).map(cardFor)}
                    </div>
                </div>
            )}

            <CreateTaskModal
                open={showCreate}
                onOpenChange={setShowCreate}
                workers={workers.data || []}
                me={me}
            />
            {selectedFresh && (
                <TaskDetailDrawer
                    tierNameById={tierNameById}
                    meetingById={meetingById}
                    task={selectedFresh}
                    onClose={() => setSelected(null)}
                    workers={workers.data || []}
                    workerName={workerName}
                />
            )}
        </div>
    );
}
