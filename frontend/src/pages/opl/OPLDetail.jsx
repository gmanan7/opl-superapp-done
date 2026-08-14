import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ChevronLeft, Printer, Share2, Pencil, Star, CheckCircle2, XCircle, Send, Trash2, History, MessageSquare } from 'lucide-react';
import { useOPL, useApproveOPL, useRejectOPL, useSubmitOPL, useDeleteOPL, roleAtLeast, } from '../../hooks/useOPL';
import { useTranslateContent } from '../../hooks/useTranslateContent';
import { getSessionContext } from '../../lib/auth';
import { CaptureColumn, StatusBadge, BeforeAfterImagePair, TranslateControl, ConfirmModal, EmptyState } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { OPLPrintView } from '../../components/opl/OPLPrintView';
import { OPLTrainingPanel } from '../../components/opl/OPLTrainingPanel';
import { OPLAuditTrailModal } from '../../components/opl/OPLAuditTrailModal';
const STATUS_KEY = { draft: 'neutral', pending_approval: 'warning', approved: 'success', rejected: 'danger' };
const STATUS_LABEL = { draft: 'opl.statusDraft', pending_approval: 'opl.statusPending', approved: 'opl.statusApproved', rejected: 'opl.statusRejected' };
const TYPE_LABEL = { know_how: 'opl.classBasic', problem_alert: 'opl.classProblem', std_change: 'opl.classStandard' };
export function OPLDetail() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { id } = useParams();
    const ctx = getSessionContext();
    const { data: opl, isLoading } = useOPL(id);
    const approve = useApproveOPL();
    const reject = useRejectOPL();
    const submit = useSubmitOPL();
    const del = useDeleteOPL();
    const translate = useTranslateContent();
    const [acceptOpen, setAcceptOpen] = useState(false);
    const [isCritical, setIsCritical] = useState(false);
    const [showInlineReject, setShowInlineReject] = useState(false);
    const [reason, setReason] = useState('');
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [auditOpen, setAuditOpen] = useState(false);
    if (isLoading)
        return <CaptureColumn><div className="py-16 text-center text-sm text-ink-subtle">{t('common.loading')}</div></CaptureColumn>;
    if (!opl)
        return <CaptureColumn><div className="py-8"><EmptyState title={t('opl.notFound')} action={{ label: t('common.back'), onClick: () => navigate('/opl') }}/></div></CaptureColumn>;
    const isAuthor = opl.created_by === ctx?.worker_id;
    const isLeader = roleAtLeast(ctx?.role, 'jh_leader');
    const userRole = (ctx?.role || '').toLowerCase();
    const userPlant = (ctx?.factory_name || ctx?.factory_code || 'TVT').toLowerCase();
    const isBeLeadRole = userRole.includes('be_lead') || userRole === 'be_lead' || userRole === 'admin' || userRole === 'it_lead' || userRole === 'leadership';
    const isPlantBeLead = isBeLeadRole && ((opl?.plant_name || '').toLowerCase() === userPlant || userPlant === 'all' || !opl?.plant_name || userRole === 'admin' || userRole === 'it_lead' || userRole === 'leadership');
    const canEdit = isAuthor && (opl.status === 'draft' || opl.status === 'rejected');
    const resolver = (text) => async (o) => {
        const res = await translate.mutateAsync({ text, target: o.target, source: o.source, sourceAsserted: o.sourceAsserted });
        return { translatedText: res.translated_text ?? '', sourceLang: res.source_lang ?? String(o.source), code: res.code };
    };
    async function act(fn, okMsg) {
        try {
            await fn;
            toast.success(okMsg);
        }
        catch (e) {
            toast.error(e.message || t('common.error'));
        }
    }
    return (<>
      <div className="min-h-full bg-surface-base print:bg-white overflow-x-hidden">
        <div className="sticky top-0 z-20 flex items-center justify-between gap-1 border-b border-line bg-surface-raised px-2.5 py-2 print:hidden">
          <div className="flex items-center gap-1 min-w-0 flex-1">
            <button type="button" onClick={() => navigate('/opl')} aria-label={t('common.back')} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-surface-hover"><ChevronLeft size={20}/></button>
            <h2 className="truncate text-sm sm:text-base font-semibold text-ink-strong">{t('opl.detailTitle')}</h2>
          </div>
          <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
            {opl.is_star && (
              <span className="flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-1 rounded-md border border-amber-200 dark:border-amber-800" title="Critical OPL">
                <Star size={14} className="fill-amber-400 text-amber-500"/>
                <span>Critical</span>
              </span>
            )}
            {canEdit && <button type="button" onClick={() => navigate(`/opl/${opl.id}/edit`)} aria-label={t('common.edit')} className="flex h-9 w-9 items-center justify-center rounded-md text-ink-muted hover:bg-surface-hover"><Pencil size={18}/></button>}
            {isPlantBeLead && <button type="button" onClick={() => setAuditOpen(true)} title="View Audit Trail" aria-label="audit trail" className="flex h-9 w-9 items-center justify-center rounded-md text-ink-muted hover:bg-surface-hover"><History size={18} className="text-brand-strong"/></button>}
            <button type="button" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/opl/${opl.id}`); toast.success(t('opl.shareCopied')); }} aria-label="share" className="flex h-9 w-9 items-center justify-center rounded-md text-ink-muted hover:bg-surface-hover"><Share2 size={18}/></button>
            <button type="button" onClick={() => window.print()} aria-label="print" className="flex h-9 w-9 items-center justify-center rounded-md text-ink-muted hover:bg-surface-hover"><Printer size={18}/></button>
          </div>
        </div>

        <CaptureColumn>
          <div className="space-y-5 py-5">
            <div className="rounded-lg border border-line bg-surface-raised p-5">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {opl.opl_type && <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-ink-muted">{t(TYPE_LABEL[opl.opl_type] ?? opl.opl_type)}</span>}
                <StatusBadge status={STATUS_KEY[opl.status]} label={t(STATUS_LABEL[opl.status] ?? opl.status)}/>
              </div>
              <h1 className="break-words text-2xl font-semibold text-ink-strong">{opl.title}</h1>
              <div className="mt-2 space-y-0.5 text-sm text-ink-muted">
                <p>{t('opl.createdBy')}: <span className="text-ink">{opl.creator_name ?? '—'}</span> · {new Date(opl.created_at).toLocaleDateString('en-IN')}</p>
                {opl.machine_name && <p>{t('opl.machine')}: <span className="text-ink">{opl.machine_name}</span></p>}
                {opl.status === 'approved' && <p>{t('opl.approvedBy')}: <span className="text-success-fg">{opl.approver_name ?? '—'}</span></p>}
              </div>
              {opl.status === 'rejected' && opl.rejection_reason && (<div className="mt-3 rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-fg">
                  <p className="font-semibold">{t('opl.rejectionNote')}</p><p>{opl.rejection_reason}</p>
                </div>)}
            </div>

            {opl.content_text && (<div className="space-y-1.5">
                <p className="text-sm font-medium text-ink-muted">{t('opl.knowHowBody')}</p>
                <TranslateControl originalText={opl.content_text} originalLang={'hi'} onTranslate={resolver(opl.content_text)}/>
              </div>)}

            <BeforeAfterImagePair before={{ path: opl.before_image_url }} after={{ path: opl.after_image_url }} beforeLabel={t('opl.fieldBeforeImage')} afterLabel={t('opl.fieldAfterImage')}/>
            {opl.before_remarks && (<div className="space-y-1.5"><p className="text-sm font-medium text-ink-muted">{t('opl.fieldBeforeRemarks')}</p><TranslateControl originalText={opl.before_remarks} originalLang={'hi'} onTranslate={resolver(opl.before_remarks)}/></div>)}
            {opl.after_remarks && (<div className="space-y-1.5"><p className="text-sm font-medium text-ink-muted">{t('opl.fieldAfterRemarks')}</p><TranslateControl originalText={opl.after_remarks} originalLang={'hi'} onTranslate={resolver(opl.after_remarks)}/></div>)}

            {opl.status === 'approved' && <OPLTrainingPanel opl={opl}/>}

            {isAuthor && (opl.status === 'draft' || opl.status === 'rejected') && (<Button onClick={() => act(submit.mutateAsync({ id: opl.id }), t('opl.submitted'))} className="h-touch-lg w-full gap-2"><Send size={16}/>{t('opl.submitApproval')}</Button>)}

            {isLeader && (opl.status === 'pending_approval' || opl.status === 'pending_jh_review') && (
              <div className="space-y-3">
                <div className="flex gap-3">
                  <Button onClick={() => { setIsCritical(false); setAcceptOpen(true); }} className="h-touch-lg flex-1 gap-2"><CheckCircle2 size={16}/>{t('opl.approve')}</Button>
                  <Button variant="secondary" onClick={() => { setReason(''); setShowInlineReject(!showInlineReject); }} className="h-touch-lg flex-1 gap-2"><XCircle size={16}/>{t('opl.reject')}</Button>
                </div>

                {showInlineReject && (
                  <div className="p-3 rounded-xl border border-red-300 dark:border-red-800 bg-red-50/90 dark:bg-red-950/40 space-y-2.5 animate-in fade-in duration-150">
                    <p className="text-xs font-bold text-red-900 dark:text-red-200 flex items-center gap-1.5">
                      <MessageSquare size={14} className="text-red-600 shrink-0" />
                      Rejection Comments / Review Feedback:
                    </p>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      maxLength={500}
                      rows={3}
                      placeholder="Enter comments explaining why this OPL is being rejected..."
                      autoFocus
                      className="w-full resize-none rounded-lg border border-red-300 dark:border-red-800 bg-surface-base p-2.5 text-xs text-ink-strong focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setShowInlineReject(false)}>
                        Cancel
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={!reason.trim() || reject.isPending}
                        onClick={async () => {
                          await act(reject.mutateAsync({ id: opl.id, reason: reason.trim() }), t('opl.rejected'));
                          setShowInlineReject(false);
                        }}
                      >
                        Confirm Rejection
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {(isAuthor || isLeader) && (opl.status === 'draft' || opl.status === 'rejected') && (<button type="button" onClick={() => setDeleteOpen(true)} className="flex items-center gap-1.5 text-sm font-medium text-danger-fg hover:underline"><Trash2 size={14}/>{t('opl.deleteOpl')}</button>)}
          </div>
        </CaptureColumn>
      </div>

      <ConfirmModal
        open={acceptOpen}
        onOpenChange={setAcceptOpen}
        title="Is this critical OPL?"
        description="Choose whether to mark this OPL as critical upon approval."
        severity="success"
        primaryLabel="Approve OPL"
        isWorking={approve.isPending}
        onConfirm={async () => {
          await act(approve.mutateAsync({ id: opl.id, is_star: isCritical, classification: opl.opl_type || 'Knowledge' }), isCritical ? 'OPL approved as Critical OPL ★' : t('opl.approved'));
          setAcceptOpen(false);
        }}
      >
        <div className="space-y-3 pt-1">
          <label className="flex items-start gap-3 p-3 rounded-lg border border-amber-200 dark:border-amber-800/60 bg-amber-50/50 dark:bg-amber-950/20 cursor-pointer hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors">
            <input
              type="checkbox"
              checked={isCritical}
              onChange={(e) => setIsCritical(e.target.checked)}
              className="mt-0.5 rounded text-amber-600 focus:ring-amber-500 h-4 w-4"
            />
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1">
                <Star size={14} className="fill-amber-400 text-amber-500" />
                Yes, mark as Critical OPL
              </span>
              <p className="text-2xs text-amber-800/80 dark:text-amber-300/80">
                Critical OPLs display a Star ★ badge in the central library for high-priority operator training.
              </p>
            </div>
          </label>
        </div>
      </ConfirmModal>

      <ConfirmModal open={deleteOpen} onOpenChange={setDeleteOpen} title={t('opl.deleteConfirm')} description={t('opl.deleteConfirmBody')} severity="danger" primaryLabel={t('opl.deleteOpl')} isWorking={del.isPending} onConfirm={async () => { try {
        await del.mutateAsync({ id: opl.id });
        toast.success(t('opl.deleted'));
        navigate('/opl');
    }
    catch (e) {
        toast.error(e.message);
    } }}/>

      <div style={{ position: 'absolute', left: '-9999px', overflow: 'hidden', width: '1px', height: '1px' }}>
        <OPLPrintView opl={opl} serialNo={1}/>
      </div>
      <OPLAuditTrailModal isOpen={auditOpen} onClose={() => setAuditOpen(false)} oplId={opl.id} oplTitle={opl.title} />
      <style>{`@media print { body * { visibility: hidden; } .opl-print-view, .opl-print-view * { visibility: visible; } .opl-print-view { position: fixed !important; left: 0 !important; top: 0 !important; } }`}</style>
    </>);
}
