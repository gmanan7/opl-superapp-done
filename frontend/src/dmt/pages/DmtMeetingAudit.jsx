import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, X } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { dmtApi } from '../lib/dmtApi';
import { todayStr } from '../lib/dmtDates';
import { ListPager } from '@/components/patterns/ListPager';
import { KpiFilterBar, optionsFrom } from './DmtKpiFilters';
import { GroupFilter } from '../components/GroupFilter';

// Every kind of change recorded on a meeting, its plain label and badge colour.
const EVENTS = {
    meeting_created: { label: 'Meeting created', tone: 'bg-blue-50 text-blue-700' },
    meeting_edited: { label: 'Details edited', tone: 'bg-amber-50 text-amber-700' },
    meeting_started: { label: 'Meeting started', tone: 'bg-emerald-50 text-emerald-700' },
    meeting_completed: { label: 'Meeting completed', tone: 'bg-emerald-50 text-emerald-700' },
    meeting_cancelled: { label: 'Meeting cancelled', tone: 'bg-slate-100 text-slate-600' },
    meeting_deleted: { label: 'Meeting deleted', tone: 'bg-rose-50 text-rose-700' },
    notes_edited: { label: 'Notes edited', tone: 'bg-amber-50 text-amber-700' },
    invitee_added: { label: 'Invitee added', tone: 'bg-indigo-50 text-indigo-700' },
    invitee_removed: { label: 'Invitee removed', tone: 'bg-rose-50 text-rose-700' },
    attendance_marked: { label: 'Attendance marked', tone: 'bg-teal-50 text-teal-700' },
    attendance_changed: { label: 'Attendance changed', tone: 'bg-orange-50 text-orange-700' },
    point_added: { label: 'Discussion point added', tone: 'bg-violet-50 text-violet-700' },
    point_notes_edited: { label: 'Point notes edited', tone: 'bg-violet-50 text-violet-700' },
    point_moved: { label: 'Point reordered', tone: 'bg-violet-50 text-violet-700' },
    point_removed: { label: 'Discussion point removed', tone: 'bg-rose-50 text-rose-700' },
    decision_added: { label: 'Decision added', tone: 'bg-cyan-50 text-cyan-700' },
    decision_edited: { label: 'Decision edited', tone: 'bg-cyan-50 text-cyan-700' },
    decision_removed: { label: 'Decision removed', tone: 'bg-rose-50 text-rose-700' },
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// 'YYYY-MM-DD' -> '24 Sep 2026' without going through Date (avoids the timezone day-shift).
const fmtDay = (s) => { if (!s) return ''; const [y, m, d] = String(s).slice(0, 10).split('-'); return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`; };
const when = (ts) => new Date(ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const q = (s) => `“${s}”`;
const short = (s, n = 140) => { const v = String(s || '').trim(); return v.length > n ? `${v.slice(0, n)}…` : v; };

function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// What happened, in a sentence, for the card body.
function detail(e) {
    switch (e.event) {
    case 'meeting_created': return 'Meeting was scheduled';
    case 'meeting_started': return 'Meeting was started';
    case 'meeting_completed': return 'Meeting was marked completed';
    case 'meeting_cancelled': return 'Meeting was cancelled';
    case 'meeting_deleted': return 'Meeting was deleted';
    case 'meeting_edited': return e.new_text;
    case 'notes_edited': return e.old_text ? `Notes changed: ${q(short(e.old_text))} → ${q(short(e.new_text) || '—')}` : `Notes written: ${q(short(e.new_text))}`;
    case 'invitee_added': return `${e.subject} added to the invite list`;
    case 'invitee_removed': return `${e.subject} removed from the invite list`;
    case 'attendance_marked': return `${e.subject} marked ${e.new_text}`;
    case 'attendance_changed': return `${e.subject}: ${e.old_text} → ${e.new_text}`;
    case 'point_added': return `Discussion point added: ${q(e.subject)}`;
    case 'point_notes_edited': return `Notes on ${q(e.subject)} changed: ${q(short(e.old_text) || '—')} → ${q(short(e.new_text) || '—')}`;
    case 'point_moved': return `${q(e.subject)} moved in the list`;
    case 'point_removed': return `Discussion point removed: ${q(e.subject)}`;
    case 'decision_added': return `Decision added: ${q(short(e.subject))}`;
    case 'decision_edited': return `Decision changed: ${q(short(e.old_text))} → ${q(short(e.new_text))}`;
    case 'decision_removed': return `Decision removed: ${q(short(e.subject))}`;
    default: return e.subject || null;
    }
}

// Organisation → "Meeting Audit Trail": every change to every meeting (details, status, notes, invitees, attendance,
// discussion points, decisions), newest first. `initialMeeting` opens it already narrowed to one meeting (the
// "Audit trail" button inside a meeting).
export function DmtMeetingAudit({ initialMeeting = null }) {
    // Opened for one meeting: start from the beginning so its whole story shows, however old the meeting is.
    const [from, setFrom] = useState(() => (initialMeeting ? '2020-01-01' : daysAgo(30)));
    const [to, setTo] = useState(() => todayStr());
    const [meeting, setMeeting] = useState(initialMeeting || 'all');
    const one = initialMeeting && meeting === initialMeeting; // narrowed server-side, so the range can be wider
    const res = useQuery({
        queryKey: ['dmt', 'meeting-audit', from, to, one ? meeting : null],
        queryFn: () => dmtApi.meetingAudit(from, to, one ? meeting : undefined),
        enabled: !!from && !!to,
    });
    const all = res.data?.entries || [];

    const [search, setSearch] = useState('');
    const [groupIds, setGroupIds] = useState(() => new Set()); // pick meetings by group; empty = every group you may see
    const [event, setEvent] = useState('all');
    const [who, setWho] = useState('all');
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(10);
    const resetPage = (fn) => (v) => { fn(v); setPage(0); };

    // Cascading filters: change any one and the others follow. Every dropdown lists only what is still possible given the
    // OTHER filters (pick a group → only its meetings, changes and people remain; pick a person → only the groups,
    // meetings and changes they touched), and a choice that stops being possible drops back to "All".
    const searchText = search.trim().toLowerCase();
    const personOf = (e) => e.changed_by_name || e.changed_by;
    const passes = (e, skip, f) => (
        (skip === 'search' || !searchText || `${e.meeting_title || ''} ${e.subject || ''} ${e.new_text || ''}`.toLowerCase().includes(searchText))
        && (skip === 'group' || f.groups.size === 0 || (e.tier_id && f.groups.has(e.tier_id)))
        && (skip === 'meeting' || f.meeting === 'all' || e.meeting_id === f.meeting)
        && (skip === 'event' || f.event === 'all' || e.event === f.event)
        && (skip === 'who' || f.who === 'all' || personOf(e) === f.who)
    );
    const facets = useMemo(() => {
        const raw = { groups: groupIds, meeting, event, who };
        const groups = new Set(); const meetings = new Map(); const events = new Set(); const people = new Set();
        for (const e of all) {
            if (e.tier_id && passes(e, 'group', raw)) groups.add(e.tier_id);
            if (e.meeting_id && !meetings.has(e.meeting_id) && passes(e, 'meeting', raw)) meetings.set(e.meeting_id, `${e.meeting_title || 'Meeting'} — ${fmtDay(e.meeting_date)}`);
            if (passes(e, 'event', raw)) events.add(e.event);
            if (passes(e, 'who', raw)) people.add(personOf(e));
        }
        return { groups, meetings, events, people };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [all, searchText, groupIds, meeting, event, who]);

    const effGroups = useMemo(() => new Set([...groupIds].filter((id) => facets.groups.has(id))), [groupIds, facets.groups]);
    const effMeeting = meeting === 'all' || facets.meetings.has(meeting) ? meeting : 'all';
    const effEvent = event === 'all' || facets.events.has(event) ? event : 'all';
    const effWho = who === 'all' || facets.people.has(who) ? who : 'all';
    const meetingOptions = [...facets.meetings].map(([value, label]) => ({ value, label }));
    const eventOptions = Object.entries(EVENTS).filter(([value]) => facets.events.has(value)).map(([value, v]) => ({ value, label: v.label }));
    const personOptions = optionsFrom([...facets.people]);

    const entries = useMemo(
        () => all.filter((e) => passes(e, null, { groups: effGroups, meeting: effMeeting, event: effEvent, who: effWho })),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [all, searchText, effGroups, effMeeting, effEvent, effWho],
    );
    const pageCount = Math.max(1, Math.ceil(entries.length / pageSize));
    const safePage = Math.min(page, pageCount - 1);
    const rows = entries.slice(safePage * pageSize, (safePage + 1) * pageSize);
    const picked = meetingOptions.find((o) => o.value === effMeeting);

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex flex-wrap items-end gap-3">
                    <div className="space-y-1">
                        <label className="text-sm font-semibold text-slate-800">From</label>
                        <input type="date" value={from} max={to} onChange={(e) => { setFrom(e.target.value || from); setPage(0); }}
                            className="block h-11 w-full rounded-md border border-slate-200 px-3 text-sm sm:w-44" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-sm font-semibold text-slate-800">To</label>
                        <input type="date" value={to} min={from} max={todayStr()} onChange={(e) => { setTo(e.target.value || to); setPage(0); }}
                            className="block h-11 w-full rounded-md border border-slate-200 px-3 text-sm sm:w-44" />
                    </div>
                </div>
                {res.data && <p className="text-sm text-slate-600"><span className="font-semibold text-slate-900">{all.length}</span> change{all.length === 1 ? '' : 's'} in this period</p>}
            </div>

            {picked && (
                <button type="button" onClick={() => { setMeeting('all'); setPage(0); }}
                    className="flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
                    Showing only: {picked.label} <X className="h-3 w-3" />
                </button>
            )}

            {res.isLoading && <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>}
            {res.error && <p className="text-sm text-rose-600">{res.error.message}</p>}
            {res.data && all.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No meeting changes were recorded in this period.</p>}

            {res.data && all.length > 0 && <GroupFilter selected={effGroups} only={facets.groups} onChange={(s) => { setGroupIds(s); setPage(0); }} />}

            {res.data && all.length > 0 && (
                <KpiFilterBar
                    search={search} onSearch={resetPage(setSearch)} searchPlaceholder="Search meeting, person, topic…"
                    selects={[
                        { label: 'Meeting', value: effMeeting, onChange: resetPage(setMeeting), options: meetingOptions },
                        { label: 'Change', value: effEvent, onChange: resetPage(setEvent), options: eventOptions },
                        { label: 'Person', value: effWho, onChange: resetPage(setWho), options: personOptions },
                    ]}
                    onClear={() => { setSearch(''); setGroupIds(new Set()); setMeeting('all'); setEvent('all'); setWho('all'); setPage(0); }}
                />
            )}
            {res.data && all.length > 0 && entries.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No changes match these filters.</p>}

            <div className="space-y-2">
                {rows.map((e) => {
                    const ev = EVENTS[e.event] || { label: e.event, tone: 'bg-slate-100 text-slate-600' };
                    const d = detail(e);
                    return (
                        <div key={e.id} className="rounded-lg border border-slate-200 bg-white p-3">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                    <Badge className={`text-xs ${ev.tone}`}>{ev.label}</Badge>
                                    <span className="min-w-0 truncate text-sm font-semibold text-slate-900">{e.meeting_title || 'Unknown meeting'}</span>
                                    {e.meeting_date && <span className="shrink-0 text-xs text-slate-500">{fmtDay(e.meeting_date)}</span>}
                                </div>
                                <span className="text-xs text-slate-400">{when(e.changed_at)}</span>
                            </div>
                            {d && <p className="mt-1.5 break-words text-sm text-slate-700">{cap(d)}</p>}
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
