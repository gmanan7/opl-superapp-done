import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Plus, Search, X, Columns3, ListTodo, Lightbulb, RotateCcw, Loader2, ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Badge } from '../../components/ui/badge';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '../../components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../../components/ui/sheet';
import { cn } from '../../lib/utils';
import { dmtApi } from '../lib/dmtApi';
import { useDmtMe } from '../lib/useDmt';
import { useDmtWorkers } from '../lib/useDmtTasks';
import {
    PD_STAGE_LABEL, PD_STAGE_PILL, KANBAN_COLUMNS, isTerminalStage, nextStageOptions,
    validateStageChange, ageInDays, pdJobMatchesQuery, columnForStage,
} from '../lib/pdCycle';
import { fmtLong } from '../lib/dmtDates';

const STAGE_CHIPS = [
    ['upcoming', 'Upcoming'], ['in_process', 'In Process'], ['processing_finished', 'Processing Finished'],
    ['feedback_approved', 'Approved'], ['feedback_rejected', 'Rejected'], ['abandoned', 'Abandoned'],
];

function usePdJobs() {
    return useQuery({
        queryKey: ['dmt', 'pd-jobs'],
        queryFn: async () => {
            const rows = await dmtApi.list('pd-jobs');
            return rows.slice().sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
        },
    });
}

function PdJobDrawer({ job, jobs, canManage, onClose, onOpenJob }) {
    const qc = useQueryClient();
    const { user } = useDmtMe();
    const workers = useDmtWorkers();
    const nameById = Object.fromEntries((workers.data || []).map((w) => [w.id || w.emp_id, w.name]));

    const [tab, setTab] = useState('main');
    const [comment, setComment] = useState('');
    const [stageForm, setStageForm] = useState({ next: '', note: '', feedback: '' });
    const [spawn, setSpawn] = useState({ title: '', reason: '', date: '' });
    const [edit, setEdit] = useState(null);

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
    };

    const postComment = useMutation({
        mutationFn: () => dmtApi.create('pd-job-comments', { job_id: job.id, author_id: user.emp_id, body: comment.trim() }),
        onSuccess: () => { setComment(''); refresh(); },
        onError: (e) => toast.error(e.message),
    });
    const changeStage = useMutation({
        mutationFn: () => dmtApi.setPdStage(job.id, stageForm.next, stageForm.note || null, stageForm.feedback || null),
        onSuccess: () => { toast.success('Stage updated'); setStageForm({ next: '', note: '', feedback: '' }); refresh(); },
        onError: (e) => toast.error(e.message),
    });
    const doSpawn = useMutation({
        mutationFn: () => dmtApi.spawnPdJob(job.id, spawn.reason, spawn.title || null, spawn.date || null),
        onSuccess: (newJob) => { toast.success('New PD job created'); setSpawn({ title: '', reason: '', date: '' }); refresh(); onOpenJob(newJob.id); },
        onError: (e) => toast.error(e.message),
    });
    const saveEdit = useMutation({
        mutationFn: () => dmtApi.update('pd-jobs', job.id, edit),
        onSuccess: () => { toast.success('Job updated'); setEdit(null); refresh(); },
        onError: (e) => toast.error(e.message),
    });

    if (!job) return null;
    const opts = nextStageOptions(job.stage);
    const terminal = isTerminalStage(job.stage);
    const prev = job.previous_job_id ? jobs.find((j) => j.id === job.previous_job_id) : null;

    return (
        <Sheet open onOpenChange={(v) => !v && onClose()}>
            <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
                <SheetHeader>
                    <SheetTitle className="text-base">PD#{job.job_number} — {job.title}</SheetTitle>
                </SheetHeader>

                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <Badge className={cn('border-0', PD_STAGE_PILL[job.stage])}>{PD_STAGE_LABEL[job.stage]}</Badge>
                    <span>Created by {nameById[job.created_by] || job.created_by}</span>
                    {prev && (
                        <button type="button" className="inline-flex items-center gap-1 text-blue-600" onClick={() => onOpenJob(prev.id)}>
                            <RotateCcw className="h-3 w-3" /> from PD#{prev.job_number}
                        </button>
                    )}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-y-2 text-sm">
                    <div><span className="text-xs text-slate-400">Customer</span><p>{job.customer || '—'}</p></div>
                    <div><span className="text-xs text-slate-400">Product</span><p>{job.product || '—'}</p></div>
                    <div><span className="text-xs text-slate-400">Substrate</span><p>{job.substrate || '—'}</p></div>
                    <div><span className="text-xs text-slate-400">Target dispatch</span><p>{job.target_dispatch_date ? fmtLong(job.target_dispatch_date) : '—'}</p></div>
                </div>
                {job.feedback_note && (
                    <div className="mt-3 rounded-md bg-slate-50 p-3 text-sm"><span className="text-xs text-slate-400">Feedback / reason</span><p>{job.feedback_note}</p></div>
                )}

                {canManage && !terminal && (
                    <div className="mt-4 space-y-2">
                        {edit ? (
                            <div className="space-y-2 rounded-lg border border-slate-200 p-3">
                                <Input placeholder="Title" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} className="h-10" />
                                <div className="grid grid-cols-2 gap-2">
                                    <Input placeholder="Customer" value={edit.customer || ''} onChange={(e) => setEdit({ ...edit, customer: e.target.value })} className="h-10" />
                                    <Input placeholder="Product" value={edit.product || ''} onChange={(e) => setEdit({ ...edit, product: e.target.value })} className="h-10" />
                                    <Input placeholder="Substrate" value={edit.substrate || ''} onChange={(e) => setEdit({ ...edit, substrate: e.target.value })} className="h-10" />
                                    <input type="date" value={edit.target_dispatch_date || ''} onChange={(e) => setEdit({ ...edit, target_dispatch_date: e.target.value })} className="h-10 rounded-md border border-slate-200 px-2 text-sm" />
                                </div>
                                <div className="flex gap-2">
                                    <Button size="sm" onClick={() => saveEdit.mutate()} disabled={saveEdit.isPending}>Save</Button>
                                    <Button size="sm" variant="outline" onClick={() => setEdit(null)}>Cancel</Button>
                                </div>
                            </div>
                        ) : (
                            <Button size="sm" variant="outline" onClick={() => setEdit({ title: job.title, customer: job.customer, product: job.product, substrate: job.substrate, target_dispatch_date: job.target_dispatch_date })}>Edit details</Button>
                        )}

                        {opts.length > 0 && (
                            <div className="space-y-2 rounded-lg border border-slate-200 p-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Move stage</p>
                                <Select value={stageForm.next} onValueChange={(v) => setStageForm({ ...stageForm, next: v })}>
                                    <SelectTrigger className="h-10"><SelectValue placeholder="Next stage…" /></SelectTrigger>
                                    <SelectContent>{opts.map((s) => <SelectItem key={s} value={s}>{PD_STAGE_LABEL[s]}</SelectItem>)}</SelectContent>
                                </Select>
                                {(stageForm.next === 'feedback_rejected' || stageForm.next === 'abandoned') && (
                                    <Input placeholder="Feedback note (required)" value={stageForm.feedback} onChange={(e) => setStageForm({ ...stageForm, feedback: e.target.value })} className="h-10" />
                                )}
                                <Input placeholder="Note (optional)" value={stageForm.note} onChange={(e) => setStageForm({ ...stageForm, note: e.target.value })} className="h-10" />
                                <Button
                                    size="sm"
                                    disabled={!stageForm.next || changeStage.isPending}
                                    onClick={() => {
                                        const v = validateStageChange({ current: job.stage, next: stageForm.next, feedbackNote: stageForm.feedback });
                                        if (!v.ok) return toast.error(v.error);
                                        changeStage.mutate();
                                    }}
                                >
                                    <ArrowRight className="mr-1 h-3.5 w-3.5" /> Move
                                </Button>
                            </div>
                        )}
                    </div>
                )}

                {canManage && (job.stage === 'feedback_rejected' || job.stage === 'abandoned') && (
                    <div className="mt-4 space-y-2 rounded-lg border border-slate-200 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Respawn as new job</p>
                        <Input placeholder="New title (optional, defaults to same)" value={spawn.title} onChange={(e) => setSpawn({ ...spawn, title: e.target.value })} className="h-10" />
                        <Input placeholder="Respawn reason (required)" value={spawn.reason} onChange={(e) => setSpawn({ ...spawn, reason: e.target.value })} className="h-10" />
                        <input type="date" value={spawn.date} onChange={(e) => setSpawn({ ...spawn, date: e.target.value })} className="h-10 w-full rounded-md border border-slate-200 px-2 text-sm" />
                        <Button size="sm" disabled={!spawn.reason.trim() || doSpawn.isPending} onClick={() => doSpawn.mutate()}>Create respawn</Button>
                    </div>
                )}

                <div className="mt-5">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Comments</p>
                    <div className="space-y-2">
                        {(comments.data || []).map((c) => (
                            <div key={c.id} className="rounded-md bg-slate-50 p-2 text-sm">
                                <p>{c.body}</p>
                                <p className="text-xs text-slate-400">{nameById[c.author_id] || c.author_id} · {fmtLong(c.created_at)}</p>
                            </div>
                        ))}
                        {(comments.data || []).length === 0 && <p className="text-xs text-slate-400">No comments.</p>}
                    </div>
                    <div className="mt-2 flex gap-2">
                        <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment…" className="h-9 text-sm" />
                        <Button size="sm" disabled={!comment.trim() || postComment.isPending} onClick={() => postComment.mutate()}>Post</Button>
                    </div>
                </div>

                <div className="mt-5">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Stage history</p>
                    <div className="space-y-1">
                        {(history.data || []).slice().sort((a, b) => (a.changed_at || '').localeCompare(b.changed_at || '')).map((h) => (
                            <div key={h.id} className="border-l-2 border-slate-200 pl-2 text-xs">
                                {PD_STAGE_LABEL[h.from_stage] || 'created'} → {PD_STAGE_LABEL[h.to_stage]}
                                {h.note ? ` — ${h.note}` : ''}
                                <span className="block text-slate-400">{fmtLong(h.changed_at)} · {nameById[h.changed_by] || h.changed_by}</span>
                            </div>
                        ))}
                        {(history.data || []).length === 0 && <p className="text-xs text-slate-400">No stage changes yet.</p>}
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}

export function DmtPdCycle() {
    const { user, tierAtLeast } = useDmtMe();
    const me = user?.emp_id;
    const canManage = tierAtLeast('module_lead');
    const jobsQ = usePdJobs();
    const jobs = jobsQ.data || [];

    const [view, setView] = useState('kanban');
    const [search, setSearch] = useState('');
    const [chips, setChips] = useState(new Set());
    const [customer, setCustomer] = useState('all');
    const [mineOnly, setMineOnly] = useState(false);
    const [openId, setOpenId] = useState(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [form, setForm] = useState({ title: '', customer: '', product: '', substrate: '', target_dispatch_date: '' });

    const customers = useMemo(() => [...new Set(jobs.map((j) => j.customer).filter(Boolean))].sort(), [jobs]);
    const filtered = useMemo(() => jobs.filter((j) => {
        if (!pdJobMatchesQuery(j, search)) return false;
        if (chips.size > 0 && !chips.has(j.stage)) return false;
        if (customer !== 'all' && j.customer !== customer) return false;
        if (mineOnly && j.created_by !== me) return false;
        return true;
    }), [jobs, search, chips, customer, mineOnly, me]);

    const toggleChip = (s) => setChips((prev) => {
        const n = new Set(prev);
        n.has(s) ? n.delete(s) : n.add(s);
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
                created_by: me,
            });
        },
        onSuccess: () => {
            toast.success('PD job created');
            setForm({ title: '', customer: '', product: '', substrate: '', target_dispatch_date: '' });
            setCreateOpen(false);
            jobsQ.refetch();
        },
        onError: (e) => toast.error(e.message),
    });

    const openJob = jobs.find((j) => j.id === openId) || null;

    const card = (j) => (
        <button key={j.id} type="button" onClick={() => setOpenId(j.id)}
            className="w-full space-y-1.5 rounded-lg border border-slate-200 bg-white p-3 text-left transition-colors hover:border-blue-300">
            <div className="flex items-start justify-between gap-2">
                <span className="font-mono text-xs text-slate-400">PD#{j.job_number}</span>
                {isTerminalStage(j.stage) && <Badge className={cn('border-0 text-[10px]', PD_STAGE_PILL[j.stage])}>{PD_STAGE_LABEL[j.stage]}</Badge>}
            </div>
            <div className="line-clamp-2 text-sm font-medium">{j.title}</div>
            {j.customer && <div className="text-xs text-slate-400">Customer: {j.customer}</div>}
            <div className="text-xs text-slate-400">Target: {j.target_dispatch_date ? fmtLong(j.target_dispatch_date) : '—'}</div>
            <div className="text-[11px] text-slate-400">Age: {ageInDays(j.updated_at || j.created_at)}d</div>
        </button>
    );

    return (
        <div className="mx-auto max-w-[1600px] space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-blue-600"><Lightbulb className="h-5 w-5" /></div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-900">PD Cycle</h1>
                        <p className="text-xs text-slate-500">Product development jobs through their lifecycle</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex overflow-hidden rounded-md border border-slate-200">
                        <button type="button" onClick={() => setView('kanban')} className={cn('px-2 py-1.5', view === 'kanban' ? 'bg-slate-900 text-white' : 'bg-white text-slate-500')}><Columns3 className="h-4 w-4" /></button>
                        <button type="button" onClick={() => setView('list')} className={cn('px-2 py-1.5', view === 'list' ? 'bg-slate-900 text-white' : 'bg-white text-slate-500')}><ListTodo className="h-4 w-4" /></button>
                    </div>
                    {canManage && <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="mr-1 h-4 w-4" /> New PD Job</Button>}
                </div>
            </div>

            <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative min-w-[200px] max-w-md flex-1">
                        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <Input placeholder="Search title, customer, PD#…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
                        {search && <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"><X className="h-4 w-4" /></button>}
                    </div>
                    <Select value={customer} onValueChange={setCustomer}>
                        <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All customers</SelectItem>
                            {customers.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex flex-wrap gap-1.5">
                    {STAGE_CHIPS.map(([key, label]) => (
                        <button key={key} type="button" onClick={() => toggleChip(key)}
                            className={cn('rounded-full border px-2.5 py-1 text-xs transition-colors',
                                chips.has(key) ? cn(PD_STAGE_PILL[key], 'border-transparent') : 'border-slate-200 text-slate-500 hover:bg-slate-100')}>
                            {label}
                        </button>
                    ))}
                    <button type="button" onClick={() => setMineOnly((v) => !v)}
                        className={cn('rounded-full border px-2.5 py-1 text-xs', mineOnly ? 'border-transparent bg-blue-100 text-blue-700' : 'border-slate-200 text-slate-500 hover:bg-slate-100')}>
                        My jobs
                    </button>
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
                <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-3">
                    {KANBAN_COLUMNS.map((col) => {
                        const colJobs = filtered.filter((j) => columnForStage(j.stage) === col.key);
                        return (
                            <div key={col.key} className="w-72 flex-shrink-0 md:w-80">
                                <div className="mb-2 flex items-center justify-between">
                                    <h3 className="text-sm font-semibold text-slate-800">{col.label}</h3>
                                    <span className="text-xs text-slate-400">{colJobs.length}</span>
                                </div>
                                <div className="min-h-[200px] space-y-2 rounded-lg bg-slate-100 p-2">
                                    {colJobs.length === 0 ? <p className="py-6 text-center text-xs text-slate-400">No jobs</p> : colJobs.map(card)}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="space-y-2">
                    {filtered.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No matching jobs.</p>}
                    {filtered.map(card)}
                </div>
            )}

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Create PD Job</DialogTitle>
                        <DialogDescription>New jobs start in Upcoming. Job number is auto-assigned.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <Input placeholder="Title *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="h-11" />
                        <div className="grid grid-cols-2 gap-3">
                            <Input placeholder="Customer" value={form.customer} onChange={(e) => setForm({ ...form, customer: e.target.value })} className="h-11" />
                            <Input placeholder="Product" value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })} className="h-11" />
                            <Input placeholder="Substrate" value={form.substrate} onChange={(e) => setForm({ ...form, substrate: e.target.value })} className="h-11" />
                            <input type="date" value={form.target_dispatch_date} onChange={(e) => setForm({ ...form, target_dispatch_date: e.target.value })} className="h-11 rounded-md border border-slate-200 px-3 text-sm" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                        <Button disabled={!form.title.trim() || create.isPending} onClick={() => create.mutate()}>
                            {create.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Create Job
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {openJob && (
                <PdJobDrawer job={openJob} jobs={jobs} canManage={canManage} onClose={() => setOpenId(null)} onOpenJob={(id) => setOpenId(id)} />
            )}
        </div>
    );
}
