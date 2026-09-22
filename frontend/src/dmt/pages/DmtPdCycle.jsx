import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Plus, Search, X, Columns3, ListTodo, Lightbulb, RotateCcw, Loader2, ArrowRight,
    ChevronLeft, ChevronRight, CalendarDays, Clock, Building2, SlidersHorizontal, BarChart3,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '../../components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../../components/ui/sheet';
import {
    DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem,
} from '../../components/ui/dropdown-menu';
import { safeStorage } from '../../lib/safeStorage';
import { ListPager } from '@/components/patterns/ListPager';
import { cn } from '../../lib/utils';
import { dmtApi } from '../lib/dmtApi';
import { useDmtMe } from '../lib/useDmt';
import { useDmtWorkers } from '../lib/useDmtTasks';
import { ageInDays, pdJobMatchesQuery } from '../lib/pdCycle';
import { matchesDue, localIso, DUE_LABEL } from '../lib/pdAnalytics';
import { DmtPdAnalyticsSheet } from './DmtPdAnalyticsSheet';
import { usePdStages } from '../lib/usePdStages';
import { fmtLong } from '../lib/dmtDates';

// Cards per kanban column page depends on how many columns the person has switched on: the fewer columns,
// the more room each one gets, so it shows more cards per page (cards are always the same size, so no scrolling).
const colPageSize = (shown) => (shown >= 4 ? 4 : shown === 3 ? 5 : 6);
const CARD_H = 'h-[136px]'; // every job card is exactly this tall, everywhere

function usePdJobs() {
    return useQuery({
        queryKey: ['dmt', 'pd-jobs'],
        queryFn: async () => {
            const rows = await dmtApi.list('pd-jobs');
            return rows.slice().sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
        },
    });
}

// A bold label above a form control, so every field in the dialogs lines up the same way.
function Field({ label, required, children }) {
    return (
        <div className="space-y-1">
            <label className="block text-sm font-semibold text-slate-800">{label}{required && <span className="ml-0.5 text-rose-500">*</span>}</label>
            {children}
        </div>
    );
}

function usePdCategories() {
    return useQuery({ queryKey: ['dmt', 'pd-categories'], queryFn: dmtApi.pdCategories, staleTime: 1000 * 60 });
}

// Prev / "n of m" / Next — used inside kanban columns and the drawer's paged lists.
function MiniPager({ page, pageCount, onPage }) {
    if (pageCount <= 1) return null;
    return (
        <div className="flex items-center justify-between pt-1 text-xs text-slate-500">
            <button type="button" disabled={page === 0} onClick={() => onPage(page - 1)}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white disabled:opacity-40">
                <ChevronLeft className="h-4 w-4" />
            </button>
            <span>{page + 1} / {pageCount}</span>
            <button type="button" disabled={page >= pageCount - 1} onClick={() => onPage(page + 1)}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white disabled:opacity-40">
                <ChevronRight className="h-4 w-4" />
            </button>
        </div>
    );
}

// fromNumber = the PD number this job was respawned from (null for an ordinary job). Respawns get their own colour.
// showStage: on the board a column already names the stage, so only the "closed" column and the list view show it.
// Layout rule that keeps text from ever overlapping: fixed bits (PD number, respawn tag) never shrink, and the one
// variable-length item on each row (stage name, customer, category) truncates with an ellipsis instead.
function JobCard({ job, onOpen, catName, stages, fromNumber, showStage = true }) {
    const overdue = job.target_dispatch_date && !stages.isClosing(job.stage)
        && String(job.target_dispatch_date).slice(0, 10) < localIso();
    return (
        <button type="button" onClick={() => onOpen(job.id)}
            className={cn('flex w-full flex-col justify-between rounded-lg border border-l-4 p-3 text-left transition-colors hover:shadow-xs',
                fromNumber ? 'border-violet-200 bg-violet-50 hover:border-violet-400' : 'border-slate-200 bg-white hover:border-blue-300',
                CARD_H, stages.bar(job.stage))}>
            <div>
                <div className="flex items-center gap-1.5">
                    <span className="shrink-0 font-mono text-xs text-slate-400">PD#{job.job_number}</span>
                    {fromNumber && (
                        <span title={`Respawn of PD#${fromNumber}`} className="inline-flex shrink-0 items-center gap-1 rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-medium text-violet-700">
                            <RotateCcw className="h-3 w-3" /> PD#{fromNumber}
                        </span>
                    )}
                    {showStage && (
                        <span title={stages.label(job.stage)} className={cn('ml-auto min-w-0 truncate rounded-full px-2 py-0.5 text-[11px] font-semibold', stages.pill(job.stage))}>
                            {stages.label(job.stage)}
                        </span>
                    )}
                </div>
                <div className="mt-1 line-clamp-2 text-sm font-semibold leading-snug text-slate-900">{job.title}</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                    <Building2 className="h-3 w-3 shrink-0 text-slate-400" />
                    <span className="min-w-0 truncate">{job.customer || 'No customer'}</span>
                    {catName && <span title={catName} className="ml-auto max-w-[45%] shrink-0 truncate rounded bg-teal-50 px-1.5 py-0.5 text-[11px] font-medium text-teal-700">{catName}</span>}
                </div>
            </div>
            <div className="flex items-center justify-between text-xs">
                <span className={cn('flex items-center gap-1', overdue ? 'font-medium text-rose-600' : 'text-slate-500')}>
                    <CalendarDays className="h-3 w-3" />
                    {job.target_dispatch_date ? fmtLong(job.target_dispatch_date) : 'No target'}
                </span>
                <span className="flex items-center gap-1 text-slate-400"><Clock className="h-3 w-3" />{ageInDays(job.updated_at || job.created_at)}d</span>
            </div>
        </button>
    );
}

const DRAWER_TABS = [['main', 'Details'], ['comments', 'Comments'], ['history', 'History']];

function PdJobDrawer({ job, jobs, canEdit, categories, stages, onClose, onOpenJob }) {
    const qc = useQueryClient();
    const { user } = useDmtMe();
    const workers = useDmtWorkers();
    const nameById = Object.fromEntries((workers.data || []).map((w) => [w.id || w.emp_id, w.name]));

    const [tab, setTab] = useState('main');
    const [comment, setComment] = useState('');
    const [stageForm, setStageForm] = useState({ next: '', note: '', feedback: '' });
    const [spawn, setSpawn] = useState({ title: '', reason: '', date: '' });
    const [spawnOpen, setSpawnOpen] = useState(false);
    const [edit, setEdit] = useState(null);
    const [cPage, setCPage] = useState(0);
    const [hPage, setHPage] = useState(0);

    const comments = useQuery({
        queryKey: ['dmt', 'pd-comments', job?.id],
        queryFn: () => dmtApi.list('pd-job-comments', { job_id: job.id }),
        enabled: !!job,
    });
    const history = useQuery({
        queryKey: ['dmt', 'pd-history', job?.id],
        queryFn: () => dmtApi.list('pd-stage-history', { job_id: job.id }),
        enabled: !!job,
    });

    const refresh = () => {
        qc.invalidateQueries({ queryKey: ['dmt', 'pd-jobs'] });
        qc.invalidateQueries({ queryKey: ['dmt', 'pd-comments', job.id] });
        qc.invalidateQueries({ queryKey: ['dmt', 'pd-history', job.id] });
        qc.invalidateQueries({ queryKey: ['dmt', 'pd-audit'] });
    };

    const postComment = useMutation({
        mutationFn: () => dmtApi.create('pd-job-comments', { job_id: job.id, author_id: user.emp_id, body: comment.trim() }),
        onSuccess: () => { setComment(''); setCPage(0); refresh(); },
        onError: (e) => toast.error(e.message),
    });
    const changeStage = useMutation({
        mutationFn: () => dmtApi.setPdStage(job.id, stageForm.next, stageForm.note || null, stageForm.feedback || null),
        onSuccess: () => { toast.success('Stage updated'); setStageForm({ next: '', note: '', feedback: '' }); refresh(); },
        onError: (e) => toast.error(e.message),
    });
    const doSpawn = useMutation({
        mutationFn: () => dmtApi.spawnPdJob(job.id, spawn.reason, spawn.title || null, spawn.date || null),
        onSuccess: (newJob) => { toast.success(`New PD job created: PD#${newJob.job_number}`); setSpawn({ title: '', reason: '', date: '' }); setSpawnOpen(false); refresh(); onOpenJob(newJob.id); },
        onError: (e) => toast.error(e.message),
    });
    const saveEdit = useMutation({
        mutationFn: () => dmtApi.update('pd-jobs', job.id, edit),
        onSuccess: () => { toast.success('Job updated'); setEdit(null); refresh(); },
        onError: (e) => toast.error(e.message),
    });

    // A respawned job carries the story of the jobs it came from: walk the chain back (PD#3 <- PD#2 <- PD#1).
    const ancestors = useMemo(() => {
        const out = [];
        const seen = new Set([job?.id]);
        let cur = job;
        while (cur?.previous_job_id && !seen.has(cur.previous_job_id)) {
            const p = jobs.find((j) => j.id === cur.previous_job_id);
            if (!p) break;
            out.push(p); seen.add(p.id); cur = p;
        }
        return out;
    }, [job, jobs]);
    const ancHistory = useQueries({
        queries: ancestors.map((a) => ({
            queryKey: ['dmt', 'pd-history', a.id],
            queryFn: () => dmtApi.list('pd-stage-history', { job_id: a.id }),
        })),
    });

    if (!job) return null;
    const fwd = stages.forward(job.stage);
    const back = stages.backTo(job.stage);
    const opts = [...fwd, ...(back ? [back] : [])];
    const terminal = stages.isClosing(job.stage);
    const nextIsBack = !!back && stageForm.next === back;
    const needsFeedback = !!stages.byKey[stageForm.next]?.requires_note;
    const canRespawn = stages.byKey[job.stage]?.kind === 'closing' && !!stages.byKey[job.stage]?.requires_note;
    const alreadySpawned = jobs.filter((j) => j.previous_job_id === job.id);
    const prev = job.previous_job_id ? jobs.find((j) => j.id === job.previous_job_id) : null;

    const cList = (comments.data || []).slice().sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    const newestFirst = (rows) => (rows || []).slice().sort((a, b) => (b.changed_at || '').localeCompare(a.changed_at || ''));
    // this job's own stage changes, then — under a heading each — the earlier jobs it was respawned from
    const hList = [
        ...newestFirst(history.data).map((h) => ({ kind: 'entry', h })),
        ...ancestors.flatMap((a, i) => {
            const rows = newestFirst(ancHistory[i]?.data);
            return [{ kind: 'divider', job: a }, ...(rows.length ? rows.map((h) => ({ kind: 'entry', h, earlier: true })) : [{ kind: 'none' }])];
        }),
    ];
    const C_SIZE = 3;
    const H_SIZE = 5;
    const cCount = Math.max(1, Math.ceil(cList.length / C_SIZE));
    const hCount = Math.max(1, Math.ceil(hList.length / H_SIZE));

    return (
        <Sheet open onOpenChange={(v) => !v && onClose()}>
            <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
                <SheetHeader>
                    <SheetTitle className="pr-6 text-base">PD#{job.job_number} — {job.title}</SheetTitle>
                </SheetHeader>

                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <Badge className={cn('border-0', stages.pill(job.stage))}>{stages.label(job.stage)}</Badge>
                    <span>Created by {nameById[job.created_by] || job.created_by}</span>
                    {prev && (
                        <button type="button" className="inline-flex items-center gap-1 text-blue-600" onClick={() => onOpenJob(prev.id)}>
                            <RotateCcw className="h-3 w-3" /> from PD#{prev.job_number}
                        </button>
                    )}
                </div>

                <div className="mt-4 grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">
                    {DRAWER_TABS.map(([key, label]) => (
                        <button key={key} type="button" onClick={() => setTab(key)}
                            className={cn('rounded-md px-2 py-1.5 text-xs font-medium transition-colors sm:text-sm',
                                tab === key ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-500 hover:text-slate-700')}>
                            {label}{key === 'comments' && cList.length > 0 ? ` (${cList.length})` : ''}
                        </button>
                    ))}
                </div>

                {tab === 'main' && (
                    <div className="mt-4 space-y-3">
                        <div className="grid grid-cols-2 gap-x-3 gap-y-3 rounded-lg border border-slate-200 p-3 text-sm">
                            <div><span className="text-xs text-slate-500">Category</span><p className="break-words">{categories.find((c) => c.id === job.category_id)?.name || 'Uncategorised'}</p></div>
                            <div><span className="text-xs text-slate-500">Customer</span><p className="break-words">{job.customer || '—'}</p></div>
                            <div><span className="text-xs text-slate-500">Product</span><p className="break-words">{job.product || '—'}</p></div>
                            <div><span className="text-xs text-slate-500">Substrate</span><p className="break-words">{job.substrate || '—'}</p></div>
                            <div><span className="text-xs text-slate-500">Target dispatch</span><p>{job.target_dispatch_date ? fmtLong(job.target_dispatch_date) : '—'}</p></div>
                        </div>
                        {prev && (
                            <div className="rounded-md bg-violet-50 p-3 text-sm">
                                <span className="text-xs font-semibold text-violet-700">Respawned from PD#{prev.job_number}</span>
                                <p className="break-words">Reason: {job.respawn_reason || '—'}</p>
                                {prev.feedback_note && <p className="mt-1 break-words text-slate-600">Why PD#{prev.job_number} ended: {prev.feedback_note}</p>}
                            </div>
                        )}
                        {job.feedback_note && (
                            <div className="rounded-md bg-slate-50 p-3 text-sm"><span className="text-xs text-slate-500">Feedback / reason</span><p className="break-words">{job.feedback_note}</p></div>
                        )}

                        {canEdit && !terminal && (
                            edit ? (
                                <div className="space-y-2.5 rounded-lg border border-slate-200 p-3">
                                    <Field label="Title" required>
                                        <Input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} className="h-10" />
                                    </Field>
                                    <Field label="Category">
                                        <Select value={edit.category_id || 'none'} onValueChange={(v) => setEdit({ ...edit, category_id: v === 'none' ? null : v })}>
                                            <SelectTrigger className="h-10"><SelectValue placeholder="Category" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">No category</SelectItem>
                                                {categories.filter((c) => c.is_active || c.id === edit.category_id).map((c) => (
                                                    <SelectItem key={c.id} value={c.id}>{c.name}{c.is_active ? '' : ' (off)'}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </Field>
                                    <div className="grid grid-cols-2 gap-2.5">
                                        <Field label="Customer">
                                            <Input value={edit.customer || ''} onChange={(e) => setEdit({ ...edit, customer: e.target.value })} className="h-10" />
                                        </Field>
                                        <Field label="Product">
                                            <Input value={edit.product || ''} onChange={(e) => setEdit({ ...edit, product: e.target.value })} className="h-10" />
                                        </Field>
                                        <Field label="Substrate">
                                            <Input value={edit.substrate || ''} onChange={(e) => setEdit({ ...edit, substrate: e.target.value })} className="h-10" />
                                        </Field>
                                        <Field label="Target dispatch date">
                                            <input type="date" value={edit.target_dispatch_date ? String(edit.target_dispatch_date).slice(0, 10) : ''} onChange={(e) => setEdit({ ...edit, target_dispatch_date: e.target.value || null })} className="h-10 w-full rounded-md border border-slate-200 px-2 text-sm" />
                                        </Field>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button size="sm" onClick={() => saveEdit.mutate()} disabled={!edit.title?.trim() || saveEdit.isPending}>Save</Button>
                                        <Button size="sm" variant="outline" onClick={() => setEdit(null)}>Cancel</Button>
                                    </div>
                                </div>
                            ) : (
                                <Button size="sm" variant="outline" onClick={() => setEdit({ title: job.title, category_id: job.category_id, customer: job.customer, product: job.product, substrate: job.substrate, target_dispatch_date: job.target_dispatch_date })}>Edit details</Button>
                            )
                        )}

                        {canEdit && !terminal && opts.length > 0 && (
                            <div className="space-y-2 rounded-lg border border-slate-200 p-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Move stage</p>
                                <Select value={stageForm.next} onValueChange={(v) => setStageForm({ ...stageForm, next: v })}>
                                    <SelectTrigger className="h-10"><SelectValue placeholder="Next stage…" /></SelectTrigger>
                                    <SelectContent>
                                        {opts.map((s) => (
                                            <SelectItem key={s} value={s}>{s === back ? `← Back to ${stages.label(s)}` : stages.label(s)}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {needsFeedback && (
                                    <Input placeholder="Feedback note (required)" value={stageForm.feedback} onChange={(e) => setStageForm({ ...stageForm, feedback: e.target.value })} className="h-10" />
                                )}
                                <Input placeholder={nextIsBack ? 'Reason for moving back (required)' : 'Note (optional)'} value={stageForm.note} onChange={(e) => setStageForm({ ...stageForm, note: e.target.value })} className="h-10" />
                                <Button
                                    size="sm"
                                    disabled={!stageForm.next || changeStage.isPending}
                                    onClick={() => {
                                        if (needsFeedback && !stageForm.feedback.trim()) return toast.error('A feedback note is required for this stage.');
                                        if (nextIsBack && !stageForm.note.trim()) return toast.error('Please give a reason for moving the job back.');
                                        changeStage.mutate();
                                    }}
                                >
                                    <ArrowRight className="mr-1 h-3.5 w-3.5" /> {nextIsBack ? 'Move back' : 'Move'}
                                </Button>
                            </div>
                        )}

                        {alreadySpawned.length > 0 && (
                            <p className="rounded-md bg-violet-50 p-2.5 text-xs text-violet-800">
                                Already respawned as{' '}
                                {alreadySpawned.map((j, i) => (
                                    <span key={j.id}>
                                        {i > 0 && ', '}
                                        <button type="button" className="font-semibold underline" onClick={() => onOpenJob(j.id)}>PD#{j.job_number}</button>
                                    </span>
                                ))}.
                            </p>
                        )}
                        {canEdit && canRespawn && (
                            <Button size="sm" variant="outline" className="gap-1" onClick={() => setSpawnOpen(true)}>
                                <RotateCcw className="h-3.5 w-3.5" /> {alreadySpawned.length > 0 ? 'Respawn again' : 'Respawn as new job'}
                            </Button>
                        )}

                        {!canEdit && (
                            <p className="rounded-md bg-slate-50 p-3 text-xs text-slate-500">You can view this job. Editing is limited to people BE Admin has given PD Cycle edit access.</p>
                        )}
                    </div>
                )}

                <Dialog open={spawnOpen} onOpenChange={(v) => { if (!doSpawn.isPending) setSpawnOpen(v); }}>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle>Respawn PD#{job.job_number} as a new job?</DialogTitle>
                            <DialogDescription>
                                This creates a new job with the same customer, product, substrate and category, starting in {stages.active[0]?.label || 'the first stage'}.
                                PD#{job.job_number} stays closed as it is.
                            </DialogDescription>
                        </DialogHeader>
                        {alreadySpawned.length > 0 && (
                            <p className="rounded-md bg-amber-50 p-2.5 text-xs text-amber-800">
                                This job was already respawned as {alreadySpawned.map((j) => `PD#${j.job_number}`).join(', ')}. Only continue if you really want another one.
                            </p>
                        )}
                        <div className="space-y-3">
                            <Field label="Reason for respawning" required>
                                <Input value={spawn.reason} onChange={(e) => setSpawn({ ...spawn, reason: e.target.value })} className="h-11" autoFocus />
                            </Field>
                            <Field label="New title">
                                <Input value={spawn.title} onChange={(e) => setSpawn({ ...spawn, title: e.target.value })} placeholder="Optional — defaults to the same title" className="h-11" />
                            </Field>
                            <Field label="Target dispatch date">
                                <input type="date" value={spawn.date} onChange={(e) => setSpawn({ ...spawn, date: e.target.value })} className="h-11 w-full rounded-md border border-slate-200 px-3 text-sm" />
                            </Field>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" disabled={doSpawn.isPending} onClick={() => setSpawnOpen(false)}>Cancel</Button>
                            <Button disabled={!spawn.reason.trim() || doSpawn.isPending} onClick={() => doSpawn.mutate()}>
                                {doSpawn.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Yes, create new job
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {tab === 'comments' && (
                    <div className="mt-4 space-y-2">
                        {canEdit && (
                            <div className="flex gap-2">
                                <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment…" className="h-10 text-sm" />
                                <Button size="sm" className="h-10" disabled={!comment.trim() || postComment.isPending} onClick={() => postComment.mutate()}>Post</Button>
                            </div>
                        )}
                        {cList.slice(cPage * C_SIZE, (cPage + 1) * C_SIZE).map((c) => (
                            <div key={c.id} className="rounded-md bg-slate-50 p-2.5 text-sm">
                                <p className="break-words">{c.body}</p>
                                <p className="mt-0.5 text-xs text-slate-500">{nameById[c.author_id] || c.author_id} · {fmtLong(c.created_at)}</p>
                            </div>
                        ))}
                        {cList.length === 0 && <p className="py-4 text-center text-xs text-slate-500">No comments yet.</p>}
                        <MiniPager page={Math.min(cPage, cCount - 1)} pageCount={cCount} onPage={setCPage} />
                    </div>
                )}

                {tab === 'history' && (
                    <div className="mt-4 space-y-2">
                        {hList.slice(hPage * H_SIZE, (hPage + 1) * H_SIZE).map((item, i) => {
                            if (item.kind === 'divider') {
                                return (
                                    <p key={`d-${item.job.id}`} className="flex items-center gap-1.5 pt-2 text-xs font-semibold text-violet-700">
                                        <RotateCcw className="h-3 w-3 shrink-0" />
                                        <span className="min-w-0 truncate">Earlier history — PD#{item.job.job_number} {item.job.title}</span>
                                    </p>
                                );
                            }
                            if (item.kind === 'none') return <p key={`n-${i}`} className="pl-3 text-xs text-slate-500">No stage changes were recorded.</p>;
                            const h = item.h;
                            return (
                                <div key={h.id} className={cn('border-l-2 pl-3 text-sm', item.earlier ? 'border-violet-200' : 'border-slate-200')}>
                                    {h.from_stage ? stages.label(h.from_stage) : 'Created'} → {stages.label(h.to_stage)}
                                    {h.note ? <span className="text-slate-600"> — {h.note}</span> : null}
                                    <span className="block text-xs text-slate-500">{fmtLong(h.changed_at)} · {nameById[h.changed_by] || h.changed_by}</span>
                                </div>
                            );
                        })}
                        {hList.length === 0 && <p className="py-4 text-center text-xs text-slate-500">No stage changes yet.</p>}
                        <MiniPager page={Math.min(hPage, hCount - 1)} pageCount={hCount} onPage={setHPage} />
                    </div>
                )}
            </SheetContent>
        </Sheet>
    );
}

export function DmtPdCycle() {
    const { user } = useDmtMe();
    const me = user?.emp_id;
    // Everyone can view; BE Admin + people listed on Organisation → PD Cycle Edit Access can edit.
    const accessQ = useQuery({ queryKey: ['dmt', 'pd-edit-access', me], queryFn: dmtApi.pdEditAccessMe, enabled: !!me });
    const canEdit = !!accessQ.data?.can_edit;
    const jobsQ = usePdJobs();
    const jobs = jobsQ.data || [];
    const catsQ = usePdCategories();
    const categories = catsQ.data || [];
    const catById = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c.name])), [categories]);
    const stages = usePdStages();
    const numberById = useMemo(() => Object.fromEntries(jobs.map((j) => [j.id, j.job_number])), [jobs]);

    const [view, setView] = useState('kanban');
    const [search, setSearch] = useState('');
    const [chips, setChips] = useState(new Set());
    const [customer, setCustomer] = useState('all');
    const [category, setCategory] = useState('all');
    const [dueFilter, setDueFilter] = useState(null); // overdue | week | month | none — set from the Analytics panel
    const [analyticsOpen, setAnalyticsOpen] = useState(false);
    const [mineOnly, setMineOnly] = useState(false);
    const [openId, setOpenId] = useState(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [form, setForm] = useState({ title: '', category_id: '', customer: '', product: '', substrate: '', target_dispatch_date: '' });
    const [colPage, setColPage] = useState({}); // per kanban column
    // Which kanban columns this person wants to see — remembered per person in this browser (same as the Task Board).
    const colsKey = `dmt_pdcycle_cols_${me || 'anon'}`;
    const [hiddenCols, setHiddenCols] = useState(() => new Set());
    useEffect(() => {
        try {
            const raw = safeStorage.getItem(colsKey);
            setHiddenCols(new Set(raw ? JSON.parse(raw) : []));
        } catch { setHiddenCols(new Set()); }
    }, [colsKey]);
    const shownCols = stages.columns.filter((c) => !hiddenCols.has(c.key));
    const toggleCol = (key) => setHiddenCols((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else if (shownCols.length > 1) next.add(key); // always keep at least one column
        else return prev;
        try { safeStorage.setItem(colsKey, JSON.stringify([...next])); } catch { /* storage unavailable */ }
        return next;
    });
    const pageSize = colPageSize(shownCols.length);
    const [listPage, setListPage] = useState(0);
    const [listSize, setListSize] = useState(6);

    const customers = useMemo(() => [...new Set(jobs.map((j) => j.customer).filter(Boolean))].sort(), [jobs]);
    // Filters other than the due-date one: these also decide what the Analytics panel counts.
    const baseFiltered = useMemo(() => jobs.filter((j) => {
        if (!pdJobMatchesQuery(j, search)) return false;
        if (chips.size > 0 && !chips.has(j.stage)) return false;
        if (customer !== 'all' && j.customer !== customer) return false;
        if (category !== 'all' && (category === 'none' ? j.category_id : j.category_id !== category)) return false;
        if (mineOnly && j.created_by !== me) return false;
        return true;
    }), [jobs, search, chips, customer, category, mineOnly, me]);
    // A tile tapped in the Analytics panel narrows the board to that due-date bucket.
    const filtered = useMemo(
        () => (dueFilter ? baseFiltered.filter((j) => matchesDue(dueFilter, j, stages.isClosing)) : baseFiltered),
        [baseFiltered, dueFilter, stages],
    );

    // Any filter change starts every pager back at page 1.
    useEffect(() => { setColPage({}); setListPage(0); }, [search, chips, customer, category, mineOnly, dueFilter, pageSize]);

    const stageCount = useMemo(() => {
        const n = {};
        jobs.forEach((j) => { n[j.stage] = (n[j.stage] || 0) + 1; });
        return n;
    }, [jobs]);

    const toggleChip = (s) => setChips((prev) => {
        const n = new Set(prev);
        if (n.has(s)) n.delete(s); else n.add(s);
        return n;
    });

    const create = useMutation({
        mutationFn: async () => {
            const factory = await dmtApi.myFactory();
            return dmtApi.create('pd-jobs', {
                factory_id: factory?.id,
                title: form.title.trim(),
                customer: form.customer.trim() || null,
                product: form.product.trim() || null,
                substrate: form.substrate.trim() || null,
                target_dispatch_date: form.target_dispatch_date || null,
                category_id: form.category_id,
                created_by: me,
            });
        },
        onSuccess: () => {
            toast.success('PD job created');
            setForm({ title: '', category_id: '', customer: '', product: '', substrate: '', target_dispatch_date: '' });
            setCreateOpen(false);
            jobsQ.refetch();
        },
        onError: (e) => toast.error(e.message),
    });

    const openJob = jobs.find((j) => j.id === openId) || null;
    const listCount = Math.max(1, Math.ceil(filtered.length / listSize));
    const safeListPage = Math.min(listPage, listCount - 1);
    const listRows = filtered.slice(safeListPage * listSize, (safeListPage + 1) * listSize);

    return (
        <div className="mx-auto max-w-[1600px] space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600"><Lightbulb className="h-5 w-5" /></div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-900">PD Cycle</h1>
                        <p className="text-xs text-slate-500">Product development jobs through their lifecycle</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex overflow-hidden rounded-md border border-slate-200">
                        <button type="button" aria-label="Board view" onClick={() => setView('kanban')} className={cn('px-2.5 py-2', view === 'kanban' ? 'bg-slate-900 text-white' : 'bg-white text-slate-500')}><Columns3 className="h-4 w-4" /></button>
                        <button type="button" aria-label="List view" onClick={() => setView('list')} className={cn('px-2.5 py-2', view === 'list' ? 'bg-slate-900 text-white' : 'bg-white text-slate-500')}><ListTodo className="h-4 w-4" /></button>
                    </div>
                    <Button size="sm" variant="outline" className="h-9 gap-1" onClick={() => setAnalyticsOpen(true)}>
                        <BarChart3 className="h-3.5 w-3.5" /> Analytics
                    </Button>
                    {view === 'kanban' && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button size="sm" variant="outline" className="h-9 gap-1"><SlidersHorizontal className="h-3.5 w-3.5" /> Columns</Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                                {stages.columns.map((c) => (
                                    <DropdownMenuCheckboxItem
                                        key={c.key}
                                        checked={!hiddenCols.has(c.key)}
                                        onCheckedChange={() => toggleCol(c.key)}
                                        onSelect={(e) => e.preventDefault()}
                                    >
                                        {c.label}
                                    </DropdownMenuCheckboxItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                    {canEdit && <Button size="sm" className="h-9" onClick={() => setCreateOpen(true)}><Plus className="mr-1 h-4 w-4" /> New PD Job</Button>}
                </div>
            </div>

            <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative min-w-[200px] max-w-md flex-1">
                        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <Input placeholder="Search title, customer, PD#…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
                        {search && <button type="button" aria-label="Clear search" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"><X className="h-4 w-4" /></button>}
                    </div>
                    <Select value={customer} onValueChange={setCustomer}>
                        <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All customers</SelectItem>
                            {customers.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Select value={category} onValueChange={setCategory}>
                        <SelectTrigger className="w-[180px]" aria-label="Category"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All categories</SelectItem>
                            {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}{c.is_active ? '' : ' (off)'}</SelectItem>)}
                            <SelectItem value="none">Uncategorised</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex flex-wrap gap-1.5">
                    {stages.live.map(({ key, label }) => (
                        <button key={key} type="button" onClick={() => toggleChip(key)}
                            className={cn('rounded-full border px-2.5 py-1 text-xs transition-colors',
                                chips.has(key) ? cn(stages.pill(key), 'border-transparent') : 'border-slate-200 text-slate-600 hover:bg-slate-100')}>
                            {label} <span className="ml-0.5 font-semibold">{stageCount[key] || 0}</span>
                        </button>
                    ))}
                    <button type="button" onClick={() => setMineOnly((v) => !v)}
                        className={cn('rounded-full border px-2.5 py-1 text-xs', mineOnly ? 'border-transparent bg-blue-100 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-100')}>
                        My jobs
                    </button>
                    {dueFilter && (
                        <button type="button" onClick={() => setDueFilter(null)}
                            className="flex items-center gap-1 rounded-full border border-transparent bg-rose-100 px-2.5 py-1 text-xs text-rose-700">
                            {DUE_LABEL[dueFilter]} <X className="h-3 w-3" />
                        </button>
                    )}
                </div>
            </div>

            {jobsQ.isLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
            ) : jobs.length === 0 ? (
                <div className="py-16 text-center">
                    <p className="text-sm font-semibold text-slate-700">No PD jobs yet</p>
                    <p className="mt-1 text-sm text-slate-500">PD jobs track product development from upcoming work to customer feedback.</p>
                </div>
            ) : view === 'kanban' ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-[repeat(auto-fit,minmax(250px,1fr))]">
                    {shownCols.map((col) => {
                        const colJobs = filtered.filter((j) => stages.columnFor(j.stage) === col.key);
                        const pages = Math.max(1, Math.ceil(colJobs.length / pageSize));
                        const page = Math.min(colPage[col.key] || 0, pages - 1);
                        const visible = colJobs.slice(page * pageSize, (page + 1) * pageSize);
                        return (
                            <div key={col.key} className="min-w-0">
                                <div className="mb-2 flex items-center justify-between px-1">
                                    <h3 className="text-sm font-semibold text-slate-800">{col.label}</h3>
                                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">{colJobs.length}</span>
                                </div>
                                <div className="space-y-2 rounded-lg bg-slate-100 p-2">
                                    {visible.length === 0
                                        ? <p className="flex h-[136px] items-center justify-center text-xs text-slate-500">No jobs</p>
                                        : visible.map((j) => <JobCard key={j.id} job={j} stages={stages} catName={catById[j.category_id]} fromNumber={numberById[j.previous_job_id]} showStage={col.key === 'closed'} onOpen={setOpenId} />)}
                                    <MiniPager page={page} pageCount={pages} onPage={(p) => setColPage((s) => ({ ...s, [col.key]: p }))} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div>
                    {filtered.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No matching jobs.</p>}
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                        {listRows.map((j) => <JobCard key={j.id} job={j} stages={stages} catName={catById[j.category_id]} fromNumber={numberById[j.previous_job_id]} onOpen={setOpenId} />)}
                    </div>
                    <ListPager
                        total={filtered.length} noun="jobs" page={safeListPage} pageCount={listCount} pageSize={listSize}
                        pageSizeOptions={[6, 12, 24]} onPage={setListPage} onPageSize={(n) => { setListSize(n); setListPage(0); }}
                    />
                </div>
            )}

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Create PD Job</DialogTitle>
                        <DialogDescription>New jobs start in {stages.active[0]?.label || 'the first stage'}. Job number is auto-assigned.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <Field label="Title" required>
                            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="h-11" />
                        </Field>
                        <Field label="Category" required>
                            <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                                <SelectTrigger className="h-11" aria-label="Category"><SelectValue placeholder="Select a category" /></SelectTrigger>
                                <SelectContent>
                                    {categories.filter((c) => c.is_active).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </Field>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Customer">
                                <Input value={form.customer} onChange={(e) => setForm({ ...form, customer: e.target.value })} className="h-11" />
                            </Field>
                            <Field label="Product">
                                <Input value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })} className="h-11" />
                            </Field>
                            <Field label="Substrate">
                                <Input value={form.substrate} onChange={(e) => setForm({ ...form, substrate: e.target.value })} className="h-11" />
                            </Field>
                            <Field label="Target dispatch date">
                                <input type="date" value={form.target_dispatch_date} onChange={(e) => setForm({ ...form, target_dispatch_date: e.target.value })} className="h-11 w-full rounded-md border border-slate-200 px-3 text-sm" />
                            </Field>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                        <Button disabled={!form.title.trim() || !form.category_id || create.isPending} onClick={() => create.mutate()}>
                            {create.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Create Job
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <DmtPdAnalyticsSheet
                open={analyticsOpen} onOpenChange={setAnalyticsOpen} jobs={baseFiltered} stages={stages}
                onPick={(kind) => { setDueFilter(kind); setAnalyticsOpen(false); }}
            />

            {openJob && (
                <PdJobDrawer job={openJob} jobs={jobs} canEdit={canEdit} categories={categories} stages={stages} onClose={() => setOpenId(null)} onOpenJob={(id) => setOpenId(id)} />
            )}
        </div>
    );
}
