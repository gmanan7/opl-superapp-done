import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { dmtApi } from '../lib/dmtApi';
import { todayStr } from '../lib/dmtDates';
import { usePdStages } from '../lib/usePdStages';
import { ListPager } from '@/components/patterns/ListPager';
import { KpiFilterBar, optionsFrom } from './DmtKpiFilters';

// Every kind of change recorded on the PD Cycle, its plain label and badge colour.
const EVENTS = {
    job_created: { label: 'Job created', tone: 'bg-blue-50 text-blue-700' },
    job_edited: { label: 'Details edited', tone: 'bg-amber-50 text-amber-700' },
    stage_changed: { label: 'Stage moved', tone: 'bg-purple-50 text-purple-700' },
    comment_added: { label: 'Comment added', tone: 'bg-slate-100 text-slate-600' },
    respawned: { label: 'Respawned', tone: 'bg-emerald-50 text-emerald-700' },
    access_granted: { label: 'Edit access given', tone: 'bg-indigo-50 text-indigo-700' },
    access_removed: { label: 'Edit access removed', tone: 'bg-rose-50 text-rose-700' },
    category_added: { label: 'Category added', tone: 'bg-teal-50 text-teal-700' },
    category_renamed: { label: 'Category renamed', tone: 'bg-teal-50 text-teal-700' },
    category_activated: { label: 'Category turned on', tone: 'bg-teal-50 text-teal-700' },
    category_deactivated: { label: 'Category turned off', tone: 'bg-slate-100 text-slate-600' },
    stage_added: { label: 'Stage added', tone: 'bg-cyan-50 text-cyan-700' },
    stage_renamed: { label: 'Stage renamed', tone: 'bg-cyan-50 text-cyan-700' },
    stage_reordered: { label: 'Stages reordered', tone: 'bg-cyan-50 text-cyan-700' },
    stage_updated: { label: 'Stage rule changed', tone: 'bg-cyan-50 text-cyan-700' },
    stage_removed: { label: 'Stage removed', tone: 'bg-rose-50 text-rose-700' },
};

const when = (ts) => new Date(ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// What happened, in a sentence, for the card body.
function detail(e, stages) {
    switch (e.event) {
    case 'job_created': return `New PD job created in ${stages.label(e.to_stage) || 'the first stage'}`;
    case 'stage_changed': return `${e.from_stage ? stages.label(e.from_stage) : 'New'} → ${stages.label(e.to_stage)}${e.detail ? ` — ${e.detail}` : ''}`;
    case 'stage_added': return `New stage: ${e.detail}`;
    case 'stage_removed': return `Stage “${e.detail}” removed`;
    case 'comment_added': return e.detail ? `“${e.detail}”` : null;
    case 'access_granted': return `${e.target_name || e.target_emp_id} can now edit the PD Cycle`;
    case 'access_removed': return `${e.target_name || e.target_emp_id} can no longer edit the PD Cycle`;
    case 'category_added': return `New category “${e.detail}”`;
    case 'category_activated': return `Category “${e.detail}” can be used again`;
    case 'category_deactivated': return `Category “${e.detail}” can no longer be picked for new jobs`;
    default: return e.detail || null; // edited / respawned carry their own sentence
    }
}

// Organisation → "PD Cycle Audit Trail": every change to the PD Cycle (jobs, stages, comments and
// who may edit), newest first, for a chosen date range.
export function DmtPdAudit() {
    const stages = usePdStages();
    const [from, setFrom] = useState(() => daysAgo(30));
    const [to, setTo] = useState(() => todayStr());
    const q = useQuery({
        queryKey: ['dmt', 'pd-audit', from, to],
        queryFn: () => dmtApi.pdAudit(from, to),
        enabled: !!from && !!to,
    });
    const all = q.data?.entries || [];

    const [search, setSearch] = useState('');
    const [event, setEvent] = useState('all');
    const [who, setWho] = useState('all');
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(10);
    const resetPage = (fn) => (v) => { fn(v); setPage(0); };

    const entries = useMemo(() => all.filter((e) => {
        const s = search.trim().toLowerCase();
        const hay = `${e.job_title || ''} PD#${e.job_number ?? ''} ${e.customer || ''}`.toLowerCase();
        return (!s || hay.includes(s))
            && (event === 'all' || e.event === event)
            && (who === 'all' || (e.changed_by_name || e.changed_by) === who);
    }), [all, search, event, who]);
    const pageCount = Math.max(1, Math.ceil(entries.length / pageSize));
    const safePage = Math.min(page, pageCount - 1);
    const rows = entries.slice(safePage * pageSize, (safePage + 1) * pageSize);

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex flex-wrap items-end gap-3">
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-700">From</label>
                        <input type="date" value={from} max={to} onChange={(e) => { setFrom(e.target.value || from); setPage(0); }}
                            className="block h-11 w-full rounded-md border border-slate-200 px-3 text-sm sm:w-44" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-700">To</label>
                        <input type="date" value={to} min={from} max={todayStr()} onChange={(e) => { setTo(e.target.value || to); setPage(0); }}
                            className="block h-11 w-full rounded-md border border-slate-200 px-3 text-sm sm:w-44" />
                    </div>
                </div>
                {q.data && <p className="text-sm text-slate-600"><span className="font-semibold text-slate-900">{all.length}</span> change{all.length === 1 ? '' : 's'} in this period</p>}
            </div>

            {q.isLoading && <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>}
            {q.error && <p className="text-sm text-rose-600">{q.error.message}</p>}
            {q.data && all.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No PD Cycle changes were recorded in this period.</p>}

            {q.data && all.length > 0 && (
                <KpiFilterBar
                    search={search} onSearch={resetPage(setSearch)} searchPlaceholder="Search job, PD#, customer…"
                    selects={[
                        { label: 'Change', value: event, onChange: resetPage(setEvent), options: Object.entries(EVENTS).map(([value, v]) => ({ value, label: v.label })) },
                        { label: 'Person', value: who, onChange: resetPage(setWho), options: optionsFrom(all.map((e) => e.changed_by_name || e.changed_by)) },
                    ]}
                    onClear={() => { setSearch(''); setEvent('all'); setWho('all'); setPage(0); }}
                />
            )}
            {q.data && all.length > 0 && entries.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No changes match these filters.</p>}

            <div className="space-y-2">
                {rows.map((e) => {
                    const ev = EVENTS[e.event] || { label: e.event, tone: 'bg-slate-100 text-slate-600' };
                    // access / category / stage-list changes aren't about one job, so no job title on the card
                    const isAccess = e.event.startsWith('access_') || e.event.startsWith('category_')
                        || ['stage_added', 'stage_renamed', 'stage_reordered', 'stage_updated', 'stage_removed'].includes(e.event);
                    return (
                        <div key={e.id} className="rounded-lg border border-slate-200 bg-white p-3">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                    <Badge className={`text-xs ${ev.tone}`}>{ev.label}</Badge>
                                    {!isAccess && (
                                        <span className="text-sm font-semibold text-slate-900">
                                            {e.job_number != null && <span className="mr-1 font-mono text-xs font-normal text-slate-400">PD#{e.job_number}</span>}
                                            {e.job_title || 'Unknown job'}
                                        </span>
                                    )}
                                    {!isAccess && e.customer && <span className="text-xs text-slate-500">{e.customer}</span>}
                                    {!isAccess && e.category && <Badge className="border-0 bg-teal-50 text-[11px] text-teal-700">{e.category}</Badge>}
                                </div>
                                <span className="text-xs text-slate-400">{when(e.changed_at)}</span>
                            </div>
                            {detail(e, stages) && <p className="mt-1.5 text-sm text-slate-700">{detail(e, stages)}</p>}
                            <p className="mt-1 text-xs text-slate-500">By <span className="font-medium text-slate-700">{e.changed_by_name || e.changed_by}</span></p>
                        </div>
                    );
                })}
            </div>

            <ListPager
                total={entries.length} noun="changes" page={safePage} pageCount={pageCount} pageSize={pageSize}
                pageSizeOptions={[10, 25, 50]} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(0); }}
            />
        </div>
    );
}
