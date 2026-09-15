import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, Trash2, Pencil, ArrowLeft, Check, LogOut, X, Star } from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../../components/ui/sheet';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { cn } from '../../lib/utils';
import { dmtApi } from '../lib/dmtApi';
import { useDmtMe } from '../lib/useDmt';
import { useDmtWorkers } from '../lib/useDmtTasks';
import {
    GROUP_COLOR_PRESETS, canCreateGroup, canDeleteGroup, canManageGroupMembers, canManageLeaders,
} from '../lib/taskExtras';

function MemberPicker({ options, selected, onToggle, height = 'h-48' }) {
    const [search, setSearch] = useState('');
    const filtered = options.filter((w) => !search || w.name.toLowerCase().includes(search.toLowerCase()));
    return (
        <>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search people…" className="h-9" />
            <div className={cn('mt-2 overflow-y-auto rounded border border-slate-200', height)}>
                <div className="space-y-0.5 p-1.5">
                    {filtered.map((w) => (
                        <label key={w.id} className="flex cursor-pointer items-center gap-2 rounded p-1.5 text-sm hover:bg-slate-50">
                            <input type="checkbox" checked={selected.has(w.id)} onChange={() => onToggle(w.id)} />
                            <span className="truncate">{w.name}</span>
                        </label>
                    ))}
                    {filtered.length === 0 && <p className="py-3 text-center text-xs text-slate-400">No matches.</p>}
                </div>
            </div>
        </>
    );
}

export function DmtGroupsPanel({ open, onOpenChange }) {
    const { user, tier } = useDmtMe();
    const me = user?.emp_id;
    const qc = useQueryClient();
    const [mode, setMode] = useState('list'); // 'list' | 'create' | {detail: id}
    const workers = useDmtWorkers();
    const workerOpts = (workers.data || []).map((w) => ({ id: w.id || w.emp_id, name: w.name }));

    const groups = useQuery({ queryKey: ['dmt', 'task-groups'], queryFn: () => dmtApi.list('task-groups'), enabled: open });
    const members = useQuery({ queryKey: ['dmt', 'task-group-members'], queryFn: () => dmtApi.list('task-group-members'), enabled: open });

    const refresh = () => {
        qc.invalidateQueries({ queryKey: ['dmt', 'task-groups'] });
        qc.invalidateQueries({ queryKey: ['dmt', 'task-group-members'] });
        qc.invalidateQueries({ queryKey: ['dmt', 'my-task-groups'] });
        qc.invalidateQueries({ queryKey: ['dmt', 'tasks'] });
    };

    const countByGroup = useMemo(() => {
        const m = new Map();
        for (const r of members.data || []) m.set(r.group_id, (m.get(r.group_id) || 0) + 1);
        return m;
    }, [members.data]);
    const myGroupIds = useMemo(
        () => new Set((members.data || []).filter((r) => r.user_id === me).map((r) => r.group_id)),
        [members.data, me],
    );
    const isAdmin = ['leadership', 'be_lead'].includes(tier);
    const visible = (groups.data || []).filter((g) => isAdmin || g.created_by === me || myGroupIds.has(g.id));

    // ---- create ----
    const [cName, setCName] = useState('');
    const [cColor, setCColor] = useState(GROUP_COLOR_PRESETS[0].value);
    const [cSel, setCSel] = useState(new Set());
    const create = useMutation({
        mutationFn: async () => {
            const factory = await dmtApi.myFactory();
            const g = await dmtApi.create('task-groups', { name: cName.trim(), color: cColor, created_by: me, factory_id: factory?.id });
            for (const uid of cSel) await dmtApi.create('task-group-members', { group_id: g.id, user_id: uid, added_by: me });
        },
        onSuccess: () => { toast.success('Group created'); setCName(''); setCSel(new Set()); setMode('list'); refresh(); },
        onError: (e) => toast.error(e.message),
    });

    // ---- detail ----
    const detailId = typeof mode === 'object' ? mode.detail : null;
    const group = (groups.data || []).find((g) => g.id === detailId);
    const groupMembers = useQuery({
        queryKey: ['dmt', 'group-members', detailId],
        queryFn: () => dmtApi.list('task-group-members', { group_id: detailId }),
        enabled: !!detailId,
    });
    const nameById = Object.fromEntries(workerOpts.map((w) => [w.id, w.name]));
    const canManage = group ? canManageGroupMembers(group, me, tier) : false;
    const canLead = group ? canManageLeaders(group, me, tier) : false;
    const [rename, setRename] = useState(null);
    const [addOpen, setAddOpen] = useState(false);
    const [addSel, setAddSel] = useState(new Set());
    const existing = new Set((groupMembers.data || []).map((m) => m.user_id));

    const renameMut = useMutation({ mutationFn: (name) => dmtApi.update('task-groups', detailId, { name }), onSuccess: () => { toast.success('Renamed'); setRename(null); refresh(); }, onError: (e) => toast.error(e.message) });
    const delGroup = useMutation({ mutationFn: () => dmtApi.remove('task-groups', detailId), onSuccess: () => { toast.success('Group deleted'); setMode('list'); refresh(); }, onError: (e) => toast.error(e.message) });
    const rmMember = useMutation({ mutationFn: (id) => dmtApi.remove('task-group-members', id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['dmt', 'group-members', detailId] }); refresh(); }, onError: (e) => toast.error(e.message) });
    const setLeader = useMutation({ mutationFn: ({ id, val }) => dmtApi.update('task-group-members', id, { is_leader: val }), onSuccess: () => qc.invalidateQueries({ queryKey: ['dmt', 'group-members', detailId] }), onError: (e) => toast.error(e.message) });
    const addMembers = useMutation({
        mutationFn: async () => { for (const uid of addSel) await dmtApi.create('task-group-members', { group_id: detailId, user_id: uid, added_by: me }); },
        onSuccess: () => { toast.success('Members added'); setAddOpen(false); setAddSel(new Set()); qc.invalidateQueries({ queryKey: ['dmt', 'group-members', detailId] }); refresh(); },
        onError: (e) => toast.error(e.message),
    });

    return (
        <Sheet open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setMode('list'); }}>
            <SheetContent className="w-full overflow-y-auto sm:max-w-[420px]">
                <SheetHeader>
                    <SheetTitle className="flex items-center gap-2">
                        {mode !== 'list' && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setMode('list')}><ArrowLeft className="h-4 w-4" /></Button>}
                        {mode === 'list' ? (isAdmin ? 'All Groups' : 'My Groups') : mode === 'create' ? 'Create Group' : 'Group Members'}
                    </SheetTitle>
                </SheetHeader>

                <div className="mt-4">
                    {mode === 'list' && (
                        <div className="space-y-3">
                            {canCreateGroup(tier) && <Button size="sm" className="w-full gap-1" onClick={() => setMode('create')}><Plus className="h-4 w-4" /> Create Group</Button>}
                            {groups.isLoading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : visible.length === 0 ? (
                                <p className="py-6 text-center text-sm text-slate-400">No groups yet.</p>
                            ) : visible.map((g) => (
                                <button key={g.id} type="button" onClick={() => setMode({ detail: g.id })}
                                    className="flex w-full items-center gap-2 rounded-lg border border-slate-200 p-3 text-left hover:bg-slate-50">
                                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: g.color }} />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium">{g.name}</p>
                                        <p className="text-[10px] text-slate-400">{countByGroup.get(g.id) || 0} member(s){g.created_by === me && ' · created by you'}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}

                    {mode === 'create' && (
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs font-medium text-slate-700">Group name *</label>
                                <Input value={cName} onChange={(e) => setCName(e.target.value)} className="mt-1 h-10" placeholder="e.g. Alpha Team" />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-700">Colour</label>
                                <div className="mt-1 flex flex-wrap gap-2">
                                    {GROUP_COLOR_PRESETS.map((c) => (
                                        <button key={c.value} type="button" onClick={() => setCColor(c.value)}
                                            className={cn('h-7 w-7 rounded-full border-2', cColor === c.value ? 'border-slate-900 scale-110' : 'border-transparent')}
                                            style={{ backgroundColor: c.value }} title={c.name} />
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-700">Members (you are not added automatically)</label>
                                <div className="mt-1">
                                    <MemberPicker options={workerOpts} selected={cSel} onToggle={(id) => setCSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; })} />
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <Button className="h-10 flex-1" disabled={!cName.trim() || create.isPending} onClick={() => create.mutate()}>
                                    {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create Group
                                </Button>
                                <Button variant="outline" className="h-10" onClick={() => setMode('list')}>Cancel</Button>
                            </div>
                        </div>
                    )}

                    {detailId && group && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: group.color }} />
                                {rename !== null ? (
                                    <div className="flex flex-1 gap-1">
                                        <Input value={rename} onChange={(e) => setRename(e.target.value)} className="h-8" />
                                        <Button size="icon" className="h-8 w-8" onClick={() => rename.trim() && renameMut.mutate(rename.trim())}><Check className="h-4 w-4" /></Button>
                                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setRename(null)}><X className="h-4 w-4" /></Button>
                                    </div>
                                ) : (
                                    <>
                                        <p className="flex-1 text-sm font-semibold">{group.name}</p>
                                        {canManage && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setRename(group.name)}><Pencil className="h-3.5 w-3.5" /></Button>}
                                    </>
                                )}
                            </div>

                            <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-slate-700">Members ({groupMembers.data?.length ?? 0})</span>
                                {canManage && <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setAddOpen(true)}><Plus className="h-3 w-3" /> Add</Button>}
                            </div>
                            <div className="space-y-1">
                                {(groupMembers.data || []).slice().sort((a, b) => (b.is_leader ? 1 : 0) - (a.is_leader ? 1 : 0)).map((m) => (
                                    <div key={m.id} className="flex items-center justify-between gap-2 rounded border border-slate-200 p-2 text-sm">
                                        <span className="flex-1 truncate">{nameById[m.user_id] || m.user_id}</span>
                                        <div className="flex shrink-0 items-center gap-1">
                                            {m.is_leader && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">Leader</span>}
                                            {m.user_id === group.created_by && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">creator</span>}
                                            {canLead && (
                                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setLeader.mutate({ id: m.id, val: !m.is_leader })}>
                                                    <Star className={cn('h-3.5 w-3.5', m.is_leader ? 'fill-amber-500 text-amber-500' : 'text-slate-300')} />
                                                </Button>
                                            )}
                                            {canManage && m.user_id !== group.created_by && (
                                                <Button size="icon" variant="ghost" className="h-6 w-6 text-rose-600" onClick={() => rmMember.mutate(m.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {addOpen && (
                                <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                                    <MemberPicker
                                        options={workerOpts.filter((w) => !existing.has(w.id))}
                                        selected={addSel}
                                        onToggle={(id) => setAddSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; })}
                                        height="h-40"
                                    />
                                    <div className="flex gap-2">
                                        <Button size="sm" className="flex-1" disabled={addSel.size === 0} onClick={() => addMembers.mutate()}>Add ({addSel.size})</Button>
                                        <Button size="sm" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
                                    </div>
                                </div>
                            )}

                            <div className="flex gap-2 border-t border-slate-100 pt-2">
                                {canDeleteGroup(tier) && (
                                    <Button variant="destructive" size="sm" className="flex-1 gap-1" onClick={() => { if (window.confirm(`Delete "${group.name}"? Its active tasks lose their group.`)) delGroup.mutate(); }}>
                                        <Trash2 className="h-3.5 w-3.5" /> Delete Group
                                    </Button>
                                )}
                                {!canManage && existing.has(me) && (
                                    <Button variant="outline" size="sm" className="flex-1 gap-1"
                                        onClick={() => { const row = (groupMembers.data || []).find((m) => m.user_id === me); if (row) rmMember.mutate(row.id, { onSuccess: () => setMode('list') }); }}>
                                        <LogOut className="h-3.5 w-3.5" /> Leave Group
                                    </Button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}
