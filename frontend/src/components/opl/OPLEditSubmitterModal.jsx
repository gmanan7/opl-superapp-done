import { useState, useEffect } from 'react';
import { Pencil, X, User, CheckCircle2, MessageSquare } from 'lucide-react';
import { useUpdateOplDetail } from '../../hooks/useOPL';
import { toast } from 'sonner';
import { loadSession } from '../../lib/auth';

export function OPLEditSubmitterModal({ isOpen, onClose, detail }) {
  const updateDetailMutation = useUpdateOplDetail();
  const session = loadSession();
  const [submittedBy, setSubmittedBy] = useState('');
  const [status, setStatus] = useState('draft');
  const [comments, setComments] = useState('');

  useEffect(() => {
    if (detail) {
      setSubmittedBy(detail.submitted_by || '');
      setStatus(detail.status || 'draft');
      setComments('');
    }
  }, [detail]);

  if (!isOpen || !detail) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!submittedBy.trim()) {
      toast.error('Submitted By field cannot be empty');
      return;
    }

    try {
      await updateDetailMutation.mutateAsync({
        id: detail.opl_id,
        submitted_by: submittedBy.trim(),
        status: status,
        comments: comments.trim() || `Updated Submitted By to "${submittedBy.trim()}"`,
        performed_by: session?.name || 'Plant Admin'
      });
      toast.success('OPL Submitter & status updated successfully');
      onClose();
    } catch {
      toast.error('Failed to update OPL detail');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface-raised shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-4 bg-surface-sunken">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-brand-strong">
              <Pencil size={18} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-ink-strong">Edit OPL Submitter</h3>
              <p className="text-xs text-ink-muted">OPL #{detail.opl_id} · {detail.title}</p>
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

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-ink-muted mb-1 flex items-center gap-1.5">
              <User size={14} className="text-brand-strong" />
              Submitted By (Editable)
            </label>
            <input
              type="text"
              value={submittedBy}
              onChange={(e) => setSubmittedBy(e.target.value)}
              placeholder="e.g. John Doe, Line Supervisor"
              className="w-full rounded-lg border border-line bg-surface-base px-3 py-2 text-sm text-ink-strong focus:outline-none focus:ring-2 focus:ring-brand-strong"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-muted mb-1 flex items-center gap-1.5">
              <CheckCircle2 size={14} className="text-brand-strong" />
              Workflow Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-lg border border-line bg-surface-base px-3 py-2 text-sm text-ink-strong focus:outline-none focus:ring-2 focus:ring-brand-strong"
            >
              <option value="draft">Draft</option>
              <option value="pending_approval">Pending Approval</option>
              <option value="published">Published / Approved</option>
              <option value="rejected">Rejected / Needs Revision</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-muted mb-1 flex items-center gap-1.5">
              <MessageSquare size={14} className="text-brand-strong" />
              Audit Trail Note / Reason for Change
            </label>
            <textarea
              rows={2}
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Explain why submitted_by or status is being changed..."
              className="w-full rounded-lg border border-line bg-surface-base px-3 py-2 text-xs text-ink-strong focus:outline-none focus:ring-2 focus:ring-brand-strong"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium rounded-lg border border-line bg-surface-base hover:bg-surface-hover text-ink-strong"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={updateDetailMutation.isPending}
              className="px-4 py-2 text-xs font-medium rounded-lg bg-brand-strong text-white hover:bg-brand-strong/90 disabled:opacity-50"
            >
              {updateDetailMutation.isPending ? 'Saving...' : 'Save & Log Audit Trail'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
