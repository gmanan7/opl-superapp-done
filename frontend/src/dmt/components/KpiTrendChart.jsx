import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { Badge } from '../../components/ui/badge';
import { cn } from '../../lib/utils';
import { formatAxisDate, calculateYMax, calculateMtd, computeRagFromValue, RAG_HEX, RAG_BADGE } from '../lib/kpiChart';
import { formatIndianNumber } from '../lib/dmtFormat';

// entries: array for THIS kpi only, ascending by reporting_date
export function KpiTrendChart({ kpi, entries }) {
    const rows = entries
        .slice()
        .sort((a, b) => a.reporting_date.localeCompare(b.reporting_date))
        .map((e) => ({
            date: formatAxisDate(e.reporting_date),
            actual: e.actual_value != null ? Number(e.actual_value) : null,
            status: e.computed_status,
            remarks: e.remarks,
        }));

    const latest = rows[rows.length - 1];
    const latestStatus = latest?.status || (latest && kpi.kpi_type === 'numeric' ? computeRagFromValue(latest.actual, kpi) : null);
    const mtd = kpi.kpi_type === 'numeric'
        ? calculateMtd(entries, kpi.mtd_aggregation || 'sum')
        : null;
    const yMax = calculateYMax(rows.map((r) => r.actual), kpi.target_value);
    const lineColor = latestStatus ? RAG_HEX[latestStatus] : '#2563eb';

    return (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">
                        {kpi.name}{kpi.unit ? <span className="text-slate-400"> ({kpi.unit})</span> : null}
                    </p>
                    <p className="text-xs text-slate-400">
                        Target: {kpi.target_value != null ? formatIndianNumber(kpi.target_value) : '—'}
                        {mtd != null && <> · MTD: <strong className="text-slate-600">{formatIndianNumber(mtd)}</strong></>}
                    </p>
                </div>
                {latestStatus && <Badge className={cn('text-[10px]', RAG_BADGE[latestStatus])}>{latestStatus.toUpperCase()}</Badge>}
            </div>

            {kpi.kpi_type === 'descriptive' ? (
                <div className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs">
                    {entries.slice().sort((a, b) => b.reporting_date.localeCompare(a.reporting_date)).map((e) => (
                        <div key={e.id} className="border-l-2 border-slate-200 pl-2">
                            <span className="text-slate-400">{e.reporting_date.slice(0, 10)}:</span> {e.text_value || '—'}
                        </div>
                    ))}
                    {entries.length === 0 && <p className="text-slate-400">No entries in range.</p>}
                </div>
            ) : rows.length === 0 ? (
                <div className="flex h-40 items-center justify-center text-xs text-slate-400">No data in range</div>
            ) : (
                <div className="mt-2 h-44">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                            <YAxis
                                tick={{ fontSize: 9, fill: '#94a3b8' }}
                                axisLine={false}
                                tickLine={false}
                                width={42}
                                domain={[0, yMax]}
                                tickFormatter={(v) => formatIndianNumber(v)}
                            />
                            <Tooltip
                                formatter={(v) => [formatIndianNumber(v), 'Actual']}
                                labelStyle={{ fontSize: 12 }}
                                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                            />
                            {kpi.green_threshold != null && (
                                <ReferenceLine y={Number(kpi.green_threshold)} stroke="#10b981" strokeDasharray="4 2" />
                            )}
                            {kpi.amber_threshold != null && (
                                <ReferenceLine y={Number(kpi.amber_threshold)} stroke="#f59e0b" strokeDasharray="4 2" />
                            )}
                            {kpi.target_value != null && (
                                <ReferenceLine y={Number(kpi.target_value)} stroke="#64748b" strokeDasharray="2 2" />
                            )}
                            <Line
                                type="monotone"
                                dataKey="actual"
                                stroke={lineColor}
                                strokeWidth={2}
                                connectNulls={false}
                                isAnimationActive={false}
                                dot={{ r: 3 }}
                                activeDot={{ r: 5 }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    );
}
