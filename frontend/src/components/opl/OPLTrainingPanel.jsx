// OPL training panel (Phase 3 M2b) — rendered on OPLDetail for APPROVED lessons.
// Viewer: own status + self-ack (if on the hook). jh_leader+: roster with status,
// batch mark-trained, audience add/remove, retrain-cadence edit, retire/restore.
// All writes go through the M2b SECURITY DEFINER RPCs (server-gated, probed 37/37).
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CheckCircle2, GraduationCap, UserMinus, UserPlus, Archive, RotateCcw, Pencil } from 'lucide-react';
import { roleAtLeast, getSessionContext } from '../../lib/auth';
import { useMyOplStatus, useOPLTrainingRoster, useSelfAck, useMarkTrained, useSetAudience, useRetireOPL, useSetRetrainFrequency, } from '../../hooks/useOPLTraining';
import { useWorkers } from '../../hooks/mdm/useWorkers';
import { StatusBadge, ConfirmModal, SkeletonRow } from '@/components/patterns';
import { Button } from '@/components/ui/button';
function statusOf(trainedAt, isDue, neverTrained) {
    if (neverTrained || trainedAt == null)
        return { key: 'neutral', labelKey: 'opl.notStarted' };
    if (isDue)
        return { key: 'warning', labelKey: 'opl.retrainingDue' };
    return { key: 'success', labelKey: 'opl.trained' };
}
export function OPLTrainingPanel({ opl }) {
    const { t } = useTranslation();
    const ctx = getSessionContext();
    const isLeader = roleAtLeast(ctx?.role, 'jh_leader');
    const retired = !!opl.retired_at;
    const myStatus = useMyOplStatus(opl.id);
    const selfAck = useSelfAck();
    const me = myStatus.data;
    // Floor worker who is not on the hook for this lesson sees no training panel.
    if (!isLeader && me && !me.in_audience)
        return null;
    const myState = statusOf(me?.trained_at ?? null, me?.is_due ?? true, !me?.trained_at);
    const canAck = !!me?.in_audience && !retired && (me.trained_at == null || me.is_due);
    async function run(p, ok) {
        try {
            await p;
            toast.success(ok);
        }
        catch (e) {
            toast.error(e.message || t('common.error'));
        }
    }
    return (<section className="space-y-4 rounded-lg border border-line bg-surface-raised p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-ink-strong">
          <GraduationCap size={18} className="text-brand-strong"/>{t('opl.trainingSection')}
        </h2>
        {retired && <StatusBadge status="neutral" label={t('opl.retiredBadge')}/>}
      </div>

      {me?.in_audience && (<div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-surface-base px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-ink-muted">{t('opl.yourTraining')}</span>
            <StatusBadge status={myState.key} label={t(myState.labelKey)}/>
            {me.trained_at && !me.is_due && (<span className="text-xs text-ink-subtle">{t('opl.trainedOn', { date: new Date(me.trained_at).toLocaleDateString('en-IN') })}</span>)}
          </div>
          {canAck && (<Button onClick={() => run(selfAck.mutateAsync(opl.id), t('opl.selfAckDone'))} disabled={selfAck.isPending} className="h-touch gap-1.5">
              <CheckCircle2 size={16}/>{t('opl.selfAck')}
            </Button>)}
        </div>)}

      {isLeader && <LeaderTraining opl={opl} retired={retired} run={run}/>}
    </section>);
}
function LeaderTraining({ opl, retired, run }) {
    const { t } = useTranslation();
    const roster = useOPLTrainingRoster(opl.id);
    const groupWorkers = useWorkers({ jhGroupId: opl.jh_group_id ?? undefined, status: 'active' });
    const mark = useMarkTrained();
    const audience = useSetAudience();
    const retire = useRetireOPL();
    const setFreq = useSetRetrainFrequency();
    const [sel, setSel] = useState(new Set());
    const [retireOpen, setRetireOpen] = useState(false);
    const [editFreq, setEditFreq] = useState(false);
    const [freq, setFreqStr] = useState(String(opl.retrain_frequency_days ?? 90));
    const rows = roster.data ?? [];
    const audienceIds = new Set(rows.map((r) => r.worker_id));
    const addable = (groupWorkers.data?.rows ?? []).filter((w) => !audienceIds.has(w.id));
    function toggle(id) {
        setSel((s) => { const n = new Set(s); if (n.has(id))
            n.delete(id);
        else
            n.add(id); return n; });
    }
    return (<div className="space-y-4 border-t border-line pt-4">
      {/* retrain cadence */}
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-ink-muted">{t('opl.retrainCadence')}</span>
        {editFreq ? (<span className="flex items-center gap-1.5">
            <input type="number" inputMode="numeric" min={1} max={3650} value={freq} onChange={(e) => setFreqStr(e.target.value)} className="h-9 w-20 rounded-md border border-line-strong bg-surface-base px-2 text-right text-ink focus:outline-none focus-visible:shadow-focus"/>
            <span className="text-ink-muted">{t('opl.days')}</span>
            <Button onClick={async () => { const d = parseInt(freq, 10); if (d >= 1 && d <= 3650) {
            await run(setFreq.mutateAsync({ oplId: opl.id, days: d }), t('opl.cadenceSaved'));
            setEditFreq(false);
        } }} className="h-9 px-3">{t('common.save')}</Button>
          </span>) : (<button type="button" onClick={() => setEditFreq(true)} className="flex items-center gap-1.5 font-medium text-ink-strong hover:underline">
            {t('opl.retrainEvery', { days: opl.retrain_frequency_days ?? 90 })}<Pencil size={13} className="text-ink-subtle"/>
          </button>)}
      </div>

      {/* roster + mark trained */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-ink-muted">{t('opl.audienceTitle')} · {rows.length}</p>
          {sel.size > 0 && !retired && (<Button onClick={() => run(mark.mutateAsync({ oplId: opl.id, workerIds: [...sel] }).then(() => setSel(new Set())), t('opl.marked', { count: sel.size }))} className="h-9 gap-1.5 px-3">
              <GraduationCap size={14}/>{t('opl.markTrainedN', { count: sel.size })}
            </Button>)}
        </div>
        {roster.isLoading ? <SkeletonRow columns={2}/> : rows.length === 0 ? (<p className="py-2 text-sm text-ink-subtle">{t('opl.audienceEmpty')}</p>) : (<ul className="divide-y divide-line rounded-md border border-line">
            {rows.map((r) => {
                const s = statusOf(r.trained_at, r.is_due, r.never_trained);
                return (<li key={r.worker_id} className="flex items-center gap-3 px-3 py-2">
                  <input type="checkbox" checked={sel.has(r.worker_id)} onChange={() => toggle(r.worker_id)} disabled={retired} className="h-4 w-4 accent-brand" aria-label={t('opl.selectWorker', { name: r.name })}/>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-strong">{r.name}</span>
                  <StatusBadge status={s.key} label={t(s.labelKey)}/>
                  <button type="button" onClick={() => run(audience.mutateAsync({ oplId: opl.id, workerId: r.worker_id, action: 'remove' }), t('opl.removedFromAudience'))} aria-label={t('opl.removeFromAudience')} className="text-ink-subtle hover:text-danger-fg"><UserMinus size={16}/></button>
                </li>);
            })}
          </ul>)}
        {addable.length > 0 && (<details className="rounded-md border border-line">
            <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-ink-muted">{t('opl.addPeople')} · {addable.length}</summary>
            <ul className="divide-y divide-line border-t border-line">
              {addable.map((w) => (<li key={w.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{w.name}</span>
                  <button type="button" onClick={() => run(audience.mutateAsync({ oplId: opl.id, workerId: w.id, action: 'add' }), t('opl.addedToAudience'))} className="flex items-center gap-1 text-sm font-medium text-brand-strong hover:underline"><UserPlus size={14}/>{t('opl.addToAudience')}</button>
                </li>))}
            </ul>
          </details>)}
      </div>

      {/* retire / restore */}
      <div className="border-t border-line pt-3">
        {retired ? (<Button variant="secondary" onClick={() => run(retire.mutateAsync({ oplId: opl.id, retire: false }), t('opl.unretired'))} className="h-touch gap-1.5">
            <RotateCcw size={15}/>{t('opl.unretire')}
          </Button>) : (<button type="button" onClick={() => setRetireOpen(true)} className="flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-danger-fg">
            <Archive size={14}/>{t('opl.retire')}
          </button>)}
      </div>

      <ConfirmModal open={retireOpen} onOpenChange={setRetireOpen} title={t('opl.retireConfirm')} description={t('opl.retireConfirmBody')} severity="caution" primaryLabel={t('opl.retire')} isWorking={retire.isPending} onConfirm={async () => { await run(retire.mutateAsync({ oplId: opl.id, retire: true }), t('opl.retired')); setRetireOpen(false); }}/>
    </div>);
}
