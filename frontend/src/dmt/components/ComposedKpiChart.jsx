import {
    ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { formatAxisDate } from '../lib/kpiChart';

// chart: dmt_kpi_charts row; links: [{kpi_id, render_as, axis, color}]; kpiById; entriesByKpi
export function ComposedKpiChart({ chart, links, kpiById, entriesByKpi }) {
    const dates = new Set();
    for (const l of links) for (const e of entriesByKpi[l.kpi_id] || []) dates.add(e.reporting_date.slice(0, 10));
    const sortedDates = [...dates].sort();

    const valueAt = {};
    for (const l of links) {
        valueAt[l.kpi_id] = {};
        for (const e of entriesByKpi[l.kpi_id] || []) {
            if (e.actual_value != null) valueAt[l.kpi_id][e.reporting_date.slice(0, 10)] = Number(e.actual_value);
        }
    }
    const data = sortedDates.map((d) => {
        const row = { date: formatAxisDate(d) };
        for (const l of links) row[l.kpi_id] = valueAt[l.kpi_id][d] ?? null;
        return row;
    });
    const hasSecondary = links.some((l) => l.axis === 'secondary');

    return (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-sm font-medium text-slate-900">{chart.name}</p>
            <div className="mt-2 h-56">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#94a3b8' }} />
                        <YAxis yAxisId="primary" tick={{ fontSize: 9, fill: '#94a3b8' }} width={40} />
                        {hasSecondary && <YAxis yAxisId="secondary" orientation="right" tick={{ fontSize: 9, fill: '#94a3b8' }} width={40} />}
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        {links.map((l) => {
                            const name = kpiById[l.kpi_id]?.name || l.kpi_id;
                            const common = { key: l.kpi_id, dataKey: l.kpi_id, name, yAxisId: l.axis, fill: l.color, stroke: l.color };
                            return l.render_as === 'bar'
                                ? <Bar {...common} isAnimationActive={false} />
                                : <Line {...common} type="monotone" strokeWidth={2} dot={{ r: 2 }} connectNulls isAnimationActive={false} />;
                        })}
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
