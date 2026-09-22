import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, Loader2, Clock, Calendar as CalendarIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
} from '../../components/ui/dialog';
import { cn } from '../../lib/utils';
import { dmtApi } from '../lib/dmtApi';
import { useDmtMe } from '../lib/useDmt';
import { useDmtMeetings } from '../lib/useDmtMeetings';
import { useDmtWorkers } from '../lib/useDmtTasks';
import { useDmtTiers } from '../lib/useDmtTiers';
import { GroupFilter } from '../components/GroupFilter';
import { tierLabel } from '../lib/taskExtras';
import { fmtLong, fmtDow, addDaysStr } from '../lib/dmtDates';

const STATUS_CLS = {
    scheduled: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-amber-100 text-amber-700',
    completed: 'bg-emerald-100 text-emerald-700',
    cancelled: 'bg-slate-100 text-slate-500',
};

function addMinutes(time, minutes) {
    const [h, m] = time.split(':').map(Number);
    const total = h * 60 + m + minutes;
    return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// Recurrence is deliberately minimal (mirrors Audits' recurrence UI, which the owner already
// approved twice over a frequency-dropdown alternative): weekly-only, on whatever weekday the
// picked date falls on. "Never" is bounded to 26 occurrences (~6 months) so eager generation
// (see buildOccurrenceDates) can't run away — more can always be added later the same way.
const NEVER_ENDING_CAP = 26;
function buildOccurrenceDates(startDate, recur) {
    if (!recur.enabled) return [startDate];
    const dates = [startDate];
    if (recur.endType === 'after') {
        const n = Math.max(1, Number(recur.count) || 1);
        for (let i = 1; i < n; i++) dates.push(addDaysStr(startDate, 7 * i));
        return dates;
    }
    if (recur.endType === 'on' && recur.endDate) {
        for (let i = 1; i < NEVER_ENDING_CAP; i++) {
            const d = addDaysStr(startDate, 7 * i);
            if (d > recur.endDate) break;
            dates.push(d);
        }
        return dates;
    }
    for (let i = 1; i < NEVER_ENDING_CAP; i++) dates.push(addDaysStr(startDate, 7 * i));
    return dates;
}

export function CreateMeetingDialog({ open, onOpenChange, me, initialTierId }) {
    const { tierAtLeast } = useDmtMe();
    const isBeLead = tierAtLeast('be_lead');
    const [templateId, setTemplateId] = useState('custom');
    const [f, setF] = useState({ title: '', date: '', start: '09:00', end: '09:30', facilitator_id: me || '', location: '', tier_id: initialTierId || '' });
    const [recur, setRecur] = useState({ enabled: false, endType: 'never', endDate: '', count: 10 });
    const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

    const templates = useQuery({
        queryKey: ['dmt', 'meeting-templates', 'active'],
        queryFn: () => dmtApi.list('meeting-templates', { is_active: 'true' }),
        enabled: open && !initialTierId,
    });
    const workers = useDmtWorkers();
    const myTiers = useDmtTiers();
    // Only whoever is actually allowed to schedule for a group can pick it here — BE admin
    // sees every visible tier, everyone else only the tier(s) they lead.
    const creatableTiers = (myTiers.data || []).filter((t) => isBeLead || t.lead_emp_id === me);
    const tierById = Object.fromEntries((myTiers.data || []).map((t) => [t.id, t]));
    // Templates: only those belonging to a group this person can schedule for (BE admin also keeps group-less ones).
    const creatableIds = new Set(creatableTiers.map((t) => t.id));
    const usableTemplates = (templates.data || []).filter((t) => (t.tier_id ? creatableIds.has(t.tier_id) : isBeLead));

    useEffect(() => {
        if (initialTierId || templateId === 'custom' || !templates.data) return;
        const tpl = templates.data.find((t) => t.id === templateId);
        if (!tpl) return;
        const dstr = f.date ? fmtLong(f.date) : '';
        const start = tpl.default_start_time ? tpl.default_start_time.slice(0, 5) : f.start;
        setF((p) => ({
            ...p,
            title: `${tpl.name} — ${dstr}`,
            start,
            end: tpl.default_start_time ? addMinutes(start, tpl.default_duration_minutes || 30) : p.end,
            location: tpl.default_location || p.location,
            // A template's tier always wins — the whole point of picking it. A custom meeting
            // keeps whatever was picked manually below.
            tier_id: tpl.tier_id || p.tier_id,
        }));
    }, [templateId, templates.data]);

    // Facilitator defaults to the group's own Lead the moment a tier is set (by template,
    // manual pick, or the fixed initialTierId) — still editable afterward if someone else
    // should run the meeting.
    useEffect(() => {
        const t = tierById[f.tier_id];
        if (t) set('facilitator_id', t.lead_emp_id || me || '');
    }, [f.tier_id]);

    const submit = async () => {
        try {
            const factory = await dmtApi.myFactory();
            const factory_id = factory?.id;
            const dates = buildOccurrenceDates(f.date, recur);
            const series_id = dates.length > 1 ? crypto.randomUUID() : null;
            // The attendance list is the group's people, filled in by the server when a meeting is created —
            // template invitees are no longer copied onto meetings.
            for (const scheduled_date of dates) {
                await dmtApi.create('meetings', {
                    title: f.title,
                    scheduled_date,
                    scheduled_start_time: f.start,
                    scheduled_end_time: f.end,
                    facilitator_id: f.facilitator_id || me,
                    factory_id,
                    location: f.location || null,
                    tier_id: f.tier_id,
                    series_id,
                    created_by: me,
                });
            }
            toast.success(dates.length > 1 ? `${dates.length} meetings created` : 'Meeting created');
            onOpenChange(false);
            setF({ title: '', date: '', start: '09:00', end: '09:30', facilitator_id: me || '', location: '', tier_id: initialTierId || '' });
            setRecur({ enabled: false, endType: 'never', endDate: '', count: 10 });
        } catch (e) {
            toast.error(e.message);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>New Meeting</DialogTitle></DialogHeader>
                <div className="space-y-3">
                    {!initialTierId && (
                        <div>
                            <label className="text-sm font-medium text-slate-700">Template (optional)</label>
                            <Select value={templateId} onValueChange={setTemplateId}>
                                <SelectTrigger className="mt-1 h-11"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="custom">Custom (no template)</SelectItem>
                                    {usableTemplates.map((t) => (
                                        <SelectItem key={t.id} value={t.id}>
                                            {t.name}{t.tier_id ? ` — ${tierLabel(tierById[t.tier_id])}` : ''}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    <div>
                        <label className="text-sm font-medium text-slate-700">Group *</label>
                        {initialTierId ? (
                            <p className="mt-1 text-sm text-slate-500">{tierLabel(tierById[initialTierId])}</p>
                        ) : templateId !== 'custom' ? (
                            <p className="mt-1 text-sm text-slate-500">
                                {f.tier_id ? tierLabel(tierById[f.tier_id]) : 'No group on this template'} <span className="text-xs text-slate-400">(from template)</span>
                            </p>
                        ) : (
                            <Select value={f.tier_id} onValueChange={(v) => set('tier_id', v)}>
                                <SelectTrigger className="mt-1 h-11"><SelectValue placeholder="Select the group this meeting is for" /></SelectTrigger>
                                <SelectContent>
                                    {creatableTiers.map((t) => <SelectItem key={t.id} value={t.id}>{tierLabel(t)}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        )}
                        {!initialTierId && creatableTiers.length === 0 && (
                            <p className="mt-1 text-xs text-rose-600">You don't lead any group yet — only a group's Lead or a BE admin can schedule its meetings.</p>
                        )}
                    </div>
                    <Input placeholder="Title *" value={f.title} onChange={(e) => set('title', e.target.value)} className="h-11" />
                    <div>
                        <label className="text-sm font-medium text-slate-700">Date *</label>
                        <input type="date" value={f.date} onChange={(e) => set('date', e.target.value)} className="mt-1 block h-11 w-full rounded-md border border-slate-200 px-3 text-sm" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-sm font-medium text-slate-700">Start *</label>
                            <Input type="time" value={f.start} onChange={(e) => set('start', e.target.value)} className="mt-1 h-11" />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-slate-700">End *</label>
                            <Input type="time" value={f.end} onChange={(e) => set('end', e.target.value)} className="mt-1 h-11" />
                        </div>
                    </div>
                    <div>
                        <label className="text-sm font-medium text-slate-700">Facilitator</label>
                        <Select value={f.facilitator_id} onValueChange={(v) => set('facilitator_id', v)}>
                            <SelectTrigger className="mt-1 h-11"><SelectValue placeholder="Select facilitator" /></SelectTrigger>
                            <SelectContent>
                                {(workers.data || []).filter((w) => w.is_active).map((w) => <SelectItem key={w.id || w.emp_id} value={w.id || w.emp_id}>{w.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <p className="mt-1 text-xs text-slate-400">Defaults to the group's Lead — change it if someone else is running this one.</p>
                    </div>
                    <Input placeholder="Location (optional)" value={f.location} onChange={(e) => set('location', e.target.value)} className="h-11" />

                    <div className="space-y-2 rounded-lg border border-slate-200 p-3">
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                            <input
                                type="checkbox" checked={recur.enabled} disabled={!f.date}
                                onChange={(e) => setRecur((p) => ({ ...p, enabled: e.target.checked }))}
                                className="h-4 w-4 rounded border-slate-300"
                            />
                            {f.date ? `Repeat every ${fmtDow(f.date).slice(0, 3)}` : 'Repeat weekly (pick a date first)'}
                        </label>
                        {recur.enabled && (
                            <div className="flex flex-wrap items-center gap-2 pl-6 text-sm">
                                <span className="text-slate-500">Ends:</span>
                                <Select value={recur.endType} onValueChange={(v) => setRecur((p) => ({ ...p, endType: v }))}>
                                    <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="never">Never</SelectItem>
                                        <SelectItem value="on">On date</SelectItem>
                                        <SelectItem value="after">After N</SelectItem>
                                    </SelectContent>
                                </Select>
                                {recur.endType === 'on' && (
                                    <input type="date" min={f.date} value={recur.endDate}
                                        onChange={(e) => setRecur((p) => ({ ...p, endDate: e.target.value }))}
                                        className="h-9 rounded-md border border-slate-200 px-2" />
                                )}
                                {recur.endType === 'after' && (
                                    <>
                                        <Input type="number" min={1} max={NEVER_ENDING_CAP} value={recur.count}
                                            onChange={(e) => setRecur((p) => ({ ...p, count: e.target.value }))}
                                            className="h-9 w-20" />
                                        <span className="text-slate-500">occurrences</span>
                                    </>
                                )}
                                {recur.endType === 'never' && (
                                    <span className="text-xs text-slate-400">— schedules the next {NEVER_ENDING_CAP} weeks; add more later the same way.</span>
                                )}
                            </div>
                        )}
                    </div>

                    <Button onClick={submit} disabled={!f.title || !f.date || !f.tier_id} className="h-12 w-full">
                        {recur.enabled ? 'Create Meetings' : 'Create Meeting'}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export function DmtMeetings() {
    const navigate = useNavigate();
    const { user, tierAtLeast } = useDmtMe();
    const [statusFilter, setStatusFilter] = useState('all');
    const [showCreate, setShowCreate] = useState(false);
    const { meetings } = useDmtMeetings(statusFilter);
    const isBeLead = tierAtLeast('be_lead');
    const myTiers = useDmtTiers();
    const tierById = Object.fromEntries((myTiers.data || []).map((t) => [t.id, t]));
    // Pick meetings by group: any mix of T4 / DMT / JH groups (empty = every meeting you can see).
    const [groupIds, setGroupIds] = useState(() => new Set());
    const visibleMeetings = (meetings.rows || []).filter((m) => groupIds.size === 0 || (m.tier_id && groupIds.has(m.tier_id)));
    // Meeting creation is now group-scoped — only a BE admin, or someone who leads at least
    // one group, has anywhere to point a new meeting at.
    const canCreate = isBeLead || (myTiers.data || []).some((t) => t.lead_emp_id === user?.emp_id);

    return (
        <div className="mx-auto max-w-5xl space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-bold text-slate-900">Meetings</h1>
                {canCreate && (
                    <Button onClick={() => setShowCreate(true)} className="h-10 gap-1.5"><Plus className="h-4 w-4" /> New Meeting</Button>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-10 w-full sm:w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
            </Select>
                <GroupFilter selected={groupIds} onChange={setGroupIds} />
            </div>

            {meetings.isLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
            ) : !visibleMeetings.length ? (
                <p className="py-8 text-center text-sm text-slate-500">No meetings found.</p>
            ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b bg-slate-50 text-left text-sm text-slate-500">
                                <th className="p-3 font-medium">Date</th>
                                <th className="p-3 font-medium">Title</th>
                                <th className="p-3 font-medium">Tier</th>
                                <th className="p-3 font-medium">Time</th>
                                <th className="p-3 font-medium">Facilitator</th>
                                <th className="p-3 text-center font-medium">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleMeetings.map((m) => (
                                <tr key={m.id} className="cursor-pointer border-b last:border-0 hover:bg-slate-50" onClick={() => navigate(`/dmt/meetings/${m.id}`)}>
                                    <td className="p-3 text-sm">{fmtLong(m.scheduled_date)}</td>
                                    <td className="p-3 text-sm font-medium">{m.title}</td>
                                    <td className="p-3 text-sm text-slate-500">{m.tier_id ? tierLabel(tierById[m.tier_id]) : '—'}</td>
                                    <td className="p-3 text-sm text-slate-500">{m.scheduled_start_time?.slice(0, 5)} – {m.scheduled_end_time?.slice(0, 5)}</td>
                                    <td className="p-3 text-sm">{m.facilitator_name || '—'}</td>
                                    <td className="p-3 text-center"><Badge className={cn('text-[10px]', STATUS_CLS[m.status])}>{m.status.replace('_', ' ')}</Badge></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <CreateMeetingDialog open={showCreate} onOpenChange={setShowCreate} me={user?.emp_id} />
        </div>
    );
}
