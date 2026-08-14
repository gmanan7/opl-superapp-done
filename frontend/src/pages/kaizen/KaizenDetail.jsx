import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronLeft, Pencil, Printer, Share2, CheckCircle2, XCircle, Send } from 'lucide-react';
import { useKaizen, useApproveKaizen, useRejectKaizen, useSubmitKaizen, roleAtLeast } from '../../hooks/useKaizen';
import { getSessionContext } from '../../lib/auth';
import { useTranslateContent } from '../../hooks/useTranslateContent';
import { useFactoryModules, buildEnabledSet } from '../../hooks/mdm';
import { CaptureColumn, StatusBadge, BeforeAfterImagePair, TranslateControl, ConfirmModal, EmptyState } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { api } from '../../lib/api';
const STATUS_KEY = {
  draft: 'neutral',
  submitted: 'warning',
  pending_review: 'warning',
  approved_for_implementation: 'info',
  approved: 'info',
  implemented: 'brand',
  submitted_for_confirmation: 'warning',
  confirmed_close: 'success',
  rejected: 'danger',
  marked_for_deletion: 'danger'
};
const STATUS_LABEL = {
  draft: 'Draft',
  submitted: 'Pending review',
  pending_review: 'Pending review',
  approved_for_implementation: 'Approved for Implementation',
  approved: 'Approved for Implementation',
  implemented: 'Implemented',
  submitted_for_confirmation: 'Submitted for confirmation',
  confirmed_close: 'Confirmed Close/Marked for deletion',
  rejected: 'Marked for deletion',
  marked_for_deletion: 'Marked for deletion'
};
const AREA_LABEL = { quality: 'kaizen.resultQuality', safety: 'kaizen.resultSafety', productivity: 'kaizen.resultProductivity', cost: 'kaizen.resultCost', environment: 'kaizen.resultEnvironment' };

function Prose({ text }) {
    const modules = useFactoryModules();
    const enabled = buildEnabledSet(modules.data).has('content_translation');
    const translate = useTranslateContent();
    if (!enabled)
        return <p className="whitespace-pre-wrap break-words text-base text-ink">{text}</p>;
    return (<TranslateControl originalText={text} originalLang="en" onTranslate={async (o) => { const r = await translate.mutateAsync({ text, target: o.target, source: o.source, sourceAsserted: o.sourceAsserted }); return { translatedText: r.translated_text ?? '', sourceLang: r.source_lang ?? String(o.source), code: r.code }; }}/>);
}
export function KaizenDetail() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { id } = useParams();
    const ctx = getSessionContext();
    const { data: k, isLoading } = useKaizen(id);
    const approve = useApproveKaizen();
    const reject = useRejectKaizen();
    const submit = useSubmitKaizen();
    const [rejectOpen, setRejectOpen] = useState(false);
    const [reason, setReason] = useState('');
    const team = useQuery({
        queryKey: ['kaizenTeam', id, (k?.team_member_ids ?? []).join(',')],
        enabled: !!k && (k.team_member_ids?.length ?? 0) > 0,
        queryFn: async () => {
            const workers = await api.getWorkers();
            return workers
                .filter((w) => k?.team_member_ids?.includes(w.id))
                .map((w) => ({ id: w.id, name: w.name }));
        },
    });
    if (isLoading)
        return <CaptureColumn><div className="py-16 text-center text-sm text-ink-subtle">{t('common.loading')}</div></CaptureColumn>;
    if (!k)
        return <CaptureColumn><div className="py-8"><EmptyState title={t('kaizen.notFound')} action={{ label: t('common.back'), onClick: () => navigate('/kaizen') }}/></div></CaptureColumn>;
    const isAuthor = k.submitted_by === ctx?.worker_id;
    const canEdit = isAuthor && (k.status === 'draft' || k.status === 'rejected');
    const isApprover = roleAtLeast(ctx?.role, 'dmt_leader');
    const isReviewer = roleAtLeast(ctx?.role, 'jh_leader') && !isApprover;
    async function act(p, ok) {
        try {
            await p;
            toast.success(ok);
        }
        catch (e) {
            toast.error(e.message || t('common.error'));
        }
    }
    return (<>
      <div className="min-h-full bg-surface-base print:bg-white">
        <div className="sticky top-0 z-20 flex items-center gap-1 border-b border-line bg-surface-raised px-2 py-2 print:hidden">
          <button type="button" onClick={() => navigate('/kaizen')} aria-label={t('common.back')} className="flex h-touch w-touch items-center justify-center rounded-md text-ink-muted hover:bg-surface-hover"><ChevronLeft size={22}/></button>
          <h2 className="flex-1 truncate text-base font-semibold text-ink-strong">{t('kaizen.detailTitle')}</h2>
          {canEdit && <button type="button" onClick={() => navigate(`/kaizen/${k.id}/edit`)} aria-label={t('kaizen.addFullDetails')} className="flex h-touch w-touch items-center justify-center rounded-md text-ink-muted hover:bg-surface-hover"><Pencil size={18}/></button>}
          <button type="button" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/kaizen/${k.id}`); toast.success(t('kaizen.linkCopied')); }} aria-label="share" className="flex h-touch w-touch items-center justify-center rounded-md text-ink-muted hover:bg-surface-hover"><Share2 size={18}/></button>
          <button type="button" onClick={() => window.print()} aria-label="print" className="flex h-touch w-touch items-center justify-center rounded-md text-ink-muted hover:bg-surface-hover"><Printer size={18}/></button>
        </div>

        <CaptureColumn>
          <div className="space-y-5 py-5">
            <div className="rounded-lg border border-line bg-surface-raised p-5">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {k.result_area && <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-ink-muted">{t(AREA_LABEL[k.result_area])}</span>}
                <StatusBadge status={STATUS_KEY[k.status]} label={STATUS_LABEL[k.status] || k.status}/>
              </div>
              <h1 className="break-words text-2xl font-semibold text-ink-strong">{k.title}</h1>
              <div className="mt-2 space-y-0.5 text-sm text-ink-muted">
                <p>{t('kaizen.submittedBy')}: <span className="text-ink">{k.submitter_name ?? '—'}</span>{k.submitted_at ? ` · ${new Date(k.submitted_at).toLocaleDateString('en-IN')}` : ''}</p>
                {k.jh_group_name && <p>{t('kaizen.jhGroup')}: <span className="text-ink">{k.jh_group_name}</span></p>}
                {k.cost_impl != null && <p>{t('kaizen.costLabel')}: <span className="text-ink">₹{k.cost_impl.toLocaleString('en-IN')}</span></p>}
                {k.benefit_description && <p>{t('kaizen.benefitLabel')}: <span className="text-ink">{k.benefit_description}</span></p>}
                {k.status === 'approved' && <p>{t('kaizen.approvedBy')}: <span className="text-success-fg">{k.approver_name ?? '—'}</span></p>}
              </div>
              {k.brief_description && <div className="mt-3 rounded-md bg-surface-sunken px-3 py-2 text-sm text-ink">{k.brief_description}</div>}
              {k.status === 'rejected' && k.rejection_reason && (<div className="mt-3 rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-fg"><p className="font-semibold">{t('kaizen.reviewNotes')}</p><p>{k.rejection_reason}</p></div>)}
            </div>

            {canEdit && (<button type="button" onClick={() => navigate(`/kaizen/${k.id}/edit`)} className="w-full rounded-lg border border-brand-subtle bg-brand-subtle/40 p-4 text-left hover:bg-brand-subtle">
                <p className="text-sm font-semibold text-brand-strong">{t('kaizen.addFullDetails')}</p>
                <p className="mt-0.5 text-xs text-ink-muted">{t('kaizen.promoteBanner')}</p>
              </button>)}

            {(k.before_image_1_url || k.after_image_1_url) && (<BeforeAfterImagePair before={{ path: k.before_image_1_url }} after={{ path: k.after_image_1_url }} beforeLabel={t('kaizen.before')} afterLabel={t('kaizen.after')}/>)}

            {k.problem_description && <div className="space-y-1.5"><p className="text-sm font-medium text-ink-muted">{t('kaizen.fieldProblemDesc')}</p><Prose text={k.problem_description}/></div>}
            {k.solution_description && <div className="space-y-1.5"><p className="text-sm font-medium text-ink-muted">{t('kaizen.fieldSolutionDesc')}</p><Prose text={k.solution_description}/></div>}
            {k.horizontal_deployment && k.horizontal_deployment_details && <div className="space-y-1.5"><p className="text-sm font-medium text-ink-muted">{t('kaizen.fieldHorizontalDeployment')}</p><Prose text={k.horizontal_deployment_details}/></div>}

            {(k.team_member_ids?.length ?? 0) > 0 && (<div className="space-y-1.5">
                <p className="text-sm font-medium text-ink-muted">{t('kaizen.teamLabel')}</p>
                <ul className="divide-y divide-line rounded-md border border-line">
                  {(team.data ?? []).map((m) => <li key={m.id} className="px-3 py-2 text-sm text-ink-strong">{m.name}</li>)}
                </ul>
              </div>)}

            {isAuthor && (k.status === 'draft' || k.status === 'rejected') && k.problem_description && (<Button onClick={() => act(submit.mutateAsync({ id: k.id }), t('kaizen.submitted'))} className="h-touch-lg w-full gap-2"><Send size={16}/>{t('kaizen.submitForReview')}</Button>)}

            {k.status === 'submitted' && isApprover && (<div className="flex gap-3 rounded-lg border border-line bg-surface-raised p-5 print:hidden">
                <Button onClick={() => act(approve.mutateAsync({ id: k.id }), t('kaizen.approved'))} disabled={approve.isPending} className="h-touch-lg flex-1 gap-2"><CheckCircle2 size={16}/>{t('kaizen.approve')}</Button>
                <Button variant="secondary" onClick={() => { setReason(''); setRejectOpen(true); }} className="h-touch-lg flex-1 gap-2"><XCircle size={16}/>{t('kaizen.reject')}</Button>
              </div>)}
            {k.status === 'submitted' && isReviewer && (<div className="rounded-lg border border-line bg-surface-sunken p-4 text-sm text-ink-muted">{t('kaizen.reviewerNote')}</div>)}
            {k.status === 'submitted' && !isApprover && !isReviewer && (<div className="rounded-md border border-info-border bg-info-bg px-4 py-3 text-sm text-info-fg">{t('kaizen.awaitingApproval')}</div>)}
          </div>
        </CaptureColumn>
      </div>

      <ConfirmModal open={rejectOpen} onOpenChange={setRejectOpen} title={t('kaizen.rejectConfirm')} severity="danger" primaryLabel={t('kaizen.confirmReject')} primaryDisabled={!reason.trim()} isWorking={reject.isPending} onConfirm={async () => { await act(reject.mutateAsync({ id: k.id, reason: reason.trim() }), t('kaizen.rejected')); setRejectOpen(false); }}>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={3} placeholder={t('kaizen.reviewNotesPlaceholder')} autoFocus className="w-full resize-none rounded-md border border-line-strong bg-surface-raised px-3 py-2 text-base text-ink focus:outline-none focus-visible:shadow-focus"/>
      </ConfirmModal>
    </>);
}
