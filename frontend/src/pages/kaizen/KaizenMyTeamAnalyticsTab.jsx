import { useState, useMemo } from 'react';
import { Users, TrendingUp, TrendingDown, Trophy, FileText, CheckCircle2, Clock, XCircle, IndianRupee, ChevronLeft, ChevronRight } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { useKaizenJhGroupAnalytics } from '../../hooks/useKaizen';
import { Button } from '@/components/ui/button';

// JH-group-scoped Kaizen analytics for a group's leader / routing reviewer — mirrors OPL's
// My Team tab exactly in shape (probe-gated visibility, date range, group picker, stat cards,
// leaderboard, member table). Kaizen has no training mechanism, so per-member metrics are
// submission/status counts instead of assigned/completed training.
const CARD_ACCENTS = {
  blue: { chip: 'text-blue-700 bg-blue-50 border-blue-100' },
  emerald: { chip: 'text-emerald-700 bg-emerald-50 border-emerald-100' },
  violet: { chip: 'text-violet-700 bg-violet-50 border-violet-100' },
  amber: { chip: 'text-amber-700 bg-amber-50 border-amber-100' },
};
const CATEGORY_LABEL = { productivity: 'Productivity', quality: 'Quality', cost: 'Cost', delivery: 'Delivery', safety: 'Safety', morale: 'Morale' };
const STATUS_CHIP = {
  confirmed_closed: { label: 'Closed', cls: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: CheckCircle2 },
  rejected: { label: 'Rejected', cls: 'text-red-700 bg-red-50 border-red-200', icon: XCircle },
};
const pendingChip = { label: 'Pending', cls: 'text-amber-700 bg-amber-50 border-amber-200', icon: Clock };

function StatCard({ label, value, sub, icon: Icon, accent = 'blue' }) {
  const a = CARD_ACCENTS[accent] || CARD_ACCENTS.blue;
  return (
    <div className="rounded-xl border border-line bg-surface-raised p-3.5 shadow-xs">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs text-ink-muted font-medium">{label}</span>
        {Icon && <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border ${a.chip}`}><Icon size={15} /></span>}
      </div>
      <div className="mt-1.5 text-2xl font-black text-ink-strong leading-none tabular-nums">{value}</div>
      {sub && <span className="mt-1 block text-2xs text-ink-subtle">{sub}</span>}
    </div>
  );
}

function RankingCard({ view, onView, rows }) {
  return (
    <div className="rounded-xl border border-line bg-surface-raised overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-3">
        <p className="text-sm font-bold text-ink-strong flex items-center gap-1.5"><Trophy size={14} className="text-amber-600" /> Member ranking</p>
        <div className="inline-flex rounded-lg border border-line bg-surface-base p-0.5 text-2xs font-semibold">
          <button type="button" onClick={() => onView('top')} className={`px-2.5 py-1 rounded-md inline-flex items-center gap-1 ${view === 'top' ? 'bg-blue-600 text-white' : 'text-ink-muted hover:text-ink-strong'}`}><TrendingUp size={11} /> Top submitters</button>
          <button type="button" onClick={() => onView('low')} className={`px-2.5 py-1 rounded-md inline-flex items-center gap-1 ${view === 'low' ? 'bg-blue-600 text-white' : 'text-ink-muted hover:text-ink-strong'}`}><TrendingDown size={11} /> Needs a nudge</button>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="p-3 text-xs text-ink-muted italic">{view === 'top' ? 'No submissions in this period.' : 'No members.'}</p>
      ) : (
        <>
          {/* Mobile: cards — a narrow fixed-width table squeezed "Submitted"/"Closed" headers
              into each other. No side-scrolling tables on a phone. */}
          <div className="sm:hidden divide-y divide-line/60">
            {rows.map((m, i) => (
              <div key={m.emp_id} className="flex items-center gap-3 p-2.5">
                <span className="w-5 shrink-0 text-center text-ink-subtle font-semibold tabular-nums text-xs">{i + 1}</span>
                <span className="min-w-0 flex-1 font-semibold text-ink-strong text-xs truncate">{m.name}</span>
                <span className="shrink-0 text-right text-xs"><span className="font-bold text-blue-700 tabular-nums">{m.kaizen_submitted}</span> <span className="text-2xs text-ink-subtle">submitted</span></span>
                <span className="shrink-0 text-right text-xs"><span className="font-bold text-emerald-700 tabular-nums">{m.kaizen_confirmed_closed}</span> <span className="text-2xs text-ink-subtle">closed</span></span>
              </div>
            ))}
          </div>
          <table className="hidden sm:table w-full table-fixed text-left text-xs border-collapse">
            <thead>
              <tr className="bg-surface-sunken border-b border-line text-ink-muted font-semibold uppercase tracking-wide text-2xs">
                <th className="p-2 w-7 text-center">#</th>
                <th className="p-2">Member</th>
                <th className="p-2 w-20 text-center leading-tight">Submitted</th>
                <th className="p-2 w-20 text-center leading-tight">Closed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {rows.map((m, i) => (
                <tr key={m.emp_id} className="hover:bg-surface-hover/40">
                  <td className="p-2 text-center text-ink-subtle font-semibold tabular-nums">{i + 1}</td>
                  <td className="p-2 font-semibold text-ink-strong truncate">{m.name}</td>
                  <td className="p-2 text-center font-bold text-blue-700 tabular-nums">{m.kaizen_submitted}</td>
                  <td className="p-2 text-center tabular-nums text-ink-subtle">{m.kaizen_confirmed_closed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function formatLocalDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function KaizenMyTeamAnalyticsTab() {
  const now = new Date();
  const [groupId, setGroupId] = useState(null);
  const [from, setFrom] = useState(formatLocalDate(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(formatLocalDate(now));
  const [leaderView, setLeaderView] = useState('top');
  const [expanded, setExpanded] = useState(null);
  const [memberPage, setMemberPage] = useState(1);
  const [isNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches);
  const MEMBER_PAGE_SIZE = isNarrow ? 3 : 5;

  const params = {};
  if (groupId) params.jh_group_id = groupId;
  if (from) params.from = new Date(`${from}T00:00:00`).toISOString();
  if (to) params.to = new Date(`${to}T23:59:59`).toISOString();
  const { data, isLoading } = useKaizenJhGroupAnalytics(params, true);

  const groups = data?.authorized_groups || [];
  const members = data?.members || [];

  const byKaizen = useMemo(() => [...members].sort((a, b) => b.kaizen_submitted - a.kaizen_submitted || String(a.name).localeCompare(String(b.name))), [members]);
  const topSubmitters = byKaizen.filter((m) => m.kaizen_submitted > 0).slice(0, 5);
  const lowSubmitters = [...members].sort((a, b) => a.kaizen_submitted - b.kaizen_submitted || String(a.name).localeCompare(String(b.name))).slice(0, 5);

  const sorted = byKaizen;
  const memberTotalPages = Math.max(1, Math.ceil(sorted.length / MEMBER_PAGE_SIZE));
  const memberValidPage = Math.min(Math.max(memberPage, 1), memberTotalPages);
  const pagedMembers = sorted.slice((memberValidPage - 1) * MEMBER_PAGE_SIZE, memberValidPage * MEMBER_PAGE_SIZE);

  const downloadMemberSummary = () => {
    if (members.length === 0) return toast.error('No members to export');
    const rows = sorted.map((m) => ({
      Name: m.name, 'Emp ID': m.emp_id, Submitted: m.kaizen_submitted, 'Confirmed Closed': m.kaizen_confirmed_closed,
      'Awaiting Review': m.kaizen_proposed, 'Approved for Implementation': m.kaizen_approved_for_implementation,
      'Submitted for Confirmation': m.kaizen_submitted_for_confirmation, Rejected: m.kaizen_rejected,
      'Savings (mixed units)': m.savings_total,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Team Summary');
    XLSX.writeFile(wb, `kaizen_team_summary_${(data?.jh_group_name || 'team').replace(/[^a-z0-9_.-]+/gi, '_')}.xlsx`);
  };

  return (
    <div className="space-y-4 py-4">
      <div className="flex flex-wrap items-center gap-3 bg-surface-raised p-3 rounded-xl border border-line shadow-xs text-xs">
        {groups.length > 1 && (
          <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/60 px-2 py-1.5">
            <Users size={13} className="text-blue-600 shrink-0" />
            <div className="flex flex-col leading-tight">
              <span className="text-2xs uppercase tracking-wider text-blue-700/80 font-semibold">Group ({groups.length})</span>
              <select value={groupId ?? data?.jh_group_id ?? ''} onChange={(e) => setGroupId(e.target.value)} className="-ml-0.5 bg-transparent font-bold text-ink-strong focus:outline-none">
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <span className="text-ink-muted">From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-line bg-surface-base px-2 py-1" />
          <span className="text-ink-muted">to</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-line bg-surface-base px-2 py-1" />
        </div>
        <div className="flex items-center gap-1">
          {(() => {
            const presets = [
              { label: 'This month', f: formatLocalDate(new Date(now.getFullYear(), now.getMonth(), 1)), t: formatLocalDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)) },
              { label: 'Last month', f: formatLocalDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)), t: formatLocalDate(new Date(now.getFullYear(), now.getMonth(), 0)) },
              { label: 'This year', f: formatLocalDate(new Date(now.getFullYear(), 0, 1)), t: formatLocalDate(new Date(now.getFullYear(), 11, 31)) },
            ];
            return presets.map((p) => (
              <button key={p.label} type="button" onClick={() => { setFrom(p.f); setTo(p.t); }} className={`px-2 py-1 rounded-md text-2xs font-semibold border ${from === p.f && to === p.t ? 'bg-blue-600 text-white border-blue-600' : 'bg-surface-base border-line text-ink-muted hover:text-ink-strong'}`}>{p.label}</button>
            ));
          })()}
          <button type="button" onClick={() => { setFrom(''); setTo(''); }} className={`px-2 py-1 rounded-md text-2xs font-semibold border ${!from && !to ? 'bg-blue-600 text-white border-blue-600' : 'bg-surface-base border-line text-ink-muted hover:text-ink-strong'}`}>All time</button>
        </div>
        <span className="text-xs text-ink-muted ml-auto font-semibold">{data?.jh_group_name}</span>
        <Button variant="outline" size="xs" className="gap-1.5 text-2xs" onClick={downloadMemberSummary}><FileText size={13} /> Team summary</Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-ink-muted py-6 text-center">Loading team analytics…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard label="Members" value={data?.member_count ?? 0} icon={Users} accent="blue" />
            <StatCard label="Participation" value={`${data?.participation_pct ?? 0}%`} sub="submitted ≥1 Kaizen" icon={TrendingUp} accent="emerald" />
            <StatCard label="Confirmed closed" value={data?.total_kaizen_confirmed_closed ?? 0} sub={`${data?.total_kaizen_submitted ?? 0} submitted total`} icon={CheckCircle2} accent="violet" />
            <StatCard label="Awaiting review" value={data?.total_kaizen_proposed ?? 0} sub="proposed, not yet reviewed" icon={Clock} accent="amber" />
            <StatCard label="Approved for impl." value={data?.total_kaizen_approved_for_implementation ?? 0} sub="awaiting implementation report" icon={Clock} accent="amber" />
            <StatCard label="Submitted for confirm." value={data?.total_kaizen_submitted_for_confirmation ?? 0} sub={`${data?.total_kaizen_rejected ?? 0} rejected total`} icon={Clock} accent="amber" />
          </div>

          <RankingCard view={leaderView} onView={setLeaderView} rows={leaderView === 'top' ? topSubmitters : lowSubmitters} />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-bold text-ink-strong">Team members</span>
          </div>

          <div className="rounded-xl border border-line">
            {/* Mobile: card per member — no side-scrolling tables */}
            <div className="sm:hidden divide-y divide-line">
              {members.length === 0 ? (
                <p className="p-4 text-center text-ink-muted text-sm">No members for this period.</p>
              ) : pagedMembers.map((m) => (
                <div key={m.emp_id} className="p-3 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink-strong text-sm break-words">{m.name}{!m.is_active && <span className="ml-1.5 text-2xs text-ink-subtle border border-line rounded px-1 align-middle">inactive</span>}</p>
                      <p className="text-2xs text-ink-muted">{m.emp_id}</p>
                    </div>
                    {m.kaizens.length > 0 && (
                      <button type="button" onClick={() => setExpanded(expanded === m.emp_id ? null : m.emp_id)} className="shrink-0 text-blue-700 font-semibold text-xs">{expanded === m.emp_id ? 'Hide' : 'Kaizens'}</button>
                    )}
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                    <div><dt className="text-ink-muted">Submitted</dt><dd className="font-semibold text-ink-strong text-sm">{m.kaizen_submitted}</dd></div>
                    <div><dt className="text-ink-muted">Confirmed closed</dt><dd className="font-semibold text-sm text-emerald-700">{m.kaizen_confirmed_closed}</dd></div>
                    <div><dt className="text-ink-muted">Awaiting review</dt><dd className="font-semibold text-sm text-amber-700">{m.kaizen_proposed}</dd></div>
                    <div><dt className="text-ink-muted">Approved for impl.</dt><dd className="font-semibold text-sm text-amber-700">{m.kaizen_approved_for_implementation}</dd></div>
                    <div><dt className="text-ink-muted">Submitted for confirm.</dt><dd className="font-semibold text-sm text-amber-700">{m.kaizen_submitted_for_confirmation}</dd></div>
                    <div><dt className="text-ink-muted">Rejected</dt><dd className="font-semibold text-sm text-red-700">{m.kaizen_rejected}</dd></div>
                    {m.savings_total > 0 && <div className="col-span-2"><dt className="text-ink-muted">Savings recorded</dt><dd className="font-semibold text-ink-strong text-sm inline-flex items-center gap-1"><IndianRupee size={12} />{m.savings_total.toLocaleString('en-IN')} <span className="text-2xs text-ink-subtle font-normal">(mixed units)</span></dd></div>}
                  </dl>
                  {expanded === m.emp_id && (
                    <div className="space-y-1.5">
                      {m.kaizens.map((k) => {
                        const chip = STATUS_CHIP[k.status] || pendingChip;
                        const Icon = chip.icon;
                        return (
                          <div key={k.kaizen_id} className="rounded-md border border-line bg-surface-base p-2">
                            <p className="text-xs text-ink-strong break-words">#{k.kaizen_id} {k.title}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-2xs text-ink-subtle">
                              <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-semibold ${chip.cls}`}><Icon size={10} /> {chip.label}</span>
                              {k.category && <span>{CATEGORY_LABEL[k.category] || k.category}</span>}
                              {k.timestamp && <span>{new Date(k.timestamp).toLocaleDateString()}</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop: table, sized to fit without scrolling */}
            <div className="hidden sm:block">
              <table className="w-full table-fixed text-left text-sm border-collapse">
                <colgroup>
                  <col className="w-[22%]" /><col className="w-[10%]" /><col className="w-[11%]" /><col className="w-[11%]" /><col className="w-[13%]" /><col className="w-[13%]" /><col className="w-[10%]" /><col className="w-[10%]" />
                </colgroup>
                <thead>
                  <tr className="bg-surface-sunken border-b border-line text-ink-muted font-semibold text-2xs uppercase tracking-wide [&_th]:whitespace-normal [&_th]:leading-tight">
                    <th className="px-2 py-2">Member</th>
                    <th className="px-2 py-2 text-center">Submitted</th>
                    <th className="px-2 py-2 text-center">Confirmed<br />closed</th>
                    <th className="px-2 py-2 text-center">Awaiting<br />review</th>
                    <th className="px-2 py-2 text-center">Approved<br />for impl.</th>
                    <th className="px-2 py-2 text-center">Submitted<br />for confirm.</th>
                    <th className="px-2 py-2 text-center">Rejected</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {members.length === 0 ? (
                    <tr><td colSpan={8} className="p-4 text-center text-ink-muted">No members for this period.</td></tr>
                  ) : pagedMembers.map((m) => (
                    <>
                      <tr key={m.emp_id} className="hover:bg-surface-hover/40 align-top">
                        <td className="px-2 py-2.5 font-semibold text-ink-strong break-words">
                          {m.name}{!m.is_active && <span className="ml-1.5 text-2xs text-ink-subtle border border-line rounded px-1 align-middle">inactive</span>}
                          <span className="block text-2xs text-ink-muted font-normal">{m.emp_id}</span>
                        </td>
                        <td className="px-2 py-2.5 text-center">{m.kaizen_submitted}</td>
                        <td className="px-2 py-2.5 text-center text-emerald-700 font-semibold">{m.kaizen_confirmed_closed}</td>
                        <td className="px-2 py-2.5 text-center text-amber-700 font-semibold">{m.kaizen_proposed}</td>
                        <td className="px-2 py-2.5 text-center text-amber-700 font-semibold">{m.kaizen_approved_for_implementation}</td>
                        <td className="px-2 py-2.5 text-center text-amber-700 font-semibold">{m.kaizen_submitted_for_confirmation}</td>
                        <td className="px-2 py-2.5 text-center text-red-700 font-semibold">{m.kaizen_rejected}</td>
                        <td className="px-2 py-2.5 text-right">
                          {m.kaizens.length > 0 && (
                            <button type="button" onClick={() => setExpanded(expanded === m.emp_id ? null : m.emp_id)} className="text-blue-700 font-semibold text-2xs">{expanded === m.emp_id ? 'Hide' : 'Kaizens'}</button>
                          )}
                        </td>
                      </tr>
                      {expanded === m.emp_id && m.kaizens.length > 0 && (
                        <tr className="bg-surface-sunken/40">
                          <td colSpan={8} className="p-2.5">
                            <div className="rounded-lg border border-line bg-surface-base p-2.5 space-y-1.5">
                              {m.kaizens.map((k) => {
                                const chip = STATUS_CHIP[k.status] || pendingChip;
                                const Icon = chip.icon;
                                return (
                                  <div key={k.kaizen_id} className="flex items-center justify-between gap-2 text-xs">
                                    <span className="text-ink-strong truncate">#{k.kaizen_id} {k.title}</span>
                                    <span className="flex items-center gap-2 shrink-0">
                                      {k.category && <span className="text-2xs text-ink-subtle">{CATEGORY_LABEL[k.category] || k.category}</span>}
                                      <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-2xs font-semibold ${chip.cls}`}><Icon size={10} /> {chip.label}</span>
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>

            {memberTotalPages > 1 && (
              <div className="flex items-center justify-between gap-2 border-t border-line bg-surface-sunken px-3 py-2 text-xs text-ink-muted">
                <span>Showing <strong>{(memberValidPage - 1) * MEMBER_PAGE_SIZE + 1}</strong>–<strong>{Math.min(memberValidPage * MEMBER_PAGE_SIZE, sorted.length)}</strong> of <strong>{sorted.length}</strong></span>
                <div className="flex items-center gap-1.5">
                  <Button variant="outline" size="xs" className="h-7 px-2 text-2xs gap-1" disabled={memberValidPage <= 1} onClick={() => setMemberPage(memberValidPage - 1)}><ChevronLeft size={12} /> Prev</Button>
                  <span className="px-1 font-semibold text-ink-strong">{memberValidPage} / {memberTotalPages}</span>
                  <Button variant="outline" size="xs" className="h-7 px-2 text-2xs gap-1" disabled={memberValidPage >= memberTotalPages} onClick={() => setMemberPage(memberValidPage + 1)}>Next <ChevronRight size={12} /></Button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
