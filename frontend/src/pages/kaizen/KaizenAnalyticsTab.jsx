import { useState, useMemo } from 'react';
import { Layers, Tag, UserCheck, User, Users, Filter, TrendingUp, Download, ClipboardList, IndianRupee } from 'lucide-react';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, LineChart, Line } from 'recharts';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { useKaizenAnalytics, useKaizenAnalyticsTrend } from '../../hooks/useKaizen';
import { EmptyState } from '@/components/patterns';

// Same visual language as OPL / Abnormality Analytics — local copy so each module's tab can
// evolve independently.
const CHART_GRID = '#F0EFEE';
const CHART_AXIS = '#A8A29E';
const CHART_PALETTE = ['#1D4ED8', '#0E7490', '#7C3AED', '#B45309', '#15803D', '#B91C1C', '#C2410C', '#A16207'];

const CATEGORY_LABEL = {
  productivity: 'Productivity', quality: 'Quality', cost: 'Cost',
  delivery: 'Delivery', safety: 'Safety', morale: 'Morale', Uncategorised: 'Uncategorised',
};

function renderInsidePieLabel(formatValue) {
  return ({ cx, cy, midAngle, innerRadius, outerRadius, percent, value }) => {
    if (!percent) return null;
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.6;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
      <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700}>
        {formatValue({ percent, value })}
      </text>
    );
  };
}
const renderPctLabel = renderInsidePieLabel(({ percent }) => `${Math.round(percent * 100)}%`);

function formatLocalDate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
const fmtNum = (n) => (Number(n) || 0).toLocaleString('en-IN');

export function KaizenAnalyticsTab() {
  const now = new Date();
  const monthStartStr = formatLocalDate(new Date(now.getFullYear(), now.getMonth(), 1));
  const todayStr = formatLocalDate(now);
  const pastMonthStartStr = formatLocalDate(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const pastMonthEndStr = formatLocalDate(new Date(now.getFullYear(), now.getMonth(), 0));

  const [fromDate, setFromDate] = useState(monthStartStr);
  const [toDate, setToDate] = useState(todayStr);
  const [appliedRange, setAppliedRange] = useState({ from: monthStartStr, to: todayStr });

  const [breakdownGroupId, setBreakdownGroupId] = useState(null);
  const [breakdownDmtId, setBreakdownDmtId] = useState(null);
  const [filterType, setFilterType] = useState('all'); // 'all' | 'jh_group' | 'dmt'

  const selectJhGroupFilter = (id) => { setFilterType('jh_group'); setBreakdownGroupId(id); setBreakdownDmtId(null); };
  const selectDmtFilter = (id) => { setFilterType('dmt'); setBreakdownDmtId(id); setBreakdownGroupId(null); };
  const clearFilter = () => { setFilterType('all'); setBreakdownGroupId(null); setBreakdownDmtId(null); };

  const [analyticsTab, setAnalyticsTab] = useState('submissions');
  const ANALYTICS_TABS = [
    { key: 'submissions', label: 'Submissions', short: 'Submits', Icon: Layers },
    { key: 'category', label: 'Category', short: 'Category', Icon: Tag },
    { key: 'savings', label: 'Savings', short: 'Savings', Icon: IndianRupee },
    { key: 'status', label: 'Status', short: 'Status', Icon: ClipboardList },
    { key: 'reviewers', label: 'Reviewer Workload', short: 'Reviewers', Icon: UserCheck },
    { key: 'users', label: 'Per-User Breakdown', short: 'Per-User', Icon: User },
    { key: 'members', label: 'Member Submissions', short: 'Members', Icon: Users },
    { key: 'compare', label: 'Compare', short: 'Compare', Icon: Filter },
    { key: 'trend', label: 'Trend', short: 'Trend', Icon: TrendingUp },
  ];

  const analyticsParams = filterType === 'jh_group' && breakdownGroupId
    ? { ...appliedRange, jh_group_id: breakdownGroupId }
    : filterType === 'dmt' && breakdownDmtId
      ? { ...appliedRange, dmt_id: breakdownDmtId }
      : appliedRange;
  const { data, isLoading, isError } = useKaizenAnalytics(analyticsParams);
  const { data: unscopedData } = useKaizenAnalytics(appliedRange);
  const allJhGroupOptions = unscopedData?.byJhGroup || [];
  const allDmtOptions = unscopedData?.byDmt || [];

  const [compareType, setCompareType] = useState('jh_group');
  const [compareAId, setCompareAId] = useState(null);
  const [compareBId, setCompareBId] = useState(null);
  const compareKey = compareType === 'jh_group' ? 'jh_group_id' : 'dmt_id';
  const { data: compareDataA } = useKaizenAnalytics(compareAId ? { ...appliedRange, [compareKey]: compareAId } : appliedRange);
  const { data: compareDataB } = useKaizenAnalytics(compareBId ? { ...appliedRange, [compareKey]: compareBId } : appliedRange);

  const [trendJhGroupId, setTrendJhGroupId] = useState(null);
  const [trendMonths, setTrendMonths] = useState(6);
  const { data: trendData, isLoading: isTrendLoading } = useKaizenAnalyticsTrend(
    { jh_group_id: trendJhGroupId, months: trendMonths },
    { enabled: Boolean(trendJhGroupId) }
  );

  const [perUserStageFilter, setPerUserStageFilter] = useState('all');
  const [memberThreshold, setMemberThreshold] = useState(1);

  const handleApply = () => {
    if (!fromDate || !toDate) return toast.error('Select both a from and to date');
    if (fromDate > toDate) return toast.error('"From" date must be before "To" date');
    setAppliedRange({ from: fromDate, to: toDate });
  };
  const handleResetToMonth = () => { setFromDate(monthStartStr); setToDate(todayStr); setAppliedRange({ from: monthStartStr, to: todayStr }); };
  const handleResetToPastMonth = () => { setFromDate(pastMonthStartStr); setToDate(pastMonthEndStr); setAppliedRange({ from: pastMonthStartStr, to: pastMonthEndStr }); };

  const byDmt = data?.byDmt || [];
  const byJhGroup = data?.byJhGroup || [];
  const memberSubmissions = data?.memberSubmissions || [];
  const byCategory = data?.byCategory || [];
  const byStatus = data?.byStatus || [];
  const savingsByUnit = data?.savingsByUnit || [];
  const reviewerWorkload = data?.reviewerWorkload || [];
  const submitterStageBreakdown = data?.submitterStageBreakdown || [];
  const totalKaizens = byDmt.reduce((s, d) => s + d.kaizen_count, 0);
  const totalMembers = byJhGroup.reduce((s, g) => s + g.member_count, 0);
  const totalClosed = byJhGroup.reduce((s, g) => s + (g.closed_count || 0), 0);

  const participationByGroupId = useMemo(() => {
    const map = new Map();
    memberSubmissions.forEach((m) => {
      if (!map.has(m.jh_group_id)) map.set(m.jh_group_id, 0);
      if (m.kaizen_count > 0) map.set(m.jh_group_id, map.get(m.jh_group_id) + 1);
    });
    return map;
  }, [memberSubmissions]);

  const perUserFilteredRows = perUserStageFilter === 'all'
    ? submitterStageBreakdown
    : submitterStageBreakdown.filter((r) => r.stage_label === perUserStageFilter);
  const perUserStageOptions = useMemo(() => [...new Set(submitterStageBreakdown.map((r) => r.stage_label))], [submitterStageBreakdown]);

  const memberBuckets = useMemo(() => ({
    zero: memberSubmissions.filter((m) => m.kaizen_count === 0),
    exact: memberSubmissions.filter((m) => m.kaizen_count === memberThreshold),
    more: memberSubmissions.filter((m) => m.kaizen_count > memberThreshold),
  }), [memberSubmissions, memberThreshold]);

  const handleExportAll = () => {
    const hasAny = byDmt.length || byJhGroup.length || memberSubmissions.length || byCategory.length || reviewerWorkload.length || submitterStageBreakdown.length || savingsByUnit.length;
    if (!hasAny) return toast.error('No data to export for this date range');
    const workbook = XLSX.utils.book_new();
    const addSheet = (name, rows) => { if (rows.length) XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), name.slice(0, 31)); };
    addSheet('By DMT', byDmt.map((r) => ({ DMT: r.dmt_name, Count: r.kaizen_count })));
    addSheet('By JH Group', byJhGroup.map((r) => ({ 'JH Group': r.jh_group_name, DMT: r.dmt_name, Count: r.kaizen_count, Closed: r.closed_count, Members: r.member_count, Index: r.kaizen_index })));
    addSheet('By Category', byCategory.map((r) => ({ Category: CATEGORY_LABEL[r.category] || r.category, Count: r.kaizen_count })));
    addSheet('By Status', byStatus.map((r) => ({ Status: r.status_label, Count: r.kaizen_count })));
    addSheet('Savings Realised', savingsByUnit.map((r) => ({ Unit: r.unit, 'Closed Kaizens': r.kaizen_count, 'Total Saved': r.total })));
    addSheet('Reviewer Workload', reviewerWorkload.map((r) => ({ Reviewer: r.worker_name, Stage: r.stage_name, Count: r.kaizen_count })));
    addSheet('Per-User Breakdown', submitterStageBreakdown.map((r) => ({ User: r.worker_name, Stage: r.stage_label, Count: r.kaizen_count })));
    addSheet('Member Submissions', memberSubmissions.map((r) => ({ Member: r.worker_name, 'JH Group': r.jh_group_name, Count: r.kaizen_count })));
    XLSX.writeFile(workbook, `Kaizen_Analytics_${appliedRange.from}_to_${appliedRange.to}.xlsx`);
    toast.success('Exported!');
  };

  if (isError) {
    return <EmptyState title="Failed to load analytics" description="You may not have permission to view this, or the server is unavailable." />;
  }

  const card = 'rounded-xl border border-line bg-surface-raised p-3 sm:p-4 shadow-xs';

  return (
    <div className="space-y-4 py-4">
      {/* Date range + scope */}
      <div className="rounded-xl border border-line bg-surface-raised p-3 sm:p-4 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-2 sm:gap-3">
          <div className="flex gap-2">
            <div className="flex-1 sm:flex-none">
              <label className="block text-xs font-semibold uppercase tracking-wider text-ink-muted mb-1">From</label>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-full h-9 rounded-lg border border-line bg-surface-base px-2.5 text-sm text-ink-strong" />
            </div>
            <div className="flex-1 sm:flex-none">
              <label className="block text-xs font-semibold uppercase tracking-wider text-ink-muted mb-1">To</label>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-full h-9 rounded-lg border border-line bg-surface-base px-2.5 text-sm text-ink-strong" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={handleApply} className="h-9 px-3 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700">Apply</button>
            <button type="button" onClick={handleResetToMonth} className="h-9 px-3 rounded-lg border border-line text-xs font-medium text-ink-muted hover:text-ink-strong">This Month</button>
            <button type="button" onClick={handleResetToPastMonth} className="h-9 px-3 rounded-lg border border-line text-xs font-medium text-ink-muted hover:text-ink-strong">Last Month</button>
            <button type="button" onClick={handleExportAll} className="h-9 px-3 rounded-lg border border-line text-xs font-medium text-ink-muted hover:text-ink-strong flex items-center gap-1.5 sm:ml-auto">
              <Download size={13} /> Export All
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-line-subtle">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Scope:</span>
          <button type="button" onClick={clearFilter} className={`px-2.5 py-1 rounded-full text-xs font-semibold ${filterType === 'all' ? 'bg-blue-600 text-white' : 'bg-surface-sunken text-ink-muted'}`}>All Groups</button>
          <select value={filterType === 'jh_group' ? (breakdownGroupId || '') : ''} onChange={(e) => e.target.value && selectJhGroupFilter(e.target.value)} className="h-8 rounded-full border border-line bg-surface-sunken px-2 text-xs text-ink-strong">
            <option value="">By JH Group...</option>
            {allJhGroupOptions.map((g) => <option key={g.jh_group_id} value={g.jh_group_id}>{g.jh_group_name}</option>)}
          </select>
          <select value={filterType === 'dmt' ? (breakdownDmtId || '') : ''} onChange={(e) => e.target.value && selectDmtFilter(e.target.value)} className="h-8 rounded-full border border-line bg-surface-sunken px-2 text-xs text-ink-strong">
            <option value="">By DMT...</option>
            {allDmtOptions.map((d) => <option key={d.dmt_id} value={d.dmt_id}>{d.dmt_name}</option>)}
          </select>
        </div>
      </div>

      {/* Section tabs — mobile: a 3-per-row grid with short labels so every section is
          visible at once and nothing scrolls sideways (same pattern as the review-status
          filter rows in KaizenList/AbnormalityList). Desktop: the single pill row. */}
      <div className="grid grid-cols-3 gap-1 bg-surface-sunken p-1 rounded-lg border border-line sm:hidden">
        {ANALYTICS_TABS.map(({ key, short, Icon }) => (
          <button key={key} type="button" onClick={() => setAnalyticsTab(key)}
            className={`flex min-w-0 items-center justify-center gap-1 rounded-md px-1 py-2 text-xs font-semibold leading-tight transition-all ${
              analyticsTab === key ? 'bg-surface-raised text-blue-700 shadow-xs' : 'text-ink-muted hover:text-ink-strong'
            }`}>
            <Icon size={12} className="shrink-0" /> <span className="truncate">{short}</span>
          </button>
        ))}
      </div>
      <div className="hidden sm:flex flex-wrap items-center gap-1 bg-surface-sunken p-1 rounded-lg border border-line">
        {ANALYTICS_TABS.map(({ key, label, Icon }) => (
          <button key={key} type="button" onClick={() => setAnalyticsTab(key)}
            className={`flex items-center gap-1.5 shrink-0 px-2.5 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-all ${
              analyticsTab === key ? 'bg-surface-raised text-blue-700 shadow-xs' : 'text-ink-muted hover:text-ink-strong'
            }`}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {isLoading && <div className="text-center py-10 text-ink-subtle text-sm">Loading analytics...</div>}

      {/* The date range defaults to month-to-date, so early in a month every chart
          legitimately reads zero. Say so, and offer the one tap that usually fixes it. */}
      {!isLoading && totalKaizens === 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-500/5 p-3 text-sm text-amber-900 flex flex-col sm:flex-row sm:items-center gap-2">
          <span className="flex-1">
            No Kaizens were submitted between <strong>{appliedRange.from}</strong> and{' '}
            <strong>{appliedRange.to}</strong>{filterType !== 'all' ? ' in the selected scope' : ''}.
          </span>
          <button type="button" onClick={handleResetToPastMonth}
            className="shrink-0 h-9 px-3 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700">
            Show last month
          </button>
        </div>
      )}

      {!isLoading && analyticsTab === 'submissions' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { v: fmtNum(totalKaizens), l: 'Total Kaizens' },
              { v: fmtNum(totalClosed), l: 'Closed' },
              { v: fmtNum(totalMembers), l: 'Members' },
              { v: totalMembers > 0 ? (totalKaizens / totalMembers).toFixed(2) : '—', l: 'Overall Index' },
            ].map((t) => (
              <div key={t.l} className="rounded-xl border border-line bg-surface-raised p-3 sm:p-4 text-center">
                <p className="text-xl sm:text-2xl font-bold text-ink-strong">{t.v}</p>
                <p className="text-xs text-ink-muted uppercase tracking-wider">{t.l}</p>
              </div>
            ))}
          </div>

          <div className={card}>
            <p className="text-sm font-semibold text-ink-strong mb-2">By DMT</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byDmt}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
                <XAxis dataKey="dmt_name" tick={{ fontSize: 10, fill: CHART_AXIS }} tickLine={false} axisLine={{ stroke: CHART_GRID }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: CHART_AXIS }} tickLine={false} axisLine={false} width={28} />
                <Tooltip />
                <Bar dataKey="kaizen_count" radius={[4, 4, 0, 0]} onClick={(d) => selectDmtFilter(d.dmt_id)} cursor="pointer">
                  {byDmt.map((row, idx) => <Cell key={row.dmt_id} fill={CHART_PALETTE[idx % CHART_PALETTE.length]} cursor="pointer" />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className={card}>
            <p className="text-sm font-semibold text-ink-strong mb-2">By JH Group</p>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byJhGroup}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
                <XAxis dataKey="jh_group_name" tick={{ fontSize: 10, fill: CHART_AXIS }} tickLine={false} axisLine={{ stroke: CHART_GRID }} interval={0} angle={-20} textAnchor="end" height={55} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: CHART_AXIS }} tickLine={false} axisLine={false} width={28} />
                <Tooltip />
                <Bar dataKey="kaizen_count" radius={[4, 4, 0, 0]} onClick={(d) => selectJhGroupFilter(d.jh_group_id)} cursor="pointer">
                  {byJhGroup.map((row, idx) => <Cell key={row.jh_group_id} fill={CHART_PALETTE[idx % CHART_PALETTE.length]} cursor="pointer" />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Seven columns can't fit a phone, and side-scrolling a table is a poor way to
              read it — below sm each row becomes a labelled card instead; the real table
              returns from sm up. Both stay tappable to scope the whole page to that group. */}
          <div className="space-y-2 sm:hidden">
            {byJhGroup.map((g) => (
              <button key={g.jh_group_id} type="button" onClick={() => selectJhGroupFilter(g.jh_group_id)}
                className="w-full rounded-xl border border-line bg-surface-raised p-3 text-left active:bg-surface-hover">
                <div className="flex items-baseline justify-between gap-2 border-b border-line-subtle pb-2">
                  <span className="text-sm font-semibold text-ink-strong">{g.jh_group_name}</span>
                  <span className="shrink-0 text-2xs font-medium text-ink-muted">{g.dmt_name || '—'}</span>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  {[
                    ['Kaizens', g.kaizen_count],
                    ['Closed', g.closed_count],
                    ['Members', g.member_count],
                    ['Index', g.kaizen_index ?? '—'],
                    ['Participation', g.member_count > 0 ? `${Math.round(((participationByGroupId.get(g.jh_group_id) || 0) / g.member_count) * 100)}%` : '—'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-baseline justify-between gap-2">
                      <dt className="text-ink-muted">{k}</dt>
                      <dd className="text-sm font-semibold text-ink-strong">{v}</dd>
                    </div>
                  ))}
                </dl>
              </button>
            ))}
          </div>
          <div className="hidden sm:block rounded-xl border border-line bg-surface-raised overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-surface-sunken text-ink-muted uppercase tracking-wider text-2xs">
                <tr><th className="text-left p-2.5">JH Group</th><th className="text-left p-2.5">DMT</th><th className="text-right p-2.5">Count</th><th className="text-right p-2.5">Closed</th><th className="text-right p-2.5">Members</th><th className="text-right p-2.5">Index</th><th className="text-right p-2.5">Participation</th></tr>
              </thead>
              <tbody>
                {byJhGroup.map((g) => (
                  <tr key={g.jh_group_id} className="border-t border-line-subtle hover:bg-surface-hover cursor-pointer" onClick={() => selectJhGroupFilter(g.jh_group_id)}>
                    <td className="p-2.5 font-medium text-ink-strong">{g.jh_group_name}</td>
                    <td className="p-2.5 text-ink-muted">{g.dmt_name || '—'}</td>
                    <td className="p-2.5 text-right">{g.kaizen_count}</td>
                    <td className="p-2.5 text-right">{g.closed_count}</td>
                    <td className="p-2.5 text-right">{g.member_count}</td>
                    <td className="p-2.5 text-right">{g.kaizen_index ?? '—'}</td>
                    <td className="p-2.5 text-right">{g.member_count > 0 ? `${Math.round(((participationByGroupId.get(g.jh_group_id) || 0) / g.member_count) * 100)}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!isLoading && analyticsTab === 'category' && (
        <div className={card}>
          <p className="text-sm font-semibold text-ink-strong mb-2">By Category</p>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={byCategory} dataKey="kaizen_count" nameKey="category" outerRadius={100} label={renderPctLabel} labelLine={false}>
                {byCategory.map((row, idx) => <Cell key={row.category} fill={CHART_PALETTE[idx % CHART_PALETTE.length]} />)}
              </Pie>
              <Tooltip formatter={(v, n) => [v, CATEGORY_LABEL[n] || n]} />
              <Legend formatter={(v) => CATEGORY_LABEL[v] || v} wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {!isLoading && analyticsTab === 'savings' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-line bg-surface-raised p-4 text-center">
              <p className="text-xl sm:text-2xl font-bold text-ink-strong">{fmtNum(totalClosed)}</p>
              <p className="text-xs text-ink-muted uppercase tracking-wider">Closed Kaizens</p>
            </div>
            <div className="rounded-xl border border-line bg-surface-raised p-4 text-center">
              <p className="text-xl sm:text-2xl font-bold text-ink-strong">{savingsByUnit.length}</p>
              <p className="text-xs text-ink-muted uppercase tracking-wider">Savings Units</p>
            </div>
          </div>
          {savingsByUnit.length === 0 ? (
            <EmptyState title="No savings recorded" description="Savings are totalled from confirmed-closed Kaizens in this range and scope." />
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {savingsByUnit.map((s) => (
                  <div key={s.unit} className="rounded-xl border border-line bg-surface-raised p-4">
                    <p className="text-xs text-ink-muted uppercase tracking-wider">{s.unit}</p>
                    <p className="text-2xl font-bold text-ink-strong mt-1">{fmtNum(s.total)}</p>
                    <p className="text-2xs text-ink-subtle mt-0.5">from {s.kaizen_count} closed Kaizen{s.kaizen_count === 1 ? '' : 's'}</p>
                  </div>
                ))}
              </div>
              <div className={card}>
                <p className="text-sm font-semibold text-ink-strong mb-2">Total saved by unit</p>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={savingsByUnit} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: CHART_AXIS }} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="unit" tick={{ fontSize: 11, fill: CHART_AXIS }} tickLine={false} axisLine={false} width={90} />
                    <Tooltip formatter={(v) => fmtNum(v)} />
                    <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                      {savingsByUnit.map((row, idx) => <Cell key={row.unit} fill={CHART_PALETTE[idx % CHART_PALETTE.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      )}

      {!isLoading && analyticsTab === 'status' && (
        <div className={card}>
          <p className="text-sm font-semibold text-ink-strong mb-2">By Status</p>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={byStatus} dataKey="kaizen_count" nameKey="status_label" outerRadius={100} label={renderPctLabel} labelLine={false}>
                {byStatus.map((row, idx) => <Cell key={row.status} fill={CHART_PALETTE[idx % CHART_PALETTE.length]} />)}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {!isLoading && analyticsTab === 'reviewers' && (
        <div className="rounded-xl border border-line bg-surface-raised overflow-x-auto">
          <table className="w-full text-xs min-w-[380px]">
            <thead className="bg-surface-sunken text-ink-muted uppercase tracking-wider text-2xs">
              <tr><th className="text-left p-2.5">Reviewer</th><th className="text-left p-2.5">Stage</th><th className="text-right p-2.5">Pending Count</th></tr>
            </thead>
            <tbody>
              {reviewerWorkload.length === 0 ? (
                <tr><td colSpan={3} className="p-6 text-center text-ink-subtle">No pending reviews in this scope.</td></tr>
              ) : reviewerWorkload.map((r) => (
                <tr key={`${r.emp_id}|${r.stage_name}`} className="border-t border-line-subtle">
                  <td className="p-2.5 font-medium text-ink-strong">{r.worker_name}</td>
                  <td className="p-2.5 text-ink-muted">{r.stage_name}</td>
                  <td className="p-2.5 text-right font-semibold">{r.kaizen_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && analyticsTab === 'users' && (
        <div className="space-y-3">
          <select value={perUserStageFilter} onChange={(e) => setPerUserStageFilter(e.target.value)} className="w-full sm:w-auto h-9 rounded-lg border border-line bg-surface-raised px-2.5 text-xs text-ink-strong">
            <option value="all">All Stages</option>
            {perUserStageOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <div className="rounded-xl border border-line bg-surface-raised overflow-x-auto">
            <table className="w-full text-xs min-w-[380px]">
              <thead className="bg-surface-sunken text-ink-muted uppercase tracking-wider text-2xs">
                <tr><th className="text-left p-2.5">User</th><th className="text-left p-2.5">Stage</th><th className="text-right p-2.5">Count</th></tr>
              </thead>
              <tbody>
                {perUserFilteredRows.length === 0 ? (
                  <tr><td colSpan={3} className="p-6 text-center text-ink-subtle">No data.</td></tr>
                ) : perUserFilteredRows.map((r, idx) => (
                  <tr key={`${r.emp_id}|${r.stage_label}|${idx}`} className="border-t border-line-subtle">
                    <td className="p-2.5 font-medium text-ink-strong">{r.worker_name}</td>
                    <td className="p-2.5 text-ink-muted">{r.stage_label}</td>
                    <td className="p-2.5 text-right font-semibold">{r.kaizen_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!isLoading && analyticsTab === 'members' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-ink-muted">Threshold:</label>
            <input type="number" min={1} value={memberThreshold} onChange={(e) => setMemberThreshold(Math.max(1, parseInt(e.target.value, 10) || 1))} className="w-16 h-8 rounded-lg border border-line bg-surface-raised px-2 text-xs text-ink-strong" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-line bg-surface-raised p-3">
              <p className="text-xs font-semibold text-ink-strong mb-1">0 Submissions ({memberBuckets.zero.length})</p>
              <div className="max-h-48 overflow-y-auto space-y-1">{memberBuckets.zero.map((m) => <p key={m.emp_id} className="text-2xs text-ink-muted">{m.worker_name}</p>)}</div>
            </div>
            <div className="rounded-xl border border-line bg-surface-raised p-3">
              <p className="text-xs font-semibold text-ink-strong mb-1">Exactly {memberThreshold} ({memberBuckets.exact.length})</p>
              <div className="max-h-48 overflow-y-auto space-y-1">{memberBuckets.exact.map((m) => <p key={m.emp_id} className="text-2xs text-ink-muted">{m.worker_name}</p>)}</div>
            </div>
            <div className="rounded-xl border border-line bg-surface-raised p-3">
              <p className="text-xs font-semibold text-ink-strong mb-1">More than {memberThreshold} ({memberBuckets.more.length})</p>
              <div className="max-h-48 overflow-y-auto space-y-1">{memberBuckets.more.map((m) => <p key={m.emp_id} className="text-2xs text-ink-muted">{m.worker_name} ({m.kaizen_count})</p>)}</div>
            </div>
          </div>
        </div>
      )}

      {!isLoading && analyticsTab === 'compare' && (
        <div className="space-y-3">
          <select value={compareType} onChange={(e) => { setCompareType(e.target.value); setCompareAId(null); setCompareBId(null); }} className="w-full sm:w-auto h-9 rounded-lg border border-line bg-surface-raised px-2.5 text-xs text-ink-strong">
            <option value="jh_group">Compare JH Groups</option>
            <option value="dmt">Compare DMTs</option>
          </select>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[{ id: compareAId, set: setCompareAId, data: compareDataA }, { id: compareBId, set: setCompareBId, data: compareDataB }].map((slot, idx) => {
              const options = compareType === 'jh_group' ? allJhGroupOptions : allDmtOptions;
              const idKey = compareType === 'jh_group' ? 'jh_group_id' : 'dmt_id';
              const nameKey = compareType === 'jh_group' ? 'jh_group_name' : 'dmt_name';
              const total = slot.data
                ? (compareType === 'jh_group' ? slot.data.byJhGroup?.[0]?.kaizen_count : slot.data.byDmt?.[0]?.kaizen_count) || 0
                : 0;
              return (
                <div key={idx} className="rounded-xl border border-line bg-surface-raised p-4">
                  <select value={slot.id || ''} onChange={(e) => slot.set(e.target.value || null)} className="w-full h-9 rounded-lg border border-line bg-surface-base px-2.5 text-xs text-ink-strong mb-3">
                    <option value="">Select {compareType === 'jh_group' ? 'JH Group' : 'DMT'}...</option>
                    {options.map((o) => <option key={o[idKey]} value={o[idKey]}>{o[nameKey]}</option>)}
                  </select>
                  <p className="text-2xl font-bold text-ink-strong text-center">{slot.id ? total : '—'}</p>
                  <p className="text-2xs text-ink-muted uppercase tracking-wider text-center">Kaizens</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {analyticsTab === 'trend' && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <select value={trendJhGroupId || ''} onChange={(e) => setTrendJhGroupId(e.target.value || null)} className="h-9 rounded-lg border border-line bg-surface-raised px-2.5 text-xs text-ink-strong">
              <option value="">Select JH Group...</option>
              {allJhGroupOptions.map((g) => <option key={g.jh_group_id} value={g.jh_group_id}>{g.jh_group_name}</option>)}
            </select>
            <select value={trendMonths} onChange={(e) => setTrendMonths(Number(e.target.value))} className="h-9 rounded-lg border border-line bg-surface-raised px-2.5 text-xs text-ink-strong">
              {[3, 6, 12, 24].map((m) => <option key={m} value={m}>{m} months</option>)}
            </select>
          </div>
          {!trendJhGroupId ? (
            <EmptyState title="Pick a JH Group" description="Select a JH group above to see its month-over-month trend." />
          ) : isTrendLoading ? (
            <div className="text-center py-10 text-ink-subtle text-sm">Loading trend...</div>
          ) : (
            <div className={card}>
              <p className="text-sm font-semibold text-ink-strong mb-2">{trendData?.jh_group_name}</p>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={trendData?.months || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: CHART_AXIS }} tickLine={false} axisLine={{ stroke: CHART_GRID }} />
                  <YAxis allowDecimals tick={{ fontSize: 11, fill: CHART_AXIS }} tickLine={false} axisLine={false} width={30} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="kaizen_count" name="Kaizens" stroke="#1D4ED8" strokeWidth={2} />
                  <Line type="monotone" dataKey="participants" name="Participants" stroke="#0E7490" strokeWidth={2} />
                  <Line type="monotone" dataKey="kaizen_index" name="Index" stroke="#7C3AED" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
