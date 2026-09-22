import { useState } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { Loader2, Plus, Pencil, Check, X, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { dmtApi } from '../lib/dmtApi';
import { useDmtMe } from '../lib/useDmt';
import { usePdStages } from '../lib/usePdStages';
import { cn } from '../../lib/utils';

// One list of stages (in progress, or closing). BE Admin adds, renames, reorders and removes; a stage that still
// has jobs in it can't be removed. Closing stages also carry two rules: a feedback note is required, and whether the
// stage can be chosen from any in-progress stage (not just the last one).
function StageList({ title, hint, kind, stages, isBe, onChanged }) {
    const rows = stages.live.filter((s) => s.kind === kind);
    const [label, setLabel] = useState('');
    const [editKey, setEditKey] = useState(null);
    const [editLabel, setEditLabel] = useState('');
    const [flags, setFlags] = useState({ requires_note: false, early_exit: false });

    const add = useMutation({
        mutationFn: () => dmtApi.addPdStage({ label: label.trim(), kind, ...(kind === 'closing' ? flags : {}) }),
        onSuccess: () => { toast.success('Stage added'); setLabel(''); setFlags({ requires_note: false, early_exit: false }); onChanged(); },
        onError: (e) => toast.error(e.message),
    });
    const patch = useMutation({
        mutationFn: ({ key, ...body }) => dmtApi.updatePdStage(key, body),
        onSuccess: () => { setEditKey(null); onChanged(); },
        onError: (e) => toast.error(e.message),
    });
    const remove = useMutation({
        mutationFn: (key) => dmtApi.removePdStage(key),
        onSuccess: () => { toast.success('Stage removed'); onChanged(); },
        onError: (e) => toast.error(e.message),
    });

    return (
        <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
            <div>
                <h2 className="text-base font-semibold text-slate-900">{title}</h2>
                <p className="mt-0.5 text-sm text-slate-500">{hint}</p>
            </div>

            <ul className="space-y-1.5">
                {rows.map((s, i) => (
                    <li key={s.key} className="rounded-lg border border-slate-200 px-3 py-2">
                        <div className="flex items-center gap-2">
                            {kind === 'active' && <span className="w-5 shrink-0 text-xs font-semibold text-slate-400">{i + 1}</span>}
                            {editKey === s.key ? (
                                <>
                                    <Input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} maxLength={40} className="h-8 min-w-0 flex-1"
                                        onKeyDown={(e) => { if (e.key === 'Enter' && editLabel.trim()) patch.mutate({ key: s.key, label: editLabel }); }} />
                                    <button type="button" aria-label="Save name" disabled={!editLabel.trim() || patch.isPending}
                                        onClick={() => patch.mutate({ key: s.key, label: editLabel })} className="text-emerald-600 disabled:opacity-40"><Check className="h-4 w-4" /></button>
                                    <button type="button" aria-label="Cancel" onClick={() => setEditKey(null)} className="text-slate-400"><X className="h-4 w-4" /></button>
                                </>
                            ) : (
                                <>
                                    <Badge className={cn('border-0 text-xs', stages.pill(s.key))}>{s.label}</Badge>
                                    <span className="text-xs text-slate-500">{s.job_count} job{s.job_count === 1 ? '' : 's'}</span>
                                    {isBe && (
                                        <span className="ml-auto flex shrink-0 items-center gap-1">
                                            <button type="button" aria-label={`Move ${s.label} up`} disabled={i === 0 || patch.isPending}
                                                onClick={() => patch.mutate({ key: s.key, move: 'up' })} className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                                            <button type="button" aria-label={`Move ${s.label} down`} disabled={i === rows.length - 1 || patch.isPending}
                                                onClick={() => patch.mutate({ key: s.key, move: 'down' })} className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                                            <button type="button" aria-label={`Rename ${s.label}`} onClick={() => { setEditKey(s.key); setEditLabel(s.label); }}
                                                className="rounded p-1 text-slate-500 hover:bg-slate-100"><Pencil className="h-4 w-4" /></button>
                                            <button type="button" aria-label={`Remove ${s.label}`} disabled={remove.isPending}
                                                onClick={() => { if (window.confirm(`Remove the "${s.label}" stage?`)) remove.mutate(s.key); }}
                                                className="rounded p-1 text-rose-500 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>
                                        </span>
                                    )}
                                </>
                            )}
                        </div>
                        {kind === 'closing' && (
                            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 pl-0.5 text-xs text-slate-600">
                                <label className="flex items-center gap-1.5">
                                    <input type="checkbox" checked={s.requires_note} disabled={!isBe || patch.isPending}
                                        onChange={(e) => patch.mutate({ key: s.key, requires_note: e.target.checked })} className="h-3.5 w-3.5 rounded border-slate-300" />
                                    Feedback note required
                                </label>
                                <label className="flex items-center gap-1.5">
                                    <input type="checkbox" checked={s.early_exit} disabled={!isBe || patch.isPending}
                                        onChange={(e) => patch.mutate({ key: s.key, early_exit: e.target.checked })} className="h-3.5 w-3.5 rounded border-slate-300" />
                                    Can be chosen from any stage
                                </label>
                            </div>
                        )}
                    </li>
                ))}
            </ul>

            {isBe && (
                <div className="space-y-2 border-t border-slate-100 pt-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={kind === 'closing' ? 'New closing stage' : 'New in-progress stage'} maxLength={40}
                            onKeyDown={(e) => { if (e.key === 'Enter' && label.trim() && !add.isPending) add.mutate(); }} className="h-10 sm:w-72" />
                        <Button className="h-10 gap-1.5" disabled={!label.trim() || add.isPending} onClick={() => add.mutate()}>
                            {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add stage
                        </Button>
                    </div>
                    {kind === 'closing' && (
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                            <label className="flex items-center gap-1.5">
                                <input type="checkbox" checked={flags.requires_note} onChange={(e) => setFlags({ ...flags, requires_note: e.target.checked })} className="h-3.5 w-3.5 rounded border-slate-300" />
                                Feedback note required
                            </label>
                            <label className="flex items-center gap-1.5">
                                <input type="checkbox" checked={flags.early_exit} onChange={(e) => setFlags({ ...flags, early_exit: e.target.checked })} className="h-3.5 w-3.5 rounded border-slate-300" />
                                Can be chosen from any stage
                            </label>
                        </div>
                    )}
                    {kind === 'active' && <p className="text-xs text-slate-500">New stages are added at the end; use the arrows to move them.</p>}
                </div>
            )}
        </section>
    );
}

// Organisation → "PD Cycle Stages": the stages every PD job moves through. BE Admin manages them; leadership can see them.
export function DmtPdStages() {
    const qc = useQueryClient();
    const { tierAtLeast } = useDmtMe();
    const isBe = tierAtLeast('be_lead');
    const stages = usePdStages();
    const onChanged = () => {
        qc.invalidateQueries({ queryKey: ['dmt', 'pd-stages'] });
        qc.invalidateQueries({ queryKey: ['dmt', 'pd-audit'] });
    };

    if (stages.isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;
    if (stages.error) return <p className="text-sm text-rose-600">{stages.error.message}</p>;

    return (
        <div className="grid max-w-3xl gap-4">
            <StageList
                title="In-progress stages" kind="active" stages={stages} isBe={isBe} onChanged={onChanged}
                hint="The steps a job moves through, in order. A new job starts in the first one, and people can move a job forward or back one step."
            />
            <StageList
                title="Closing stages" kind="closing" stages={stages} isBe={isBe} onChanged={onChanged}
                hint="How a job ends. Closed jobs are final. A job that ends in a stage with a required feedback note can be respawned as a new job."
            />
            <p className="text-xs text-slate-500">
                A stage can only be removed once no job is in it. Removed stages still show their name in old history.
            </p>
        </div>
    );
}
