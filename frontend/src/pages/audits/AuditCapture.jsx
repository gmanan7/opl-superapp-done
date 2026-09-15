import { useMemo, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Camera, ChevronDown, FileText, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  useAuditSubmission, useSubmitAuditResponses, useSaveAuditDraft,
  useCreateAuditChangeRequest, useCloseAuditOccurrence,
} from '../../hooks/useAudits';
import { compressImageAndUpload } from '../../lib/imageUpload';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

// Legacy 5S pillar slugs get a pretty label; any other (free-form) category name shows as-is.
const PILLAR_LABEL = {
  sort: 'Sort', set_in_order: 'Set in Order', shine: 'Shine',
  standardize: 'Standardize', sustain: 'Sustain',
};
const catLabel = (name) => PILLAR_LABEL[name] || name || 'Uncategorised';
const fmtNum = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '';
  return String(Math.round(v * 1000) / 1000);
};
function buildScale(min, max, step) {
  const mn = Number(min), mx = Number(max), st = Number(step);
  if (!(mx > mn) || !(st > 0)) return [];
  const out = [];
  for (let s = mn; s <= mx + 1e-9; s += st) out.push(Math.round(s * 1e6) / 1e6);
  return out;
}

export function AuditCapture() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = location.state?.from === 'all' ? '/audits?tab=all' : '/audits';
  const { data: submission, isLoading } = useAuditSubmission(id);
  const submitResponses = useSubmitAuditResponses();
  const saveDraft = useSaveAuditDraft();
  const closeOcc = useCloseAuditOccurrence();

  // "Close the Audit" always goes through the confirmation sheet — even when everyone is in,
  // so the Audit Admin sees what they are signing off. The sheet names who never started and,
  // separately, who is part-way through (their unfinished scorecard is discarded).
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  async function handleConfirmClose() {
    try {
      await closeOcc.mutateAsync(submission.occurrence.id);
      setCloseConfirmOpen(false);
      toast.success('Audit closed');
    } catch (e) { toast.error(e.message || 'Could not close'); }
  }

  const isReadOnly = submission?.status === 'submitted';
  const structure = submission?.structure || 'categories_questions';
  const scoringMode = submission?.scoring_mode || 'required';
  const usesCategories = structure === 'categories';
  const scale = useMemo(
    () => buildScale(submission?.score_min ?? 1, submission?.score_max ?? 4, submission?.score_step ?? 1),
    [submission?.score_min, submission?.score_max, submission?.score_step],
  );
  const scaleTooWide = scale.length === 0 || scale.length > 12;

  // The list of scored items — questions, or categories when the template is category-only.
  const items = useMemo(() => {
    if (!submission) return [];
    return usesCategories
      ? (submission.categories || []).map((c) => ({ key: c.id, kind: 'category', label: c.name, photo_required: c.photo_required }))
      : (submission.questions || []).map((q) => ({ key: q.id, kind: 'question', label: q.question_text, photo_required: q.photo_required, category_id: q.category_id }));
  }, [submission, usesCategories]);

  // Existing saved answers, keyed by item id.
  const existingByKey = useMemo(() => {
    const m = {};
    (submission?.responses || []).forEach((r) => {
      const key = r.category_id && !r.question_id ? r.category_id : r.question_id;
      if (!key) return;
      m[key] = {
        score: r.score != null ? Number(r.score) : null,
        remarks: r.remarks || '',
        photos: (r.photos || []).map((p) => ({ photo_url: p.photo_url, caption: p.caption || '' })),
      };
    });
    return m;
  }, [submission]);

  const [answers, setAnswers] = useState({});
  const [uploading, setUploading] = useState(null);
  const [openCategory, setOpenCategory] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showChangeRequest, setShowChangeRequest] = useState(false);

  function getAnswer(key) {
    return answers[key] || existingByKey[key] || { score: null, remarks: '', photos: [] };
  }
  function setAnswer(key, patch) {
    setAnswers((prev) => ({ ...prev, [key]: { ...getAnswer(key), ...patch } }));
  }
  async function addPhoto(key, file) {
    if (!file) return;
    setUploading(key);
    try {
      const url = await compressImageAndUpload(file); // compressed to 150KB
      const cur = getAnswer(key);
      setAnswer(key, { photos: [...cur.photos, { photo_url: url, caption: '' }] });
    } catch (e) {
      toast.error(e.message || 'Photo upload failed');
    } finally {
      setUploading(null);
    }
  }
  function removePhoto(key, idx) {
    const cur = getAnswer(key);
    setAnswer(key, { photos: cur.photos.filter((_, i) => i !== idx) });
  }
  function setCaption(key, idx, caption) {
    const cur = getAnswer(key);
    setAnswer(key, { photos: cur.photos.map((p, i) => (i === idx ? { ...p, caption } : p)) });
  }

  // Group questions under their category for the 'categories_questions' layout.
  const grouped = useMemo(() => {
    if (structure !== 'categories_questions' || !submission) return [];
    const cats = submission.categories || [];
    const byCat = {};
    (submission.questions || []).forEach((q) => { (byCat[q.category_id] ||= []).push(q); });
    return cats.map((c) => ({ category: c, questions: byCat[c.id] || [] }));
  }, [structure, submission]);
  const effectiveOpenCategory = openCategory ?? grouped[0]?.category?.id ?? null;

  function buildResponses() {
    return items.map((it) => {
      const a = getAnswer(it.key);
      const base = it.kind === 'category' ? { category_id: it.key } : { question_id: it.key };
      return {
        ...base,
        score: a.score != null && a.score !== '' ? Number(a.score) : null,
        remarks: a.remarks || null,
        photos: (a.photos || []).filter((p) => p.photo_url).map((p) => ({ photo_url: p.photo_url, caption: p.caption || null })),
      };
    });
  }

  function validate(forSubmit) {
    if (!forSubmit) return null;
    const answered = (it) => {
      const a = getAnswer(it.key);
      return a.score != null || (a.remarks && a.remarks.trim()) || (a.photos || []).some((p) => p.photo_url);
    };
    if (scoringMode === 'required') {
      const missing = items.find((it) => getAnswer(it.key).score == null);
      if (missing) return 'Give every item a score before submitting';
    }
    const missingPhoto = items.find((it) => it.photo_required && !(getAnswer(it.key).photos || []).some((p) => p.photo_url));
    if (missingPhoto) return `A photo is required for "${missingPhoto.label}"`;
    if (scoringMode === 'off' && !items.some(answered)) return 'Add at least one photo or comment before submitting';
    return null;
  }

  function handleOpenPreview() {
    const err = validate(true);
    if (err) { toast.error(err); return; }
    setShowPreview(true);
  }
  async function handleConfirmSubmit() {
    try {
      await submitResponses.mutateAsync({ id, responses: buildResponses() });
      toast.success('Audit submitted');
      setShowPreview(false);
    } catch (e) {
      toast.error(e.message || 'Could not submit audit');
    }
  }
  async function handleSaveDraft() {
    try {
      await saveDraft.mutateAsync({ id, responses: buildResponses() });
      toast.success('Draft saved');
    } catch (e) {
      toast.error(e.message || 'Could not save draft');
    }
  }

  if (isLoading) return <div className="p-6 text-center text-slate-400">Loading…</div>;
  if (!submission) return <div className="p-6 text-center text-slate-400">Audit not found</div>;

  const scoreMax = Number(submission.score_max) || 4;
  const overallAvg = submission.total_score != null ? Number(submission.total_score) : null;
  const categoryAverages = submission.category_scores || [];
  const catNameById = Object.fromEntries((submission.categories || []).map((c) => [c.id, c.name]));
  const occ = submission.occurrence || null;
  const scorecards = submission.scorecards || [];
  const combinedCategories = submission.combined_categories || [];

  const renderItemCard = (it) => {
    const a = getAnswer(it.key);
    return (
      <div key={it.key} className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
        <p className="text-sm text-slate-800">
          {it.kind === 'category' ? catLabel(it.label) : it.label}
          {it.photo_required && <span className="ml-1 text-2xs uppercase tracking-wide text-amber-600">Photo required</span>}
        </p>

        {scoringMode !== 'off' && (
          scaleTooWide ? (
            <Input
              type="number" disabled={isReadOnly}
              min={submission.score_min} max={submission.score_max} step={submission.score_step}
              value={a.score ?? ''} placeholder={`${fmtNum(submission.score_min)}–${fmtNum(submission.score_max)}`}
              onChange={(e) => setAnswer(it.key, { score: e.target.value === '' ? null : Number(e.target.value) })}
              className="h-9 w-32 text-sm"
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              {scale.map((s) => (
                <button
                  key={s} type="button" disabled={isReadOnly}
                  onClick={() => setAnswer(it.key, { score: a.score === s ? null : s })}
                  className={`min-w-[3rem] flex-1 rounded-md border py-2 text-sm font-semibold ${Number(a.score) === s ? 'border-primary bg-primary/10 text-primary' : 'border-slate-200 text-slate-600'}`}
                >
                  {fmtNum(s)}
                </button>
              ))}
            </div>
          )
        )}

        <Textarea
          disabled={isReadOnly}
          value={a.remarks || ''}
          onChange={(e) => setAnswer(it.key, { remarks: e.target.value })}
          placeholder="Observations / comments (optional)"
          className="text-sm"
        />

        <div className="flex flex-wrap gap-2">
          {(a.photos || []).map((p, idx) => (
            <div key={idx} className="w-28 space-y-1">
              <div className="relative">
                <img src={p.photo_url} alt="" className="h-20 w-full rounded-md border border-slate-200 object-contain bg-slate-50" />
                {!isReadOnly && (
                  <button type="button" onClick={() => removePhoto(it.key, idx)} className="absolute -top-1.5 -right-1.5 rounded-full bg-white border border-slate-300 p-0.5 text-slate-500 hover:text-red-500">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
              {isReadOnly
                ? (p.caption ? <p className="text-xs text-slate-500">{p.caption}</p> : null)
                : <Input value={p.caption || ''} onChange={(e) => setCaption(it.key, idx, e.target.value)} placeholder="Caption" className="h-8 text-xs" />}
            </div>
          ))}
          {!isReadOnly && (
            <label className="inline-flex h-20 w-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-slate-300 text-xs text-primary">
              {uploading === it.key ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
              Add photo
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => addPhoto(it.key, e.target.files?.[0])} />
            </label>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-4 pb-40 md:pb-24">
      <button onClick={() => navigate(backTo)} className="flex items-center gap-1 text-sm text-slate-500"><ArrowLeft className="w-4 h-4" /> Back</button>
      <div>
        <h1 className="text-lg font-bold text-slate-900">{submission.template_name}</h1>
        <p className="text-sm text-slate-500">
          {submission.zone_name} · Due {submission.due_date}
          {scoringMode === 'off' ? ' · No scoring' : ` · Scale ${fmtNum(submission.score_min)}–${fmtNum(submission.score_max)} (step ${fmtNum(submission.score_step)})`}
          {scoringMode === 'optional' ? ' · scoring optional' : ''}
        </p>
      </div>

      {occ && (
        <div className={`rounded-lg border p-3 space-y-2 ${occ.status === 'closed' ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-white'}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-slate-900">
              {occ.status === 'closed'
                ? (occ.combined_score != null ? `Combined grade: ${Number(occ.combined_score).toFixed(2)} / ${fmtNum(occ.combined_max || scoreMax)}` : 'Closed · no score')
                : `Combined so far: ${occ.combined_score != null ? `${Number(occ.combined_score).toFixed(2)} / ${fmtNum(occ.combined_max || scoreMax)}` : '—'}`}
            </div>
            <span className="text-xs text-slate-500 shrink-0">{occ.submitted_count}/{occ.expected_count} auditors submitted</span>
          </div>

          {(scorecards || []).length > 0 && (
            <div className="rounded-md border border-slate-200 bg-white divide-y divide-slate-100">
              {scorecards.map((c) => (
                <div key={c.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="text-slate-700">{c.auditor_name || '—'}{c.id === submission.id ? ' (you)' : ''}</span>
                  <span className={`font-semibold ${c.status === 'submitted' ? 'text-emerald-700' : 'text-amber-600'}`}>
                    {c.status === 'submitted' ? (c.total_score != null ? `${Number(c.total_score).toFixed(1)} / ${fmtNum(c.max_score || scoreMax)}` : 'submitted') : 'in progress'}
                  </span>
                </div>
              ))}
            </div>
          )}
          {occ.status === 'open' && (occ.missing_auditors || []).length > 0 && (
            <p className="text-xs text-slate-400">Waiting on: {occ.missing_auditors.join(', ')}</p>
          )}
          {(combinedCategories || []).length > 0 && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 max-w-md pt-1">
              {combinedCategories.map((c) => (
                <div key={c.category} className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="text-slate-500">{catLabel(c.category)}</span>
                  <span className="text-sm font-semibold text-slate-700">{Number(c.avg_score).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
          {/* "Close the Audit" is the Audit Admin's own call, but only once they have handed
              in their own scorecard — they audit like everyone else before deciding the round
              is over. Everyone (them included) sees Submit; this appears afterwards. */}
          <div className="flex flex-wrap gap-2 pt-1">
            {occ.status === 'open' && submission.can_close && submission.status === 'submitted' && (
              <Button size="sm" variant="outline" className="text-rose-600 hover:text-rose-700" onClick={() => setCloseConfirmOpen(true)} disabled={closeOcc.isPending}>
                Close the Audit
              </Button>
            )}
            {occ.status === 'open' && submission.can_close && submission.status !== 'submitted' && (
              <p className="text-xs text-slate-400">Submit your own scorecard first — then you can close the audit.</p>
            )}
            {/* The final report is available to the Audit Admin / BE-lead / Global tier once
                the round is closed. */}
            {occ.status === 'closed' && submission.can_close && (
              <Button size="sm" variant="outline" onClick={() => navigate('/audits/report/' + occ.id)}>
                <FileText size={14} className="mr-1" /> Generate Report
              </Button>
            )}
          </div>
        </div>
      )}

      {isReadOnly && (
        <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-1">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-900">
              {overallAvg != null ? `Your scorecard: ${overallAvg.toFixed(2)} / ${fmtNum(scoreMax)}` : 'Submitted (no score)'}
            </div>
            {structure !== 'categories' && (
              <Button size="sm" variant="outline" onClick={() => setShowChangeRequest(true)}>Request Change</Button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 max-w-md pt-1">
            {categoryAverages.map((c) => (
              <div key={c.category_id || c.category} className="flex items-baseline justify-between gap-2 text-xs">
                <span className="text-slate-500">{catLabel(c.category || catNameById[c.category_id])}</span>
                <span className="text-sm font-semibold text-slate-700">{Number(c.avg_score).toFixed(2)} / {fmtNum(scoreMax)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {structure === 'categories_questions' ? (
        grouped.map(({ category, questions }) => {
          const isOpen = effectiveOpenCategory === category.id;
          const answeredCount = questions.filter((q) => getAnswer(q.id).score != null).length;
          return (
            <section key={category.id} className="rounded-lg border border-slate-200 bg-white overflow-hidden">
              <button type="button" onClick={() => setOpenCategory(isOpen ? '' : category.id)} className="w-full flex items-center justify-between px-3 py-2.5 text-left">
                <span className="text-sm font-bold text-slate-700">{catLabel(category.name)}</span>
                <span className="flex items-center gap-2 text-xs text-slate-400">
                  {scoringMode === 'off' ? `${questions.length} item(s)` : `${answeredCount}/${questions.length} scored`}
                  <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </span>
              </button>
              {isOpen && (
                <div className="px-3 pb-3 space-y-2 border-t border-slate-100 pt-2">
                  {questions.map((q) => renderItemCard({ key: q.id, kind: 'question', label: q.question_text, photo_required: q.photo_required }))}
                  {questions.length === 0 && <p className="text-xs text-slate-400">No questions in this category.</p>}
                </div>
              )}
            </section>
          );
        })
      ) : (
        <div className="space-y-2">
          {items.map((it) => renderItemCard(it))}
        </div>
      )}

      {!isReadOnly && (
        <div className="fixed bottom-16 md:bottom-0 left-0 right-0 z-30 p-3 bg-white border-t border-slate-200 max-w-3xl mx-auto flex justify-end gap-2 safe-area-bottom">
          <Button variant="outline" onClick={handleSaveDraft} disabled={saveDraft.isPending || submitResponses.isPending}>
            {saveDraft.isPending ? 'Saving…' : 'Save as Draft'}
          </Button>
          <Button onClick={handleOpenPreview} disabled={submitResponses.isPending || saveDraft.isPending}>
            Preview &amp; Submit
          </Button>
        </div>
      )}

      {closeConfirmOpen && (
        <CloseAuditDialog
          occurrence={submission.occurrence}
          isClosing={closeOcc.isPending}
          onConfirm={handleConfirmClose}
          onClose={() => setCloseConfirmOpen(false)}
        />
      )}
      {showPreview && (
        <PreviewDialog
          submission={submission}
          items={items}
          structure={structure}
          scoringMode={scoringMode}
          scoreMax={scoreMax}
          getAnswer={getAnswer}
          isSubmitting={submitResponses.isPending}
          onConfirm={handleConfirmSubmit}
          onClose={() => setShowPreview(false)}
        />
      )}
      {showChangeRequest && (
        <RequestChangeDialog submission={submission} scale={scale} onClose={() => setShowChangeRequest(false)} />
      )}
    </div>
  );
}

// Confirmation for "Close the Audit". Spells out exactly who is being left behind, splitting
// people who never opened the audit from people who are part-way through — closing discards
// the latter's unfinished scorecard, which is the thing worth pausing over.
function CloseAuditDialog({ occurrence: occ, isClosing, onConfirm, onClose }) {
  const notStarted = occ?.not_started_auditors || [];
  const inProgress = occ?.in_progress_auditors || [];
  const everyoneIn = notStarted.length === 0 && inProgress.length === 0;
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{everyoneIn ? 'Close this audit?' : 'Close the audit early?'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-slate-600">
            <span className="font-semibold text-slate-800">{occ?.submitted_count}</span> of{' '}
            <span className="font-semibold text-slate-800">{occ?.expected_count}</span> scorecards are in.
          </p>

          {inProgress.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-800">
                Part-way through ({inProgress.length})
              </p>
              <p className="mt-1 text-sm text-amber-900">{inProgress.join(', ')}</p>
              <p className="mt-1 text-xs text-amber-700">Their unfinished scorecard will be discarded.</p>
            </div>
          )}

          {notStarted.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                Not started ({notStarted.length})
              </p>
              <p className="mt-1 text-sm text-slate-800">{notStarted.join(', ')}</p>
            </div>
          )}

          <p className="text-xs text-slate-500">
            {everyoneIn
              ? 'Everyone has submitted. Closing finalises the combined score.'
              : 'Anyone who has not submitted is left out of the score entirely — they are not marked zero. This cannot be undone.'}
          </p>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose} disabled={isClosing}>Cancel</Button>
          <Button className="bg-rose-600 text-white hover:bg-rose-700" onClick={onConfirm} disabled={isClosing}>
            {isClosing ? 'Closing…' : everyoneIn ? 'Close the Audit' : 'Close anyway'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PreviewDialog({ submission, items, structure, scoringMode, scoreMax, getAnswer, isSubmitting, onConfirm, onClose }) {
  const scored = items.map((it) => ({ it, a: getAnswer(it.key) })).filter((x) => x.a.score != null);
  const overallAvg = scored.length ? scored.reduce((s, x) => s + Number(x.a.score), 0) / scored.length : null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Preview — {submission.template_name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-900">
            {scoringMode === 'off' || overallAvg == null
              ? `${items.filter((it) => { const a = getAnswer(it.key); return a.remarks || (a.photos || []).some((p) => p.photo_url) || a.score != null; }).length} of ${items.length} item(s) filled in`
              : `Projected final average: ${overallAvg.toFixed(2)} / ${scoreMax}`}
          </div>
          <div className="space-y-2">
            {items.map((it) => {
              const a = getAnswer(it.key);
              return (
                <div key={it.key} className="rounded-lg border border-slate-200 p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-slate-800">{it.kind === 'category' ? it.label : it.label}</p>
                    {a.score != null && <span className="font-semibold text-primary shrink-0">{a.score}/{scoreMax}</span>}
                  </div>
                  {a.remarks && <p className="text-xs text-slate-500 mt-1">{a.remarks}</p>}
                  {(a.photos || []).length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-1">
                      {a.photos.map((p, i) => (
                        <div key={i} className="w-20">
                          <img src={p.photo_url} alt="" className="h-16 w-full rounded-md border border-slate-200 object-contain bg-slate-50" />
                          {p.caption && <p className="text-2xs text-slate-500">{p.caption}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Back to Edit</Button>
            <Button onClick={onConfirm} disabled={isSubmitting}>{isSubmitting ? 'Submitting…' : 'Confirm & Submit'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const CHANGE_FIELDS = [
  { value: 'score', label: 'Score' },
  { value: 'photo', label: 'Photo' },
  { value: 'remarks', label: 'Remarks' },
];

function RequestChangeDialog({ submission, scale, onClose }) {
  const createRequest = useCreateAuditChangeRequest();
  const [reason, setReason] = useState('');
  const [items, setItems] = useState([]); // { question_id, field, new_value }
  const [uploading, setUploading] = useState(false);
  const useSelect = scale.length > 0 && scale.length <= 12;

  function toggleQuestion(questionId, checked) {
    setItems((prev) => checked
      ? [...prev, { question_id: questionId, field: 'score', new_value: '' }]
      : prev.filter((it) => it.question_id !== questionId));
  }
  function updateItem(questionId, field, value) {
    setItems((prev) => prev.map((it) => (it.question_id === questionId ? { ...it, [field]: value } : it)));
  }
  async function handlePhotoChange(questionId, file) {
    if (!file) return;
    setUploading(true);
    try {
      const url = await compressImageAndUpload(file);
      updateItem(questionId, 'new_value', url);
    } catch (e) {
      toast.error(e.message || 'Photo upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit() {
    if (!reason.trim()) { toast.error('A reason is required'); return; }
    if (items.length === 0) { toast.error('Select at least one question to change'); return; }
    const incomplete = items.find((it) => !it.new_value);
    if (incomplete) { toast.error('Every selected question needs a new value'); return; }
    try {
      await createRequest.mutateAsync({ submission_id: submission.id, reason: reason.trim(), items });
      toast.success('Change request sent to the audit admin');
      onClose();
    } catch (e) {
      toast.error(e.message || 'Could not send change request');
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Request a Change</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for the change (required)" className="text-sm" />
          <div className="space-y-2">
            {(submission.questions || []).map((q) => {
              const item = items.find((it) => it.question_id === q.id);
              const checked = !!item;
              return (
                <div key={q.id} className="rounded-lg border border-slate-200 p-3 space-y-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={checked} onChange={(e) => toggleQuestion(q.id, e.target.checked)} />
                    {q.question_text}
                  </label>
                  {checked && (
                    <div className="pl-6 flex gap-2 items-center flex-wrap">
                      <Select value={item.field} onValueChange={(v) => updateItem(q.id, 'field', v)}>
                        <SelectTrigger className="h-8 text-xs w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {CHANGE_FIELDS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {item.field === 'score' && (
                        useSelect ? (
                          <Select value={item.new_value} onValueChange={(v) => updateItem(q.id, 'new_value', v)}>
                            <SelectTrigger className="h-8 text-xs w-24"><SelectValue placeholder="Score" /></SelectTrigger>
                            <SelectContent>
                              {scale.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input type="number" min={submission.score_min} max={submission.score_max} step={submission.score_step}
                            value={item.new_value} onChange={(e) => updateItem(q.id, 'new_value', e.target.value)} className="h-8 text-xs w-24" placeholder="Score" />
                        )
                      )}
                      {item.field === 'remarks' && (
                        <Input value={item.new_value} onChange={(e) => updateItem(q.id, 'new_value', e.target.value)} placeholder="New remarks" className="h-8 text-xs" />
                      )}
                      {item.field === 'photo' && (
                        <label className="inline-flex items-center gap-1 text-xs text-primary cursor-pointer">
                          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                          {item.new_value ? 'Photo selected' : 'Choose photo'}
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => handlePhotoChange(q.id, e.target.files?.[0])} />
                        </label>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createRequest.isPending}>Send Request</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
