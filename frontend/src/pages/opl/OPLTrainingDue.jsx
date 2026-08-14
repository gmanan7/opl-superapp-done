// My OPL Training (Phase 3 M2b) — the worker's due/retraining queue (bounded cap 5,
// star+overdue ordered) with one-tap self-ack; jh_leader+ also get a group due-board
// (lessons with people due → tap through to the lesson roster to mark). RLS-scoped:
// floor sees only their own due rows; leaders see their tier.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, CheckCircle2, Star } from 'lucide-react';
import { roleAtLeast, getSessionContext } from '../../lib/auth';
import { useMyTrainingDue, useGroupDueBoard, useSelfAck } from '../../hooks/useOPLTraining';
import { capQueue } from '../../lib/oplTraining';
import { CaptureColumn, StatusBadge, EmptyState, SkeletonRow } from '@/components/patterns';
import { Button } from '@/components/ui/button';
export function OPLTrainingDue() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const ctx = getSessionContext();
    const isLeader = roleAtLeast(ctx?.role, 'jh_leader');
    const myDue = useMyTrainingDue();
    const board = useGroupDueBoard(isLeader);
    const selfAck = useSelfAck();
    const [showAll, setShowAll] = useState(false);
    const all = myDue.data ?? [];
    const { visible, moreCount } = showAll ? { visible: all, moreCount: 0 } : capQueue(all, 5);
    async function ack(id) {
        try {
            await selfAck.mutateAsync(id);
            toast.success(t('opl.selfAckDone'));
        }
        catch (e) {
            toast.error(e.message || t('common.error'));
        }
    }
    // Group the leader board by lesson, most-due (and starred) first.
    const byOpl = new Map();
    for (const r of board.data ?? []) {
        const a = byOpl.get(r.opl_id) ?? [];
        a.push(r);
        byOpl.set(r.opl_id, a);
    }
    const lessons = [...byOpl.values()].sort((a, b) => (Number(b[0].is_star) - Number(a[0].is_star)) || (b.length - a.length));
    return (<div className="min-h-full bg-surface-base overflow-x-hidden">
      <header className="sticky top-0 z-30 border-b border-line bg-surface-raised">
        <CaptureColumn className="flex items-center gap-1 py-3">
          <button type="button" onClick={() => navigate('/opl')} aria-label={t('common.back')} className="flex h-touch w-touch items-center justify-center rounded-md text-ink-muted hover:bg-surface-hover"><ChevronLeft size={22}/></button>
          <h1 className="text-2xl font-semibold text-ink-strong">{t('opl.trainingTitle')}</h1>
        </CaptureColumn>
      </header>

      <CaptureColumn>
        <div className="space-y-6 py-4">
          {/* my due / retraining queue */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">{t('opl.myTrainingDue')}</h2>
            {myDue.isLoading ? ([0, 1].map((i) => <SkeletonRow key={i} columns={2}/>)) : all.length === 0 ? (<EmptyState glyph="✓" title={t('opl.allCaughtUp')} body={t('opl.allCaughtUpBody')}/>) : (<>
                {visible.map((r) => (<div key={r.opl_id} className="flex items-center gap-3 rounded-lg border border-line bg-surface-raised px-4 py-3">
                    <button type="button" onClick={() => navigate(`/opl/${r.opl_id}`)} className="min-w-0 flex-1 text-left">
                      <div className="flex items-center gap-2">
                        {r.is_star && <Star size={14} className="shrink-0 fill-warning-fg text-warning-fg" aria-label="star"/>}
                        <p className="truncate text-lg font-medium text-ink-strong">{r.title}</p>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <StatusBadge status={r.never_trained ? 'neutral' : 'warning'} label={r.never_trained ? t('opl.notStarted') : t('opl.retrainingDue')}/>
                        {!r.never_trained && r.days_overdue ? <span className="text-xs text-ink-subtle">{t('opl.overdueBy', { days: r.days_overdue })}</span> : null}
                      </div>
                    </button>
                    <Button onClick={() => ack(r.opl_id)} disabled={selfAck.isPending} className="h-touch shrink-0 gap-1.5"><CheckCircle2 size={16}/>{t('opl.selfAck')}</Button>
                  </div>))}
                {moreCount > 0 && (<button type="button" onClick={() => setShowAll(true)} className="min-h-touch w-full rounded-lg border border-dashed border-line text-sm font-medium text-ink-muted hover:bg-surface-hover">
                    {t('opl.moreDue', { count: moreCount })}
                  </button>)}
              </>)}
          </section>

          {/* leader group due-board */}
          {isLeader && (<section className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">{t('opl.groupDueTitle')}</h2>
              {board.isLoading ? (<SkeletonRow columns={2}/>) : lessons.length === 0 ? (<p className="py-2 text-sm text-ink-subtle">{t('opl.noOneDue')}</p>) : (lessons.map((members) => (<button key={members[0].opl_id} type="button" onClick={() => navigate(`/opl/${members[0].opl_id}`)} className="flex min-h-touch-lg w-full items-center gap-3 rounded-lg border border-line bg-surface-raised px-4 py-3 text-left hover:bg-surface-hover">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      {members[0].is_star && <Star size={14} className="shrink-0 fill-warning-fg text-warning-fg" aria-label="star"/>}
                      <p className="truncate text-base font-medium text-ink-strong">{members[0].title}</p>
                    </div>
                    <StatusBadge status="warning" label={t('opl.dueCount', { count: members.length })}/>
                    <ChevronRight size={18} className="shrink-0 text-ink-subtle"/>
                  </button>)))}
            </section>)}
        </div>
      </CaptureColumn>
    </div>);
}
