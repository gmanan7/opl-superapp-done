import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Clock, Users, AlertTriangle, FileWarning, Loader2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { cn } from '../../lib/utils';
import { dmtApi } from '../lib/dmtApi';
import { fmtShort } from '../lib/dmtDates';

const RANGES = [['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['this_month', 'This Month'], ['last_month', 'Last Month']];

function getRange(q) {
    const now = new Date();
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const y = now.getFullYear(), m = now.getMonth();
    if (q === '7d') { const s = new Date(now); s.setDate(s.getDate() - 7); return [iso(s), iso(now)]; }
    if (q === '30d') { const s = new Date(now); s.setDate(s.getDate() - 30); return [iso(s), iso(now)]; }
    if (q === 'this_month') return [iso(new Date(y, m, 1)), iso(now)];
    return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))];
}

const minutesBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 60000);

function Chip({ icon: Icon, label, value }) {
    return (
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <Icon className="h-5 w-5 text-slate-400" />
            <div>
                <p className="text-xl font-bold text-slate-800">{value}</p>
                <p className="text-xs text-slate-500">{label}</p>
            </div>
        </div>
    );
}

export function DmtCompliance() {
    const [range, setRange] = useState('30d');
    const [from, to] = useMemo(() => getRange(range), [range]);

    const meetings = useQuery({
        queryKey: ['dmt', 'compliance-meetings', from, to],
        queryFn: () => dmtApi.list('meetings'),
        select: (rows) => rows
            .filter((m) => m.scheduled_date >= from && m.scheduled_date <= to)
            .sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date)),
    });
    const invitees = useQuery({ queryKey: ['dmt', 'compliance-invitees'], queryFn: () => dmtApi.list('meeting-invitees') });
    const attendance = useQuery({ queryKey: ['dmt', 'compliance-attendance'], queryFn: () => dmtApi.list('meeting-attendance') });
    const redEntries = useQuery({
        queryKey: ['dmt', 'compliance-red', from, to],
        queryFn: () => dmtApi.list('kpi-entries', { computed_status: 'red' }),
        select: (rows) => rows.filter((e) => e.reporting_date >= from && e.reporting_date <= to),
    });
    const tasks = useQuery({ queryKey: ['dmt', 'compliance-tasks'], queryFn: () => dmtApi.list('tasks') });

    const linkedEntryIds = useMemo(
        () => new Set((tasks.data || []).map((t) => t.origin_kpi_entry_id).filter(Boolean)),
        [tasks.data],
    );

    const rows = useMemo(() => (meetings.data || []).map((m) => {
        const inv = (invitees.data || []).filter((i) => i.meeting_id === m.id);
        const att = (attendance.data || []).filter((a) => a.meeting_id === m.id);
        const present = att.filter((a) => a.status === 'present').length;
        const attPct = inv.length ? Math.round((present / inv.length) * 100) : null;
        let delay = null;
        if (m.actual_start) delay = minutesBetween(`${m.scheduled_date}T${m.scheduled_start_time}`, m.actual_start);
        let duration = null;
        if (m.actual_start && m.actual_end) duration = minutesBetween(m.actual_start, m.actual_end);
        const dayRed = (redEntries.data || []).filter((e) => e.reporting_date === m.scheduled_date);
        const unaddressed = dayRed.filter((e) => !linkedEntryIds.has(e.id)).length;
        return { m, delay, duration, attPct, unaddressed };
    }), [meetings.data, invitees.data, attendance.data, redEntries.data, linkedEntryIds]);

    const summary = useMemo(() => {
        const total = rows.length;
        const onTime = rows.filter((r) => r.delay !== null && r.delay <= 5).length;
        const withAtt = rows.filter((r) => r.attPct !== null);
        const avgAtt = withAtt.length ? Math.round(withAtt.reduce((a, r) => a + r.attPct, 0) / withAtt.length) : 0;
        const totalUn = rows.reduce((a, r) => a + r.unaddressed, 0);
        return { total, onTime, onTimePct: total ? Math.round((onTime / total) * 100) : 0, avgAtt, totalUn };
    }, [rows]);

    const loading = meetings.isLoading || invitees.isLoading || attendance.isLoading;

    return (
        <div className="mx-auto max-w-5xl space-y-5">
            <h1 className="text-xl font-bold text-slate-900">Meeting Compliance</h1>

            <div className="flex flex-wrap gap-2">
                {RANGES.map(([v, l]) => (
                    <Button key={v} size="sm" variant={range === v ? 'default' : 'outline'} onClick={() => setRange(v)}>{l}</Button>
                ))}
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Chip icon={CalendarDays} label="Meetings Held" value={summary.total} />
                <Chip icon={Clock} label="On-time Starts" value={`${summary.onTime} (${summary.onTimePct}%)`} />
                <Chip icon={Users} label="Avg Attendance" value={`${summary.avgAtt}%`} />
                <Chip icon={AlertTriangle} label="Red KPIs Unaddressed" value={summary.totalUn} />
            </div>

            {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
            ) : rows.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
                    <FileWarning className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                    <p className="text-sm text-slate-500">No meetings in this period.</p>
                </div>
            ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b bg-slate-50 text-left text-slate-500">
                                <th className="px-4 py-2 font-medium">Date</th>
                                <th className="px-4 py-2 font-medium">Meeting</th>
                                <th className="px-4 py-2 font-medium">Sched.</th>
                                <th className="px-4 py-2 text-right font-medium">Delay</th>
                                <th className="px-4 py-2 text-right font-medium">Duration</th>
                                <th className="px-4 py-2 text-right font-medium">Attendance</th>
                                <th className="px-4 py-2 text-right font-medium">Red w/o Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {rows.map((r) => (
                                <tr key={r.m.id} className="hover:bg-slate-50">
                                    <td className="px-4 py-2 text-slate-700">{fmtShort(r.m.scheduled_date)}</td>
                                    <td className="px-4 py-2 font-medium text-slate-700">{r.m.title}</td>
                                    <td className="px-4 py-2 text-slate-500">{r.m.scheduled_start_time?.slice(0, 5)}</td>
                                    <td className={cn('px-4 py-2 text-right', r.delay != null && r.delay > 15 ? 'font-medium text-rose-600' : r.delay != null && r.delay > 5 ? 'text-amber-600' : 'text-slate-600')}>
                                        {r.delay != null ? `${r.delay} min` : '—'}
                                    </td>
                                    <td className="px-4 py-2 text-right text-slate-600">{r.duration != null ? `${r.duration} min` : '—'}</td>
                                    <td className={cn('px-4 py-2 text-right', r.attPct != null && r.attPct < 60 ? 'text-rose-600' : r.attPct != null && r.attPct < 80 ? 'text-amber-600' : 'text-slate-600')}>
                                        {r.attPct != null ? `${r.attPct}%` : '—'}
                                    </td>
                                    <td className={cn('px-4 py-2 text-right', r.unaddressed > 0 ? 'font-medium text-rose-600' : 'text-slate-600')}>{r.unaddressed}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
