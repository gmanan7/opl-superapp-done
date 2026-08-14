// Kaizen create/edit — ONE form (UAT round 2, item A; supersedes the two-stage
// idea→promote of D-030). All fields on a single screen; photo on the form (mobile +
// desktop); description MANDATORY; Submit gated on title + description; Save-draft or
// Submit-for-review. Create-first: a draft row is inserted before image upload so the
// validate-kaizen-image Edge can authorize it. B = object-contain preview; C = factory-
// wide team picker via kaizen_worker_search. Fields use the null-fallback pattern
// (local ?? existing) so no setState-in-effect.
import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ChevronLeft, ImagePlus, X, Search, UserPlus } from 'lucide-react';
import { useKaizen, useCreateKaizenIdea, useUpdateKaizen, useSubmitKaizen, useKaizenWorkerSearch, useTeamMemberNames, } from '../../hooks/useKaizen';
import { uploadKaizenImageViaEdge, ImageUploadError } from '../../lib/imageUpload';
import { getSessionContext } from '../../lib/auth';
import { useJhGroupSelector } from '../../hooks/useJhGroupSelector';
import { CaptureColumn, EmptyState } from '@/components/patterns';
import { Button } from '@/components/ui/button';
const AREAS = [
    { value: 'productivity', label: 'Productivity' },
    { value: 'quality', label: 'Quality' },
    { value: 'cost', label: 'Cost' },
    { value: 'delivery', label: 'Delivery' },
    { value: 'safety', label: 'Safety' },
    { value: 'morale', label: 'Morale' },
];
const inputCls = 'w-full rounded-md border border-line-strong bg-surface-raised px-3 py-2 text-base text-ink focus:outline-none focus-visible:shadow-focus';
// B — preview FITS the box (object-contain in an aspect frame), never crops/overflows.
function ImageSlot({ preview, label, onAdd, onRemove, disabled }) {
    const { t } = useTranslation();
    const ref = useRef(null);
    return (<div className="space-y-1">
      <p className="text-sm font-medium text-ink-muted">{label}</p>
      {preview ? (<div className="relative aspect-[4/3] w-full overflow-hidden rounded-md border border-line bg-surface-sunken">
          <img src={preview} alt={label} className="h-full w-full object-contain"/>
          {!disabled && <button type="button" onClick={onRemove} aria-label={t('kaizen.removePhoto')} className="absolute right-2 top-2 rounded-full bg-surface-raised/90 p-1 shadow-sm hover:bg-surface-raised"><X size={14} className="text-ink-muted"/></button>}
        </div>) : (<button type="button" onClick={() => ref.current?.click()} disabled={disabled} className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-line hover:border-brand hover:bg-surface-hover disabled:opacity-50">
          <ImagePlus size={20} className="text-ink-subtle"/><span className="text-xs text-ink-subtle">{t('kaizen.addPhoto')}</span>
        </button>)}
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f)
        onAdd(f); e.target.value = ''; }}/>
    </div>);
}
export function KaizenForm() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { id: editId } = useParams();
    const isEdit = !!editId;
    const ctx = getSessionContext();
    const existing = useKaizen(editId);
    const ex = existing.data;
    const create = useCreateKaizenIdea();
    const update = useUpdateKaizen();
    const submitK = useSubmitKaizen();
    const { selectedJhGroupId, setSelectedJhGroupId, needsGroupSelector, jhGroups, isLoading: jhLoading } = useJhGroupSelector();
    const newIdRef = useRef(crypto.randomUUID());
    const [createdId, setCreatedId] = useState(null);
    // null/undefined = unchanged → fall back to the loaded record (no setState-in-effect).
    const [title, setTitle] = useState(null);
    const [area, setArea] = useState(undefined);
    const [brief, setBrief] = useState(null);
    const [problem, setProblem] = useState(null);
    const [solution, setSolution] = useState(null);
    const [cost, setCost] = useState(null);
    const [benefit, setBenefit] = useState(null);
    const [hd, setHd] = useState(null);
    const [hdDetails, setHdDetails] = useState(null);
    const [team, setTeam] = useState(null);
    const [pickedNames, setPickedNames] = useState({});
    const [q, setQ] = useState('');
    const [beforeFile, setBeforeFile] = useState(null);
    const [afterFile, setAfterFile] = useState(null);
    const [beforePrev, setBeforePrev] = useState(null);
    const [afterPrev, setAfterPrev] = useState(null);
    const [phase, setPhase] = useState('idle');
    const [error, setError] = useState(null);
    const vTitle = title ?? ex?.title ?? '';
    const vArea = area === undefined ? (ex?.result_area ?? null) : area;
    const vBrief = brief ?? ex?.brief_description ?? '';
    const vProblem = problem ?? ex?.problem_description ?? '';
    const vSolution = solution ?? ex?.solution_description ?? '';
    const vCost = cost ?? (ex?.cost_impl != null ? String(ex.cost_impl) : '');
    const vBenefit = benefit ?? ex?.benefit_description ?? '';
    const vHd = hd ?? ex?.horizontal_deployment ?? false;
    const vHdDetails = hdDetails ?? ex?.horizontal_deployment_details ?? '';
    const vTeam = team ?? new Set(ex?.team_member_ids ?? []);
    const teamNames = useTeamMemberNames([...vTeam]);
    const results = useKaizenWorkerSearch(q);
    const isPending = phase !== 'idle';
    const hasBeforePhoto = !!(beforeFile || beforePrev || ex?.before_image_key);
    const canSubmit = vTitle.trim().length > 0 && vProblem.trim().length > 0 && hasBeforePhoto;
    const nameFor = (id) => pickedNames[id] ?? teamNames.data?.[id] ?? '…';
    function addMember(id, name) { setTeam(new Set([...vTeam, id])); setPickedNames((m) => ({ ...m, [id]: name })); }
    function removeMember(id) { setTeam(new Set([...vTeam].filter((x) => x !== id))); }
    async function save(thenSubmit) {
        setError(null);
        if (!vTitle.trim())
            return setError(t('kaizen.errorTitleRequired'));
        if (thenSubmit && !(vTitle.trim() && vProblem.trim() && hasBeforePhoto))
            return setError('Please enter Kaizen Title, Problem Description, and attach a Before Photo before submitting');
        if (!ctx?.factory_id)
            return setError(t('kaizen.errorNoFactory'));
        if (!isEdit && !createdId && !selectedJhGroupId)
            return setError(t('kaizen.errorResultAreaRequired'));
        const kid = isEdit ? editId : newIdRef.current;
        try {
            if (!isEdit && !createdId) {
                setPhase('saving');
                await create.mutateAsync({ id: kid, title: vTitle.trim(), result_area: vArea, brief_description: vBrief.trim() || null, jh_group_id: selectedJhGroupId, machine_id: null });
                setCreatedId(kid);
            }
            let beforeUrl = ex?.before_image_1_url ?? null, beforeHash = ex?.before_image_1_hash ?? null;
            let afterUrl = ex?.after_image_1_url ?? null, afterHash = ex?.after_image_1_hash ?? null;
            if (beforeFile || afterFile) {
                setPhase('uploading');
                if (beforeFile) {
                    const r = await uploadKaizenImageViaEdge(beforeFile, kid, 'before', { prevHash: beforeHash, prevPath: beforeUrl });
                    beforeUrl = r.path;
                    beforeHash = r.hash;
                }
                if (afterFile) {
                    const r = await uploadKaizenImageViaEdge(afterFile, kid, 'after', { prevHash: afterHash, prevPath: afterUrl });
                    afterUrl = r.path;
                    afterHash = r.hash;
                }
            }
            setPhase('saving');
            const fields = {
                id: kid, title: vTitle.trim(), result_area: vArea ?? undefined, brief_description: vBrief.trim() || null,
                problem_description: vProblem.trim() || null, solution_description: vSolution.trim() || null,
                cost_impl: vCost ? Number(vCost) : null, benefit_description: vBenefit.trim() || null,
                team_member_ids: [...vTeam], horizontal_deployment: vHd, horizontal_deployment_details: vHd ? (vHdDetails.trim() || null) : null,
                before_image_1_url: beforeUrl, before_image_1_hash: beforeHash, after_image_1_url: afterUrl, after_image_1_hash: afterHash,
            };
            await update.mutateAsync(fields);
            if (thenSubmit)
                await submitK.mutateAsync({ id: kid });
            toast.success(thenSubmit ? t('kaizen.submitted') : t('kaizen.draftSaved'));
            navigate(`/kaizen/${kid}`, { replace: true });
        }
        catch (e) {
            setPhase('idle');
            setError(e instanceof ImageUploadError ? e.message : e.message || t('kaizen.errorSubmitFailed'));
        }
    }
    if (isEdit && existing.isLoading)
        return <CaptureColumn><div className="py-16 text-center text-sm text-ink-subtle">{t('common.loading')}</div></CaptureColumn>;
    if (isEdit && !ex)
        return <CaptureColumn><div className="py-8"><EmptyState title={t('kaizen.notFound')} action={{ label: t('common.back'), onClick: () => navigate('/kaizen') }}/></div></CaptureColumn>;
    return (<div className="min-h-full bg-surface-base">
      <header className="sticky top-0 z-30 border-b border-line bg-surface-raised">
        <CaptureColumn className="flex items-center gap-1 py-3">
          <button type="button" onClick={() => navigate(isEdit ? `/kaizen/${editId}` : '/kaizen')} aria-label={t('common.back')} className="flex h-touch w-touch shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-surface-hover"><ChevronLeft size={22}/></button>
          <h1 className="min-w-0 flex-1 truncate text-2xl font-semibold text-ink-strong">{isEdit ? t('kaizen.editTitle') : t('kaizen.newTitle')}</h1>
        </CaptureColumn>
      </header>

      <CaptureColumn>
        <div className="space-y-6 py-5 pb-28">
          {needsGroupSelector && !isEdit && (<div className="space-y-1.5">
              <label className="text-sm font-medium text-ink-muted">{t('kaizen.jhGroup')}</label>
              {jhLoading ? <p className="text-sm text-ink-subtle">{t('common.loading')}</p> : (<select value={selectedJhGroupId} onChange={(e) => setSelectedJhGroupId(e.target.value)} className={`h-field ${inputCls}`}>
                  <option value="">{t('kaizen.selectJhGroup')}</option>
                  {jhGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>)}
            </div>)}

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-ink-muted">Kaizen Title *</label>
            <input type="text" value={vTitle} onChange={(e) => setTitle(e.target.value)} maxLength={160} disabled={isPending} placeholder="Enter kaizen title..." className={`h-field ${inputCls}`}/>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-ink-muted">Problem / Current Description *</label>
            <textarea value={vProblem} onChange={(e) => setProblem(e.target.value)} maxLength={2000} rows={3} disabled={isPending} placeholder="Describe the current problem, defect, or area of improvement..." className={`${inputCls} resize-none`}/>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-ink-muted">Category *</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
              {AREAS.map((a) => (<button key={a.value} type="button" onClick={() => setArea(a.value)} className={`min-h-touch rounded-md border px-3 text-sm font-medium ${vArea === a.value ? 'border-brand bg-brand-subtle text-brand-strong font-bold' : 'border-line bg-surface-raised text-ink hover:bg-surface-hover'}`}>{a.label}</button>))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <ImageSlot preview={beforePrev} label={`${t('kaizen.before')} *`} disabled={isPending} onAdd={(f) => { setBeforeFile(f); setBeforePrev(URL.createObjectURL(f)); }} onRemove={() => { setBeforeFile(null); setBeforePrev(null); }}/>
            <ImageSlot preview={afterPrev} label={t('kaizen.after')} disabled={isPending} onAdd={(f) => { setAfterFile(f); setAfterPrev(URL.createObjectURL(f)); }} onRemove={() => { setAfterFile(null); setAfterPrev(null); }}/>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-ink-muted">Solution / Improvement Action</label>
            <textarea value={vSolution} onChange={(e) => setSolution(e.target.value)} maxLength={2000} rows={3} disabled={isPending} placeholder={t('kaizen.fieldSolutionDescPlaceholder')} className={`${inputCls} resize-none`}/>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><label className="text-sm font-medium text-ink-muted">{t('kaizen.fieldCost')}</label><input type="number" inputMode="numeric" min={0} value={vCost} onChange={(e) => setCost(e.target.value)} disabled={isPending} placeholder={t('kaizen.fieldCostPlaceholder')} className={`h-field ${inputCls}`}/></div>
            <div className="space-y-1.5"><label className="text-sm font-medium text-ink-muted">{t('kaizen.benefitLabel')}</label><input type="text" value={vBenefit} onChange={(e) => setBenefit(e.target.value)} maxLength={300} disabled={isPending} placeholder={t('kaizen.benefitPlaceholder')} className={`h-field ${inputCls}`}/></div>
          </div>

          {/* C — factory-wide team picker (kaizen_worker_search) */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-ink-muted">{t('kaizen.teamLabel')} · {vTeam.size}</label>
            {vTeam.size > 0 && (<div className="flex flex-wrap gap-2">
                {[...vTeam].map((mid) => (<span key={mid} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-sunken px-2.5 py-1 text-sm text-ink">
                    {nameFor(mid)}
                    <button type="button" onClick={() => removeMember(mid)} aria-label={t('kaizen.removePhoto')} className="text-ink-subtle hover:text-danger-fg"><X size={13}/></button>
                  </span>))}
              </div>)}
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle"/>
              <input type="text" value={q} onChange={(e) => setQ(e.target.value)} disabled={isPending} placeholder={t('kaizen.searchPeople')} className={`h-field ${inputCls} pl-9`}/>
            </div>
            {q.trim().length > 0 && (<ul className="max-h-56 divide-y divide-line overflow-y-auto rounded-md border border-line">
                {(results.data ?? []).filter((w) => !vTeam.has(w.id)).map((w) => (<li key={w.id}><button type="button" onClick={() => addMember(w.id, w.name)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-hover">
                    <UserPlus size={14} className="shrink-0 text-brand-strong"/>
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">{w.name}</span>
                    {w.jh_group && <span className="shrink-0 text-xs text-ink-subtle">{w.jh_group}</span>}
                  </button></li>))}
                {!results.isLoading && (results.data ?? []).filter((w) => !vTeam.has(w.id)).length === 0 && <li className="px-3 py-2 text-sm text-ink-subtle">{t('kaizen.noResults')}</li>}
              </ul>)}
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-3"><input type="checkbox" checked={vHd} onChange={(e) => setHd(e.target.checked)} disabled={isPending} className="h-4 w-4 accent-brand"/><span className="text-sm font-medium text-ink">{t('kaizen.hdApplies')}</span></label>
            {vHd && <textarea value={vHdDetails} onChange={(e) => setHdDetails(e.target.value)} maxLength={500} rows={2} disabled={isPending} placeholder={t('kaizen.fieldHorizontalDeploymentPlaceholder')} className={`${inputCls} resize-none`}/>}
          </div>

          {error && <p className="rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-fg">{error}</p>}

          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => save(false)} disabled={isPending} className="h-touch-lg flex-1">{phase === 'uploading' ? t('kaizen.uploadingImages') : phase === 'saving' ? t('kaizen.saving') : t('kaizen.saveDraft')}</Button>
            <Button onClick={() => save(true)} disabled={isPending || !canSubmit} className="h-touch-lg flex-1">{t('kaizen.submitForReview')}</Button>
          </div>
          {!canSubmit && <p className="text-center text-xs text-ink-subtle">{t('kaizen.submitHint')}</p>}
        </div>
      </CaptureColumn>
    </div>);
}
