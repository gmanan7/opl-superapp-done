import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { ClipboardCheck, Download, FileText, Plus, Trash2, Upload, Users, X } from 'lucide-react';
import { downloadAuditTemplateSheet, parseAuditFile, hasBlockingErrors, toFormState } from '../../lib/auditTemplateExcel';
import { toast } from 'sonner';
import { getSessionContext, roleAtLeast } from '../../lib/auth';
import { api } from '../../lib/api';
import {
  useZones, useCreateZone, useDeleteZone,
  useAuditHomeZones, useSetAuditHomeZone, useRemoveAuditHomeZone,
  useAuditTemplates, useCreateAuditTemplate, useUpdateAuditTemplate, useDeleteAuditTemplate,
  useAddAuditTemplateQuestion, useUpdateAuditTemplateQuestion,
  useAddAuditTemplateCategory, useUpdateAuditTemplateCategory,
  useAuditSchedules, useCreateAuditSchedule, useUpdateAuditSchedule, useDeleteAuditSchedule,
  useAddAuditScheduleAuditor, useCopyAuditScheduleAuditors, useRemoveAuditScheduleAuditor,
  useAuditSubmissions, useStartAuditSubmission,
  useAuditOccurrences, useCloseAuditOccurrence,
  useMyAuditAdminStatus, useAuditTemplateAdmins, useAddAuditTemplateAdmin, useRemoveAuditTemplateAdmin,
  useAuditGlobalAdmins, useAddAuditGlobalAdmin, useRemoveAuditGlobalAdmin,
  useAuditChangeRequests, useReviewAuditChangeRequest, useAuditAuditTrail,
} from '../../hooks/useAudits';
import { StatusBadge, EmptyState, WorkerPicker, ListPager } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

const CATEGORIES = [
  { value: 'sort', label: 'Sort' },
  { value: 'set_in_order', label: 'Set in Order' },
  { value: 'shine', label: 'Shine' },
  { value: 'standardize', label: 'Standardize' },
  { value: 'sustain', label: 'Sustain' },
];

const STRUCTURE_OPTIONS = [
  { value: 'questions', label: 'Questions only', hint: 'A flat list of questions.' },
  { value: 'categories', label: 'Categories only', hint: 'The auditor scores each category directly — no questions.' },
  { value: 'categories_questions', label: 'Questions grouped under categories', hint: 'Questions live under category headings (like 5S).' },
];
const SCORING_OPTIONS = [
  { value: 'required', label: 'Score required', hint: 'Every item must be scored to submit.' },
  { value: 'optional', label: 'Score optional', hint: 'The auditor may skip scoring any item.' },
  { value: 'off', label: 'No scoring', hint: 'Just photos and comments — no marks at all.' },
];
const PILLAR_LABEL = { sort: 'Sort', set_in_order: 'Set in Order', shine: 'Shine', standardize: 'Standardize', sustain: 'Sustain' };
const prettyCat = (name) => PILLAR_LABEL[name] || name;

// Role-based shortcut only — the real answer (role tier OR being a per-template admin,
// which can be any role) comes from useMyAuditAdminStatus(); this just avoids a flash of
// the wrong tab for the common case while that request is in flight.
function roleImpliesAuditAdmin(role) {
  return roleAtLeast(role, 'be_lead');
}
// Only a true BE-lead tier may create a brand-new audit template, appoint/remove a
// template's admins, or manage factory-wide Zones/Home Zones — mirrors the backend's
// BE_LEAD_ROLES-only gates. Being an appointed admin of one audit grants none of this.
function isTrueBeLead(role) {
  return roleAtLeast(role, 'be_lead');
}

const CATEGORY_LABEL_BY_VALUE = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label]));

// Exports an already-saved template's questionnaire in the same Question/Category
// shape the New Audit Template dialog imports — so a downloaded, saved questionnaire
// round-trips straight back in via Import from Excel.
function downloadTemplateQuestionnaire(template) {
  const questions = (template.questions || []).slice().sort((a, b) => (a.question_order ?? 0) - (b.question_order ?? 0));
  const rows = questions.map((q) => ({ Question: q.question_text, Category: CATEGORY_LABEL_BY_VALUE[q.category] || q.category }));
  const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Question: '', Category: '' }], { header: ['Question', 'Category'] });
  sheet['!cols'] = [{ wch: 60 }, { wch: 18 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Questions');
  const safeName = (template.name || 'audit_questionnaire').replace(/[\\/:*?"<>|]/g, '_');
  XLSX.writeFile(workbook, `${safeName}.xlsx`);
}

// Client-side paging for a list: returns the current slice plus props for the shared ListPager.
function usePaged(items, defaultSize = 5) {
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(defaultSize);
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const p = Math.min(page, pageCount - 1);
  return {
    slice: items.slice(p * size, p * size + size),
    pager: { total: items.length, page: p, pageCount, pageSize: size, pageSizeOptions: [5, 10, 20], onPage: setPage, onPageSize: (n) => { setSize(n); setPage(0); } },
  };
}

export function AuditsHome() {
  const navigate = useNavigate();
  const ctx = getSessionContext();
  const { data: myAdminStatus } = useMyAuditAdminStatus();
  const isAdmin = myAdminStatus ? myAdminStatus.isAuditAdmin : roleImpliesAuditAdmin(ctx?.role);
  // "Full" audit capability = true BE-lead OR an appointed Global 5S Admin (server-derived,
  // since a global admin can be any role) — can create templates, configure/schedule ANY
  // audit. Narrower than that: canManageAuditAdmins is a true-BE-lead-only role check, used
  // for appointment rights (template admins, global admins) and Zones/Home Zones, which a
  // Global 5S Admin does NOT get.
  const isFullAuditAdmin = myAdminStatus ? myAdminStatus.isBeLead : isTrueBeLead(ctx?.role);
  const canManageAuditAdmins = isTrueBeLead(ctx?.role);
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'my';
  const setTab = (t) => setSearchParams(t === 'my' ? {} : { tab: t }, { replace: true });

  const { data: submissions = [], isLoading: subsLoading } = useAuditSubmissions();
  const { data: schedules = [] } = useAuditSchedules();
  const startSubmission = useStartAuditSubmission();

  const todayStr = new Date().toLocaleDateString('en-CA'); // 'YYYY-MM-DD' in local time
  const myCompleted = submissions.filter((s) => s.status === 'submitted' && s.is_mine);
  const myScheduleList = schedules.filter((s) => s.is_my_audit);
  const assignedPaged = usePaged(myScheduleList);
  const completedPaged = usePaged(myCompleted);

  async function handleStart(scheduleId) {
    try {
      const created = await startSubmission.mutateAsync({ scheduleId, dueDate: new Date().toISOString().slice(0, 10) });
      navigate(`/audits/${created.id}`);
    } catch (e) {
      toast.error(e.message || 'Could not start audit');
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5 text-primary" /> Audits
        </h1>
      </div>

      {/* One row, no scroll: the buttons share the width evenly and use short labels on a
          phone. Full labels from sm up. Per-button bottom border carries the active state. */}
      <div className="flex gap-0.5 border-b border-slate-200 sm:gap-1">
        {[
          { key: 'my', label: 'My Audits', short: 'Mine', show: true },
          { key: 'all', label: 'All Audits', short: 'All', show: isFullAuditAdmin },
          { key: 'configure', label: 'Configure', short: 'Config', show: isAdmin },
          { key: 'trail', label: 'Audit Trail', short: 'Trail', show: isAdmin },
        ].filter((t) => t.show).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`min-w-0 flex-1 whitespace-nowrap px-1 py-2 text-center text-xs font-semibold border-b-2 -mb-px sm:flex-none sm:px-3 sm:text-sm ${tab === t.key ? 'border-primary text-primary' : 'border-transparent text-slate-500'}`}
          >
            <span className="sm:hidden">{t.short}</span>
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {tab === 'my' && (
        <div className="space-y-6">
          <section>
            <h2 className="text-sm font-bold text-slate-700 mb-2">Assigned to you</h2>
            {myScheduleList.length === 0 ? (
              <EmptyState title="No audits assigned" body="You'll see an audit here once an Audit Admin adds you as an auditor." />
            ) : (
              <>
                <div className="space-y-2">
                  {assignedPaged.slice.map((s) => {
                    const draftId = s.open_submission_id;
                    const doneId = s.my_current_submission_id;
                    const canStartNow = !draftId && !doneId && s.current_occurrence && s.current_occurrence <= todayStr;
                    const info = (
                      <div className="min-w-0">
                        <div className="font-semibold text-sm text-slate-900">{s.template_name} · {s.zone_name}</div>
                        <div className="text-xs text-slate-500">
                          {describeRecurrence(s)}
                          {s.current_occurrence ? ` · this one: ${s.current_occurrence}` : ''}
                        </div>
                      </div>
                    );
                    const pill = 'shrink-0 rounded-full px-3 py-1 text-xs font-semibold';
                    if (draftId) {
                      return (
                        <button key={s.id} type="button" onClick={() => navigate(`/audits/${draftId}`)} className="w-full text-left rounded-lg border border-slate-200 bg-white p-3 flex items-center justify-between gap-3 hover:bg-slate-50">
                          {info}<span className={`${pill} bg-amber-100 text-amber-800`}>Resume draft</span>
                        </button>
                      );
                    }
                    if (doneId) {
                      return (
                        <button key={s.id} type="button" onClick={() => navigate(`/audits/${doneId}`)} className="w-full text-left rounded-lg border border-slate-200 bg-white p-3 flex items-center justify-between gap-3 hover:bg-slate-50">
                          {info}<span className={`${pill} bg-emerald-50 text-emerald-700`}>✓ Submitted — view</span>
                        </button>
                      );
                    }
                    if (canStartNow) {
                      return (
                        <button key={s.id} type="button" onClick={() => handleStart(s.id)} disabled={startSubmission.isPending} className="w-full text-left rounded-lg border border-slate-200 bg-white p-3 flex items-center justify-between gap-3 hover:bg-slate-50 disabled:opacity-60">
                          {info}<span className={`${pill} bg-primary text-white`}>Start</span>
                        </button>
                      );
                    }
                    return (
                      <div key={s.id} className="rounded-lg border border-slate-200 bg-white p-3 flex items-center justify-between gap-3">
                        {info}<span className="text-xs text-slate-400 shrink-0">Scheduled for {s.next_occurrence || s.current_occurrence}</span>
                      </div>
                    );
                  })}
                </div>
                <ListPager {...assignedPaged.pager} noun="audits" />
              </>
            )}
          </section>

          <section>
            <h2 className="text-sm font-bold text-slate-700 mb-2">Completed</h2>
            {subsLoading ? null : myCompleted.length === 0 ? (
              <EmptyState title="No completed audits yet" body="Submitted audits will show up here with their score." />
            ) : (
              <>
              <div className="space-y-2">
                {completedPaged.slice.map((s) => (
                  <button key={s.id} onClick={() => navigate(`/audits/${s.id}`)} className="w-full text-left rounded-lg border border-slate-200 bg-white p-3 flex items-center justify-between gap-3 hover:bg-slate-50">
                    <div>
                      <div className="font-semibold text-sm text-slate-900">{s.template_name} · {s.zone_name}</div>
                      <div className="text-xs text-slate-500">
                        Submitted {s.submitted_at ? new Date(s.submitted_at).toLocaleDateString() : ''}
                        {s.occurrence_status === 'open' && s.expected_count > 1 ? ` · ${s.submitted_count}/${s.expected_count} auditors done` : ''}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <StatusBadge status="success" label={s.total_score != null ? `You: ${Number(s.total_score).toFixed(1)}/${s.max_score != null ? Number(s.max_score) : 4}` : 'Submitted'} />
                      {s.occurrence_status === 'closed' && s.combined_score != null && (
                        <div className="text-[11px] text-slate-500 mt-0.5">Combined {Number(s.combined_score).toFixed(1)}/{Number(s.combined_max || s.max_score || 4)}</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
              <ListPager {...completedPaged.pager} noun="audits" />
              </>
            )}
          </section>
        </div>
      )}

      {tab === 'all' && isFullAuditAdmin && <AuditBoard schedules={schedules} navigate={navigate} todayStr={todayStr} />}


      {tab === 'trail' && isAdmin && <AuditTrailTab />}

      {tab === 'configure' && isAdmin && (
        <ConfigureAudits
          canManageAuditAdmins={canManageAuditAdmins}
          isFullAuditAdmin={isFullAuditAdmin}
          scheduleAdminOnly={!!myAdminStatus && !myAdminStatus.isBeLead && (myAdminStatus.adminTemplateIds || []).length === 0 && myAdminStatus.isScheduleAdmin}
        />
      )}
    </div>
  );
}

// Plant-wide view for BE / Global Audit Admins: every audit occurrence, bucketed. Each
// occurrence collects one scorecard per auditor; the combined score is their average and
// the occurrence stays "In progress" until everyone submits (or it's force-closed).
// Each All-Audits column shows 5 cards at a time with its own pager, so a plant with a long
// history doesn't produce three endless scrolling lists.
function PagedColumn({ title, items, empty, render }) {
  const { slice, pager } = usePaged(items);
  return (
    <section className="space-y-2 min-w-0">
      <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {title} <span className="text-slate-400">({items.length})</span>
      </h3>
      <div className="space-y-2">
        {items.length === 0 ? <p className="text-xs text-slate-400">{empty}</p> : slice.map(render)}
      </div>
      <ListPager {...pager} noun="audits" />
    </section>
  );
}
function AuditBoard({ schedules, navigate, todayStr }) {
  const [view, setView] = useState('board'); // 'board' | 'list'
  const { data: occurrences = [], isLoading } = useAuditOccurrences();
  const closeOcc = useCloseAuditOccurrence();
  const startSubmission = useStartAuditSubmission();

  const openOcc = occurrences.filter((o) => o.status === 'open').sort((a, b) => String(b.due_date).localeCompare(String(a.due_date)));
  const closedOcc = occurrences.filter((o) => o.status === 'closed').sort((a, b) => String(b.closed_at || b.due_date).localeCompare(String(a.closed_at || a.due_date)));
  const openBySchedDate = new Set(occurrences.map((o) => `${o.schedule_id}|${String(o.due_date).slice(0, 10)}`));
  const scheduled = schedules
    .filter((s) => s.is_active !== false && s.next_occurrence && !openBySchedDate.has(`${s.id}|${s.next_occurrence}`))
    .sort((a, b) => String(a.next_occurrence).localeCompare(String(b.next_occurrence)));

  async function handleClose(o) {
    if (!window.confirm(`Close this audit now? ${o.submitted_count} of ${o.expected_count} auditors submitted — only their scores count toward the combined grade.`)) return;
    try { await closeOcc.mutateAsync(o.id); toast.success('Audit closed'); }
    catch (e) { toast.error(e.message || 'Could not close'); }
  }

  const openScorecard = (o) => {
    const first = (o.scorecards || [])[0];
    if (first) navigate(`/audits/${first.id}`, { state: { from: 'all' } });
  };

  const OccCard = ({ o, tone }) => (
    <div className={`w-full rounded-lg border p-3 ${tone}`}>
      <button onClick={() => openScorecard(o)} className="text-left w-full hover:opacity-70">
        <div className="font-semibold text-sm text-slate-900">{o.template_name} · {o.zone_name}</div>
        <div className="text-xs text-slate-500 mt-0.5">{String(o.due_date).slice(0, 10)}
          {o.status === 'closed'
            ? (o.combined_score != null
              ? (Number(o.combined_max) === 1 ? ` · ${Math.round(Number(o.combined_score) * 100)}% Yes` : ` · combined ${Number(o.combined_score).toFixed(1)}/${Number(o.combined_max || 4)}`)
              : ' · no score')
            : ` · ${o.submitted_count}/${o.expected_count} auditors submitted${String(o.due_date).slice(0, 10) < todayStr ? ' · overdue' : ''}`}
        </div>
      </button>
      {o.status === 'open' && (
        <button onClick={() => handleClose(o)} disabled={closeOcc.isPending} className="mt-2 text-xs font-medium text-rose-600 hover:underline">
          Close now
        </button>
      )}
      {o.status === 'closed' && (
        <button onClick={() => navigate('/audits/report/' + o.id)} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline">
          <FileText size={12} /> Generate Report
        </button>
      )}
    </div>
  );
  // A scheduled audit has no round yet. It only opens (starting the round) once its day has come.
  const openScheduled = async (s) => {
    try {
      const created = await startSubmission.mutateAsync({ scheduleId: s.id, dueDate: String(s.next_occurrence).slice(0, 10) });
      navigate(`/audits/${created.id}`, { state: { from: 'all' } });
    } catch (e) {
      toast.error(e.message || 'Could not open audit');
    }
  };
  const SchedCard = ({ s }) => {
    const body = (
      <>
        <div className="font-semibold text-sm text-slate-900">{s.template_name} · {s.zone_name}</div>
        <div className="text-xs text-slate-500 mt-0.5">{describeRecurrence(s)} · next {s.next_occurrence}</div>
        <div className="text-xs text-slate-400 mt-0.5">Audit Admin: {s.admin_name}</div>
      </>
    );
    const due = String(s.next_occurrence).slice(0, 10) <= todayStr;
    return due ? (
      <button type="button" onClick={() => openScheduled(s)} disabled={startSubmission.isPending} className="w-full text-left rounded-lg border border-slate-200 p-3 hover:bg-slate-50">{body}</button>
    ) : (
      <div className="w-full rounded-lg border border-slate-200 p-3">{body}</div>
    );
  };
  const columns = (
    <>
      <PagedColumn title="Scheduled" items={scheduled} empty="Nothing upcoming."
        render={(s) => <SchedCard key={s.id} s={s} />} />
      <PagedColumn title="In progress" items={openOcc} empty="None started."
        render={(o) => <OccCard key={o.id} o={o} tone="border-amber-200 bg-amber-50/40" />} />
      <PagedColumn title="Completed" items={closedOcc} empty="None yet."
        render={(o) => <OccCard key={o.id} o={o} tone="border-emerald-200 bg-emerald-50/40" />} />
    </>
  );

  return (
    <div className="space-y-3">
      <div className="flex justify-end gap-1">
        {['board', 'list'].map((v) => (
          <button key={v} onClick={() => setView(v)} className={`rounded-full px-3 py-1 text-xs font-semibold ${view === v ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600'}`}>{v === 'board' ? 'Board' : 'List'}</button>
        ))}
      </div>
      {isLoading ? <p className="text-sm text-slate-400 text-center py-8">Loading…</p>
        : view === 'board'
          ? <div className="grid gap-4 md:grid-cols-3">{columns}</div>
          : <div className="space-y-5">{columns}</div>}
    </div>
  );
}


const CONFIGURE_SUBTABS = [
  { key: 'templates', label: 'Templates', short: 'Templates', hideForScheduleAdmin: true },
  { key: 'schedules', label: 'Schedules', short: 'Schedules' },
  { key: 'zones', label: 'Zones', short: 'Zones', hideForScheduleAdmin: true },
  { key: 'globalAdmins', label: 'Global Audit Admin', short: 'Admins', beLeadOnly: true },
  { key: 'activity', label: 'Change Requests', short: 'Changes' },
];

function ConfigureAudits({ canManageAuditAdmins, isFullAuditAdmin, scheduleAdminOnly }) {
  const { data: templates = [] } = useAuditTemplates();
  const { data: zones = [] } = useZones();
  const { data: schedules = [] } = useAuditSchedules();
  const { data: homeZones = [] } = useAuditHomeZones();
  const deleteTemplate = useDeleteAuditTemplate();
  const deleteSchedule = useDeleteAuditSchedule();
  const currentEmpId = getSessionContext()?.worker_id || '';
  const [subtab, setSubtab] = useState(scheduleAdminOnly ? 'schedules' : 'templates');
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [showScheduleDialog, setShowScheduleDialog] = useState(null); // { template } or { template, editing: schedule }
  const [editingTemplate, setEditingTemplate] = useState(null);

  async function handleDeleteTemplate(t) {
    if (!window.confirm(`Delete the audit type "${t.name}"? Its schedules stop and it disappears from the list. Past completed audits stay in the records.`)) return;
    try {
      await deleteTemplate.mutateAsync(t.id);
      toast.success('Audit type deleted');
    } catch (e) {
      toast.error(e.message || 'Could not delete audit type');
    }
  }
  async function handleDeleteSchedule(s) {
    if (!window.confirm(`Delete this ${s.recurrence === 'none' ? 'one-off' : s.recurrence} schedule for "${s.template_name} · ${s.zone_name}"? It stops generating new audits. Audits already done stay.`)) return;
    try {
      await deleteSchedule.mutateAsync(s.id);
      toast.success('Schedule deleted');
    } catch (e) {
      toast.error(e.message || 'Could not delete schedule');
    }
  }

  const fiveSTemplate = templates.find((t) => t.name === '5S Audit');
  const homeZoneByEmpId = useMemo(() => Object.fromEntries(homeZones.map((h) => [h.emp_id, h.zone_id])), [homeZones]);

  return (
    <div className="space-y-4">
      {/* One row: on a phone the pills share the width evenly and drop to 11px + short labels
          so every one fits without truncation; from sm up they size to their full label. */}
      <div className="flex gap-1">
        {CONFIGURE_SUBTABS.filter((t) => (!t.beLeadOnly || canManageAuditAdmins) && !(t.hideForScheduleAdmin && scheduleAdminOnly)).map((t) => (
          <button
            key={t.key}
            onClick={() => setSubtab(t.key)}
            className={`min-w-0 flex-1 whitespace-nowrap rounded-full px-1 py-1.5 text-center text-[11px] font-semibold transition-colors sm:flex-none sm:px-3 sm:text-xs ${subtab === t.key ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            <span className="sm:hidden">{t.short}</span>
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {subtab === 'templates' && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-slate-500">Each audit is administered independently — appointing someone on one audit grants nothing on another, unless they're a Global Audit Admin.</p>
            {isFullAuditAdmin && (
              <Button size="sm" onClick={() => setShowTemplateDialog(true)}>
                <Plus className="w-4 h-4 mr-1" /> {fiveSTemplate ? 'New Audit' : '5S Audit'}
              </Button>
            )}
          </div>
          {templates.length === 0 ? (
            <EmptyState title="No audit templates yet" body="Create the 5S Audit questionnaire to start scheduling audits." />
          ) : (
            <>
              {/* Mobile: a card per template — the action row wraps instead of forcing the
                  whole table to scroll sideways. Desktop (sm+): the real table. */}
              <div className="space-y-2 sm:hidden">
                {templates.map((t) => (
                  <div key={t.id} className="rounded-md border border-slate-200 bg-white p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-900">{t.name}</span>
                      <span className="shrink-0 text-xs text-slate-500">{t.questions?.length || 0} question{(t.questions?.length || 0) === 1 ? '' : 's'}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => downloadTemplateQuestionnaire(t)}><Download className="w-4 h-4 mr-1" /> Download</Button>
                      {t.is_admin && <Button size="sm" variant="outline" onClick={() => setEditingTemplate(t)}>Edit</Button>}
                      {t.is_admin && <Button size="sm" onClick={() => setShowScheduleDialog({ template: t })}>Schedule</Button>}
                      {isFullAuditAdmin && (
                        <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700" onClick={() => handleDeleteTemplate(t)} disabled={deleteTemplate.isPending}>
                          <Trash2 className="w-4 h-4 mr-1" /> Delete
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden sm:block rounded-md border border-slate-200 bg-white overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Audit</TableHead>
                      <TableHead className="w-28 text-center">Questions</TableHead>
                      <TableHead className="w-64"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {templates.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-semibold text-sm text-slate-900">{t.name}</TableCell>
                        <TableCell className="text-center text-xs text-slate-500">{t.questions?.length || 0}</TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => downloadTemplateQuestionnaire(t)}><Download className="w-4 h-4 mr-1" /> Download</Button>
                            {t.is_admin && <Button size="sm" variant="outline" onClick={() => setEditingTemplate(t)}>Edit</Button>}
                            {t.is_admin && <Button size="sm" onClick={() => setShowScheduleDialog({ template: t })}>Schedule</Button>}
                            {isFullAuditAdmin && (
                              <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700" onClick={() => handleDeleteTemplate(t)} disabled={deleteTemplate.isPending}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </section>
      )}

      {subtab === 'schedules' && (
        <section>
          {schedules.length === 0 ? (
            <EmptyState title="Nothing scheduled" body="Go to Templates and hit Schedule to start assigning auditors." />
          ) : (
            <div className="rounded-md border border-slate-200 bg-white divide-y divide-slate-100">
              {schedules.map((s) => (
                <ScheduleRow
                  key={s.id}
                  schedule={s}
                  otherSchedules={schedules.filter((o) => o.id !== s.id)}
                  homeZoneByEmpId={homeZoneByEmpId}
                  onEdit={() => setShowScheduleDialog({ template: { id: s.template_id, name: s.template_name }, editing: s })}
                  onDelete={(isFullAuditAdmin || s.admin_emp_id === currentEmpId) ? () => handleDeleteSchedule(s) : null}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {subtab === 'zones' && isFullAuditAdmin && (
        <div className="space-y-6">
          <ZonesSection zones={zones} />
          <HomeZonesSection zones={zones} homeZones={homeZones} />
        </div>
      )}
      {subtab === 'zones' && !isFullAuditAdmin && (
        <EmptyState title="Not available" body="Zones and home zones are shared, factory-wide master data — ask your BE-lead or a Global Audit Admin to manage them." />
      )}

      {subtab === 'globalAdmins' && canManageAuditAdmins && <GlobalAdminsSection />}

      {subtab === 'activity' && <ChangeRequestsSection />}

      {showTemplateDialog && <CreateTemplateDialog onClose={() => setShowTemplateDialog(false)} />}
      {showScheduleDialog && (
        <CreateScheduleDialog
          template={showScheduleDialog.template}
          editing={showScheduleDialog.editing}
          zones={zones}
          lockZone={scheduleAdminOnly}
          onClose={() => setShowScheduleDialog(null)}
        />
      )}
      {editingTemplate && <EditTemplateDialog template={editingTemplate} isFullAuditAdmin={isFullAuditAdmin} onClose={() => setEditingTemplate(null)} />}
    </div>
  );
}

const STRUCTURE_LABEL = Object.fromEntries(STRUCTURE_OPTIONS.map((s) => [s.value, s.label]));

function EditTemplateDialog({ template, isFullAuditAdmin, onClose }) {
  const { data: templates = [] } = useAuditTemplates();
  const live = templates.find((t) => t.id === template.id) || template;
  const structure = live.structure || 'categories_questions';
  const updateTemplate = useUpdateAuditTemplate();
  const updateQuestion = useUpdateAuditTemplateQuestion();
  const addQuestion = useAddAuditTemplateQuestion();
  const addCategory = useAddAuditTemplateCategory();
  const updateCategory = useUpdateAuditTemplateCategory();

  const [scoringMode, setScoringMode] = useState(live.scoring_mode || 'required');
  const [scoreMin, setScoreMin] = useState(String(live.score_min ?? 1));
  const [scoreMax, setScoreMax] = useState(String(live.score_max ?? 4));
  const [scoreStep, setScoreStep] = useState(String(live.score_step ?? 1));
  const [limitAuditors, setLimitAuditors] = useState(live.max_auditors != null);
  const [maxAuditors, setMaxAuditors] = useState(String(live.max_auditors ?? 3));
  const [newText, setNewText] = useState('');
  const [newQCategoryId, setNewQCategoryId] = useState('');
  const [newPhotoRequired, setNewPhotoRequired] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatPhoto, setNewCatPhoto] = useState(false);

  const activeCategories = (live.categories || []).filter((c) => c.is_active).sort((a, b) => (a.category_order ?? 0) - (b.category_order ?? 0));
  const activeQuestions = (live.questions || []).filter((q) => q.is_active).sort((a, b) => (a.question_order ?? 0) - (b.question_order ?? 0));
  const catNameById = Object.fromEntries(activeCategories.map((c) => [c.id, c.name]));

  async function saveSettings() {
    try {
      if (limitAuditors && !(Number(maxAuditors) >= 1)) { toast.error('Enter the auditor limit (1 or more)'); return; }
      await updateTemplate.mutateAsync({
        id: template.id, scoring_mode: scoringMode,
        score_min: Number(scoreMin), score_max: Number(scoreMax), score_step: Number(scoreStep),
        max_auditors: limitAuditors ? Number(maxAuditors) : null,
      });
      toast.success('Settings saved');
    } catch (e) { toast.error(e.message || 'Could not save settings'); }
  }
  async function handleRetireQuestion(q) {
    try { await updateQuestion.mutateAsync({ id: q.id, is_active: false }); toast.success('Question retired'); }
    catch (e) { toast.error(e.message || 'Could not retire question'); }
  }
  async function handleRetireCategory(c) {
    try { await updateCategory.mutateAsync({ id: c.id, is_active: false }); toast.success('Category retired'); }
    catch (e) { toast.error(e.message || 'Could not retire category'); }
  }
  async function toggleQuestionPhoto(q, checked) {
    try { await updateQuestion.mutateAsync({ id: q.id, photo_required: checked }); }
    catch (e) { toast.error(e.message || 'Could not update question'); }
  }
  async function toggleCategoryPhoto(c, checked) {
    try { await updateCategory.mutateAsync({ id: c.id, photo_required: checked }); }
    catch (e) { toast.error(e.message || 'Could not update category'); }
  }
  async function handleAddQuestion() {
    if (!newText.trim()) return;
    if (structure === 'categories_questions' && !newQCategoryId) { toast.error('Pick a category for the question'); return; }
    try {
      await addQuestion.mutateAsync({ templateId: template.id, question_text: newText.trim(), category_id: structure === 'categories_questions' ? newQCategoryId : null, photo_required: newPhotoRequired });
      setNewText(''); setNewPhotoRequired(false);
      toast.success('Question added');
    } catch (e) { toast.error(e.message || 'Could not add question'); }
  }
  async function handleAddCategory() {
    if (!newCatName.trim()) return;
    try {
      await addCategory.mutateAsync({ templateId: template.id, name: newCatName.trim(), photo_required: newCatPhoto });
      setNewCatName(''); setNewCatPhoto(false);
      toast.success('Category added');
    } catch (e) { toast.error(e.message || 'Could not add category'); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit {live.name}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-slate-500">Structure: <span className="font-medium">{STRUCTURE_LABEL[structure]}</span> (cannot be changed — build a new audit for a different structure). Retiring a question or category keeps every past audit intact; it just stops appearing in new captures.</p>

          <div className="rounded-md border border-dashed border-slate-300 p-3 space-y-2">
            <p className="text-xs font-semibold text-slate-600">Scoring</p>
            <div className="flex flex-wrap gap-3 items-center">
              <Select value={scoringMode} onValueChange={setScoringMode}>
                <SelectTrigger className="h-8 text-xs w-44"><SelectValue /></SelectTrigger>
                <SelectContent>{SCORING_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
              {scoringMode !== 'off' && (
                <div className="flex gap-2 items-center text-xs text-slate-600">
                  <label>Low <Input type="number" value={scoreMin} onChange={(e) => setScoreMin(e.target.value)} className="h-8 w-16 inline-block" /></label>
                  <label>High <Input type="number" value={scoreMax} onChange={(e) => setScoreMax(e.target.value)} className="h-8 w-16 inline-block" /></label>
                  <label>Step <Input type="number" value={scoreStep} onChange={(e) => setScoreStep(e.target.value)} className="h-8 w-16 inline-block" /></label>
                </div>
              )}
              <Button size="sm" onClick={saveSettings} disabled={updateTemplate.isPending}>Save settings</Button>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 pt-1">
              <Switch checked={limitAuditors} onCheckedChange={setLimitAuditors} /> Limit auditors per audit
            </label>
            {limitAuditors && (
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <span>Maximum</span>
                <Input type="number" min="1" max="100" value={maxAuditors} onChange={(e) => setMaxAuditors(e.target.value)} className="h-8 w-20" />
                <span>total — Audit Admin counts as one. (Save settings to apply.)</span>
              </div>
            )}
          </div>

          {structure !== 'questions' && (
            <div>
              <div className="rounded-md border border-slate-200">
                <Table>
                  <TableHeader><TableRow><TableHead>Category</TableHead><TableHead className="w-32 text-center">Mandatory photo</TableHead><TableHead className="w-20"></TableHead></TableRow></TableHeader>
                  <TableBody>
                    {activeCategories.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="text-sm">{prettyCat(c.name)}</TableCell>
                        <TableCell className="text-center"><Switch checked={c.photo_required} onCheckedChange={(v) => toggleCategoryPhoto(c, v)} /></TableCell>
                        <TableCell><Button size="sm" variant="outline" onClick={() => handleRetireCategory(c)} disabled={updateCategory.isPending}>Retire</Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="rounded-md border border-dashed border-slate-300 p-3 space-y-2 mt-2">
                <p className="text-xs font-semibold text-slate-600">Add a category</p>
                <div className="flex gap-2 items-center flex-wrap">
                  <Input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="Category name" className="h-8 max-w-xs" />
                  <label className="flex items-center gap-1.5 text-xs text-slate-600"><Switch checked={newCatPhoto} onCheckedChange={setNewCatPhoto} /> Mandatory photo</label>
                  <Button size="sm" onClick={handleAddCategory} disabled={addCategory.isPending || !newCatName.trim()}><Plus className="w-4 h-4 mr-1" /> Add</Button>
                </div>
              </div>
            </div>
          )}

          {structure !== 'categories' && (
            <div>
              <div className="rounded-md border border-slate-200">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Question</TableHead>
                      {structure === 'categories_questions' && <TableHead className="w-36">Category</TableHead>}
                      <TableHead className="w-32 text-center">Mandatory photo</TableHead>
                      <TableHead className="w-20"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeQuestions.map((q) => (
                      <TableRow key={q.id}>
                        <TableCell className="text-sm">{q.question_text}</TableCell>
                        {structure === 'categories_questions' && <TableCell className="text-xs text-slate-500">{prettyCat(catNameById[q.category_id] || q.category)}</TableCell>}
                        <TableCell className="text-center"><Switch checked={q.photo_required} onCheckedChange={(v) => toggleQuestionPhoto(q, v)} /></TableCell>
                        <TableCell><Button size="sm" variant="outline" onClick={() => handleRetireQuestion(q)} disabled={updateQuestion.isPending}>Retire</Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="rounded-md border border-dashed border-slate-300 p-3 space-y-2 mt-2">
                <p className="text-xs font-semibold text-slate-600">Add a question</p>
                <Input value={newText} onChange={(e) => setNewText(e.target.value)} placeholder="Question text" />
                <div className="flex gap-2 items-center flex-wrap">
                  {structure === 'categories_questions' && (
                    <Select value={newQCategoryId} onValueChange={setNewQCategoryId}>
                      <SelectTrigger className="h-8 text-xs w-44"><SelectValue placeholder="Category" /></SelectTrigger>
                      <SelectContent>{activeCategories.map((c) => <SelectItem key={c.id} value={c.id}>{prettyCat(c.name)}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                  <label className="flex items-center gap-1.5 text-xs text-slate-600"><Switch checked={newPhotoRequired} onCheckedChange={setNewPhotoRequired} /> Mandatory photo</label>
                  <Button size="sm" onClick={handleAddQuestion} disabled={addQuestion.isPending || !newText.trim()}><Plus className="w-4 h-4 mr-1" /> Add</Button>
                </div>
              </div>
            </div>
          )}

          {isFullAuditAdmin && <TemplateAdminsSection templateId={template.id} />}
          <div className="flex justify-end pt-2"><Button variant="outline" onClick={onClose}>Done</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// The appointment rosters (per-audit Admins, Global Audit Admins) have the same 6-column
// shape and are always short. Cards on a phone, the real table from sm up.
function AdminRoster({ admins, emptyText, onRemove, removing }) {
  const fmtDate = (v) => { if (!v) return '—'; const d = new Date(v); return isNaN(d) ? '—' : d.toLocaleDateString(); };
  if (admins.length === 0) {
    return <p className="rounded-md border border-slate-200 bg-white px-3 py-5 text-center text-sm text-slate-400">{emptyText}</p>;
  }
  return (
    <>
      <div className="space-y-2 sm:hidden">
        {admins.map((a) => (
          <div key={a.emp_id} className="rounded-md border border-slate-200 bg-white p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-slate-900">{a.name}</span>
              <span className="shrink-0 text-xs text-slate-500">{a.emp_id}</span>
            </div>
            <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-500">
              <div><dt className="inline text-slate-400">Role: </dt><dd className="inline">{a.role || '—'}</dd></div>
              <div><dt className="inline text-slate-400">Since: </dt><dd className="inline">{fmtDate(a.assigned_at)}</dd></div>
              <div className="col-span-2"><dt className="inline text-slate-400">Appointed by: </dt><dd className="inline">{a.assigned_by_name || '—'}</dd></div>
            </dl>
            <Button size="sm" variant="outline" className="mt-2" onClick={() => onRemove(a)} disabled={removing}>Remove</Button>
          </div>
        ))}
      </div>
      <div className="hidden sm:block rounded-md border border-slate-200 bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="w-32">Employee ID</TableHead>
              <TableHead className="w-36">Current role</TableHead>
              <TableHead className="w-40">Appointed by</TableHead>
              <TableHead className="w-32">Appointed on</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {admins.map((a) => (
              <TableRow key={a.emp_id}>
                <TableCell className="font-semibold text-sm text-slate-900">{a.name}</TableCell>
                <TableCell className="text-xs text-slate-500">{a.emp_id}</TableCell>
                <TableCell className="text-xs text-slate-500">{a.role || '—'}</TableCell>
                <TableCell className="text-xs text-slate-500">{a.assigned_by_name || '—'}</TableCell>
                <TableCell className="text-xs text-slate-500">{fmtDate(a.assigned_at)}</TableCell>
                <TableCell>
                  <Button size="sm" variant="outline" onClick={() => onRemove(a)} disabled={removing}>Remove</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

function TemplateAdminsSection({ templateId }) {
  const { data: admins = [] } = useAuditTemplateAdmins(templateId);
  const addAdmin = useAddAuditTemplateAdmin();
  const removeAdmin = useRemoveAuditTemplateAdmin();

  return (
    <div className="rounded-md border border-dashed border-slate-300 p-3 space-y-2">
      <p className="text-xs font-semibold text-slate-600">Audit Admins for this audit</p>
      <p className="text-xs text-slate-500">Only for this specific audit — not factory-wide. Their role doesn't change; they gain configure access (edit questions, schedule it, manage its auditors) for this one audit.</p>
      <WorkerPicker
        className="max-w-sm"
        placeholder="Search by name or employee ID to appoint"
        excludeIds={admins.map((a) => a.emp_id)}
        onSelect={(r) => addAdmin.mutate({ templateId, empId: r.id })}
      />
      <AdminRoster
        admins={admins}
        emptyText="No Audit Admin appointed for this audit yet."
        onRemove={(a) => removeAdmin.mutate({ templateId, empId: a.emp_id })}
        removing={removeAdmin.isPending}
      />
    </div>
  );
}

function GlobalAdminsSection() {
  const { data: admins = [] } = useAuditGlobalAdmins();
  const addAdmin = useAddAuditGlobalAdmin();
  const removeAdmin = useRemoveAuditGlobalAdmin();

  return (
    <section>
      <p className="text-xs text-slate-500 mb-3">A Global Audit Admin can create, configure, and schedule ANY audit — full audit capability, factory-wide. Unlike per-audit admins, this is not scoped to one template. Their role doesn't change.</p>

      <div className="rounded-md border border-dashed border-slate-300 p-3 space-y-2 mb-4">
        <p className="text-xs font-semibold text-slate-600">Add a Global Audit Admin</p>
        <WorkerPicker
          className="max-w-sm"
          placeholder="Search by name or employee ID to appoint"
          excludeIds={admins.map((a) => a.emp_id)}
          onSelect={(r) => addAdmin.mutate(r.id)}
        />
      </div>

      <AdminRoster
        admins={admins}
        emptyText="No audit admins appointed yet."
        onRemove={(a) => removeAdmin.mutate(a.emp_id)}
        removing={removeAdmin.isPending}
      />
    </section>
  );
}

function ChangeRequestsSection() {
  const { data: requests = [] } = useAuditChangeRequests();
  const review = useReviewAuditChangeRequest();
  const [noteById, setNoteById] = useState({});
  const pending = requests.filter((r) => r.status === 'pending');

  async function handleReview(id, action) {
    try {
      await review.mutateAsync({ id, action, reviewNote: noteById[id] || '' });
      toast.success(action === 'approve' ? 'Change approved' : 'Change rejected');
    } catch (e) {
      toast.error(e.message || 'Could not review change request');
    }
  }

  return (
    <section>
      <h2 className="text-sm font-bold text-slate-700 mb-2">Change Requests {pending.length > 0 && <span className="text-xs font-normal text-amber-600">({pending.length} pending)</span>}</h2>
      {pending.length === 0 ? (
        <EmptyState title="No pending change requests" body="A post-submission correction request from an auditor will show up here." />
      ) : (
        <div className="space-y-2">
          {pending.map((r) => (
            <div key={r.id} className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-sm text-slate-900">{r.template_name} · {r.zone_name}</div>
                <span className="text-xs text-slate-400">{new Date(r.created_at).toLocaleString()}</span>
              </div>
              <div className="text-xs text-slate-600">Requested by <span className="font-medium">{r.requested_by_name}</span>: "{r.reason}"</div>
              <div className="space-y-1">
                {r.items.map((it) => (
                  <div key={it.id} className="text-xs text-slate-600 bg-slate-50 rounded px-2 py-1">
                    <span className="font-medium">{it.question_text}</span> — {it.field}: <span className="line-through text-slate-400">{it.old_value ?? '—'}</span> → <span className="font-semibold">{it.new_value}</span>
                  </div>
                ))}
              </div>
              <Textarea value={noteById[r.id] || ''} onChange={(e) => setNoteById((p) => ({ ...p, [r.id]: e.target.value }))} placeholder="Review note (optional)" className="text-sm" />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => handleReview(r.id, 'reject')} disabled={review.isPending}>Reject</Button>
                <Button size="sm" onClick={() => handleReview(r.id, 'approve')} disabled={review.isPending}>Approve</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

const TRAIL_ACTIONS = {
  submitted: { label: 'Submitted', tone: 'bg-blue-50 text-blue-700 border-blue-200' },
  draft_saved: { label: 'Draft saved', tone: 'bg-slate-100 text-slate-600 border-slate-200' },
  change_requested: { label: 'Change requested', tone: 'bg-amber-50 text-amber-700 border-amber-200' },
  change_approved: { label: 'Change approved', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  change_rejected: { label: 'Change rejected', tone: 'bg-rose-50 text-rose-700 border-rose-200' },
  template_deleted: { label: 'Audit type deleted', tone: 'bg-rose-50 text-rose-700 border-rose-200' },
  schedule_deleted: { label: 'Schedule deleted', tone: 'bg-rose-50 text-rose-700 border-rose-200' },
  submission_deleted: { label: 'Audit entry deleted', tone: 'bg-rose-50 text-rose-700 border-rose-200' },
};
const trailActionLabel = (a) => TRAIL_ACTIONS[a]?.label || a;
function trailDetail(r) {
  const f = r.changed_fields || {};
  if (r.action === 'submitted' && f.overall_avg != null) return `Overall ${Number(f.overall_avg).toFixed(1)}`;
  if (r.action === 'change_requested' && f.reason) return `“${f.reason}”`;
  if ((r.action === 'change_rejected' || r.action === 'change_approved') && f.review_note) return `“${f.review_note}”`;
  if (r.action === 'change_approved' && f.new_overall_avg != null) return `New overall ${Number(f.new_overall_avg).toFixed(1)}`;
  if (r.action === 'template_deleted' && f.name) return `“${f.name}”${f.schedules_deactivated ? ` · ${f.schedules_deactivated} schedule(s) stopped` : ''}`;
  return '';
}

function AuditTrailTab() {
  const { data: trail = [], isLoading } = useAuditAuditTrail();
  const [action, setAction] = useState('all');
  const [tpl, setTpl] = useState('all');
  const [zone, setZone] = useState('all');
  const [actor, setActor] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const actionsPresent = useMemo(() => [...new Set(trail.map((r) => r.action))], [trail]);
  const templateNames = useMemo(() => [...new Set(trail.map((r) => r.template_name).filter(Boolean))].sort(), [trail]);
  const zoneNames = useMemo(() => [...new Set(trail.map((r) => r.zone_name).filter(Boolean))].sort(), [trail]);

  const rows = trail.filter((r) => {
    if (action !== 'all' && r.action !== action) return false;
    if (tpl !== 'all' && r.template_name !== tpl) return false;
    if (zone !== 'all' && r.zone_name !== zone) return false;
    if (actor && !String(r.actor_name || '').toLowerCase().includes(actor.toLowerCase())) return false;
    const d = String(r.created_at || '').slice(0, 10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });

  const counts = useMemo(() => {
    const c = {};
    rows.forEach((r) => { c[r.action] = (c[r.action] || 0) + 1; });
    return c;
  }, [rows]);

  return (
    <div className="space-y-4">
      {/* Filters: a 2-up grid on a phone (fixed widths used to leave ragged half-rows),
          natural widths from sm up. */}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
        <Select value={action} onValueChange={setAction}>
          <SelectTrigger className="h-8 text-xs w-full sm:w-44"><SelectValue placeholder="Event type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All events</SelectItem>
            {actionsPresent.map((a) => <SelectItem key={a} value={a}>{trailActionLabel(a)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={tpl} onValueChange={setTpl}>
          <SelectTrigger className="h-8 text-xs w-full sm:w-40"><SelectValue placeholder="Audit type" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All audit types</SelectItem>{templateNames.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={zone} onValueChange={setZone}>
          <SelectTrigger className="h-8 text-xs w-full sm:w-40"><SelectValue placeholder="Zone" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All zones</SelectItem>{zoneNames.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
        </Select>
        <Input value={actor} onChange={(e) => setActor(e.target.value)} placeholder="By whom…" className="h-8 w-full text-xs sm:w-36" />
        <label className="text-xs text-slate-500">From <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-full sm:w-36 sm:inline-block" /></label>
        <label className="text-xs text-slate-500">To <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-full sm:w-36 sm:inline-block" /></label>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {Object.keys(TRAIL_ACTIONS).filter((a) => actionsPresent.includes(a)).map((a) => (
          <button key={a} onClick={() => setAction(action === a ? 'all' : a)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${action === a ? TRAIL_ACTIONS[a].tone : 'border-slate-200 text-slate-500 bg-white'}`}>
            {TRAIL_ACTIONS[a].label} · {counts[a] || 0}
          </button>
        ))}
      </div>

      {isLoading ? <p className="text-sm text-slate-400 text-center py-8">Loading…</p> : rows.length === 0 ? (
        <EmptyState title="Nothing logged" body="Every submission, change request, approval and deletion across your plant's audits is recorded here." />
      ) : (
        <>
        {/* Phone: one card per log entry — the 5-column table cannot fit 375px. */}
        <div className="space-y-2 sm:hidden">
          {rows.map((r) => (
            <div key={r.id} className="rounded-md border border-slate-200 bg-white p-3 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <span className={`inline-block shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${(TRAIL_ACTIONS[r.action] || {}).tone || 'border-slate-200 text-slate-600'}`}>
                  {trailActionLabel(r.action)}
                </span>
                <span className="text-[11px] text-slate-400 text-right">{new Date(r.created_at).toLocaleString()}</span>
              </div>
              <p className="mt-1.5 text-sm font-medium text-slate-800 break-words">
                {r.template_name || '—'}{r.zone_name ? <span className="font-normal text-slate-500"> · {r.zone_name}</span> : null}
              </p>
              <p className="mt-0.5 text-xs text-slate-500 break-words">By <span className="font-medium text-slate-700">{r.actor_name || 'system'}</span></p>
              {trailDetail(r) ? <p className="mt-1 text-xs text-slate-500 break-words">{trailDetail(r)}</p> : null}
            </div>
          ))}
        </div>

        <div className="hidden rounded-md border border-slate-200 bg-white sm:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">When</TableHead>
                <TableHead className="w-40">Event</TableHead>
                <TableHead>Audit · Zone</TableHead>
                <TableHead className="w-36">By</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs text-slate-500">{new Date(r.created_at).toLocaleString()}</TableCell>
                  <TableCell>
                    <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${(TRAIL_ACTIONS[r.action] || {}).tone || 'border-slate-200 text-slate-600'}`}>
                      {trailActionLabel(r.action)}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-slate-800">{r.template_name || '—'}{r.zone_name ? <span className="text-slate-500"> · {r.zone_name}</span> : null}</TableCell>
                  <TableCell className="text-xs text-slate-500">{r.actor_name || 'system'}</TableCell>
                  <TableCell className="text-xs text-slate-500">{trailDetail(r)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        </>
      )}
    </div>
  );
}


function ZonesSection({ zones }) {
  const createZone = useCreateZone();
  const deleteZone = useDeleteZone();
  const [newZoneName, setNewZoneName] = useState('');

  async function handleAdd() {
    if (!newZoneName.trim()) return;
    try {
      await createZone.mutateAsync(newZoneName.trim());
      setNewZoneName('');
    } catch (e) {
      toast.error(e.message || 'Could not create zone');
    }
  }
  async function handleDelete(zone) {
    try {
      await deleteZone.mutateAsync(zone.id);
    } catch (e) {
      toast.error(e.message || 'Could not delete zone');
    }
  }

  return (
    <section>
      <h2 className="text-sm font-bold text-slate-700 mb-2">Zones</h2>
      <div className="flex gap-2 mb-2">
        <Input value={newZoneName} onChange={(e) => setNewZoneName(e.target.value)} placeholder="New zone name" onKeyDown={(e) => e.key === 'Enter' && handleAdd()} />
        <Button size="sm" onClick={handleAdd} disabled={createZone.isPending || !newZoneName.trim()}><Plus className="w-4 h-4 mr-1" /> Add</Button>
      </div>
      {zones.length === 0 ? (
        <EmptyState title="No zones yet" body="Add a zone above before scheduling an audit." />
      ) : (
        <div className="rounded-md border border-slate-200 bg-white divide-y divide-slate-100">
          {zones.map((z) => (
            <div key={z.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span>{z.name}</span>
              <button onClick={() => handleDelete(z)} disabled={deleteZone.isPending} className="text-slate-400 hover:text-red-500"><X className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function HomeZonesSection({ zones, homeZones }) {
  const setHomeZone = useSetAuditHomeZone();
  const removeHomeZone = useRemoveAuditHomeZone();
  const [pendingWorker, setPendingWorker] = useState(null); // { id, name } awaiting a zone pick

  async function handleAssignZone(zoneId) {
    if (!pendingWorker) return;
    try {
      await setHomeZone.mutateAsync({ empId: pendingWorker.id, zoneId });
      toast.success(`${pendingWorker.name}'s home zone set`);
      setPendingWorker(null);
    } catch (e) {
      toast.error(e.message || 'Could not set home zone');
    }
  }

  return (
    <section>
      <h2 className="text-sm font-bold text-slate-700 mb-1">Home Zones</h2>
      <p className="text-xs text-slate-500 mb-3">A worker's home zone is where they normally work — they can never be assigned to audit it themselves, to keep audits independent.</p>
      {homeZones.length > 0 && (
        <div className="rounded-md border border-slate-200 bg-white divide-y divide-slate-100 mb-3">
          {homeZones.map((h) => (
            <div key={h.emp_id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span>{h.name} <span className="text-slate-400">→</span> {h.zone_name}</span>
              <button onClick={() => removeHomeZone.mutate(h.emp_id)} disabled={removeHomeZone.isPending} className="text-slate-400 hover:text-red-500"><X className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 max-w-md flex-wrap">
        <WorkerPicker
          className="flex-1 min-w-[200px]"
          placeholder="Search by name or employee ID"
          onSelect={(r) => setPendingWorker(r)}
        />
        {pendingWorker && (
          <>
            <span className="text-xs text-slate-500 shrink-0">Home zone for {pendingWorker.name}:</span>
            <Select onValueChange={handleAssignZone}>
              <SelectTrigger className="h-9 text-xs w-40"><SelectValue placeholder="Select a zone" /></SelectTrigger>
              <SelectContent>
                {zones.map((z) => <SelectItem key={z.id} value={z.id}>{z.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <button onClick={() => setPendingWorker(null)} className="text-slate-400 hover:text-red-500"><X className="w-4 h-4" /></button>
          </>
        )}
      </div>
    </section>
  );
}

function QuestionRows({ rows, setRows, label = 'question' }) {
  const update = (i, field, value) => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  const add = () => setRows((rs) => [...rs, { question_text: '', photo_required: false }]);
  const remove = (i) => setRows((rs) => rs.filter((_, idx) => idx !== i));
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs text-slate-400 w-5">{i + 1}</span>
          <Input value={r.question_text} onChange={(e) => update(i, 'question_text', e.target.value)} placeholder={`Item ${i + 1}`} className="h-8" />
          <label className="flex items-center gap-1 text-[11px] text-slate-500 shrink-0"><Switch checked={r.photo_required} onCheckedChange={(v) => update(i, 'photo_required', v)} /> photo</label>
          <button onClick={() => remove(i)} className="text-slate-400 hover:text-red-500"><X className="w-4 h-4" /></button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={add}><Plus className="w-4 h-4 mr-1" /> Add {label}</Button>
    </div>
  );
}

function CreateTemplateDialog({ onClose }) {
  const createTemplate = useCreateAuditTemplate();
  const [name, setName] = useState('');
  const [structure, setStructure] = useState('categories_questions');
  const [scoringMode, setScoringMode] = useState('required');
  const [scoreMin, setScoreMin] = useState('1');
  const [scoreMax, setScoreMax] = useState('5');
  const [scoreStep, setScoreStep] = useState('1');
  const [markStyle, setMarkStyle] = useState('scale'); // 'scale' = numeric marks, 'yes_no' = Yes (1) / No (0)
  const [importPreview, setImportPreview] = useState(null); // parsed Excel awaiting confirmation
  const [importFileName, setImportFileName] = useState('');
  const [limitAuditors, setLimitAuditors] = useState(false);
  const [maxAuditors, setMaxAuditors] = useState('3');
  const [flatQuestions, setFlatQuestions] = useState([{ question_text: '', photo_required: false }]);
  const [cats, setCats] = useState([{ name: '', photo_required: false, questions: [{ question_text: '', photo_required: false }] }]);

  const addCat = () => setCats((c) => [...c, { name: '', photo_required: false, questions: [{ question_text: '', photo_required: false }] }]);
  const removeCat = (i) => setCats((c) => c.filter((_, idx) => idx !== i));
  const updateCat = (i, field, value) => setCats((c) => c.map((x, idx) => (idx === i ? { ...x, [field]: value } : x)));
  const setCatQuestions = (i, updater) => setCats((c) => c.map((x, idx) => (idx === i ? { ...x, questions: typeof updater === 'function' ? updater(x.questions) : updater } : x)));

  async function handlePickFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setImportFileName(file.name);
      setImportPreview(await parseAuditFile(file));
    } catch {
      setImportPreview({ items: [], errors: ['Could not read that file. Please upload the .xlsx you downloaded.'], structure: null, categories: [] });
    }
  }
  function applyImport() {
    const f = toFormState(importPreview);
    setStructure(f.structure);
    if (f.flatQuestions) setFlatQuestions(f.flatQuestions);
    if (f.cats) setCats(f.cats);
    toast.success(`Loaded ${importPreview.items.length} questions — review them below, then Save audit`);
    setImportPreview(null);
  }

  async function handleSave() {
    if (!name.trim()) { toast.error('Give the audit a name'); return; }
    const yesNo = scoringMode !== 'off' && markStyle === 'yes_no';
    if (scoringMode !== 'off' && !yesNo) {
      const mn = Number(scoreMin), mx = Number(scoreMax), st = Number(scoreStep);
      if (!(mx > mn) || !(st > 0)) { toast.error('Highest mark must exceed lowest, and step must be positive'); return; }
    }
    if (limitAuditors && !(Number(maxAuditors) >= 1)) { toast.error('Enter the auditor limit (1 or more)'); return; }
    const payload = {
      name: name.trim(), structure, scoring_mode: scoringMode,
      score_min: yesNo ? 0 : Number(scoreMin), score_max: yesNo ? 1 : Number(scoreMax), score_step: yesNo ? 1 : Number(scoreStep),
      max_auditors: limitAuditors ? Number(maxAuditors) : null,
    };
    if (structure === 'questions') {
      const qs = flatQuestions.filter((q) => q.question_text.trim());
      if (qs.length === 0) { toast.error('Add at least one question'); return; }
      payload.questions = qs.map((q) => ({ question_text: q.question_text.trim(), photo_required: !!q.photo_required }));
    } else if (structure === 'categories') {
      const cs = cats.filter((c) => c.name.trim());
      if (cs.length === 0) { toast.error('Add at least one category'); return; }
      payload.categories = cs.map((c) => ({ name: c.name.trim(), photo_required: !!c.photo_required }));
    } else {
      const cs = cats.filter((c) => c.name.trim());
      if (cs.length === 0) { toast.error('Add at least one category'); return; }
      payload.categories = cs.map((c) => ({ name: c.name.trim(), photo_required: !!c.photo_required }));
      payload.questions = [];
      cs.forEach((c, ci) => {
        c.questions.filter((q) => q.question_text.trim()).forEach((q) => {
          payload.questions.push({ question_text: q.question_text.trim(), photo_required: !!q.photo_required, category_index: ci });
        });
      });
      if (payload.questions.length === 0) { toast.error('Add at least one question under a category'); return; }
    }
    try {
      await createTemplate.mutateAsync(payload);
      toast.success('Audit created');
      onClose();
    } catch (e) {
      toast.error(e.message || 'Could not create audit');
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>New Audit</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Audit name (e.g. Safety Walk)" />

          <div className="rounded-md border border-dashed border-slate-300 p-3 space-y-2">
            <p className="text-xs font-semibold text-slate-600">Build from Excel (optional)</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={downloadAuditTemplateSheet}><Download className="w-4 h-4 mr-1" /> Download template</Button>
              <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent">
                <Upload className="w-4 h-4" /> Import from Excel
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handlePickFile} />
              </label>
            </div>
            {importPreview && (
              <div className="space-y-2 rounded-md bg-slate-50 p-2">
                <p className="text-xs text-slate-600">Preview of <strong>{importFileName}</strong> — {importPreview.items.length} question{importPreview.items.length === 1 ? '' : 's'}{importPreview.categories.length ? ` in ${importPreview.categories.length} categor${importPreview.categories.length === 1 ? 'y' : 'ies'}` : ''}</p>
                {importPreview.errors.map((er, i) => <p key={i} className="text-xs font-medium text-rose-600">{er}</p>)}
                {importPreview.items.length > 0 && (
                  <div className="max-h-56 overflow-y-auto rounded border border-slate-200 bg-white">
                    <table className="w-full text-xs">
                      <thead><tr className="text-left text-slate-500"><th className="px-2 py-1">Row</th><th className="px-2 py-1">Category</th><th className="px-2 py-1">Question</th><th className="px-2 py-1">Photo</th></tr></thead>
                      <tbody>
                        {importPreview.items.map((it) => (
                          <tr key={it.line} className={it.errors.length ? 'bg-rose-50' : ''}>
                            <td className="px-2 py-1 align-top text-slate-400">{it.line}</td>
                            <td className="px-2 py-1 align-top">{it.category || '—'}</td>
                            <td className="px-2 py-1 align-top break-words">{it.question || '—'}{it.errors.length > 0 && <span className="block font-medium text-rose-600">{it.errors.join('; ')}</span>}</td>
                            <td className="px-2 py-1 align-top">{it.photo ? 'Yes' : 'No'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => setImportPreview(null)}>Discard</Button>
                  <Button type="button" size="sm" onClick={applyImport} disabled={hasBlockingErrors(importPreview)}>Load into this audit</Button>
                </div>
                {hasBlockingErrors(importPreview) && <p className="text-[11px] text-slate-400">Fix the highlighted rows in the sheet and import it again.</p>}
              </div>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-1">Structure</p>
              <Select value={structure} onValueChange={setStructure}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{STRUCTURE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-[11px] text-slate-400 mt-1">{STRUCTURE_OPTIONS.find((o) => o.value === structure)?.hint}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-1">Scoring</p>
              <Select value={scoringMode} onValueChange={setScoringMode}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{SCORING_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-[11px] text-slate-400 mt-1">{SCORING_OPTIONS.find((o) => o.value === scoringMode)?.hint}</p>
            </div>
          </div>

          {scoringMode !== 'off' && (
            <div className="flex gap-2">
              {[{ v: 'scale', l: 'Marks (e.g. 1–4)' }, { v: 'yes_no', l: 'Yes / No' }].map((o) => (
                <button key={o.v} type="button" onClick={() => setMarkStyle(o.v)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${markStyle === o.v ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600'}`}>{o.l}</button>
              ))}
            </div>
          )}
          {scoringMode !== 'off' && markStyle === 'scale' && (
            <div className="flex gap-3 items-end text-xs text-slate-600">
              <label>Lowest mark<Input type="number" value={scoreMin} onChange={(e) => setScoreMin(e.target.value)} className="h-8 w-20 mt-0.5" /></label>
              <label>Highest mark<Input type="number" value={scoreMax} onChange={(e) => setScoreMax(e.target.value)} className="h-8 w-20 mt-0.5" /></label>
              <label>Step up<Input type="number" value={scoreStep} onChange={(e) => setScoreStep(e.target.value)} className="h-8 w-20 mt-0.5" /></label>
            </div>
          )}

          <div className="rounded-md border border-dashed border-slate-300 p-3">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              <Switch checked={limitAuditors} onCheckedChange={setLimitAuditors} /> Limit how many auditors an audit can have
            </label>
            {limitAuditors && (
              <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                <span>Maximum</span>
                <Input type="number" min="1" max="100" value={maxAuditors} onChange={(e) => setMaxAuditors(e.target.value)} className="h-8 w-20" />
                <span>people total — the Audit Admin counts as one.</span>
              </div>
            )}
          </div>

          {structure === 'questions' && (
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-2">Questions</p>
              <QuestionRows rows={flatQuestions} setRows={setFlatQuestions} />
            </div>
          )}

          {structure === 'categories' && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-600">Categories</p>
              {cats.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={c.name} onChange={(e) => updateCat(i, 'name', e.target.value)} placeholder={`Category ${i + 1}`} className="h-8" />
                  <label className="flex items-center gap-1 text-[11px] text-slate-500 shrink-0"><Switch checked={c.photo_required} onCheckedChange={(v) => updateCat(i, 'photo_required', v)} /> photo</label>
                  <button onClick={() => removeCat(i)} className="text-slate-400 hover:text-red-500"><X className="w-4 h-4" /></button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addCat}><Plus className="w-4 h-4 mr-1" /> Add category</Button>
            </div>
          )}

          {structure === 'categories_questions' && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-600">Categories &amp; their questions</p>
              {cats.map((c, i) => (
                <div key={i} className="rounded-md border border-slate-200 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input value={c.name} onChange={(e) => updateCat(i, 'name', e.target.value)} placeholder={`Category ${i + 1}`} className="h-8 font-semibold" />
                    <label className="flex items-center gap-1 text-[11px] text-slate-500 shrink-0"><Switch checked={c.photo_required} onCheckedChange={(v) => updateCat(i, 'photo_required', v)} /> photo</label>
                    <button onClick={() => removeCat(i)} className="text-slate-400 hover:text-red-500"><X className="w-4 h-4" /></button>
                  </div>
                  <div className="pl-3">
                    <QuestionRows rows={c.questions} setRows={(u) => setCatQuestions(i, u)} />
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addCat}><Plus className="w-4 h-4 mr-1" /> Add category</Button>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={createTemplate.isPending}>Save audit</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const dowOf = (iso) => {
  if (!iso) return null;
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d).getDay();
};
const emptyRecurrence = (today) => ({
  freq: 'once', interval: 1, weekdays: [], day_of_month: '',
  start_date: today, end_type: 'never', end_date: '', occurrence_count: '',
});
function recurrenceFromSchedule(s, today) {
  if (!s) return emptyRecurrence(today);
  return {
    freq: s.freq || (s.recurrence === 'none' ? 'once' : s.recurrence === 'fortnightly' ? 'weekly' : s.recurrence) || 'once',
    interval: s.recur_interval || (s.recurrence === 'fortnightly' ? 2 : 1),
    weekdays: Array.isArray(s.weekdays) ? s.weekdays.map(Number) : [],
    day_of_month: s.day_of_month || '',
    start_date: (s.start_date || s.specific_date || today || '').slice(0, 10),
    end_type: s.end_type || 'never',
    end_date: (s.end_date || '').slice(0, 10),
    occurrence_count: s.occurrence_count || '',
  };
}
function describeRecurrence(s) {
  const freq = s.freq || (s.recurrence === 'none' ? 'once' : s.recurrence);
  if (!freq || freq === 'once') return `One-off · ${(s.start_date || s.specific_date || '').slice(0, 10) || 'no date'}`;
  let base;
  if (freq === 'daily') base = 'Every day';
  else if (freq === 'monthly') base = 'Every month' + (s.day_of_month ? ` on the ${s.day_of_month}` : '');
  else {
    const day = (s.weekdays || [])[0];
    base = day != null ? `Every ${WEEKDAY_FULL[day]}` : 'Weekly';
  }
  if (s.end_type === 'on' && s.end_date) base += ` · until ${String(s.end_date).slice(0, 10)}`;
  if (s.end_type === 'after' && s.occurrence_count) base += ` · ${s.occurrence_count} times`;
  return base;
}

// Pick a date. Tick "Repeat" and it becomes a weekly series on that date's weekday —
// no frequency picker, the date decides. Optionally cap when the series ends.
function RecurrenceEditor({ value, onChange }) {
  const set = (patch) => onChange({ ...value, ...patch });
  const repeats = value.freq !== 'once';
  const dow = dowOf(value.start_date);

  function changeDate(iso) {
    // If it's a series, the weekly day follows the new date.
    const d = dowOf(iso);
    set({ start_date: iso, ...(repeats && d != null ? { weekdays: [d] } : {}) });
  }
  function toggleRepeat(on) {
    if (!on) { set({ freq: 'once', weekdays: [], end_type: 'never', end_date: '', occurrence_count: '' }); return; }
    set({ freq: 'weekly', interval: 1, day_of_month: '', weekdays: dow != null ? [dow] : [] });
  }

  return (
    <div className="space-y-3 rounded-md border border-slate-200 p-3">
      <label className="block text-xs font-semibold text-slate-600">
        Date
        <Input type="date" value={value.start_date} onChange={(e) => changeDate(e.target.value)} className="h-9 mt-1" />
      </label>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={repeats} onChange={(e) => toggleRepeat(e.target.checked)} />
        Repeat {dow != null ? `every ${WEEKDAY_FULL[dow]}` : 'weekly'}
      </label>

      {repeats && (
        <div className="space-y-1 border-l-2 border-slate-100 pl-3">
          <p className="text-xs font-semibold text-slate-600">Ends</p>
          <label className="flex items-center gap-2 text-xs"><input type="radio" className="accent-blue-600" checked={value.end_type === 'never'} onChange={() => set({ end_type: 'never' })} /> Never</label>
          <label className="flex items-center gap-2 text-xs">
            <input type="radio" className="accent-blue-600" checked={value.end_type === 'on'} onChange={() => set({ end_type: 'on' })} /> On
            <Input type="date" disabled={value.end_type !== 'on'} value={value.end_date} onChange={(e) => set({ end_date: e.target.value })} className="h-7 w-40" />
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input type="radio" className="accent-blue-600" checked={value.end_type === 'after'} onChange={() => set({ end_type: 'after' })} /> After
            <Input type="number" min="1" max="1000" disabled={value.end_type !== 'after'} value={value.occurrence_count} onChange={(e) => set({ occurrence_count: e.target.value })} className="h-7 w-20" /> times
          </label>
        </div>
      )}
    </div>
  );
}

function CreateScheduleDialog({ template, zones, onClose, editing, lockZone = false }) {
  const createSchedule = useCreateAuditSchedule();
  const updateSchedule = useUpdateAuditSchedule();
  const createZone = useCreateZone();
  const today = new Date().toISOString().slice(0, 10);
  const [zoneId, setZoneId] = useState(editing?.zone_id || '');
  const [newZoneName, setNewZoneName] = useState('');
  const [rec, setRec] = useState(() => recurrenceFromSchedule(editing, today));
  const [admin, setAdmin] = useState(editing ? { id: editing.admin_emp_id, name: editing.admin_name } : null);
  const isEditing = !!editing;

  async function handleAddZone() {
    if (!newZoneName.trim()) return;
    try {
      const zone = await createZone.mutateAsync(newZoneName.trim());
      setZoneId(zone.id);
      setNewZoneName('');
      toast.success(`Zone "${zone.name}" added`);
    } catch (e) {
      toast.error(e.message || 'Could not create zone');
    }
  }

  function buildRecurrencePayload() {
    const p = {
      freq: rec.freq,
      recur_interval: Number(rec.interval) || 1,
      weekdays: rec.freq === 'weekly' ? rec.weekdays : [],
      day_of_month: rec.freq === 'monthly' && rec.day_of_month ? Number(rec.day_of_month) : null,
      start_date: rec.start_date,
      end_type: rec.freq === 'once' ? 'never' : rec.end_type,
      end_date: rec.end_type === 'on' ? rec.end_date : null,
      occurrence_count: rec.end_type === 'after' ? Number(rec.occurrence_count) || null : null,
    };
    return p;
  }

  async function handleSave() {
    try {
      if (!zoneId) { toast.error('Pick or add a zone'); return; }
      if (!rec.start_date) { toast.error(rec.freq === 'once' ? 'Pick a date' : 'Pick a start date'); return; }
      if (rec.freq === 'weekly' && rec.weekdays.length === 0) { toast.error('Pick at least one weekday'); return; }
      if (rec.freq !== 'once' && rec.end_type === 'on' && !rec.end_date) { toast.error('Pick an end date'); return; }
      if (rec.freq !== 'once' && rec.end_type === 'after' && !(Number(rec.occurrence_count) >= 1)) { toast.error('Enter how many times it repeats'); return; }
      if (!admin?.id) { toast.error('An Audit Admin for this schedule is required'); return; }
      const payload = { zone_id: zoneId, admin_emp_id: admin.id, ...buildRecurrencePayload() };
      if (isEditing) {
        await updateSchedule.mutateAsync({ id: editing.id, ...payload });
        toast.success('Schedule updated');
      } else {
        await createSchedule.mutateAsync({ template_id: template.id, ...payload });
        toast.success('Audit scheduled');
      }
      onClose();
    } catch (e) {
      toast.error(e.message || 'Could not save schedule');
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEditing ? 'Edit schedule — ' : 'Schedule '}{template.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-600">Zone</label>
            {lockZone ? (
              <div className="mt-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                {zones.find((z) => z.id === zoneId)?.name || '—'}
              </div>
            ) : (
              <>
                <Select value={zoneId} onValueChange={setZoneId}>
                  <SelectTrigger><SelectValue placeholder="Select a zone" /></SelectTrigger>
                  <SelectContent>
                    {zones.map((z) => <SelectItem key={z.id} value={z.id}>{z.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="text-xs text-slate-400 my-1">or add a new zone</div>
                <div className="flex gap-2">
                  <Input value={newZoneName} onChange={(e) => setNewZoneName(e.target.value)} placeholder="New zone name" onKeyDown={(e) => e.key === 'Enter' && handleAddZone()} />
                  <Button type="button" variant="outline" onClick={handleAddZone} disabled={createZone.isPending || !newZoneName.trim()}>Add</Button>
                </div>
              </>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">When</label>
            <RecurrenceEditor value={rec} onChange={setRec} />
            <p className="text-xs text-slate-400 mt-1">{describeRecurrence(buildRecurrencePayload())}</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">Audit Admin for this schedule (required)</label>
            {lockZone ? (
              <div className="mt-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                {admin?.name || '—'}
              </div>
            ) : admin ? (
              <div className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm mt-1">
                <span>{admin.name}</span>
                <button onClick={() => setAdmin(null)} className="text-slate-400 hover:text-red-500"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <WorkerPicker className="mt-1" placeholder="Search by name or employee ID" onSelect={setAdmin} />
            )}
            <p className="text-xs text-slate-400 mt-1">Accountable for this schedule specifically — gains configure rights over it even without being a template-wide admin.</p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={createSchedule.isPending || updateSchedule.isPending}>{isEditing ? 'Save changes' : 'Schedule'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleRow({ schedule, otherSchedules = [], homeZoneByEmpId = {}, onEdit, onDelete }) {
  const addAuditor = useAddAuditScheduleAuditor();
  const removeAuditor = useRemoveAuditScheduleAuditor();
  const copyAuditors = useCopyAuditScheduleAuditors();
  const [showPicker, setShowPicker] = useState(false);
  const [copyFromId, setCopyFromId] = useState('');

  async function handleAddAuditor(empId) {
    try {
      await addAuditor.mutateAsync({ scheduleId: schedule.id, empId });
    } catch (e) {
      toast.error(e.message || 'Could not assign auditor');
    }
  }

  async function handleCopyAuditors(fromScheduleId) {
    setCopyFromId(fromScheduleId);
    try {
      const res = await copyAuditors.mutateAsync({ scheduleId: schedule.id, fromScheduleId });
      const skippedNote = res.skipped_home_zone ? ` (${res.skipped_home_zone} skipped — their home zone)` : '';
      toast.success(res.copied ? `Copied ${res.copied} auditor(s)${skippedNote}` : 'Nothing to copy — all were their home zone or already assigned');
    } catch (e) {
      toast.error(e.message || 'Could not copy auditors');
    } finally {
      setCopyFromId('');
    }
  }

  const schedulesWithAuditors = otherSchedules.filter((s) => (s.auditors || []).length > 0);
  const auditorRows = schedule.auditors || [];
  const currentAuditorIds = auditorRows.map((a) => a.emp_id);
  const usedSlots = new Set([schedule.admin_emp_id, ...currentAuditorIds].filter(Boolean)).size;
  const cap = schedule.max_auditors || null;
  const atCap = cap != null && usedSlots >= cap;

  return (
    <div className="p-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold text-sm text-slate-900">{schedule.template_name} · {schedule.zone_name}</div>
          <div className="text-xs text-slate-500">{describeRecurrence(schedule)}{schedule.next_occurrence && schedule.freq !== 'once' ? ` · next ${schedule.next_occurrence}` : ''} · Audit Admin: {schedule.admin_name}</div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onEdit}>Edit</Button>
          <Button size="sm" variant="outline" onClick={() => setShowPicker((v) => !v)}><Users className="w-4 h-4 mr-1" /> Auditors</Button>
          {onDelete && (
            <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700" onClick={onDelete}><Trash2 className="w-4 h-4" /></Button>
          )}
        </div>
      </div>

      <div className="mt-2 rounded-md border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-100 bg-slate-50">
          <span className="text-xs font-semibold text-slate-600">Auditors{cap != null ? ` (${usedSlots} of ${cap} — Audit Admin included)` : ` (${auditorRows.length})`}</span>
        </div>
        {/* Cards under sm — the 5-column table clips its own remove button off-screen on a phone */}
        <div className="sm:hidden divide-y divide-slate-100">
          <div className="p-3 bg-slate-50/60">
            <div className="text-sm font-medium text-slate-800">{schedule.admin_name} <span className="text-2xs uppercase tracking-wide text-primary">Audit Admin</span></div>
            <div className="text-xs text-slate-500">{schedule.admin_emp_id}</div>
          </div>
          {auditorRows.length === 0 && (
            <div className="text-center text-xs text-slate-400 py-4">No auditors added yet.</div>
          )}
          {auditorRows.map((a) => (
            <div key={a.emp_id} className="p-3 flex items-start justify-between gap-2">
              <div>
                <div className="text-sm text-slate-800">{a.name}</div>
                <dl className="mt-1 grid grid-cols-2 gap-x-3 text-xs text-slate-500">
                  <div><dt className="inline text-slate-400">Emp ID: </dt><dd className="inline">{a.emp_id}</dd></div>
                  <div><dt className="inline text-slate-400">JH Group: </dt><dd className="inline">{a.jh_group || '—'}</dd></div>
                  <div className="col-span-2"><dt className="inline text-slate-400">Department: </dt><dd className="inline">{a.department || '—'}</dd></div>
                </dl>
              </div>
              <button onClick={() => removeAuditor.mutate({ scheduleId: schedule.id, empId: a.emp_id })} className="shrink-0 text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>

        <Table className="hidden sm:table">
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="w-24">Emp ID</TableHead>
              <TableHead className="w-40">JH Group</TableHead>
              <TableHead className="w-40">Department</TableHead>
              <TableHead className="w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="bg-slate-50/60">
              <TableCell className="text-sm font-medium text-slate-800">{schedule.admin_name} <span className="text-2xs uppercase tracking-wide text-primary">Audit Admin</span></TableCell>
              <TableCell className="text-xs text-slate-500">{schedule.admin_emp_id}</TableCell>
              <TableCell className="text-xs text-slate-400" colSpan={3}></TableCell>
            </TableRow>
            {auditorRows.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-xs text-slate-400 py-4">No auditors added yet.</TableCell></TableRow>
            )}
            {auditorRows.map((a) => (
              <TableRow key={a.emp_id}>
                <TableCell className="text-sm text-slate-800">{a.name}</TableCell>
                <TableCell className="text-xs text-slate-500">{a.emp_id}</TableCell>
                <TableCell className="text-xs text-slate-500">{a.jh_group || '—'}</TableCell>
                <TableCell className="text-xs text-slate-500">{a.department || '—'}</TableCell>
                <TableCell>
                  <button onClick={() => removeAuditor.mutate({ scheduleId: schedule.id, empId: a.emp_id })} className="text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {showPicker && (
        <div className="mt-2 space-y-2">
          {atCap ? (
            <p className="text-xs text-amber-600">Auditor limit reached ({cap}). Remove someone first, or raise the limit on the audit type.</p>
          ) : (
            <>
              <WorkerPicker
                placeholder="Search by name or employee ID"
                excludeIds={[...currentAuditorIds, schedule.admin_emp_id].filter(Boolean)}
                isDisabled={(r) => (homeZoneByEmpId[r.id] === schedule.zone_id ? 'Home zone' : null)}
                onSelect={(r) => handleAddAuditor(r.id)}
              />
              {schedulesWithAuditors.length > 0 && (
                <Select value={copyFromId} onValueChange={handleCopyAuditors}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Or reuse the auditor pool from another schedule" /></SelectTrigger>
                  <SelectContent>
                    {schedulesWithAuditors.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.template_name} · {s.zone_name} ({s.auditors.length})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
