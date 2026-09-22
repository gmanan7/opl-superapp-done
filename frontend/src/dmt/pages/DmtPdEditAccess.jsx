import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, UserPlus, Trash2, Plus, Pencil, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import { dmtApi } from '../lib/dmtApi';
import { useDmtMe } from '../lib/useDmt';

const when = (ts) => new Date(ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// Small side panel: the PD job categories. BE Admin can add and rename; nothing is ever turned off
// or deleted here. Everyone with access to this tab can see the list.
function PdCategories({ isBe }) {
    const qc = useQueryClient();
    const cats = useQuery({ queryKey: ['dmt', 'pd-categories'], queryFn: dmtApi.pdCategories });
    const [name, setName] = useState('');
    const [editId, setEditId] = useState(null);
    const [editName, setEditName] = useState('');
    const refresh = () => {
        qc.invalidateQueries({ queryKey: ['dmt', 'pd-categories'] });
        qc.invalidateQueries({ queryKey: ['dmt', 'pd-audit'] });
    };
    const add = useMutation({
        mutationFn: () => dmtApi.addPdCategory(name.trim()),
        onSuccess: () => { toast.success('Category added'); setName(''); refresh(); },
        onError: (e) => toast.error(e.message),
    });
    const rename = useMutation({
        mutationFn: ({ id, newName }) => dmtApi.updatePdCategory(id, { name: newName.trim() }),
        onSuccess: () => { setEditId(null); refresh(); },
        onError: (e) => toast.error(e.message),
    });
    const list = cats.data || [];

    return (
        <aside className="h-fit space-y-2 rounded-lg border border-slate-200 bg-white p-3">
            <h2 className="text-sm font-semibold text-slate-900">Job categories</h2>
            {cats.isLoading && <div className="flex justify-center py-2"><Loader2 className="h-4 w-4 animate-spin text-slate-400" /></div>}
            {cats.error && <p className="text-xs text-rose-600">{cats.error.message}</p>}
            <ul className="space-y-1">
                {list.map((c) => (
                    <li key={c.id} className="flex h-9 items-center justify-between gap-1 rounded-md bg-slate-50 px-2 text-sm">
                        {editId === c.id ? (
                            <>
                                <Input value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={60} className="h-7 min-w-0 flex-1 px-2 text-sm"
                                    onKeyDown={(e) => { if (e.key === 'Enter' && editName.trim()) rename.mutate({ id: c.id, newName: editName }); }} />
                                <button type="button" aria-label="Save name" disabled={!editName.trim() || rename.isPending}
                                    onClick={() => rename.mutate({ id: c.id, newName: editName })} className="text-emerald-600 disabled:opacity-40"><Check className="h-4 w-4" /></button>
                                <button type="button" aria-label="Cancel" onClick={() => setEditId(null)} className="text-slate-400"><X className="h-4 w-4" /></button>
                            </>
                        ) : (
                            <>
                                <span className="truncate text-slate-800">{c.name}</span>
                                {isBe && (
                                    <button type="button" aria-label={`Rename ${c.name}`} onClick={() => { setEditId(c.id); setEditName(c.name); }}
                                        className="shrink-0 text-slate-400 hover:text-slate-700"><Pencil className="h-3.5 w-3.5" /></button>
                                )}
                            </>
                        )}
                    </li>
                ))}
            </ul>
            {isBe && (
                <div className="flex gap-1.5 pt-1">
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category" maxLength={60} className="h-8 min-w-0 flex-1 text-sm"
                        onKeyDown={(e) => { if (e.key === 'Enter' && name.trim() && !add.isPending) add.mutate(); }} />
                    <Button size="sm" className="h-8 w-8 shrink-0 p-0" aria-label="Add category" disabled={!name.trim() || add.isPending} onClick={() => add.mutate()}>
                        {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    </Button>
                </div>
            )}
        </aside>
    );
}

// Organisation → "PD Cycle Edit Access": everyone can VIEW the PD Cycle; BE Admin plus the people
// listed here can create and change jobs. BE Admin manages the list; leadership can see it.
export function DmtPdEditAccess() {
    const qc = useQueryClient();
    const { tierAtLeast } = useDmtMe();
    const isBe = tierAtLeast('be_lead');
    const [empId, setEmpId] = useState('');

    const editors = useQuery({ queryKey: ['dmt', 'pd-editors'], queryFn: dmtApi.pdEditors });
    const people = useQuery({ queryKey: ['worker-names'], queryFn: dmtApi.workerNames, staleTime: 1000 * 60 * 5, enabled: isBe });

    const refresh = () => {
        qc.invalidateQueries({ queryKey: ['dmt', 'pd-editors'] });
        qc.invalidateQueries({ queryKey: ['dmt', 'pd-edit-access'] });
    };
    const add = useMutation({
        mutationFn: () => dmtApi.addPdEditor(empId),
        onSuccess: () => { toast.success('Edit access granted'); setEmpId(''); refresh(); },
        onError: (e) => toast.error(e.message),
    });
    const remove = useMutation({
        mutationFn: (id) => dmtApi.removePdEditor(id),
        onSuccess: () => { toast.success('Edit access removed'); refresh(); },
        onError: (e) => toast.error(e.message),
    });

    const list = editors.data || [];
    const taken = new Set(list.map((e) => e.emp_id));
    const candidates = (people.data || []).filter((p) => p.is_active && !taken.has(p.id));

    return (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="min-w-0 space-y-4">
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <h2 className="text-base font-semibold text-slate-900">Who can edit the PD Cycle</h2>
                    <p className="mt-1 text-sm text-slate-500">
                        Everyone can view the PD Cycle. Only the people below get to create jobs, edit them, move them between stages,
                        comment and respawn. BE Admin can always edit; everyone else needs BE Admin to add them here.
                    </p>
                </div>

                {isBe && (
                    <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center">
                        <div className="sm:w-80">
                            <Select value={empId} onValueChange={setEmpId}>
                                <SelectTrigger className="h-10"><SelectValue placeholder="Select a person" /></SelectTrigger>
                                <SelectContent>
                                    {candidates.map((p) => (
                                        <SelectItem key={p.id} value={p.id}>{p.name} ({p.role})</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button className="h-10 gap-1.5" disabled={!empId || add.isPending} onClick={() => add.mutate()}>
                            {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Give edit access
                        </Button>
                    </div>
                )}

                {editors.isLoading && <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>}
                {editors.error && <p className="text-sm text-rose-600">{editors.error.message}</p>}
                {editors.data && list.length === 0 && (
                    <p className="rounded-lg border border-dashed border-slate-300 py-8 text-center text-sm text-slate-500">
                        No one has been added yet, so only BE Admin can edit the PD Cycle.
                    </p>
                )}

                <div className="space-y-2">
                    {list.map((e) => (
                        <div key={e.emp_id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-slate-900">{e.name} <span className="font-normal text-slate-400">({e.role})</span></p>
                                <p className="text-xs text-slate-500">Added by {e.added_by_name || e.added_by || '—'} on {when(e.added_at)}</p>
                            </div>
                            {isBe && (
                                <Button variant="ghost" size="sm" className="shrink-0 gap-1 text-rose-600 hover:text-rose-700"
                                    disabled={remove.isPending} onClick={() => remove.mutate(e.emp_id)}>
                                    <Trash2 className="h-4 w-4" /> Remove
                                </Button>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            <PdCategories isBe={isBe} />
        </div>
    );
}
