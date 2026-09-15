import { History, X, Clock, ArrowRight, MessageSquare } from 'lucide-react';
import { useAbnormalityAuditTrail } from '../../hooks/useAbnormalities';
import { SkeletonRow, EmptyState } from '@/components/patterns';

// Mirrors OPLAuditTrailModal (src/components/opl/OPLAuditTrailModal.jsx) — kept as a local
// copy since each module's audit view evolves independently.
const ACTION_BADGES = {
  created: { label: 'Created', color: 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-800' },
  submitted_for_review: { label: 'Submitted for Review', color: 'bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-200 border-sky-200 dark:border-sky-800' },
  marked_for_deletion: { label: 'Marked for Deletion', color: 'bg-rose-100 dark:bg-rose-900/40 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-800' },
  assigned_for_closure: { label: 'Assigned for Closure', color: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800' },
  submitted_for_dmt_review: { label: 'Submitted for DMT Review', color: 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800' },
  dmt_closed: { label: 'Closed by DMT', color: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800' },
};

const CHANGED_FIELD_LABEL = {
  type: 'Type', tag_color: 'Tag', description: 'Description', action: 'Action',
  target_date: 'Target Date', responsibility_id: 'Responsibility', assignee_emp_id: 'Assigned To',
};

export function AbnormalityAuditTrailModal({ isOpen, onClose, abnormalityId, abnormalityDescription }) {
  const { data: auditLogs = [], isLoading } = useAbnormalityAuditTrail(isOpen ? abnormalityId : null);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-line bg-surface-raised shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-4 bg-surface-sunken">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-brand-strong">
              <History size={20} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-ink-strong flex items-center gap-2">
                Abnormality Audit Trail Log
                {abnormalityId && <span className="text-xs font-mono font-normal text-ink-subtle">(#{abnormalityId})</span>}
              </h3>
              {abnormalityDescription && <p className="text-xs text-ink-muted truncate max-w-md">{abnormalityDescription}</p>}
            </div>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-subtle hover:bg-surface-hover hover:text-ink-strong">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {isLoading ? (
            <div className="space-y-3">
              <SkeletonRow columns={2} />
              <SkeletonRow columns={2} />
            </div>
          ) : auditLogs.length === 0 ? (
            <EmptyState title="No Audit History Yet" description="Actions and status changes will appear here in chronological order." />
          ) : (
            <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-line">
              {auditLogs.map((log) => {
                const badgeInfo = ACTION_BADGES[log.action] || { label: log.action, color: 'bg-stone-100 dark:bg-stone-800 text-ink-muted border-line' };
                return (
                  <div key={log.id} className="relative group">
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

                      {(log.status_from || log.status_to) && log.status_from !== log.status_to && (
                        <div className="flex items-center gap-2 text-xs bg-surface-raised p-2 rounded-lg border border-line/60">
                          <span className="text-ink-subtle">Status:</span>
                          <span className="capitalize text-ink-muted">{log.status_from || 'None'}</span>
                          <ArrowRight size={12} className="text-ink-subtle" />
                          <span className="capitalize font-semibold text-ink-strong">{log.status_to}</span>
                        </div>
                      )}

                      {log.changed_fields && Object.keys(log.changed_fields).length > 0 && (
                        <div className="space-y-1 text-xs bg-surface-raised p-2 rounded-lg border border-line/60">
                          {Object.entries(log.changed_fields).map(([field, { from, to }]) => (
                            <p key={field}>
                              <span className="font-medium text-ink-subtle">{CHANGED_FIELD_LABEL[field] || field}:</span>{' '}
                              <span className="line-through text-ink-muted">{from ?? '—'}</span>
                              {' → '}
                              <span className="font-semibold text-ink-strong">{to ?? '—'}</span>
                            </p>
                          ))}
                        </div>
                      )}

                      {log.comments && (
                        <p className="text-xs text-ink-muted flex items-start gap-1.5 pt-0.5">
                          <MessageSquare size={13} className="text-ink-subtle mt-0.5 shrink-0" />
                          <span>{log.comments}</span>
                        </p>
                      )}

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

        <div className="border-t border-line px-5 py-3 bg-surface-sunken flex justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-medium rounded-lg border border-line bg-surface-raised hover:bg-surface-hover text-ink-strong">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
