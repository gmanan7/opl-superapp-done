import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import {
    Plus, Loader2, Play, Pause, CheckCircle2, XCircle, Search, Calendar as CalendarIcon,
    Columns3, ListTodo, Lock, Users, Download, RotateCcw,
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
    Sheet, SheetContent, SheetHeader, SheetTitle,
} from '../../components/ui/sheet';
import { cn } from '../../lib/utils';
import { dmtApi } from '../lib/dmtApi';
import { useDmtMe } from '../lib/useDmt';
import { useDmtTasks, useTaskActivity, useTaskMutations } from '../lib/useDmtTasks';
import { todayStr, diffDays, fmtLong } from '../lib/dmtDates';
import {
    TASK_SORT_OPTIONS, sortTasks, buildPushCounts, isCarryover, truncateGroupName, taskVisibility,
} from '../lib/taskExtras';
import { DmtGroupsPanel } from '../components/DmtGroupsPanel';
import { DmtTaskCalendar } from '../components/DmtTaskCalendar';

const COLUMNS = [
    { status: 'open', label: 'Open' },
    { status: 'in_progress', label: 'In Progress' },
    { status: 'blocked', label: 'Blocked' },
    { status: 'completed', label: 'Completed' },
    { status: 'cancelled', label: 'Cancelled' },
];
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

function canAct(task, me, tierAtLeast) {
    return task.owner_id === me || task.assigned_by === me || task.created_by === me || tierAtLeast('module_lead');
}

function dueLabel(t) {
    if (!t.due_date) return null;
    const d = diffDays(t.due_date.slice(0, 10), todayStr());
    if (['completed', 'cancelled'].includes(t.status)) return null;
    if (d < 0) return { text: `${-d}d overdue`, cls: 'text-rose-600' };
    if (d === 0) return { text: 'Due today', cls: 'text-amber-600' };
    return { text: `Due ${fmtLong(t.due_date)}`, cls: 'text-slate-400' };
}

function TaskCard({ task, onClick, compact, groupMeta, carryover, pushes = 0 }) {
    const dl = dueLabel(task);
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'w-full rounded-lg border bg-white p-3 text-left shadow-xs transition-shadow hover:shadow-md',
                isOverdue(task) ? 'border-rose-200' : 'border-slate-200',
            )}
            style={groupMeta ? { borderLeft: `3px solid ${groupMeta.color}` } : undefined}
        >
            <div className="flex items-start justify-between gap-1">
                <div className="min-w-0 flex-1">
                    <span className="text-[10px] text-slate-400">#{task.task_number}</span>
                    <p className="flex items-center gap-1 truncate text-sm font-medium leading-tight">
                        {task.is_private && !groupMeta && <Lock size={12} className="shrink-0 text-slate-400" />}
                        <span className="truncate">{task.title}</span>
                    </p>
                    {groupMeta && (
                        <span className="mt-0.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                            style={{ color: groupMeta.color, border: `1px solid ${groupMeta.color}40`, backgroundColor: `${groupMeta.color}15` }}>
                            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: groupMeta.color }} />
                            {truncateGroupName(groupMeta.name)}
                        </span>
                    )}
                </div>
                <Badge className={cn('shrink-0 text-[10px]', PRIORITY_CLS[task.priority])}>{task.priority}</Badge>
            </div>
            {dl && <p className={cn('mt-1 flex items-center gap-1 text-[10px]', dl.cls)}><CalendarIcon className="h-3 w-3" />{dl.text}</p>}
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] text-slate-400">{task.owner_name}</span>
                {task.dept_name && <Badge variant="secondary" className="text-[10px]">{task.dept_name}</Badge>}
                {compact && <Badge className={cn('text-[10px]', STATUS_CLS[task.status])}>{task.status.replace('_', ' ')}</Badge>}
                {carryover && <span className="rounded-full border border-violet-300 px-1.5 text-[10px] text-violet-600">↩ Carryover</span>}
                {pushes >= 1 && <span className="rounded-full border border-violet-300 px-1.5 text-[10px] text-violet-600">↩ {pushes}×</span>}
            </div>
        </button>
    );
}

function ActivityFeed({ items, workerName, onComment, adding }) {
    const [text, setText] = useState('');
    const sorted = [...items].sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
    const describe = (u) => {
        if (u.update_type === 'comment') return u.update_note;
        if (u.update_type === 'status_change') return `Status → ${(u.new_status || '').replace('_', ' ')}${u.update_note ? ` — ${u.update_note}` : ''}`;
        if (u.update_type === 'due_date_change') return `Due date → ${u.new_due_date}${u.update_note ? ` (${u.update_note})` : ''}`;
        if (u.update_type === 'title_change') return `Renamed to "${u.new_text}"`;
        if (u.update_type === 'assignee_change') return `Owner changed`;
        if (u.update_type === 'description_change') return 'Description updated';
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
            <div className="flex gap-2">
                <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment…" className="h-9 text-sm"
                    onKeyDown={(e) => { if (e.key === 'Enter' && text.trim()) { onComment(text.trim()); setText(''); } }} />
                <Button size="sm" disabled={!text.trim() || adding} onClick={() => { onComment(text.trim()); setText(''); }}>Post</Button>
            </div>
        </div>
    );
}

function CreateTaskModal({ open, onOpenChange, departments, workers, me, myGroups }) {
    const { create } = useTaskMutations();
    const empty = { title: '', description: '', department_id: '', owner_id: '', priority: 'medium', due_date: '', visibility: 'everyone' };
    const [f, setF] = useState(empty);
    const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

    const submit = () => {
        const vis = taskVisibility(f.visibility);
        create.mutate(
            {
                title: f.title.trim(),
                description: f.description.trim() || null,
                department_id: f.department_id,
                owner_id: f.owner_id,
                assigned_by: me,
                created_by: me,
                priority: f.priority,
                due_date: f.due_date,
                origin_type: 'standalone',
                is_private: vis.is_private,
                task_group_id: vis.task_group_id,
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
                    <Input placeholder="Title *" value={f.title} onChange={(e) => set('title', e.target.value)} className="h-11" />
                    <Textarea placeholder="Description" value={f.description} onChange={(e) => set('description', e.target.value)} rows={2} />
                    <Select value={f.department_id} onValueChange={(v) => set('department_id', v)}>
                        <SelectTrigger className="h-11"><SelectValue placeholder="Department *" /></SelectTrigger>
                        <SelectContent>{departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={f.owner_id} onValueChange={(v) => set('owner_id', v)}>
                        <SelectTrigger className="h-11"><SelectValue placeholder="Owner *" /></SelectTrigger>
                        <SelectContent>
                            {workers.map((w) => <SelectItem key={w.id || w.emp_id} value={w.id || w.emp_id}>{w.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
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
                    <Select value={f.visibility} onValueChange={(v) => set('visibility', v)}>
                        <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="everyone">Visible to everyone</SelectItem>
                            <SelectItem value="private">Private (you + owner + admins)</SelectItem>
                            {(myGroups || []).map((g) => <SelectItem key={g.id} value={g.id}>Group: {g.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button disabled={!f.title.trim() || !f.department_id || !f.owner_id || !f.due_date || create.isPending} onClick={submit}>
                        {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function TaskDetailDrawer({ task, onClose, departments, workers, workerName }) {
    const { user, tierAtLeast } = useDmtMe();
    const me = user?.emp_id;
    const activity = useTaskActivity(task.id);
    const { setStatus, setDueDate, setFields, comment } = useTaskMutations();
    const act = canAct(task, me, tierAtLeast);
    const terminal = ['completed', 'cancelled'].includes(task.status);

    const [editMode, setEditMode] = useState(false);
    const [edit, setEdit] = useState({});
    const [showDue, setShowDue] = useState(false);
    const [due, setDue] = useState({ date: '', reason: '' });
    const [closing, setClosing] = useState(null); // 'completed' | 'cancelled'
    const [resolution, setResolution] = useState('');

    const enterEdit = () => {
        setEdit({
            title: task.title, description: task.description || '',
            department_id: task.department_id, owner_id: task.owner_id, priority: task.priority,
        });
        setEditMode(true);
    };

    const saveEdit = () => {
        setFields.mutate(
            { id: task.id, fields: edit },
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
                        <Select value={edit.department_id} onValueChange={(v) => setEdit({ ...edit, department_id: v })}>
                            <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                            <SelectContent>{departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                        </Select>
                        <Select value={edit.owner_id} onValueChange={(v) => setEdit({ ...edit, owner_id: v })}>
                            <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                            <SelectContent>{workers.map((w) => <SelectItem key={w.id || w.emp_id} value={w.id || w.emp_id}>{w.name}</SelectItem>)}</SelectContent>
                        </Select>
                        <Select value={edit.priority} onValueChange={(v) => setEdit({ ...edit, priority: v })}>
                            <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                            <SelectContent>{['low', 'medium', 'high', 'critical'].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                        </Select>
                        <div className="flex gap-2">
                            <Button className="h-11 flex-1" disabled={!edit.title || setFields.isPending} onClick={saveEdit}>Save</Button>
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
                            <div><span className="text-xs text-slate-400">Department</span><p>{task.dept_name || '—'}</p></div>
                            <div><span className="text-xs text-slate-400">Owner</span><p>{task.owner_name}</p></div>
                            <div><span className="text-xs text-slate-400">Assigned by</span><p>{task.assigned_by_name}</p></div>
                            <div>
                                <span className="text-xs text-slate-400">Due Date</span>
                                <p className={cn(isOverdue(task) && 'font-medium text-rose-600')}>{task.due_date ? fmtLong(task.due_date) : '—'}</p>
                            </div>
                        </div>

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
                                        <Button size="sm" variant="outline" className="h-9 gap-1" onClick={() => changeStatus('blocked')}><Pause className="h-3.5 w-3.5" />Block</Button>
                                    )}
                                    <Button size="sm" className="h-9 gap-1 bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => { setClosing('completed'); setResolution(''); }}>
                                        <CheckCircle2 className="h-3.5 w-3.5" />Complete
                                    </Button>
                                    <Button size="sm" variant="outline" className="h-9 gap-1" onClick={() => { setClosing('cancelled'); setResolution(''); }}>
                                        <XCircle className="h-3.5 w-3.5" />Cancel
                                    </Button>
                                </div>
                            </div>
                        )}

                        {terminal && task.resolution_note && (
                            <div><span className="text-xs text-slate-400">Resolution</span><p className="mt-0.5 text-sm">{task.resolution_note}</p></div>
                        )}

                        <ActivityFeed
                            items={activity.data || []}
                            workerName={workerName}
                            adding={comment.isPending}
                            onComment={(text) => comment.mutate({ id: task.id, text })}
                        />
                    </div>
                )}

                <Dialog open={!!closing} onOpenChange={(v) => !v && setClosing(null)}>
                    <DialogContent className="max-w-md">
                        <DialogHeader><DialogTitle>{closing === 'completed' ? 'Complete Task' : 'Cancel Task'}</DialogTitle></DialogHeader>
                        <Textarea value={resolution} onChange={(e) => setResolution(e.target.value)} rows={3}
                            placeholder="What was done / why cancelled? (required)" />
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setClosing(null)}>Back</Button>
                            <Button disabled={!resolution.trim()} onClick={() => { changeStatus(closing, resolution.trim()); setClosing(null); }}
                                className={closing === 'completed' ? 'bg-emerald-600 text-white hover:bg-emerald-700' : ''}>
                                {closing === 'completed' ? 'Complete' : 'Cancel Task'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </SheetContent>
        </Sheet>
    );
}

function exportTasksXlsx(rows, groupNameById) {
    const data = rows.map((t) => ({
        '#': t.task_number,
        Title: t.title,
        Department: t.dept_name || '',
        Owner: t.owner_name || '',
        'Assigned by': t.assigned_by_name || '',
        Priority: t.priority,
        Status: t.status,
        'Due date': t.due_date ? t.due_date.slice(0, 10) : '',
        Group: t.task_group_id ? (groupNameById[t.task_group_id] || '') : '',
        Private: t.is_private ? 'Yes' : '',
        Resolution: t.resolution_note || '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tasks');
    XLSX.writeFile(wb, `dmt-tasks-${todayStr()}.xlsx`);
}

export function DmtTaskBoard() {
    const { user } = useDmtMe();
    const me = user?.emp_id;
    const [view, setView] = useState('kanban');
    const [filterDept, setFilterDept] = useState('all');
    const [filterPriority, setFilterPriority] = useState('all');
    const [chip, setChip] = useState({ mine: false, overdue: false, today: false, carryover: false });
    const [search, setSearch] = useState('');
    const [sortKey, setSortKey] = useState('created_desc');
    const [groupFilter, setGroupFilter] = useState(null);
    const [listTab, setListTab] = useState('active');
    const [showCreate, setShowCreate] = useState(false);
    const [showGroups, setShowGroups] = useState(false);
    const [selected, setSelected] = useState(null);

    const { tasks, departments, workers, workerName } = useDmtTasks({ department: filterDept, priority: filterPriority });
    const myGroups = useQuery({ queryKey: ['dmt', 'my-task-groups'], queryFn: () => dmtApi.fetch('/my-task-groups') });
    const dueChanges = useQuery({ queryKey: ['dmt', 'task-due-changes'], queryFn: () => dmtApi.list('task-updates', { update_type: 'due_date_change' }) });

    const groupMetaById = useMemo(
        () => Object.fromEntries((myGroups.data || []).map((g) => [g.id, { name: g.name, color: g.color }])),
        [myGroups.data],
    );
    const groupNameById = Object.fromEntries((myGroups.data || []).map((g) => [g.id, g.name]));
    const historyIds = useMemo(() => new Set((dueChanges.data || []).map((r) => r.task_id)), [dueChanges.data]);
    const pushCounts = useMemo(() => buildPushCounts(dueChanges.data || []), [dueChanges.data]);

    const applyFilters = (list) => {
        let r = list;
        if (chip.mine && me) r = r.filter((t) => t.owner_id === me);
        if (chip.overdue) r = r.filter(isOverdue);
        if (chip.today) r = r.filter(isDueToday);
        if (chip.carryover) r = r.filter((t) => isCarryover(t, historyIds));
        if (groupFilter) r = r.filter((t) => t.task_group_id === groupFilter);
        const q = search.trim().toLowerCase();
        if (q) r = r.filter((t) => `${t.title} ${t.description || ''} #${t.task_number} ${t.owner_name} ${groupNameById[t.task_group_id] || ''}`.toLowerCase().includes(q));
        return sortTasks(r, sortKey);
    };

    const activeTasks = useMemo(() => applyFilters(tasks.rows.filter((t) => !['completed', 'cancelled'].includes(t.status))), [tasks.rows, chip, search, sortKey, groupFilter, historyIds, me]);
    const closedTasks = useMemo(() => {
        const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 14);
        const c = cutoff.toISOString().slice(0, 10);
        return applyFilters(tasks.rows.filter((t) => ['completed', 'cancelled'].includes(t.status) && (t.completed_at || '').slice(0, 10) >= c));
    }, [tasks.rows, chip, search, sortKey, groupFilter, historyIds, me]);
    const kanbanTasks = useMemo(() => applyFilters(tasks.rows), [tasks.rows, chip, search, sortKey, groupFilter, historyIds, me]);

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

    const cardFor = (t) => (
        <TaskCard key={t.id} task={t} onClick={() => setSelected(t)}
            groupMeta={t.task_group_id ? groupMetaById[t.task_group_id] : undefined}
            carryover={isCarryover(t, historyIds)}
            pushes={pushCounts.get(t.id) || 0}
            compact={view !== 'kanban'} />
    );

    return (
        <div className="mx-auto max-w-6xl space-y-4">
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
                    <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => setShowGroups(true)}><Users className="h-3.5 w-3.5" /> Groups</Button>
                    <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => exportTasksXlsx([...activeTasks, ...closedTasks], groupNameById)}><Download className="h-3.5 w-3.5" /> Export</Button>
                    <Button size="sm" className="gap-1.5" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />New Task</Button>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks…" className="h-9 w-48 pl-8 text-sm" />
                </div>
                <Select value={filterDept} onValueChange={setFilterDept}>
                    <SelectTrigger className="h-9 w-40 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Departments</SelectItem>
                        {(departments.data || []).map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                    </SelectContent>
                </Select>
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
            </div>

            {(myGroups.data || []).length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-slate-400">Groups:</span>
                    {(myGroups.data || []).map((g) => (
                        <button key={g.id} type="button" onClick={() => setGroupFilter(groupFilter === g.id ? null : g.id)}
                            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium"
                            style={groupFilter === g.id ? { backgroundColor: g.color, borderColor: g.color, color: '#fff' } : { color: g.color, borderColor: g.color }}>
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: groupFilter === g.id ? '#fff' : g.color }} />
                            {truncateGroupName(g.name, 16)}
                        </button>
                    ))}
                    {groupFilter && <button type="button" onClick={() => setGroupFilter(null)} className="text-[10px] text-slate-400 underline">clear</button>}
                </div>
            )}

            {tasks.isLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
            ) : view === 'kanban' ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    {COLUMNS.map((col) => {
                        const colTasks = kanbanTasks.filter((t) => t.status === col.status);
                        return (
                            <div key={col.status} className="space-y-2">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{col.label} ({colTasks.length})</p>
                                {colTasks.map(cardFor)}
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
                departments={departments.data || []}
                workers={workers.data || []}
                me={me}
                myGroups={myGroups.data || []}
            />
            <DmtGroupsPanel open={showGroups} onOpenChange={setShowGroups} />
            {selectedFresh && (
                <TaskDetailDrawer
                    task={selectedFresh}
                    onClose={() => setSelected(null)}
                    departments={departments.data || []}
                    workers={workers.data || []}
                    workerName={workerName}
                />
            )}
        </div>
    );
}
