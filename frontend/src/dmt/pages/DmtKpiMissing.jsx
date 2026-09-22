import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { dmtApi } from '../lib/dmtApi';
import { todayStr } from '../lib/dmtDates';
import { ListPager } from '@/components/patterns/ListPager';
import { KpiFilterBar, optionsFrom, deptLabel } from './DmtKpiFilters';
import { useDmtModules } from '../lib/useDmtKpi';

function yesterday() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Organisation → "KPI Not Submitted": for one chosen day, which KPIs still have no value.
export function DmtKpiMissing() {
    const [date, setDate] = useState(yesterday);
    const q = useQuery({
        queryKey: ['dmt', 'kpi-entry-status', date],
        queryFn: () => dmtApi.kpiEntryStatus(date),
        enabled: !!date,
    });
    const modules = useDmtModules();
    const allMissing = q.data?.missing || [];
    const total = q.data?.total ?? 0;

    const [search, setSearch] = useState('');
    const [mod, setMod] = useState('all');
    const [dept, setDept] = useState('all');
    const [group, setGroup] = useState('all');
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(10);
    const resetPage = (fn) => (v) => { fn(v); setPage(0); };
    // Cascading filters: Module -> Department -> Group. Each dropdown only offers what exists
    // under the choices above it, and changing a higher one clears the ones below.
    const pickMod = (v) => { setMod(v); setDept('all'); setGroup('all'); setPage(0); };
    const pickDept = (v) => { setDept(v); setGroup('all'); setPage(0); };
    const deptPool = allMissing.filter((k) => mod === 'all' || k.module === mod);
    const groupPool = deptPool.filter((k) => dept === 'all' || k.department === dept);

    const missing = useMemo(() => allMissing.filter((k) =>
        (!search || k.name.toLowerCase().includes(search.trim().toLowerCase()))
        && (mod === 'all' || k.module === mod)
        && (dept === 'all' || k.department === dept)
        && (group === 'all' || (group === '__none' ? !k.group_label : k.group_label === group))
    ), [allMissing, search, mod, dept, group]);
    const pageCount = Math.max(1, Math.ceil(missing.length / pageSize));
    const safePage = Math.min(page, pageCount - 1);
    const rows = missing.slice(safePage * pageSize, (safePage + 1) * pageSize);

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
                {q.data && (
                    <p className="text-sm text-slate-600">
                        <span className="font-semibold text-slate-900">{allMissing.length}</span> of {total} KPIs have no value for this day
                    </p>
                )}
            </div>

            {q.isLoading && <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>}
            {q.error && <p className="text-sm text-rose-600">{q.error.message}</p>}

            {q.data && allMissing.length > 0 && (
                <KpiFilterBar
                    search={search} onSearch={resetPage(setSearch)}
                    selects={[
                        { label: 'Module', value: mod, onChange: pickMod, options: optionsFrom((modules.data || []).map((m) => m.name)) },
                        { label: 'Department', value: dept, onChange: pickDept, options: optionsFrom(deptPool.map((k) => k.department)) },
                        { label: 'Group', value: group, onChange: resetPage(setGroup), options: [...optionsFrom(groupPool.map((k) => k.group_label)), ...(groupPool.some((k) => !k.group_label) ? [{ value: '__none', label: 'No group' }] : [])] },
                    ]}
                    onClear={() => { setSearch(''); setMod('all'); setDept('all'); setGroup('all'); setPage(0); }}
                />
            )}

            {q.data && allMissing.length === 0 && (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                    <CheckCircle2 className="h-4 w-4 shrink-0" /> Every KPI has a value for this day.
                </div>
            )}

            {q.data && allMissing.length > 0 && missing.length === 0 && (
                <p className="py-6 text-center text-sm text-slate-500">No KPIs match these filters.</p>
            )}

            {missing.length > 0 && (
                <>
                    {/* phone: one card per KPI */}
                    <div className="space-y-2 sm:hidden">
                        {rows.map((k) => (
                            <div key={k.kpi_id} className="rounded-lg border border-slate-200 bg-white p-3">
                                <p className="text-sm font-medium text-slate-900">{k.name}</p>
                                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                                    <dt className="text-slate-400">Department</dt><dd className="text-slate-700">{deptLabel(k.module, k.department) || '—'}</dd>
                                    <dt className="text-slate-400">Group</dt>
                                    <dd className="text-slate-700">{k.group_label || <span className="text-amber-700">No group</span>}</dd>
                                    <dt className="text-slate-400">Lead</dt><dd className="text-slate-700">{k.lead_name || '—'}</dd>
                                </dl>
                            </div>
                        ))}
                    </div>
                    <div className="hidden overflow-x-auto rounded-lg border border-slate-200 bg-white sm:block">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b bg-slate-50 text-left text-sm text-slate-500">
                                    <th className="p-3 font-medium">KPI</th>
                                    <th className="p-3 font-medium">Department</th>
                                    <th className="p-3 font-medium">Group</th>
                                    <th className="p-3 font-medium">Lead</th>
                                    <th className="p-3 font-medium">Members</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((k) => (
                                    <tr key={k.kpi_id} className="border-b last:border-0">
                                        <td className="p-3 text-sm font-medium text-slate-900">{k.name}</td>
                                        <td className="p-3 text-sm text-slate-600">{deptLabel(k.module, k.department) || '—'}</td>
                                        <td className="p-3 text-sm text-slate-600">
                                            {k.group_label || (
                                                <Badge className="gap-1 bg-amber-50 text-xs text-amber-700">
                                                    <AlertTriangle className="h-3 w-3" /> No group — nobody can enter it
                                                </Badge>
                                            )}
                                        </td>
                                        <td className="p-3 text-sm text-slate-600">{k.lead_name || '—'}</td>
                                        <td className="p-3 text-sm text-slate-600">{k.tier_id ? k.member_count : '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <ListPager
                        total={missing.length} noun="KPIs" page={safePage} pageCount={pageCount} pageSize={pageSize}
                        pageSizeOptions={[10, 25, 50]} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(0); }}
                    />
                </>
            )}
        </div>
    );
}
