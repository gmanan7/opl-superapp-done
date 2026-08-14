// KPI Trend (analysis surface) — re-grounded on tokens. FIX 4: charts are GROUPED BY
// MACHINE into collapsible TrendSections, with the JH-overview rollup as its own
// delineated section (no flat grid). Body-only: the MonthSelector lives in the
// landing's sticky header. Recharts needs literal colors (cannot use Tailwind
// classes); the few hexes mirror design tokens — the one scoped tokens-only exception.
import { useTranslation } from 'react-i18next';
import { Pencil } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, } from 'recharts';
import { CaptureColumn, EmptyState, TrendSection } from '@/components/patterns';
import { useGroupDefinitions, useKpiTrend, useMissingKpiDates, resolveKpiName, } from '../../hooks/useKPIs';
import { daysInMonth, isOnTarget, yesterdayStr } from '../../lib/kpi';
const CHART_BRAND = '#B45309'; // brand.DEFAULT
const CHART_TARGET = '#D6D3D1'; // line.strong
const CHART_GRID = '#F0EFEE'; // line.subtle
const CHART_AXIS = '#A8A29E'; // ink.subtle
function pad(n) { return String(n).padStart(2, '0'); }
function KPICard({ def, trend, year, month }) {
    const { i18n, t } = useTranslation();
    const name = resolveKpiName(def, i18n.language);
    const yday = yesterdayStr();
    const total = daysInMonth(year, month);
    const chart = [];
    for (let day = 1; day <= total; day++) {
        const dateStr = `${year}-${pad(month)}-${pad(day)}`;
        const future = dateStr > yday;
        const entry = future ? undefined : trend.find((e) => e.entry_date === dateStr && (def.machine_id === null ? e.machine_id === null : e.machine_id === def.machine_id));
        chart.push({ day, actual: entry ? (entry.kpi_values[def.kpi_key] ?? null) : null, target: def.target_value });
    }
    const actuals = chart.map((d) => d.actual).filter((v) => v !== null);
    const mtd = actuals.length ? actuals.reduce((s, v) => s + v, 0) / actuals.length : null;
    const meeting = mtd !== null ? isOnTarget(def.direction, mtd, def.target_value) : null;
    return (<div className="overflow-hidden rounded-lg border border-line bg-surface-raised shadow-sm">
      <div className="flex items-start justify-between gap-2 border-b border-line-subtle px-4 pb-2.5 pt-3">
        <div className="min-w-0">
          <p lang={i18n.language} className="break-words text-sm font-semibold leading-tight text-ink-strong">{name}</p>
          {def.unit && <p className="mt-0.5 text-xs text-ink-muted">{def.unit}</p>}
        </div>
        <div className="shrink-0 text-right">
          {def.target_value !== null && (<span className="inline-block rounded bg-surface-sunken px-1.5 py-0.5 text-xs tabular-nums text-ink-muted">
              {t('kpi.target')}: {def.target_value}
            </span>)}
          {mtd !== null && (<p className={`mt-1 text-sm font-bold tabular-nums ${meeting === false ? 'text-danger-fg' : meeting ? 'text-success-fg' : 'text-ink-strong'}`}>{mtd.toFixed(1)}</p>)}
          {mtd === null && <p className="mt-1 text-xs text-ink-subtle">—</p>}
        </div>
      </div>
      <div className="px-2 py-2">
        <ResponsiveContainer width="100%" height={120}>
          <LineChart data={chart} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID}/>
            <XAxis dataKey="day" tick={{ fontSize: 9, fill: CHART_AXIS }} tickLine={false} axisLine={false} interval="preserveStartEnd"/>
            <YAxis tick={{ fontSize: 9, fill: CHART_AXIS }} tickLine={false} axisLine={false} width={32}/>
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E7E5E4' }} 
    
    formatter={(value, n) => [value != null ? `${value} ${def.unit ?? ''}` : '—', n === 'actual' ? name : t('kpi.target')]} 
    
    labelFormatter={(l) => `${t('kpi.day')} ${l}`}/>
            <Line type="monotone" dataKey="actual" stroke={CHART_BRAND} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false}/>
            {def.target_value !== null && (<Line type="monotone" dataKey="target" stroke={CHART_TARGET} strokeWidth={1.5} strokeDasharray="4 4" dot={false} connectNulls isAnimationActive={false}/>)}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>);
}
export function MonthSelector({ year, month, onChange }) {
    const { t } = useTranslation();
    const now = new Date();
    const ty = now.getFullYear();
    const tm = now.getMonth() + 1;
    const lm = new Date(ty, tm - 2, 1);
    const ly = lm.getFullYear();
    const lmo = lm.getMonth() + 1;
    const isThis = year === ty && month === tm;
    const isLast = year === ly && month === lmo;
    const older = [];
    for (let i = 2; i <= 11; i++) {
        const d = new Date(ty, tm - 1 - i, 1);
        older.push({ year: d.getFullYear(), month: d.getMonth() + 1, label: d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) });
    }
    const pill = (active) => `min-h-touch rounded-md border px-3 text-sm font-medium ${active ? 'border-surface-inverse bg-surface-inverse text-ink-inverse' : 'border-line bg-surface-raised text-ink-muted hover:bg-surface-hover'}`;
    return (<div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => onChange(ty, tm)} className={pill(isThis)}>{t('kpi.thisMonth')}</button>
      <button type="button" onClick={() => onChange(ly, lmo)} className={pill(isLast)}>{t('kpi.lastMonth')}</button>
      <select value={isThis || isLast ? '' : `${year}-${month}`} onChange={(e) => { if (e.target.value) {
        const [y, m] = e.target.value.split('-').map(Number);
        onChange(y, m);
    } }} className="min-h-touch rounded-md border border-line bg-surface-raised px-2 text-sm text-ink-muted focus:outline-none focus-visible:shadow-focus">
        <option value="">{t('kpi.older')}</option>
        {older.map((o) => <option key={`${o.year}-${o.month}`} value={`${o.year}-${o.month}`}>{o.label}</option>)}
      </select>
    </div>);
}
export function KpiTrendView({ groupId, year, month, onEnter }) {
    const { t } = useTranslation();
    const { data: defs = [], isLoading } = useGroupDefinitions(groupId);
    const { data: trend = [] } = useKpiTrend(groupId, year, month);
    const missing = useMissingKpiDates(groupId, year, month);
    // Group machine KPIs BY machine (preserve order); JH-level KPIs as their own section.
    const machineOrder = [];
    const byMachine = new Map();
    const jhDefs = [];
    for (const d of defs) {
        if (d.machine_id) {
            if (!byMachine.has(d.machine_id)) {
                byMachine.set(d.machine_id, []);
                machineOrder.push(d.machine_id);
            }
            byMachine.get(d.machine_id).push(d);
        }
        else
            jhDefs.push(d);
    }
    return (<CaptureColumn variant="wide">
      <div className="space-y-6 pb-12 pt-4">
        {missing.length > 0 && (<div className="flex items-center gap-2 rounded-lg border border-warning-border bg-warning-bg px-4 py-2.5">
            <Pencil size={13} className="shrink-0 text-warning-fg"/>
            <p className="text-sm text-warning-fg">
              <span className="font-semibold">{t('kpi.missingDaysCount', { count: missing.length })} </span>
              {missing.slice(0, 5).map((d, i) => (<span key={d}>{i > 0 && ', '}<button onClick={onEnter} className="font-medium underline underline-offset-2">{t('kpi.day')} {new Date(d + 'T00:00:00').getDate()}</button></span>))}
              {missing.length > 5 && <span> {t('kpi.andMore', { count: missing.length - 5 })}</span>}
            </p>
          </div>)}

        {isLoading && <p className="py-16 text-center text-sm text-ink-subtle">{t('common.loading')}</p>}
        {!isLoading && defs.length === 0 && <EmptyState title={t('kpi.noData')}/>}

        {!isLoading && machineOrder.map((mid) => {
            const group = byMachine.get(mid);
            const m = group.find((d) => d.machine)?.machine ?? null;
            const subtitle = [m?.jh_group?.dmt?.code, m?.jh_group?.name, m?.area?.name].filter(Boolean).join(' · ');
            return (<TrendSection key={mid} title={m?.name ?? '—'} subtitle={subtitle || undefined} meta={t('kpi.kpiCount', { count: group.length })}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {group.map((d) => <KPICard key={d.id} def={d} trend={trend} year={year} month={month}/>)}
              </div>
            </TrendSection>);
        })}

        {!isLoading && jhDefs.length > 0 && (<TrendSection title={t('kpi.jhOverview')} meta={t('kpi.kpiCount', { count: jhDefs.length })}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {jhDefs.map((d) => <KPICard key={d.id} def={d} trend={trend} year={year} month={month}/>)}
            </div>
          </TrendSection>)}
      </div>
    </CaptureColumn>);
}
