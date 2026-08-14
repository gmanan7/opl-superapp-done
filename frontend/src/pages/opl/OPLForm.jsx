import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ImagePlus, X, Loader2 } from 'lucide-react';
import { getSessionContext } from '../../lib/auth';
import { useJhGroupSelector } from '../../hooks/useJhGroupSelector';
import { useCreateOPL, useUpdateOPL, useSubmitOPL, useOPL } from '../../hooks/useOPL';
import { uploadOplImageViaEdge } from '../../lib/imageUpload';
import { api } from '../../lib/api';
import { CaptureColumn } from '@/components/patterns';
import { Button } from '@/components/ui/button';
const TYPES = [
    { value: 'know_how', key: 'opl.classBasic' },
    { value: 'problem_alert', key: 'opl.classProblem' },
    { value: 'std_change', key: 'opl.classStandard' },
];
function ImageSlot({ label, preview, onAdd, onRemove }) {
    const { t } = useTranslation();
    const ref = useRef(null);
    return (<div>
      <p className="mb-1.5 text-sm font-medium text-ink-muted">{label}</p>
      {preview ? (<div className="relative overflow-hidden rounded-lg border border-line">
          <img src={preview} alt="" className="max-h-48 w-full object-cover"/>
          <button type="button" onClick={onRemove} aria-label={t('common.cancel')} className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-ink-strong/60 text-ink-inverse hover:bg-ink-strong/80">
            <X size={14}/>
          </button>
        </div>) : (<button type="button" onClick={() => ref.current?.click()} className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line-strong bg-surface-raised text-ink-subtle hover:border-brand hover:text-brand">
          <ImagePlus size={22}/>
          <span className="text-sm font-medium">{t('opl.addPhoto')}</span>
          <span className="text-xs">{t('opl.photoMax')}</span>
        </button>)}
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f)
        onAdd(f); e.target.value = ''; }}/>
    </div>);
}
export function OPLForm() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { id } = useParams();
    const isEdit = !!id;
    const ctx = getSessionContext();
    const create = useCreateOPL();
    const update = useUpdateOPL();
    const submit = useSubmitOPL();
    const { data: existing } = useOPL(id);
    const { selectedJhGroupId, setSelectedJhGroupId, needsGroupSelector, jhGroups } = useJhGroupSelector();
    const groupId = needsGroupSelector ? selectedJhGroupId : (ctx?.jh_group_id ?? '');
    const { data: machines = [] } = useQuery({
        queryKey: ['opl-machines', groupId],
        enabled: !!groupId,
        queryFn: async () => {
            const all = await api.getMachines(groupId);
            return all.map((m) => ({ id: m.id, name: m.name }));
        },
    });
    const [title, setTitle] = useState('');
    const [oplType, setOplType] = useState('');
    const [machineId, setMachineId] = useState('');
    const [contentText, setContentText] = useState('');
    const [beforeFile, setBeforeFile] = useState(null);
    const [afterFile, setAfterFile] = useState(null);
    const [beforePreview, setBeforePreview] = useState(null);
    const [afterPreview, setAfterPreview] = useState(null);
    const [beforeRemarks, setBeforeRemarks] = useState('');
    const [afterRemarks, setAfterRemarks] = useState('');
    const [err, setErr] = useState(null);
    const [phase, setPhase] = useState('idle');
    const busy = phase !== 'idle';
    useEffect(() => {
        if (!existing)
            return;
        setTitle(existing.title);
        setOplType(existing.opl_type ?? '');
        setMachineId(existing.machine_id ?? '');
        setContentText(existing.content_text ?? '');
        setBeforeRemarks(existing.before_remarks ?? '');
        setAfterRemarks(existing.after_remarks ?? '');
        setBeforePreview(existing.before_image_url ? 'stored' : null);
        setAfterPreview(existing.after_image_url ? 'stored' : null);
    }, [existing]);
    useEffect(() => { setMachineId(''); }, [groupId]);
    const onBefore = useCallback((f) => { setBeforeFile(f); setBeforePreview(URL.createObjectURL(f)); }, []);
    const onAfter = useCallback((f) => { setAfterFile(f); setAfterPreview(URL.createObjectURL(f)); }, []);
    async function handleSave(doSubmit) {
        if (!ctx?.factory_id)
            return setErr(t('opl.errorNoFactory'));
        if (!groupId)
            return setErr(t('common.errorJhGroupRequired'));
        if (!title.trim())
            return setErr(t('opl.errorTitleRequired'));
        if (!oplType)
            return setErr(t('opl.errorClassRequired'));
        if (doSubmit) {
            if (!afterFile && !afterPreview)
                return setErr(t('opl.errorAfterImageRequired') || 'After image is required.');
            if (!afterRemarks.trim())
                return setErr(t('opl.errorAfterRemarksRequired') || 'After description is required.');
        }
        setErr(null);
        const oplId = isEdit ? id : crypto.randomUUID();
        const content = {
            title: title.trim(), opl_type: oplType, machine_id: machineId || null,
            content_text: contentText.trim() || null, before_remarks: beforeRemarks.trim() || null, after_remarks: afterRemarks.trim() || null,
        };
        try {
            if (!isEdit) {
                setPhase('saving');
                await create.mutateAsync({ id: oplId, jh_group_id: groupId, ...content });
            }
            let beforeUrl = existing?.before_image_url ?? null, afterUrl = existing?.after_image_url ?? null;
            let beforeHash = existing?.before_image_hash ?? null, afterHash = existing?.after_image_hash ?? null;
            if (beforeFile || afterFile) {
                setPhase('uploading');
                if (beforeFile) {
                    const r = await uploadOplImageViaEdge(beforeFile, oplId, 'before', { prevHash: beforeHash, prevPath: beforeUrl });
                    beforeUrl = r.path;
                    beforeHash = r.hash;
                }
                if (afterFile) {
                    const r = await uploadOplImageViaEdge(afterFile, oplId, 'after', { prevHash: afterHash, prevPath: afterUrl });
                    afterUrl = r.path;
                    afterHash = r.hash;
                }
            }
            setPhase('saving');
            await update.mutateAsync({ id: oplId, ...content, before_image_url: beforeUrl, after_image_url: afterUrl, before_image_hash: beforeHash, after_image_hash: afterHash });
            if (doSubmit)
                await submit.mutateAsync({ id: oplId });
            navigate(isEdit ? `/opl/${oplId}` : '/opl', { replace: true });
        }
        catch (e) {
            setErr(e.message);
        }
        finally {
            setPhase('idle');
        }
    }
    const label = (base) => phase === 'uploading' ? t('opl.uploadingImages') : phase === 'saving' ? t('opl.saving') : base;
    const hasAfterImage = !!afterFile || !!afterPreview;
    const hasAfterRemarks = !!afterRemarks.trim();
    const canSubmit = !busy && !!title.trim() && !!oplType && !!groupId && hasAfterImage && hasAfterRemarks;
    return (<div className="min-h-full bg-surface-base pb-28">
      <div className="flex items-center gap-1 border-b border-line bg-surface-raised px-2 py-2">
        <button type="button" onClick={() => navigate(-1)} aria-label={t('common.back')} className="flex h-touch w-touch items-center justify-center rounded-md text-ink-muted hover:bg-surface-hover"><ChevronLeft size={22}/></button>
        <h2 className="text-base font-semibold text-ink-strong">{isEdit ? t('opl.formTitleEdit') : t('opl.formTitleNew')}</h2>
      </div>
      <CaptureColumn>
        <div className="space-y-5 py-5">
          {needsGroupSelector && (<div>
              <label className="mb-1.5 block text-sm font-medium text-ink-muted">{t('common.jhGroup')} *</label>
              <select value={selectedJhGroupId} onChange={(e) => setSelectedJhGroupId(e.target.value)} className="min-h-touch w-full rounded-md border border-line bg-surface-raised px-3 text-base text-ink focus:outline-none focus-visible:shadow-focus">
                <option value="">{t('common.selectJhGroup')}</option>
                {jhGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>)}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-muted">{t('opl.fieldTitle')} *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder={t('opl.fieldTitlePlaceholder')} className="min-h-touch w-full rounded-md border border-line-strong bg-surface-raised px-3 text-base text-ink-strong focus:outline-none focus-visible:shadow-focus"/>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-ink-muted">{t('opl.fieldClassification')} *</label>
            <div className="grid grid-cols-3 gap-2">
              {TYPES.map(({ value, key }) => (<button key={value} type="button" onClick={() => setOplType(value)} className={`min-h-touch rounded-md border px-2 text-sm font-medium ${oplType === value ? 'border-brand bg-brand-subtle text-brand-strong' : 'border-line bg-surface-raised text-ink-muted'}`}>
                  {t(key)}
                </button>))}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-muted">{t('opl.fieldMachine')}</label>
            <select value={machineId} onChange={(e) => setMachineId(e.target.value)} disabled={!groupId} className="min-h-touch w-full rounded-md border border-line bg-surface-raised px-3 text-base text-ink focus:outline-none focus-visible:shadow-focus disabled:opacity-50">
              <option value="">{t('opl.selectMachine')}</option>
              {machines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-muted">{t('opl.fieldContent')}</label>
            <textarea value={contentText} onChange={(e) => setContentText(e.target.value)} maxLength={2000} rows={3} placeholder={t('opl.contentPlaceholder')} className="w-full resize-none rounded-md border border-line-strong bg-surface-raised px-3 py-2 text-base text-ink focus:outline-none focus-visible:shadow-focus"/>
          </div>

          {/* Before Section (Optional) */}
          <div className="space-y-2 rounded-lg border border-line p-3 bg-surface-base">
            <ImageSlot label={`${t('opl.fieldBeforeImage')} (optional)`} preview={beforePreview} onAdd={onBefore} onRemove={() => { setBeforeFile(null); setBeforePreview(null); }}/>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-muted">{t('opl.fieldBeforeRemarks')} (optional)</label>
              <textarea value={beforeRemarks} onChange={(e) => setBeforeRemarks(e.target.value)} maxLength={500} rows={2} placeholder={t('opl.remarksPlaceholder')} className="w-full resize-none rounded-md border border-line-strong bg-surface-raised px-3 py-2 text-base text-ink focus:outline-none focus-visible:shadow-focus"/>
            </div>
          </div>

          {/* After Section (Mandatory: Photo + Description) */}
          <div className="space-y-2 rounded-lg border border-brand/30 p-3 bg-surface-base">
            <ImageSlot label={`${t('opl.fieldAfterImage')} *`} preview={afterPreview} onAdd={onAfter} onRemove={() => { setAfterFile(null); setAfterPreview(null); }}/>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-muted">{t('opl.fieldAfterRemarks')} *</label>
              <textarea value={afterRemarks} onChange={(e) => setAfterRemarks(e.target.value)} maxLength={500} rows={2} placeholder={t('opl.remarksPlaceholder')} className="w-full resize-none rounded-md border border-line-strong bg-surface-raised px-3 py-2 text-base text-ink focus:outline-none focus-visible:shadow-focus"/>
            </div>
          </div>

          {err && <div className="rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-fg">{err}</div>}
        </div>
      </CaptureColumn>
      <div className="fixed inset-x-0 bottom-0 flex gap-3 border-t border-line bg-surface-raised px-gutter py-3 md:px-gutter-lg">
        <Button variant="secondary" onClick={() => handleSave(false)} disabled={busy || !title.trim()} className="h-touch-lg flex-1">
          {busy && <Loader2 size={16} className="animate-spin"/>}{label(t('opl.saveDraft'))}
        </Button>
        <Button onClick={() => handleSave(true)} disabled={!canSubmit} className="h-touch-lg flex-1">
          {busy && <Loader2 size={16} className="animate-spin"/>}{label(t('opl.submitApproval'))}
        </Button>
      </div>
    </div>);
}
