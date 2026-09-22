import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Search } from 'lucide-react';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../../components/ui/table';
import { cn } from '../../lib/utils';
import { useDmtTasks } from '../lib/useDmtTasks';
import { useDmtTiers } from '../lib/useDmtTiers';
import { tierLabel } from '../lib/taskExtras';
import { todayStr, fmtShort } from '../lib/dmtDates';

const STATUS_CLS = {
    open: 'bg-blue-100 text-blue-700', in_progress: 'bg-amber-100 text-amber-700',
    blocked: 'bg-rose-100 text-rose-700', completed: 'bg-emerald-100 text-emerald-700',
    cancelled: 'bg-slate-100 text-slate-500',
};
const PRIORITY_CLS = {
    critical: 'bg-rose-600 text-white', high: 'bg-amber-500 text-white',
    medium: 'bg-blue-100 text-blue-700', low: 'bg-slate-100 text-slate-600',
};
const isOverdue = (t) => !['completed', 'cancelled'].includes(t.status) && t.due_date && t.due_date.slice(0, 10) < todayStr();

export function DmtAdminTaskOverview() {
    const navigate = useNavigate();
    const { tasks } = useDmtTasks();
    const tiers = useDmtTiers();
    const groupName = useMemo(() => Object.fromEntries((tiers.data || []).map((t) => [t.id, tierLabel(t)])), [tiers.data]);
    const [status, setStatus] = useState('all');
    const [group, setGroup] = useState('all');
    const [priority, setPriority] = useState('all');
    const [overdueOnly, setOverdueOnly] = useState(false);
    const [search, setSearch] = useState('');

    const rows = useMemo(() => {
        let r = tasks.rows;
        if (status !== 'all') r = r.filter((t) => t.status === status);
        if (group === 'none') r = r.filter((t) => !t.tier_id);
        else if (group !== 'all') r = r.filter((t) => t.tier_id === group);
        if (priority !== 'all') r = r.filter((t) => t.priority === priority);
        if (overdueOnly) r = r.filter(isOverdue);
        const q = search.trim().toLowerCase();
        if (q) r = r.filter((t) => `${t.title} #${t.task_number} ${t.owner_name} ${groupName[t.tier_id] || ''}`.toLowerCase().includes(q));
        return r.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    }, [tasks.rows, status, group, priority, overdueOnly, search, groupName]);

    const stats = useMemo(() => {
        const all = tasks.rows;
        const open = all.filter((t) => !['completed', 'cancelled'].includes(t.status));
        return {
            total: all.length,
            open: open.length,
            overdue: open.filter(isOverdue).length,
            completed: all.filter((t) => t.status === 'completed').length,
        };
    }, [tasks.rows]);

    return (
        <div className="mx-auto max-w-6xl space-y-4">
            <h1 className="text-xl font-bold text-slate-900">Task Overview</h1>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[['Total', stats.total], ['Open', stats.open], ['Overdue', stats.overdue], ['Completed', stats.completed]].map(([l, v]) => (
                    <div key={l} className="rounded-xl border border-slate-200 bg-white p-3">
                        <p className="text-xl font-bold text-slate-800">{v}</p>
                        <p className="text-xs text-slate-500">{l}</p>
                    </div>
                ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="h-9 w-48 pl-8 text-sm" />
                </div>
                <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="h-9 w-36 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Any status</SelectItem>
                        {['open', 'in_progress', 'blocked', 'completed', 'cancelled'].map((s) => <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Select value={group} onValueChange={setGroup}>
                    <SelectTrigger className="h-9 w-48 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All groups</SelectItem>
                        <SelectItem value="none">Not in any group</SelectItem>
                        {(tiers.data || []).map((t) => <SelectItem key={t.id} value={t.id}>{tierLabel(t)}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger className="h-9 w-32 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Any priority</SelectItem>
                        {['low', 'medium', 'high', 'critical'].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                </Select>
                <button type="button" onClick={() => setOverdueOnly((v) => !v)}
                    className={cn('rounded-full border px-3 py-1 text-xs font-medium', overdueOnly ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-600')}>
                    Overdue
                </button>
            </div>

            {tasks.isLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
            ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>#</TableHead>
                                <TableHead>Title</TableHead>
                                <TableHead>Group</TableHead>
                                <TableHead>Owner</TableHead>
                                <TableHead>Priority</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Due</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.map((t) => (
                                <TableRow key={t.id} className="cursor-pointer" onClick={() => navigate(`/dmt/tasks?open=${t.id}`)}>
                                    <TableCell className="text-slate-400">{t.task_number}</TableCell>
                                    <TableCell className="font-medium">{t.title}</TableCell>
                                    <TableCell className="text-slate-500">{groupName[t.tier_id] || 'Not in any group'}</TableCell>
                                    <TableCell className="text-slate-500">{t.owner_name}</TableCell>
                                    <TableCell><Badge className={cn('text-[10px]', PRIORITY_CLS[t.priority])}>{t.priority}</Badge></TableCell>
                                    <TableCell><Badge className={cn('text-[10px]', STATUS_CLS[t.status])}>{t.status.replace('_', ' ')}</Badge></TableCell>
                                    <TableCell className={cn('text-sm', isOverdue(t) && 'font-medium text-rose-600')}>{t.due_date ? fmtShort(t.due_date) : '—'}</TableCell>
                                </TableRow>
                            ))}
                            {rows.length === 0 && <TableRow><TableCell colSpan={7} className="py-8 text-center text-slate-400">No tasks match.</TableCell></TableRow>}
                        </TableBody>
                    </Table>
                </div>
            )}
        </div>
    );
}
