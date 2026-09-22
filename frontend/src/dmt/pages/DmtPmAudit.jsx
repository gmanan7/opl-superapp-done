import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { dmtApi } from '../lib/dmtApi';
import { todayStr } from '../lib/dmtDates';
import { ListPager } from '@/components/patterns/ListPager';
import { KpiFilterBar, optionsFrom, deptLabel } from './DmtKpiFilters';
import { useDmtModules } from '../lib/useDmtKpi';

// Every kind of change recorded on the PM Schedule, its plain label and badge colour.
const EVENTS = {
    plan_added: { label: 'Planned', tone: 'bg-blue-50 text-blue-700' },
    plan_removed: { label: 'Plan removed', tone: 'bg-slate-100 text-slate-600' },
    actual_recorded: { label: 'Marked done', tone: 'bg-emerald-50 text-emerald-700' },
    actual_edited: { label: 'Remarks edited', tone: 'bg-amber-50 text-amber-700' },
    actual_removed: { label: 'Done record removed', tone: 'bg-rose-50 text-rose-700' },
    machine_added: { label: 'Machine added to calendar', tone: 'bg-violet-50 text-violet-700' },
    machine_removed: { label: 'Machine removed from calendar', tone: 'bg-rose-50 text-rose-700' },
    access_granted: { label: 'Edit access given', tone: 'bg-indigo-50 text-indigo-700' },
    access_removed: { label: 'Edit access removed', tone: 'bg-rose-50 text-rose-700' },
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// 'YYYY-MM-DD' -> '24 Sep 2026' without going through Date (avoids the timezone day-shift).
const fmtDay = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-'); return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`; };
const when = (ts) => new Date(ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// What happened, in a sentence, for the card body.
function detail(e) {
    switch (e.event) {
    case 'plan_added': return `PM planned for ${fmtDay(e.event_date)}`;
    case 'plan_removed': return `Plan for ${fmtDay(e.event_date)} removed`;
    case 'actual_recorded': return `Marked done for ${fmtDay(e.event_date)}${e.new_text ? ` — “${e.new_text}”` : ''}`;
    case 'actual_edited': return `Remarks for ${fmtDay(e.event_date)} changed: “${e.old_text || '—'}” → “${e.new_text || '—'}”`;
    case 'actual_removed': return `Done record for ${fmtDay(e.event_date)} removed${e.old_text ? ` (was “${e.old_text}”)` : ''}`;
    case 'access_granted': return `${e.target_name || e.target_emp_id} can now edit the PM Schedule`;
    case 'access_removed': return `${e.target_name || e.target_emp_id} can no longer edit the PM Schedule`;
    default: return null; // machine added / removed: the machine name says it all
    }
}

// Organisation → "PM Schedule Audit Trail": every change to the PM Schedule (plans, done records,
// machines on the calendar, and who may edit), newest first, for a chosen date range.
export function DmtPmAudit() {
    const [from, setFrom] = useState(() => daysAgo(30));
    const [to, setTo] = useState(() => todayStr());
    const q = useQuery({
        queryKey: ['dmt', 'pm-audit', from, to],
        queryFn: () => dmtApi.pmAudit(from, to),
        enabled: !!from && !!to,
    });
    const modules = useDmtModules();
    const all = q.data?.entries || [];

    const [search, setSearch] = useState('');
    const [mod, setMod] = useState('all');
    const [event, setEvent] = useState('all');
    const [who, setWho] = useState('all');
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(10);
    const resetPage = (fn) => (v) => { fn(v); setPage(0); };

    const entries = useMemo(() => all.filter((e) =>
        (!search || (e.machine_name || '').toLowerCase().includes(search.trim().toLowerCase()))
        && (mod === 'all' || e.module === mod)
        && (event === 'all' || e.event === event)
        && (who === 'all' || (e.changed_by_name || e.changed_by) === who)
    ), [all, search, mod, event, who]);
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
            {q.data && all.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No PM Schedule changes were recorded in this period.</p>}

            {q.data && all.length > 0 && (
                <KpiFilterBar
                    search={search} onSearch={resetPage(setSearch)} searchPlaceholder="Search machine…"
                    selects={[
                        { label: 'Module', value: mod, onChange: resetPage(setMod), options: optionsFrom((modules.data || []).map((m) => m.name)) },
                        { label: 'Change', value: event, onChange: resetPage(setEvent), options: Object.entries(EVENTS).map(([value, v]) => ({ value, label: v.label })) },
                        { label: 'Person', value: who, onChange: resetPage(setWho), options: optionsFrom(all.map((e) => e.changed_by_name || e.changed_by)) },
                    ]}
                    onClear={() => { setSearch(''); setMod('all'); setEvent('all'); setWho('all'); setPage(0); }}
                />
            )}
            {q.data && all.length > 0 && entries.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No changes match these filters.</p>}

            <div className="space-y-2">
                {rows.map((e) => {
                    const ev = EVENTS[e.event] || { label: e.event, tone: 'bg-slate-100 text-slate-600' };
                    const isAccess = e.event.startsWith('access_');
                    const sub = isAccess ? null : deptLabel(e.module, e.machine_type);
                    return (
                        <div key={e.id} className="rounded-lg border border-slate-200 bg-white p-3">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                    <Badge className={`text-xs ${ev.tone}`}>{ev.label}</Badge>
                                    {!isAccess && <span className="text-sm font-semibold text-slate-900">{e.machine_name || 'Unknown machine'}</span>}
                                    {sub && <span className="text-xs text-slate-500">{sub}</span>}
                                </div>
                                <span className="text-xs text-slate-400">{when(e.changed_at)}</span>
                            </div>
                            {detail(e) && <p className="mt-1.5 text-sm text-slate-700">{detail(e)}</p>}
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
