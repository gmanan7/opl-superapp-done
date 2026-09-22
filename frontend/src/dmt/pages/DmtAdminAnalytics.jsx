import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import {
    ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import { ChevronDown, Loader2, Download } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import { cn } from '../../lib/utils';
import { dmtApi } from '../lib/dmtApi';
import { useDmtTiers } from '../lib/useDmtTiers';
import { tierLabel } from '../lib/taskExtras';
import { useDmtWorkers } from '../lib/useDmtTasks';
import { todayStr, addDaysStr, fmtLong } from '../lib/dmtDates';

const ACT_CLS = { active: 'bg-emerald-100 text-emerald-700', idle: 'bg-amber-100 text-amber-700', inactive: 'bg-rose-100 text-rose-700', never: 'bg-slate-100 text-slate-500' };
function activityStatus(lastIso) {
    if (!lastIso) return 'never';
    const days = (Date.now() - new Date(lastIso).getTime()) / 86400000;
    if (days <= 7) return 'active';
    if (days <= 30) return 'idle';
    return 'inactive';
}

const PERIODS = [['30', 'Last 30 days'], ['7', 'Last 7 days'], ['90', 'Last 90 days']];

function Section({ title, children }) {
    const [open, setOpen] = useState(true);
    return (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-4 py-3 text-left">
                <ChevronDown className={cn('h-4 w-4 transition-transform', !open && '-rotate-90')} />
                <span className="text-sm font-semibold">{title}</span>
            </button>
            {open && <div className="border-t border-slate-100 p-4">{children}</div>}
        </div>
    );
}

function Tile({ label, value }) {
    return (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xl font-bold text-slate-800">{value}</p>
            <p className="text-xs text-slate-500">{label}</p>
        </div>
    );
}

export function DmtAdminAnalytics() {
    const [days, setDays] = useState('30');
    const from = useMemo(() => addDaysStr(todayStr(), -parseInt(days, 10)), [days]);

    const tiers = useDmtTiers();
    const workers = useDmtWorkers();
    const tasks = useQuery({ queryKey: ['dmt', 'an-tasks'], queryFn: () => dmtApi.list('tasks', { scope: 'all' }) });
    const taskUpdates = useQuery({ queryKey: ['dmt', 'an-task-updates'], queryFn: () => dmtApi.list('task-updates', { update_type: 'due_date_change' }) });
    const kpis = useQuery({ queryKey: ['dmt', 'an-kpis'], queryFn: () => dmtApi.list('kpi-master', { is_active: 'true' }) });
    const entries = useQuery({ queryKey: ['dmt', 'an-entries'], queryFn: () => dmtApi.list('kpi-entries') });
    const meetings = useQuery({ queryKey: ['dmt', 'an-meetings'], queryFn: () => dmtApi.list('meetings') });
    const invitees = useQuery({ queryKey: ['dmt', 'an-invitees'], queryFn: () => dmtApi.list('meeting-invitees') });
    const attendance = useQuery({ queryKey: ['dmt', 'an-attendance'], queryFn: () => dmtApi.list('meeting-attendance') });

    const groupName = Object.fromEntries((tiers.data || []).map((t) => [t.id, tierLabel(t)]));

    // ---- Tasks ----
    const taskStats = useMemo(() => {
        const all = tasks.data || [];
        const open = all.filter((t) => !['completed', 'cancelled'].includes(t.status));
        const overdue = open.filter((t) => t.due_date && t.due_date.slice(0, 10) < todayStr());
        const created = all.filter((t) => (t.created_at || '').slice(0, 10) >= from);
        const completed = all.filter((t) => t.status === 'completed' && (t.completed_at || '').slice(0, 10) >= from);
        const byGroup = {};
        for (const t of open) { const n = groupName[t.tier_id] || 'Not in any group'; byGroup[n] = (byGroup[n] || 0) + 1; }
        const byStatus = {};
        for (const t of all) byStatus[t.status] = (byStatus[t.status] || 0) + 1;
        return {
            openCount: open.length, overdueCount: overdue.length,
            createdCount: created.length, completedCount: completed.length,
            pushCount: (taskUpdates.data || []).length,
            groupChart: Object.entries(byGroup).map(([name, count]) => ({ name, count })),
            statusChart: Object.entries(byStatus).map(([name, count]) => ({ name: name.replace('_', ' '), count })),
        };
    }, [tasks.data, taskUpdates.data, from, groupName]);

    // ---- KPIs ----
    const kpiStats = useMemo(() => {
        const active = kpis.data || [];
        const inRange = (entries.data || []).filter((e) => e.reporting_date >= from);
        const today = todayStr();
        const yest = addDaysStr(today, -1);
        const kpisWithYesterday = new Set(inRange.filter((e) => e.reporting_date.slice(0, 10) === yest).map((e) => e.kpi_id));
        const compliance = active.length ? Math.round((kpisWithYesterday.size / active.length) * 100) : 0;
        const red = inRange.filter((e) => e.computed_status === 'red').length;
        const perDay = {};
        for (const e of inRange) { const d = e.reporting_date.slice(0, 10); perDay[d] = (perDay[d] || 0) + 1; }
        const dayChart = Object.entries(perDay).sort().map(([date, count]) => ({ date: date.slice(5), count }));
        return { activeCount: active.length, entriesCount: inRange.length, compliance, red, dayChart };
    }, [kpis.data, entries.data, from]);

    // ---- Meetings ----
    const meetingStats = useMemo(() => {
        const inRange = (meetings.data || []).filter((m) => m.scheduled_date >= from);
        let onTime = 0, withStart = 0;
        const attByMeeting = {};
        for (const a of attendance.data || []) (attByMeeting[a.meeting_id] = attByMeeting[a.meeting_id] || []).push(a);
        const invByMeeting = {};
        for (const i of invitees.data || []) invByMeeting[i.meeting_id] = (invByMeeting[i.meeting_id] || 0) + 1;
        let attSum = 0, attN = 0;
        for (const m of inRange) {
            if (m.actual_start) {
                withStart += 1;
                const delay = (new Date(m.actual_start) - new Date(`${m.scheduled_date}T${m.scheduled_start_time}`)) / 60000;
                if (delay <= 5) onTime += 1;
            }
            const inv = invByMeeting[m.id] || 0;
            if (inv) {
                const present = (attByMeeting[m.id] || []).filter((a) => a.status === 'present').length;
                attSum += (present / inv) * 100;
                attN += 1;
            }
        }
        return {
            held: inRange.length,
            onTimePct: withStart ? Math.round((onTime / withStart) * 100) : 0,
            avgAtt: attN ? Math.round(attSum / attN) : 0,
        };
    }, [meetings.data, attendance.data, invitees.data, from]);

    const kpiEntriesAll = useQuery({ queryKey: ['dmt', 'an-entries-all'], queryFn: () => dmtApi.list('kpi-entries') });
    const taskUpdatesAll = useQuery({ queryKey: ['dmt', 'an-task-updates-all'], queryFn: () => dmtApi.list('task-updates') });

    const people = useMemo(() => {
        const last = {};
        const bump = (emp, ts) => { if (emp && ts && (!last[emp] || ts > last[emp])) last[emp] = ts; };
        for (const e of kpiEntriesAll.data || []) bump(e.submitted_by, e.submitted_at);
        for (const t of tasks.data || []) { bump(t.owner_id, t.updated_at || t.created_at); bump(t.assigned_by, t.created_at); }
        for (const u of taskUpdatesAll.data || []) bump(u.updated_by, u.created_at);
        const kpiCount = {};
        for (const e of kpiEntriesAll.data || []) kpiCount[e.submitted_by] = (kpiCount[e.submitted_by] || 0) + 1;
        const taskCount = {};
        for (const t of tasks.data || []) taskCount[t.owner_id] = (taskCount[t.owner_id] || 0) + 1;
        return (workers.data || []).map((w) => {
            const id = w.id || w.emp_id;
            return { id, name: w.name, lastActive: last[id] || null, status: activityStatus(last[id]), kpiEntries: kpiCount[id] || 0, tasksOwned: taskCount[id] || 0 };
        }).sort((a, b) => (b.lastActive || '').localeCompare(a.lastActive || ''));
    }, [workers.data, kpiEntriesAll.data, tasks.data, taskUpdatesAll.data]);

    const peopleSummary = useMemo(() => {
        const c = { active: 0, idle: 0, inactive: 0, never: 0 };
        for (const p of people) c[p.status] += 1;
        return c;
    }, [people]);

    const loading = tasks.isLoading || kpis.isLoading || meetings.isLoading;

    const exportXlsx = () => {
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(people.map((p) => ({
            Name: p.name, Status: p.status, 'Last active': p.lastActive ? p.lastActive.slice(0, 10) : 'never',
            'KPI entries': p.kpiEntries, 'Tasks owned': p.tasksOwned,
        }))), 'People');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
            { Metric: 'Open tasks', Value: taskStats.openCount },
            { Metric: 'Overdue tasks', Value: taskStats.overdueCount },
            { Metric: `Tasks created (${days}d)`, Value: taskStats.createdCount },
            { Metric: `Tasks completed (${days}d)`, Value: taskStats.completedCount },
            { Metric: 'Active KPIs', Value: kpiStats.activeCount },
            { Metric: `KPI entries (${days}d)`, Value: kpiStats.entriesCount },
            { Metric: 'Yesterday compliance %', Value: kpiStats.compliance },
            { Metric: `Meetings held (${days}d)`, Value: meetingStats.held },
            { Metric: 'On-time start %', Value: meetingStats.onTimePct },
            { Metric: 'Avg attendance %', Value: meetingStats.avgAtt },
        ]), 'Summary');
        XLSX.writeFile(wb, `dmt-analytics-${todayStr()}.xlsx`);
    };

    return (
        <div className="mx-auto max-w-5xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h1 className="text-xl font-bold text-slate-900">Analytics</h1>
                <div className="flex items-center gap-2">
                    <Select value={days} onValueChange={setDays}>
                        <SelectTrigger className="h-9 w-40 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>{PERIODS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                    </Select>
                    <Button size="sm" variant="outline" className="h-9 gap-1" onClick={exportXlsx}><Download className="h-4 w-4" /> Export</Button>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
            ) : (
                <>
                    <Section title="People & Engagement">
                        <div className="grid grid-cols-4 gap-3">
                            <Tile label="Active (7d)" value={peopleSummary.active} />
                            <Tile label="Idle (7–30d)" value={peopleSummary.idle} />
                            <Tile label="Inactive (30d+)" value={peopleSummary.inactive} />
                            <Tile label="Never used" value={peopleSummary.never} />
                        </div>
                        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-slate-50 text-left text-xs text-slate-500">
                                        <th className="px-3 py-2 font-medium">Person</th>
                                        <th className="px-3 py-2 font-medium">Status</th>
                                        <th className="px-3 py-2 font-medium">Last active</th>
                                        <th className="px-3 py-2 font-medium">KPI entries</th>
                                        <th className="px-3 py-2 font-medium">Tasks owned</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {people.map((p) => (
                                        <tr key={p.id} className="border-b last:border-0">
                                            <td className="px-3 py-2 font-medium">{p.name}</td>
                                            <td className="px-3 py-2"><Badge className={cn('text-[10px]', ACT_CLS[p.status])}>{p.status}</Badge></td>
                                            <td className="px-3 py-2 text-slate-500">{p.lastActive ? fmtLong(p.lastActive) : '—'}</td>
                                            <td className="px-3 py-2">{p.kpiEntries}</td>
                                            <td className="px-3 py-2">{p.tasksOwned}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Section>

                    <Section title="Tasks">
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                            <Tile label="Open" value={taskStats.openCount} />
                            <Tile label="Overdue" value={taskStats.overdueCount} />
                            <Tile label={`Created (${days}d)`} value={taskStats.createdCount} />
                            <Tile label={`Completed (${days}d)`} value={taskStats.completedCount} />
                            <Tile label="Due-date pushes" value={taskStats.pushCount} />
                        </div>
                        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div>
                                <p className="mb-1 text-xs font-medium text-slate-500">Open tasks by group</p>
                                <div className="h-52">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={taskStats.groupChart}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                            <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                                            <YAxis tick={{ fontSize: 9 }} allowDecimals={false} />
                                            <Tooltip contentStyle={{ fontSize: 12 }} />
                                            <Bar dataKey="count" fill="#2563eb" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                            <div>
                                <p className="mb-1 text-xs font-medium text-slate-500">All tasks by status</p>
                                <div className="h-52">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={taskStats.statusChart}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                            <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                                            <YAxis tick={{ fontSize: 9 }} allowDecimals={false} />
                                            <Tooltip contentStyle={{ fontSize: 12 }} />
                                            <Bar dataKey="count" fill="#0ea5e9" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>
                    </Section>

                    <Section title="KPIs">
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <Tile label="Active KPIs" value={kpiStats.activeCount} />
                            <Tile label={`Entries (${days}d)`} value={kpiStats.entriesCount} />
                            <Tile label="Yesterday compliance" value={`${kpiStats.compliance}%`} />
                            <Tile label={`Red entries (${days}d)`} value={kpiStats.red} />
                        </div>
                        <div className="mt-4">
                            <p className="mb-1 text-xs font-medium text-slate-500">KPI entries per day</p>
                            <div className="h-52">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={kpiStats.dayChart}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                        <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                                        <YAxis tick={{ fontSize: 9 }} allowDecimals={false} />
                                        <Tooltip contentStyle={{ fontSize: 12 }} />
                                        <Line type="monotone" dataKey="count" stroke="#2563eb" strokeWidth={2} dot={{ r: 2 }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </Section>

                    <Section title="Meetings">
                        <div className="grid grid-cols-3 gap-3">
                            <Tile label={`Held (${days}d)`} value={meetingStats.held} />
                            <Tile label="On-time start %" value={`${meetingStats.onTimePct}%`} />
                            <Tile label="Avg attendance" value={`${meetingStats.avgAtt}%`} />
                        </div>
                    </Section>
                </>
            )}
        </div>
    );
}
