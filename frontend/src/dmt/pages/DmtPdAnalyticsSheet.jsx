import { useMemo } from 'react';
import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
} from 'recharts';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../../components/ui/sheet';
import { cn } from '../../lib/utils';
import { computePdAnalytics, DUE_LABEL } from '../lib/pdAnalytics';

const TILE_TONE = {
    overdue: 'border-rose-200 bg-rose-50 text-rose-700',
    week: 'border-amber-200 bg-amber-50 text-amber-700',
    month: 'border-blue-200 bg-blue-50 text-blue-700',
    none: 'border-slate-200 bg-slate-50 text-slate-600',
};

// Side panel opened from the "Analytics" button. Everything is based on the target dispatch date and follows the
// filters currently applied on the page (customer, category, search, stage chips). Clicking a tile filters the board.
export function DmtPdAnalyticsSheet({ open, onOpenChange, jobs, stages, onPick }) {
    const a = useMemo(() => computePdAnalytics(jobs, stages.isClosing), [jobs, stages]);
    const stuck = Object.entries(a.overdueByStage).sort((x, y) => y[1] - x[1]);
    const maxStuck = Math.max(1, ...stuck.map(([, n]) => n));
    const c = a.closed;
    const closedWithDate = c.onTime + c.late;

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-full overflow-y-auto sm:max-w-md">
                <SheetHeader>
                    <SheetTitle className="text-base">Analytics</SheetTitle>
                </SheetHeader>
                <p className="mt-1 text-xs text-slate-500">
                    Based on the target dispatch date, for the {a.total} job{a.total === 1 ? '' : 's'} matching the filters on the page.
                </p>

                <div className="mt-4 grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                        <p className="text-2xl font-bold text-slate-900">{a.open}</p>
                        <p className="text-xs font-medium text-slate-600">Open jobs</p>
                    </div>
                    {Object.keys(DUE_LABEL).map((k) => (
                        <button key={k} type="button" onClick={() => onPick(k)} disabled={a.tiles[k] === 0}
                            className={cn('rounded-lg border p-3 text-left transition-shadow hover:shadow-sm disabled:cursor-default disabled:opacity-60 disabled:hover:shadow-none', TILE_TONE[k])}>
                            <p className="text-2xl font-bold">{a.tiles[k]}</p>
                            <p className="text-xs font-medium">{DUE_LABEL[k]}</p>
                        </button>
                    ))}
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500">Tap a tile to show just those jobs on the board.</p>

                <section className="mt-5">
                    <h3 className="mb-1 text-sm font-semibold text-slate-800">Open jobs by target month</h3>
                    <div className="h-52 rounded-lg border border-slate-200 bg-white p-2">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={a.perMonth} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
                                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                                <Tooltip formatter={(v) => [v, 'Jobs']} />
                                <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                                    {a.perMonth.map((d) => <Cell key={d.name} fill={d.overdue ? '#e11d48' : '#2563eb'} />)}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </section>

                <section className="mt-5">
                    <h3 className="mb-1 text-sm font-semibold text-slate-800">Where overdue jobs are stuck</h3>
                    <div className="space-y-1.5 rounded-lg border border-slate-200 bg-white p-3">
                        {stuck.length === 0 && <p className="text-xs text-slate-500">No overdue jobs.</p>}
                        {stuck.map(([key, n]) => (
                            <div key={key}>
                                <div className="flex justify-between text-xs"><span className="text-slate-700">{stages.label(key)}</span><span className="font-semibold text-slate-900">{n}</span></div>
                                <div className="mt-0.5 h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-rose-500" style={{ width: `${(n / maxStuck) * 100}%` }} /></div>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="mt-5 mb-2">
                    <h3 className="mb-1 text-sm font-semibold text-slate-800">Closed jobs: on time or late</h3>
                    <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
                        {c.total === 0 && <p className="text-xs text-slate-500">No closed jobs yet.</p>}
                        {c.total > 0 && (
                            <>
                                <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100">
                                    <div className="bg-emerald-500" style={{ width: `${closedWithDate ? (c.onTime / closedWithDate) * 100 : 0}%` }} />
                                    <div className="bg-rose-500" style={{ width: `${closedWithDate ? (c.late / closedWithDate) * 100 : 0}%` }} />
                                </div>
                                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                                    <span className="text-emerald-700"><strong>{c.onTime}</strong> on or before target</span>
                                    <span className="text-rose-700"><strong>{c.late}</strong> after target</span>
                                    {c.noDate > 0 && <span className="text-slate-500"><strong>{c.noDate}</strong> without a target date</span>}
                                </div>
                            </>
                        )}
                    </div>
                </section>
            </SheetContent>
        </Sheet>
    );
}
