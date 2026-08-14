import { useTranslation } from 'react-i18next';
import { History, X, User, Clock, ArrowRight, MessageSquare } from 'lucide-react';
import { useOplAuditTrail } from '../../hooks/useOPL';
import { SkeletonRow, EmptyState } from '@/components/patterns';

const ACTION_BADGES = {
  created: { label: 'Created', color: 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-800' },
  submitted_for_review: { label: 'Submitted for Review', color: 'bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-200 border-sky-200 dark:border-sky-800' },
  jh_accepted: { label: 'Accepted by JH Lead', color: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800' },
  jh_rejected: { label: 'Rejected by JH Lead', color: 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800' },
  be_accepted: { label: 'Accepted by BE Lead', color: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800' },
  be_rejected: { label: 'Rejected by BE Lead', color: 'bg-rose-100 dark:bg-rose-900/40 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-800' },
  classification_changed: { label: 'Classification Changed', color: 'bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-200 border-purple-200 dark:border-purple-800' },
  starred: { label: 'Starred', color: 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800' },
  unstarred: { label: 'Unstarred', color: 'bg-stone-100 dark:bg-stone-800 text-ink-muted border-line' },
  submitted_by_updated: { label: 'Submitter Changed', color: 'bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-200 border-purple-200 dark:border-purple-800' },
  status_changed: { label: 'Status Changed', color: 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800' },
  submitted_by_and_status_changed: { label: 'Updated Submitter & Status', color: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-200 border-indigo-200 dark:border-indigo-800' },
  updated: { label: 'Updated', color: 'bg-stone-100 dark:bg-stone-800 text-ink-muted border-line' },
  approved: { label: 'Approved', color: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800' },
  rejected: { label: 'Rejected', color: 'bg-rose-100 dark:bg-rose-900/40 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-800' }
};

export function OPLAuditTrailModal({ isOpen, onClose, oplId, oplTitle }) {
  const { data: auditLogs = [], isLoading } = useOplAuditTrail(isOpen ? oplId : null);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-line bg-surface-raised shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-4 bg-surface-sunken">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-brand-strong">
              <History size={20} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-ink-strong flex items-center gap-2">
                OPL Audit Trail Log
                {oplId && <span className="text-xs font-mono font-normal text-ink-subtle">(#{oplId})</span>}
              </h3>
              {oplTitle && <p className="text-xs text-ink-muted truncate max-w-md">{oplTitle}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-subtle hover:bg-surface-hover hover:text-ink-strong"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {isLoading ? (
            <div className="space-y-3">
              <SkeletonRow columns={2} />
              <SkeletonRow columns={2} />
            </div>
          ) : auditLogs.length === 0 ? (
            <EmptyState
              title="No Audit History Yet"
              description="Actions, submitter edits, and status changes will appear here in chronological order."
            />
          ) : (
            <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-line">
              {auditLogs.map((log) => {
                const badgeInfo = ACTION_BADGES[log.action] || ACTION_BADGES.updated;
                return (
                  <div key={log.id} className="relative group">
                    {/* Timeline Node Icon */}
                    <div className="absolute -left-6 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-surface-raised border-2 border-brand-strong text-brand-strong">
                      <div className="h-1.5 w-1.5 rounded-full bg-brand-strong" />
                    </div>

                    <div className="rounded-xl border border-line bg-surface-sunken p-4 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/40 pb-2">
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full border ${badgeInfo.color}`}>
                          {badgeInfo.label}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-ink-subtle">
                          <Clock size={12} />
                          {log.timestamp ? new Date(log.timestamp).toLocaleString() : '—'}
                        </span>
                      </div>

                      {/* Submitter Change */}
                      {(log.submitted_by_from || log.submitted_by_to) && log.submitted_by_from !== log.submitted_by_to && (
                        <div className="flex items-center gap-2 text-xs bg-surface-raised p-2 rounded-lg border border-line/60">
                          <User size={14} className="text-brand-strong shrink-0" />
                          <span className="text-ink-subtle">Submitted By:</span>
                          <span className="font-medium text-ink-muted line-through">{log.submitted_by_from || 'None'}</span>
                          <ArrowRight size={12} className="text-ink-subtle" />
                          <span className="font-semibold text-ink-strong">{log.submitted_by_to || 'None'}</span>
                        </div>
                      )}

                      {/* Status Transition */}
                      {(log.status_from || log.status_to) && log.status_from !== log.status_to && (
                        <div className="flex items-center gap-2 text-xs bg-surface-raised p-2 rounded-lg border border-line/60">
                          <span className="text-ink-subtle">Status:</span>
                          <span className="capitalize text-ink-muted">{log.status_from || 'None'}</span>
                          <ArrowRight size={12} className="text-ink-subtle" />
                          <span className="capitalize font-semibold text-ink-strong">{log.status_to}</span>
                        </div>
                      )}

                      {/* Comments */}
                      {log.comments && (
                        <p className="text-xs text-ink-muted flex items-start gap-1.5 pt-0.5">
                          <MessageSquare size={13} className="text-ink-subtle mt-0.5 shrink-0" />
                          <span>{log.comments}</span>
                        </p>
                      )}

                      {/* Performed By Footer */}
                      <div className="pt-1 flex items-center justify-between text-[11px] text-ink-subtle border-t border-line/20">
                        <span>Performed by: <strong className="text-ink-muted">{log.performed_by || 'System'}</strong></span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-line px-5 py-3 bg-surface-sunken flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium rounded-lg border border-line bg-surface-raised hover:bg-surface-hover text-ink-strong"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
