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
import { fmtLong } from '../lib/dmtDates';

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

function CreateMeetingDialog({ open, onOpenChange, me }) {
    const [templateId, setTemplateId] = useState('custom');
    const [f, setF] = useState({ title: '', date: '', start: '09:00', end: '09:30', facilitator_id: me || '', location: '' });
    const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

    const templates = useQuery({
        queryKey: ['dmt', 'meeting-templates', 'active'],
        queryFn: () => dmtApi.list('meeting-templates', { is_active: 'true' }),
        enabled: open,
    });
    const workers = useDmtWorkers();

    useEffect(() => {
        if (templateId === 'custom' || !templates.data) return;
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
        }));
    }, [templateId, templates.data]);

    const submit = async () => {
        try {
            const factory = await dmtApi.myFactory();
            const factory_id = factory?.id;
            const meeting = await dmtApi.create('meetings', {
                title: f.title,
                scheduled_date: f.date,
                scheduled_start_time: f.start,
                scheduled_end_time: f.end,
                facilitator_id: f.facilitator_id || me,
                factory_id,
                location: f.location || null,
                created_by: me,
            });
            if (templateId !== 'custom') {
                const tplInv = await dmtApi.list('meeting-template-invitees', { template_id: templateId });
                for (const inv of tplInv) {
                    await dmtApi.create('meeting-invitees', {
                        meeting_id: meeting.id, user_id: inv.user_id, is_mandatory: inv.is_mandatory,
                    });
                }
            }
            toast.success('Meeting created');
            onOpenChange(false);
            setF({ title: '', date: '', start: '09:00', end: '09:30', facilitator_id: me || '', location: '' });
        } catch (e) {
            toast.error(e.message);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>New Meeting</DialogTitle></DialogHeader>
                <div className="space-y-3">
                    <div>
                        <label className="text-sm font-medium text-slate-700">Template (optional)</label>
                        <Select value={templateId} onValueChange={setTemplateId}>
                            <SelectTrigger className="mt-1 h-11"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="custom">Custom (no template)</SelectItem>
                                {(templates.data || []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <Input placeholder='Title * — e.g. "T4 Daily Review"' value={f.title} onChange={(e) => set('title', e.target.value)} className="h-11" />
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
                                {(workers.data || [])
                                    .filter((w) => ['leadership', 'be_lead', 'it_lead', 'admin', 'module_lead'].includes(String(w.role || '').toLowerCase()))
                                    .map((w) => <SelectItem key={w.id || w.emp_id} value={w.id || w.emp_id}>{w.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <Input placeholder="Location (optional)" value={f.location} onChange={(e) => set('location', e.target.value)} className="h-11" />
                    <Button onClick={submit} disabled={!f.title || !f.date} className="h-12 w-full">Create Meeting</Button>
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
    const canCreate = tierAtLeast('module_lead');

    return (
        <div className="mx-auto max-w-5xl space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-bold text-slate-900">Meetings</h1>
                {canCreate && (
                    <Button onClick={() => setShowCreate(true)} className="h-10 gap-1.5"><Plus className="h-4 w-4" /> New Meeting</Button>
                )}
            </div>

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

            {meetings.isLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
            ) : !meetings.rows.length ? (
                <p className="py-8 text-center text-sm text-slate-500">No meetings found.</p>
            ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b bg-slate-50 text-left text-sm text-slate-500">
                                <th className="p-3 font-medium">Date</th>
                                <th className="p-3 font-medium">Title</th>
                                <th className="p-3 font-medium">Time</th>
                                <th className="p-3 font-medium">Facilitator</th>
                                <th className="p-3 text-center font-medium">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {meetings.rows.map((m) => (
                                <tr key={m.id} className="cursor-pointer border-b last:border-0 hover:bg-slate-50" onClick={() => navigate(`/dmt/meetings/${m.id}`)}>
                                    <td className="p-3 text-sm">{fmtLong(m.scheduled_date)}</td>
                                    <td className="p-3 text-sm font-medium">{m.title}</td>
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
