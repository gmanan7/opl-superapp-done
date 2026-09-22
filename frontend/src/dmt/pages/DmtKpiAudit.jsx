import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Pencil } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { dmtApi } from '../lib/dmtApi';
import { RAG_CLASSES } from '../lib/dmtRag';
import { formatIndianNumber } from '../lib/dmtFormat';
import { todayStr } from '../lib/dmtDates';
import { ListPager } from '@/components/patterns/ListPager';
import { KpiFilterBar, optionsFrom, deptLabel } from './DmtKpiFilters';
import { useDmtModules } from '../lib/useDmtKpi';

function yesterday() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const when = (ts) => new Date(ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const show = (num, text) => (num !== null && num !== undefined ? formatIndianNumber(num) : (text || '—'));

// Organisation → "KPI Audit Trail": for one chosen day, who submitted each KPI, the value, and
// every later edit (old → new, who, when).
export function DmtKpiAudit() {
    const [date, setDate] = useState(yesterday);
    const q = useQuery({
        queryKey: ['dmt', 'kpi-entry-audit', date],
        queryFn: () => dmtApi.kpiEntryAudit(date),
        enabled: !!date,
    });
    const modules = useDmtModules();
    const allEntries = q.data?.entries || [];

    const [search, setSearch] = useState('');
    const [mod, setMod] = useState('all');
    const [dept, setDept] = useState('all');
    const [group, setGroup] = useState('all');
    const [who, setWho] = useState('all');
    const [status, setStatus] = useState('all');
    const [editedOnly, setEditedOnly] = useState(false);
    const [lateOnly, setLateOnly] = useState(false);
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(10);
    const resetPage = (fn) => (v) => { fn(v); setPage(0); };
    // Cascading filters: Module -> Department -> Group. Each dropdown only offers what exists
    // under the choices above it, and changing a higher one clears the ones below.
    const pickMod = (v) => { setMod(v); setDept('all'); setGroup('all'); setPage(0); };
    const pickDept = (v) => { setDept(v); setGroup('all'); setPage(0); };
    const deptPool = allEntries.filter((e) => mod === 'all' || e.module === mod);
    const groupPool = deptPool.filter((e) => dept === 'all' || e.department === dept);

    // "Person" matches the first submitter OR anyone who later edited that value.
    const involved = (e) => [e.submitted_by_name || e.submitted_by, ...e.edits.map((x) => x.changed_by_name || x.changed_by)];
    const entries = useMemo(() => allEntries.filter((e) =>
        (!search || e.kpi_name.toLowerCase().includes(search.trim().toLowerCase()))
        && (mod === 'all' || e.module === mod)
        && (dept === 'all' || e.department === dept)
        && (group === 'all' || e.group_label === group)
        && (who === 'all' || involved(e).includes(who))
        && (status === 'all' || e.computed_status === status)
        && (!editedOnly || e.edits.length > 0)
        && (!lateOnly || e.is_late_entry)
    ), [allEntries, search, mod, dept, group, who, status, editedOnly, lateOnly]);
    const pageCount = Math.max(1, Math.ceil(entries.length / pageSize));
    const safePage = Math.min(page, pageCount - 1);
    const pageRows = entries.slice(safePage * pageSize, (safePage + 1) * pageSize);

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Date</label>
                    <input
                        type="date"
                        value={date}
                        max={todayStr()}
                        onChange={(e) => setDate(e.target.value || date)}
                        className="block h-11 w-full rounded-md border border-slate-200 px-3 text-sm sm:w-48"
                    />
                </div>
                {q.data && <p className="text-sm text-slate-600"><span className="font-semibold text-slate-900">{allEntries.length}</span> KPI{allEntries.length === 1 ? '' : 's'} submitted for this day</p>}
            </div>

            {q.isLoading && <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>}
            {q.error && <p className="text-sm text-rose-600">{q.error.message}</p>}
            {q.data && allEntries.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No KPI values were submitted for this day.</p>}
            {q.data && allEntries.length > 0 && (
                <KpiFilterBar
                    search={search} onSearch={resetPage(setSearch)}
                    selects={[
                        { label: 'Module', value: mod, onChange: pickMod, options: optionsFrom((modules.data || []).map((m) => m.name)) },
                        { label: 'Department', value: dept, onChange: pickDept, options: optionsFrom(deptPool.map((e) => e.department)) },
                        { label: 'Group', value: group, onChange: resetPage(setGroup), options: optionsFrom(groupPool.map((e) => e.group_label)) },
                        { label: 'Person', value: who, onChange: resetPage(setWho), options: optionsFrom(allEntries.flatMap(involved)) },
                        { label: 'Status', value: status, onChange: resetPage(setStatus), options: [{ value: 'red', label: 'Red' }, { value: 'amber', label: 'Amber' }, { value: 'green', label: 'Green' }] },
                    ]}
                    toggles={[
                        { label: 'Edited only', checked: editedOnly, onChange: resetPage(setEditedOnly) },
                        { label: 'Late only', checked: lateOnly, onChange: resetPage(setLateOnly) },
                    ]}
                    onClear={() => { setSearch(''); setMod('all'); setDept('all'); setGroup('all'); setWho('all'); setStatus('all'); setEditedOnly(false); setLateOnly(false); setPage(0); }}
                />
            )}
            {q.data && allEntries.length > 0 && entries.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No entries match these filters.</p>}

            <div className="space-y-3">
                {pageRows.map((e) => (
                    <div key={e.id} className="rounded-lg border border-slate-200 bg-white p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-900">{e.kpi_name}</p>
                                <p className="text-xs text-slate-500">{[deptLabel(e.module, e.department), e.group_label].filter(Boolean).join(' · ') || '—'}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-base font-bold text-slate-900">{show(e.actual_value, e.text_value)}{e.unit && e.actual_value !== null ? ` ${e.unit}` : ''}</span>
                                {e.computed_status && <Badge className={`text-xs ${RAG_CLASSES[e.computed_status] || ''}`}>{e.computed_status.toUpperCase()}</Badge>}
                                {e.is_late_entry && <Badge className="bg-amber-50 text-xs text-amber-700">Late</Badge>}
                            </div>
                        </div>
                        <p className="mt-2 text-xs text-slate-600">
                            Submitted by <span className="font-medium text-slate-800">{e.submitted_by_name || e.submitted_by}</span> on {when(e.submitted_at)}
                            {e.remarks ? <span className="text-slate-400"> · “{e.remarks}”</span> : null}
                        </p>
                        {e.edits.length > 0 && (
                            <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
                                {e.edits.map((ed, i) => (
                                    <p key={i} className="flex flex-wrap items-center gap-x-1.5 text-xs text-slate-600">
                                        <Pencil className="h-3 w-3 text-blue-600" />
                                        <span>Edited by <span className="font-medium text-slate-800">{ed.changed_by_name || ed.changed_by}</span> on {when(ed.changed_at)}:</span>
                                        <span className="font-medium text-slate-800">{show(ed.old_actual, ed.old_text)} → {show(ed.new_actual, ed.new_text)}</span>
                                        {(ed.old_remarks || '') !== (ed.new_remarks || '') && (
                                            <span className="text-slate-400">(remarks: “{ed.old_remarks || '—'}” → “{ed.new_remarks || '—'}”)</span>
                                        )}
                                    </p>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
            <ListPager
                total={entries.length} noun="entries" page={safePage} pageCount={pageCount} pageSize={pageSize}
                pageSizeOptions={[10, 25, 50]} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(0); }}
            />
        </div>
    );
}
