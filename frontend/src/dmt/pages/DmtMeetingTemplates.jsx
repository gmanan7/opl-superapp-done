import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, Pencil, Users, Trash2, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Badge } from '../../components/ui/badge';
import { Switch } from '../../components/ui/switch';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../../components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../../components/ui/sheet';
import { dmtApi } from '../lib/dmtApi';
import { useDmtMe } from '../lib/useDmt';
import { useDmtWorkers } from '../lib/useDmtTasks';

function TemplateForm({ open, onOpenChange, template, me, onSaved }) {
    const qc = useQueryClient();
    const [f, setF] = useState({ name: '', description: '', duration: 30, start: '09:00', location: '' });
    useEffect(() => {
        if (template) setF({
            name: template.name, description: template.description || '',
            duration: template.default_duration_minutes, start: template.default_start_time?.slice(0, 5) || '09:00',
            location: template.default_location || '',
        });
        else setF({ name: '', description: '', duration: 30, start: '09:00', location: '' });
    }, [template, open]);

    const save = useMutation({
        mutationFn: async () => {
            const payload = {
                name: f.name, description: f.description || null,
                default_duration_minutes: Number(f.duration),
                default_start_time: f.start || null, default_location: f.location || null,
            };
            if (template) { await dmtApi.update('meeting-templates', template.id, payload); return template.id; }
            const factory = await dmtApi.myFactory();
            const row = await dmtApi.create('meeting-templates', { ...payload, factory_id: factory?.id, created_by: me });
            return row.id;
        },
        onSuccess: (id) => {
            toast.success(template ? 'Template updated' : 'Template created');
            qc.invalidateQueries({ queryKey: ['dmt', 'meeting-templates'] });
            onSaved(id);
        },
        onError: (e) => toast.error(e.message),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader><DialogTitle>{template ? 'Edit Template' : 'New Template'}</DialogTitle></DialogHeader>
                <div className="space-y-4">
                    <Input placeholder='Template name * — e.g. "T4 Daily Review"' value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="h-11" />
                    <Textarea placeholder="Description (optional)" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={2} />
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-sm font-medium text-slate-700">Duration (min)</label>
                            <Input type="number" min={5} value={f.duration} onChange={(e) => setF({ ...f, duration: e.target.value })} className="mt-1 h-11" />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-slate-700">Default start</label>
                            <Input type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} className="mt-1 h-11" />
                        </div>
                    </div>
                    <Input placeholder="Default location (optional)" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} className="h-11" />
                </div>
                <DialogFooter>
                    <Button disabled={!f.name.trim() || save.isPending} onClick={() => save.mutate()}>
                        {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {template ? 'Save Changes' : 'Create Template'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function InviteesSheet({ templateId, onClose }) {
    const qc = useQueryClient();
    const [search, setSearch] = useState('');
    const workers = useDmtWorkers();
    const nameById = Object.fromEntries((workers.data || []).map((w) => [w.id || w.emp_id, w.name]));

    const invitees = useQuery({
        queryKey: ['dmt', 'template-invitees', templateId],
        queryFn: () => dmtApi.list('meeting-template-invitees', { template_id: templateId }),
        enabled: !!templateId,
    });
    const refresh = () => {
        qc.invalidateQueries({ queryKey: ['dmt', 'template-invitees', templateId] });
        qc.invalidateQueries({ queryKey: ['dmt', 'meeting-templates'] });
    };
    const add = useMutation({ mutationFn: (userId) => dmtApi.create('meeting-template-invitees', { template_id: templateId, user_id: userId, is_mandatory: true }), onSuccess: refresh, onError: (e) => toast.error(e.message) });
    const remove = useMutation({ mutationFn: (id) => dmtApi.remove('meeting-template-invitees', id), onSuccess: refresh });
    const toggle = useMutation({ mutationFn: ({ id, val }) => dmtApi.update('meeting-template-invitees', id, { is_mandatory: val }), onSuccess: refresh });

    const existing = new Set((invitees.data || []).map((i) => i.user_id));
    const matches = (workers.data || [])
        .filter((w) => !existing.has(w.id || w.emp_id) && search && w.name.toLowerCase().includes(search.toLowerCase()))
        .slice(0, 12);

    return (
        <Sheet open={!!templateId} onOpenChange={(v) => !v && onClose()}>
            <SheetContent className="w-full overflow-y-auto sm:max-w-md">
                <SheetHeader><SheetTitle>Manage Invitees</SheetTitle></SheetHeader>
                <div className="mt-4 space-y-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search people to add…" className="h-10 pl-9" />
                    </div>
                    {matches.length > 0 && (
                        <div className="max-h-40 overflow-y-auto rounded-md border border-slate-200">
                            {matches.map((w) => (
                                <button key={w.id || w.emp_id} type="button" className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-slate-50"
                                    onClick={() => { add.mutate(w.id || w.emp_id); setSearch(''); }}>
                                    <span>{w.name}</span><Plus className="h-3.5 w-3.5 text-slate-400" />
                                </button>
                            ))}
                        </div>
                    )}
                    {invitees.isLoading ? (
                        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
                    ) : !invitees.data?.length ? (
                        <p className="py-4 text-center text-sm text-slate-400">No invitees added yet.</p>
                    ) : (
                        <div className="space-y-2">
                            {invitees.data.map((inv) => (
                                <div key={inv.id} className="flex items-center justify-between rounded-md border border-slate-200 bg-white p-2">
                                    <p className="text-sm font-medium">{nameById[inv.user_id] || inv.user_id}</p>
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center gap-1.5">
                                            <Switch checked={inv.is_mandatory} onCheckedChange={(v) => toggle.mutate({ id: inv.id, val: v })} />
                                            <span className="text-[10px] text-slate-400">{inv.is_mandatory ? 'Mandatory' : 'Optional'}</span>
                                        </div>
                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-600" onClick={() => remove.mutate(inv.id)}><X className="h-3.5 w-3.5" /></Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}

export function DmtMeetingTemplates() {
    const { user, tierAtLeast } = useDmtMe();
    const qc = useQueryClient();
    const canEdit = tierAtLeast('leadership');
    const [showCreate, setShowCreate] = useState(false);
    const [editT, setEditT] = useState(null);
    const [inviteesId, setInviteesId] = useState(null);
    const [deleteId, setDeleteId] = useState(null);

    const templates = useQuery({
        queryKey: ['dmt', 'meeting-templates'],
        queryFn: async () => {
            const rows = await dmtApi.list('meeting-templates');
            return rows.slice().sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
        },
    });
    const counts = useQuery({
        queryKey: ['dmt', 'template-invitee-counts'],
        queryFn: async () => {
            const rows = await dmtApi.list('meeting-template-invitees');
            const c = {};
            for (const r of rows) c[r.template_id] = (c[r.template_id] || 0) + 1;
            return c;
        },
    });
    const del = useMutation({
        mutationFn: (id) => dmtApi.remove('meeting-templates', id),
        onSuccess: () => { toast.success('Template deleted'); qc.invalidateQueries({ queryKey: ['dmt', 'meeting-templates'] }); setDeleteId(null); },
        onError: (e) => toast.error(e.message),
    });

    return (
        <div className="mx-auto max-w-4xl space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-bold text-slate-900">Meeting Templates</h1>
                {canEdit && <Button onClick={() => setShowCreate(true)} className="h-10 gap-1.5"><Plus className="h-4 w-4" /> New Template</Button>}
            </div>

            {templates.isLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
            ) : !templates.data?.length ? (
                <p className="py-8 text-center text-sm text-slate-500">No templates yet.</p>
            ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b bg-slate-50 text-left text-sm text-slate-500">
                                <th className="p-3 font-medium">Name</th>
                                <th className="p-3 font-medium">Duration</th>
                                <th className="p-3 font-medium">Default Time</th>
                                <th className="p-3 text-center font-medium">Invitees</th>
                                <th className="p-3 text-center font-medium">Status</th>
                                {canEdit && <th className="p-3 text-right font-medium">Actions</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {templates.data.map((t) => (
                                <tr key={t.id} className="border-b last:border-0">
                                    <td className="p-3 text-sm font-medium">{t.name}</td>
                                    <td className="p-3 text-sm text-slate-500">{t.default_duration_minutes} min</td>
                                    <td className="p-3 text-sm text-slate-500">{t.default_start_time?.slice(0, 5) || '—'}</td>
                                    <td className="p-3 text-center text-sm">{counts.data?.[t.id] || 0}</td>
                                    <td className="p-3 text-center"><Badge variant={t.is_active ? 'default' : 'secondary'} className="text-[10px]">{t.is_active ? 'Active' : 'Inactive'}</Badge></td>
                                    {canEdit && (
                                        <td className="p-3 text-right">
                                            <div className="flex justify-end gap-1">
                                                <Button variant="ghost" size="icon" onClick={() => setEditT(t)}><Pencil className="h-4 w-4" /></Button>
                                                <Button variant="ghost" size="icon" onClick={() => setInviteesId(t.id)}><Users className="h-4 w-4" /></Button>
                                                <Button variant="ghost" size="icon" className="text-rose-600" onClick={() => setDeleteId(t.id)}><Trash2 className="h-4 w-4" /></Button>
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <TemplateForm
                open={showCreate || !!editT}
                onOpenChange={(v) => { if (!v) { setShowCreate(false); setEditT(null); } }}
                template={editT}
                me={user?.emp_id}
                onSaved={(id) => { setShowCreate(false); setEditT(null); setInviteesId(id); }}
            />
            <InviteesSheet templateId={inviteesId} onClose={() => setInviteesId(null)} />

            <Dialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader><DialogTitle>Delete this template?</DialogTitle></DialogHeader>
                    <p className="text-sm text-slate-500">Existing meetings are not affected.</p>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
                        <Button variant="destructive" onClick={() => del.mutate(deleteId)}>Delete</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
