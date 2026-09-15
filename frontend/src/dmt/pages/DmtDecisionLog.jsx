import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronDown, ClipboardList, Loader2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import { cn } from '../../lib/utils';
import { dmtApi } from '../lib/dmtApi';
import { useDmtWorkers } from '../lib/useDmtTasks';
import { useDmtDepartments } from '../lib/useDmtKpi';
import { todayStr, fmtLong, fmtShort } from '../lib/dmtDates';

const TASK_STATUS_CLS = {
    open: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-amber-100 text-amber-700',
    blocked: 'bg-rose-100 text-rose-700',
    completed: 'bg-emerald-100 text-emerald-700',
    cancelled: 'bg-slate-100 text-slate-500',
};

const RANGES = [['7d', '7 days'], ['30d', '30 days'], ['90d', '90 days'], ['this_year', 'This year']];
function rangeFrom(q) {
    const now = new Date();
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (q === '7d') { const s = new Date(now); s.setDate(s.getDate() - 7); return iso(s); }
    if (q === '30d') { const s = new Date(now); s.setDate(s.getDate() - 30); return iso(s); }
    if (q === '90d') { const s = new Date(now); s.setDate(s.getDate() - 90); return iso(s); }
    return `${now.getFullYear()}-01-01`;
}

const isTaskOverdue = (t) => t && !['completed', 'cancelled'].includes(t.status) && t.due_date && t.due_date.slice(0, 10) < todayStr();

export function DmtDecisionLog() {
    const navigate = useNavigate();
    const [range, setRange] = useState('30d');
    const [taskFilter, setTaskFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [collapsed, setCollapsed] = useState({});
    const from = useMemo(() => rangeFrom(range), [range]);

    const decisions = useQuery({ queryKey: ['dmt', 'decisions-all'], queryFn: () => dmtApi.list('meeting-decisions') });
    const meetings = useQuery({ queryKey: ['dmt', 'decisions-meetings'], queryFn: () => dmtApi.list('meetings') });
    const tasks = useQuery({ queryKey: ['dmt', 'decisions-tasks'], queryFn: () => dmtApi.list('tasks') });
    const points = useQuery({ queryKey: ['dmt', 'decisions-points'], queryFn: () => dmtApi.list('meeting-discussion-points') });
    const workers = useDmtWorkers();
    const departments = useDmtDepartments();

    const meetingById = Object.fromEntries((meetings.data || []).map((m) => [m.id, m]));
    const taskById = Object.fromEntries((tasks.data || []).map((t) => [t.id, t]));
    const pointById = Object.fromEntries((points.data || []).map((p) => [p.id, p]));
    const nameById = Object.fromEntries((workers.data || []).map((w) => [w.id || w.emp_id, w.name]));
    const deptById = Object.fromEntries((departments.data || []).map((d) => [d.id, d.name]));

    const rows = useMemo(() => (decisions.data || [])
        .map((d) => {
            const meeting = meetingById[d.meeting_id];
            const task = d.linked_task_id ? taskById[d.linked_task_id] : null;
            return { ...d, meeting, task };
        })
        .filter((d) => d.meeting && d.meeting.scheduled_date >= from)
        .filter((d) => {
            if (taskFilter === 'has_task') return !!d.linked_task_id;
            if (taskFilter === 'no_task') return !d.linked_task_id;
            if (taskFilter === 'overdue') return isTaskOverdue(d.task);
            if (taskFilter === 'completed') return d.task?.status === 'completed';
            return true;
        })
        .filter((d) => !search.trim() || d.decision_text.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')),
    [decisions.data, meetingById, taskById, from, taskFilter, search]);

    const grouped = useMemo(() => {
        const map = new Map();
        for (const d of rows) {
            if (!map.has(d.meeting.id)) map.set(d.meeting.id, { meeting: d.meeting, decisions: [] });
            map.get(d.meeting.id).decisions.push(d);
        }
        return [...map.values()].sort((a, b) => b.meeting.scheduled_date.localeCompare(a.meeting.scheduled_date));
    }, [rows]);

    const stats = useMemo(() => {
        const withTask = rows.filter((d) => d.linked_task_id).length;
        const overdue = rows.filter((d) => isTaskOverdue(d.task)).length;
        return { total: rows.length, withTask, withoutTask: rows.length - withTask, overdue };
    }, [rows]);

    const loading = decisions.isLoading || meetings.isLoading;

    return (
        <div className="mx-auto max-w-5xl space-y-4">
            <h1 className="text-xl font-bold text-slate-900">Decision Log</h1>

            <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search decisions…" className="h-9 w-56 pl-8 text-sm" />
                </div>
                <Select value={range} onValueChange={setRange}>
                    <SelectTrigger className="h-9 w-32 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>{RANGES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={taskFilter} onValueChange={setTaskFilter}>
                    <SelectTrigger className="h-9 w-40 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All decisions</SelectItem>
                        <SelectItem value="has_task">With a task</SelectItem>
                        <SelectItem value="no_task">No task</SelectItem>
                        <SelectItem value="overdue">Task overdue</SelectItem>
                        <SelectItem value="completed">Task completed</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[['Total', stats.total], ['With task', stats.withTask], ['No task', stats.withoutTask], ['Overdue', stats.overdue]].map(([l, v]) => (
                    <div key={l} className="rounded-xl border border-slate-200 bg-white p-3">
                        <p className="text-xl font-bold text-slate-800">{v}</p>
                        <p className="text-xs text-slate-500">{l}</p>
                    </div>
                ))}
            </div>

            {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
            ) : grouped.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
                    <ClipboardList className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                    <p className="text-sm text-slate-500">No decisions match.</p>
                </div>
            ) : (
                grouped.map(({ meeting, decisions: mDecisions }) => {
                    const isCollapsed = collapsed[meeting.id] ?? false;
                    return (
                        <div key={meeting.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                            <button type="button" className="flex w-full items-center justify-between px-4 py-2.5" onClick={() => setCollapsed({ ...collapsed, [meeting.id]: !isCollapsed })}>
                                <div className="flex items-center gap-2 text-sm">
                                    <ChevronDown className={cn('h-4 w-4 transition-transform', isCollapsed && '-rotate-90')} />
                                    <span className="font-semibold">{meeting.title}</span>
                                    <span className="text-slate-400">{fmtShort(meeting.scheduled_date)} · {mDecisions.length} decision{mDecisions.length !== 1 ? 's' : ''}</span>
                                </div>
                                <button type="button" onClick={(e) => { e.stopPropagation(); navigate(`/dmt/meetings/${meeting.id}`); }} className="text-xs text-blue-600">Open</button>
                            </button>
                            {!isCollapsed && (
                                <div className="divide-y divide-slate-100 border-t border-slate-100">
                                    {mDecisions.map((d) => (
                                        <div key={d.id} className="px-4 py-3">
                                            <p className="text-sm">{d.decision_text}</p>
                                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                                                {d.discussion_point_id && pointById[d.discussion_point_id] && <span>on: {pointById[d.discussion_point_id].title}</span>}
                                                <span>by {nameById[d.created_by] || d.created_by}</span>
                                                <span>· {fmtLong(d.created_at)}</span>
                                            </div>
                                            {d.task && (
                                                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-slate-50 p-2 text-xs">
                                                    <Badge className={cn('text-[10px]', TASK_STATUS_CLS[d.task.status])}>{d.task.status.replace('_', ' ')}</Badge>
                                                    <span className="font-medium">#{d.task.task_number} {d.task.title}</span>
                                                    <span className="text-slate-400">
                                                        {nameById[d.task.owner_id] || d.task.owner_id}
                                                        {deptById[d.task.department_id] ? ` · ${deptById[d.task.department_id]}` : ''}
                                                        {d.task.due_date ? ` · due ${fmtShort(d.task.due_date)}` : ''}
                                                    </span>
                                                    {isTaskOverdue(d.task) && <span className="font-medium text-rose-600">overdue</span>}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })
            )}
        </div>
    );
}
