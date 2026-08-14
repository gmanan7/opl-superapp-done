import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, RefreshCw, User, Calendar, UserCheck, MessageSquare, Loader2, AlertTriangle, CheckCircle, XCircle, ArrowRight, Clock, } from 'lucide-react';
import { useAbnormality, useUpdateAbnormality, useAssignAbnormality, useAddAbnormalityUpdate, useWorkersByGroup, getSessionContext, roleAtLeast, } from '../../hooks/useAbnormalities';
import { parsePhotoUrls } from '../../lib/imageUpload';
// ─── Status / badge helpers ───────────────────────────────────────────────────
const STATUS_BADGE = {
    open: 'bg-red-100 text-red-700',
    assigned: 'bg-amber-100 text-amber-700',
    wip: 'bg-blue-100 text-blue-700',
    pending_verify: 'bg-purple-100 text-purple-700',
    closed: 'bg-green-100 text-green-700',
    rejected: 'bg-gray-100 text-gray-600',
};
const STATUS_LABEL_KEY = {
    open: 'abn.statusOpen',
    assigned: 'abn.statusAssigned',
    wip: 'abn.statusWip',
    pending_verify: 'abn.statusPending',
    closed: 'abn.statusClosed',
    rejected: 'abn.statusRejected',
};
const TYPE_LABEL_KEY = {
    minor_flaw: 'abn.typeMinorFlaw',
    unfulfilled_basic_condition: 'abn.typeUnfulfilledBasic',
    source_of_contamination: 'abn.typeContamination',
    inaccessible_place: 'abn.typeInaccessible',
    source_of_quality_defect: 'abn.typeQualityDefect',
    unnecessary_item: 'abn.typeUnnecessary',
    unsafe_place: 'abn.typeUnsafe',
};
const PRIORITY_COLORS = {
    low: 'bg-gray-100 text-gray-600',
    medium: 'bg-yellow-100 text-yellow-700',
    high: 'bg-orange-100 text-orange-700',
    critical: 'bg-red-100 text-red-700',
};
function daysAgo(dateStr) {
    const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
    if (days === 0)
        return 'today';
    if (days === 1)
        return 'yesterday';
    return `${days}d ago`;
}
function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}
// ─── Bottom Sheet ─────────────────────────────────────────────────────────────
function BottomSheet({ open, onClose, title, children, }) {
    if (!open)
        return null;
    return (<div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose}/>
      <div className="relative bg-white rounded-t-2xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            <XCircle size={20}/>
          </button>
        </div>
        <div className="px-4 py-4">{children}</div>
        <div className="h-safe-bottom"/>
      </div>
    </div>);
}
// ─── Assign Sheet ─────────────────────────────────────────────────────────────
function AssignSheet({ abnormalityId, jhGroupId, currentStatus, onClose, }) {
    const { t } = useTranslation();
    const { data: workers = [] } = useWorkersByGroup(jhGroupId);
    const assignMutation = useAssignAbnormality();
    const [workerId, setWorkerId] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [notes, setNotes] = useState('');
    const handleAssign = async () => {
        if (!workerId)
            return;
        await assignMutation.mutateAsync({
            abnormality_id: abnormalityId,
            assigned_to: workerId,
            due_date: dueDate || null,
            notes: notes || null,
            status_from: currentStatus,
        });
        onClose();
    };
    return (<div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('abn.assignTo')}</label>
        <select value={workerId} onChange={(e) => setWorkerId(e.target.value)} className="w-full h-11 px-3 rounded-xl border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">{t('abn.selectTeamMember')}</option>
          {workers.map((w) => (<option key={w.id} value={w.id}>
              {w.name} ({w.employee_id})
            </option>))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('abn.dueDate')}</label>
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full h-11 px-3 rounded-xl border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('abn.notes')}</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full px-3 py-2.5 rounded-xl border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" placeholder={t('abn.notesPlaceholder')}/>
      </div>
      <button onClick={handleAssign} disabled={!workerId || assignMutation.isPending} className="w-full h-12 bg-amber-600 disabled:bg-stone-200 disabled:text-stone-400 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 hover:bg-amber-700 transition-colors">
        {assignMutation.isPending && <Loader2 size={16} className="animate-spin"/>}
        {t('abn.confirmAssign')}
      </button>
    </div>);
}
// ─── Note Sheet ───────────────────────────────────────────────────────────────
function NoteSheet({ abnormalityId, onClose, }) {
    const { t } = useTranslation();
    const addUpdate = useAddAbnormalityUpdate();
    const [note, setNote] = useState('');
    const handleSubmit = async () => {
        if (!note.trim())
            return;
        await addUpdate.mutateAsync({ abnormality_id: abnormalityId, note: note.trim() });
        onClose();
    };
    return (<div className="space-y-4">
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={5} autoFocus className="w-full px-3 py-2.5 rounded-xl border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" placeholder={t('abn.addNotePlaceholder')}/>
      <button onClick={handleSubmit} disabled={!note.trim() || addUpdate.isPending} className="w-full h-12 bg-amber-600 disabled:bg-stone-200 disabled:text-stone-400 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 hover:bg-amber-700 transition-colors">
        {addUpdate.isPending && <Loader2 size={16} className="animate-spin"/>}
        {t('abn.addNote')}
      </button>
    </div>);
}
// ─── Confirm action sheet ─────────────────────────────────────────────────────
function ConfirmActionSheet({ message, confirmLabel, confirmClass, onConfirm, onClose, loading, }) {
    return (<div className="space-y-4">
      <p className="text-sm text-gray-600">{message}</p>
      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 h-12 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold">
          Cancel
        </button>
        <button onClick={onConfirm} disabled={loading} className={`flex-1 h-12 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 ${confirmClass}`}>
          {loading && <Loader2 size={16} className="animate-spin"/>}
          {confirmLabel}
        </button>
      </div>
    </div>);
}
function TimelineItem({ event }) {
    const { t } = useTranslation();
    return (<div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={[
            'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
            event.type === 'status_change' ? 'bg-blue-100' :
                event.type === 'assignment' ? 'bg-amber-100' :
                    event.type === 'created' ? 'bg-gray-100' : 'bg-gray-50 border border-gray-200',
        ].join(' ')}>
          {event.type === 'status_change' && <ArrowRight size={14} className="text-blue-600"/>}
          {event.type === 'assignment' && <UserCheck size={14} className="text-amber-600"/>}
          {event.type === 'note' && <MessageSquare size={14} className="text-gray-500"/>}
          {event.type === 'created' && <AlertTriangle size={14} className="text-gray-500"/>}
        </div>
        <div className="w-px flex-1 bg-gray-200 my-1"/>
      </div>

      <div className="flex-1 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            {event.type === 'created' && (<p className="text-sm text-gray-700">
                <span className="font-medium">{event.actorName ?? t('abn.unknown')}</span>{' '}
                {t('abn.reportedThis')}
              </p>)}
            {event.type === 'status_change' && event.statusFrom && event.statusTo && (<div className="flex items-center gap-1.5 flex-wrap">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[event.statusFrom]}`}>
                  {t(STATUS_LABEL_KEY[event.statusFrom])}
                </span>
                <ArrowRight size={12} className="text-gray-400"/>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[event.statusTo]}`}>
                  {t(STATUS_LABEL_KEY[event.statusTo])}
                </span>
              </div>)}
            {event.type === 'assignment' && (<p className="text-sm text-gray-700">
                {t('abn.assignedTo')}{' '}
                <span className="font-medium">{event.assigneeName ?? t('abn.unknown')}</span>
                {event.dueDate && (<span className="text-gray-500"> · due {new Date(event.dueDate).toLocaleDateString()}</span>)}
              </p>)}
            {event.type === 'note' && event.note && (<p className="text-sm text-gray-700 leading-snug">"{event.note}"</p>)}

            {(event.type === 'status_change' || event.type === 'note') && event.actorName && (<p className="text-xs text-gray-400 mt-0.5">{event.actorName}</p>)}
            {event.note && event.type === 'status_change' && (<p className="text-xs text-gray-500 mt-1 italic">"{event.note}"</p>)}
          </div>
          <span className="text-xs text-gray-400 shrink-0 mt-0.5">{daysAgo(event.createdAt)}</span>
        </div>
      </div>
    </div>);
}
// ─── Action button ────────────────────────────────────────────────────────────
function ActionButton({ label, icon: Icon, onClick, variant = 'default', disabled, }) {
    const base = 'flex items-center gap-2 h-11 px-4 rounded-xl border text-sm font-medium transition-colors';
    const styles = {
        default: 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 active:bg-gray-100',
        success: 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100',
        danger: 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100',
    };
    return (<button onClick={onClick} disabled={disabled} className={`${base} ${styles[variant]} ${disabled ? 'opacity-40' : ''}`}>
      <Icon size={16}/>
      {label}
    </button>);
}
// ─── Main component ───────────────────────────────────────────────────────────
export function AbnormalityDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const ctx = getSessionContext();
    const isLeader = roleAtLeast(ctx?.role ?? null, 'jh_leader');
    const { data: abn, isLoading, error, refetch } = useAbnormality(id);
    const updateMutation = useUpdateAbnormality();
    const [sheet, setSheet] = useState(null);
    const handleStatusChange = async (newStatus, note) => {
        if (!abn)
            return;
        await updateMutation.mutateAsync({
            id: abn.id,
            status: newStatus,
            status_from: abn.status,
            note,
        });
        setSheet(null);
    };
    if (isLoading) {
        return (<div className="flex justify-center items-center h-64">
        <Loader2 size={28} className="animate-spin text-blue-600"/>
      </div>);
    }
    if (error || !abn) {
        return (<div className="p-4">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          {t('common.error')}: {error?.message ?? 'Not found'}
        </div>
      </div>);
    }
    const photos = parsePhotoUrls(abn.photo_url);
    // Build unified timeline
    const timelineEvents = [
        {
            id: `created-${abn.id}`,
            type: 'created',
            actorName: abn.reporter?.name ?? null,
            createdAt: abn.created_at,
        },
        ...abn.assignments.map((a) => ({
            id: a.id,
            type: 'assignment',
            actorName: a.assigner?.name ?? null,
            assigneeName: a.assignee?.name ?? null,
            dueDate: a.due_date,
            note: a.notes,
            createdAt: a.created_at,
        })),
        ...abn.updates.map((u) => ({
            id: u.id,
            type: (u.status_from || u.status_to ? 'status_change' : 'note'),
            actorName: u.worker?.name ?? null,
            statusFrom: u.status_from,
            statusTo: u.status_to,
            note: u.note,
            createdAt: u.created_at,
        })),
    ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const isClosed = abn.status === 'closed' || abn.status === 'rejected';
    return (<div className="min-h-full bg-stone-50 pb-32">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-stone-200 flex items-center gap-3 px-5 py-3">
        <button onClick={() => navigate(-1)} className="p-1.5 -ml-1.5 rounded-lg text-stone-500 hover:bg-stone-100">
          <ChevronLeft size={22}/>
        </button>
        <h1 className="text-base font-semibold text-gray-900 flex-1 truncate">
          {t('abn.detailTitle')}
        </h1>
        <button onClick={() => refetch()} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100">
          <RefreshCw size={16}/>
        </button>
      </div>

      {/* Detail card */}
      <div className="bg-white mx-5 mt-4 rounded-2xl border border-stone-200 overflow-hidden shadow-sm">
        {/* Top tags */}
        <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
          <span className={[
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide',
            abn.red_white_tag === 'red'
                ? 'bg-red-600 text-white'
                : 'bg-gray-100 text-gray-700 border border-gray-300',
        ].join(' ')}>
            <span className={`w-2.5 h-2.5 rounded-full ${abn.red_white_tag === 'red' ? 'bg-white' : 'bg-white border border-gray-400'}`}/>
            {abn.red_white_tag === 'red' ? t('abn.tagRed') : t('abn.tagWhite')}
          </span>
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_BADGE[abn.status]}`}>
            {t(STATUS_LABEL_KEY[abn.status])}
          </span>
        </div>

        {/* Machine + subsection */}
        <div className="px-4 pb-1">
          <p className="text-base font-semibold text-gray-900">
            {abn.machine?.name ?? t('abn.unknownMachine')}
            {abn.subsection && (<span className="text-gray-400 font-normal"> › {abn.subsection.name}</span>)}
          </p>
          {abn.abnormality_type && (<p className="text-sm text-indigo-600 font-medium mt-0.5">
              {t(TYPE_LABEL_KEY[abn.abnormality_type] ?? abn.abnormality_type)}
            </p>)}
        </div>

        {/* Meta grid */}
        <div className="grid grid-cols-2 gap-3 px-4 py-3 border-t border-gray-100">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <User size={13}/>
            <span>{abn.reporter?.name ?? '—'}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Calendar size={13}/>
            <span>{new Date(abn.created_at).toLocaleDateString()}</span>
          </div>
          {abn.assignee && (<div className="flex items-center gap-2 text-xs text-gray-500">
              <UserCheck size={13}/>
              <span>{abn.assignee.name}</span>
            </div>)}
          <div className="flex items-center gap-2 text-xs">
            <span className={`px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[abn.priority]}`}>
              {t(`abn.priority_${abn.priority}`)}
            </span>
          </div>
        </div>

        {/* Description */}
        {abn.description && (<div className="px-4 pb-4 border-t border-gray-100 pt-3">
            <p className="text-sm text-gray-700 leading-relaxed">{abn.description}</p>
          </div>)}

        {/* Photos */}
        {photos.length > 0 && (<div className="flex gap-3 px-4 pb-4 border-t border-gray-100 pt-3">
            {photos.map((url, i) => (<img key={i} src={url} alt="" className="w-28 h-28 rounded-xl object-cover border border-gray-200"/>))}
          </div>)}

        {/* Resolved at */}
        {abn.resolved_at && (<div className="flex items-center gap-2 px-4 pb-4 text-xs text-green-600">
            <CheckCircle size={14}/>
            <span>{t('abn.resolvedAt')} {formatDate(abn.resolved_at)}</span>
          </div>)}
      </div>

      {/* Timeline */}
      <div className="mx-5 mt-4">
        <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">
          {t('abn.timeline')}
        </h2>
        <div className="bg-white rounded-2xl border border-stone-200 px-4 pt-4 pb-0 shadow-sm">
          {timelineEvents.map((event) => (<TimelineItem key={event.id} event={event}/>))}
        </div>
      </div>

      {/* Action panel */}
      {!isClosed && (<div className="fixed bottom-16 left-0 right-0 z-20 bg-white border-t border-stone-200 px-5 py-3 md:left-[220px]">
          <div className="flex flex-col gap-2">
            {/* Leader actions */}
            {isLeader && (<div className="flex gap-2 flex-wrap">
                {(abn.status === 'open' || abn.status === 'assigned') && (<ActionButton label={t('abn.actionAssign')} icon={UserCheck} onClick={() => setSheet('assign')}/>)}
                {abn.status === 'assigned' && (<ActionButton label={t('abn.actionWip')} icon={Clock} onClick={() => setSheet('wip')} variant="default"/>)}
                {abn.status === 'wip' && (<ActionButton label={t('abn.actionRequestClose')} icon={CheckCircle} onClick={() => setSheet('request_close')} variant="success"/>)}
                {(abn.status === 'open' || abn.status === 'assigned' || abn.status === 'wip') && (<ActionButton label={t('abn.actionCloseDirect')} icon={CheckCircle} onClick={() => setSheet('close')} variant="success"/>)}
                {abn.status === 'pending_verify' && (<>
                    <ActionButton label={t('abn.actionClose')} icon={CheckCircle} onClick={() => setSheet('close')} variant="success"/>
                    <ActionButton label={t('abn.actionReject')} icon={XCircle} onClick={() => setSheet('reject')} variant="danger"/>
                  </>)}
                <ActionButton label={t('abn.addNote')} icon={MessageSquare} onClick={() => setSheet('note')}/>
              </div>)}

            {/* Non-leader: note only */}
            {!isLeader && (<ActionButton label={t('abn.addProgressNote')} icon={MessageSquare} onClick={() => setSheet('note')}/>)}
          </div>
        </div>)}

      {/* Bottom Sheets */}
      <BottomSheet open={sheet === 'assign'} onClose={() => setSheet(null)} title={t('abn.actionAssign')}>
        <AssignSheet abnormalityId={abn.id} jhGroupId={abn.jh_group_id} currentStatus={abn.status} onClose={() => setSheet(null)}/>
      </BottomSheet>

      <BottomSheet open={sheet === 'note'} onClose={() => setSheet(null)} title={t('abn.addNote')}>
        <NoteSheet abnormalityId={abn.id} onClose={() => setSheet(null)}/>
      </BottomSheet>

      <BottomSheet open={sheet === 'wip'} onClose={() => setSheet(null)} title={t('abn.actionWip')}>
        <ConfirmActionSheet message={t('abn.confirmWipMsg')} confirmLabel={t('abn.actionWip')} confirmClass="bg-blue-600 text-white" onConfirm={() => handleStatusChange('wip')} onClose={() => setSheet(null)} loading={updateMutation.isPending}/>
      </BottomSheet>

      <BottomSheet open={sheet === 'request_close'} onClose={() => setSheet(null)} title={t('abn.actionRequestClose')}>
        <ConfirmActionSheet message={t('abn.confirmRequestCloseMsg')} confirmLabel={t('abn.actionRequestClose')} confirmClass="bg-purple-600 text-white" onConfirm={() => handleStatusChange('pending_verify')} onClose={() => setSheet(null)} loading={updateMutation.isPending}/>
      </BottomSheet>

      <BottomSheet open={sheet === 'close'} onClose={() => setSheet(null)} title={t('abn.actionClose')}>
        <ConfirmActionSheet message={t('abn.confirmCloseMsg')} confirmLabel={t('abn.actionClose')} confirmClass="bg-green-600 text-white" onConfirm={() => handleStatusChange('closed')} onClose={() => setSheet(null)} loading={updateMutation.isPending}/>
      </BottomSheet>

      <BottomSheet open={sheet === 'reject'} onClose={() => setSheet(null)} title={t('abn.actionReject')}>
        <ConfirmActionSheet message={t('abn.confirmRejectMsg')} confirmLabel={t('abn.actionReject')} confirmClass="bg-red-600 text-white" onConfirm={() => handleStatusChange('rejected')} onClose={() => setSheet(null)} loading={updateMutation.isPending}/>
      </BottomSheet>
    </div>);
}
