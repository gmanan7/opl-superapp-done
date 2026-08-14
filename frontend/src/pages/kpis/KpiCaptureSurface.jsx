// KPI capture surface (FIX 2) — the group's machines + JH-overview rollup as a stack
// of MachineCards in a centered column, each editable in place with its own per-machine
// Save. Body-only: the group selector + yesterday-default DateStepper live in the
// landing's single sticky header (which owns `date`). One useGroupEntries query seeds
// every card's prefill + entered/not-entered status. Scales to any KPI count (FIX 3).
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CaptureColumn, EmptyState, SkeletonRow } from '@/components/patterns';
import { useGroupDefinitions, useGroupEntries, entriesByTarget, buildTargets, JH_TARGET, } from '../../hooks/useKPIs';
import { localDateStr } from '../../lib/kpi';
import { MachineCaptureCard } from './MachineCaptureCard';
export function KpiCaptureSurface({ groupId, groupName, date, }) {
    const { t, i18n } = useTranslation();
    const dateStr = localDateStr(date);
    const { data: defs = [], isLoading } = useGroupDefinitions(groupId);
    const { data: entryRows = [] } = useGroupEntries(groupId, dateStr);
    const entryMap = useMemo(() => entriesByTarget(entryRows), [entryRows]);
    const targets = useMemo(() => buildTargets(defs, groupName, groupId), [defs, groupName, groupId]);
    return (<CaptureColumn>
      <div className="space-y-4 pb-12 pt-4">
        {isLoading ? ([0, 1].map((i) => (<div key={i} className="rounded-lg border border-line bg-surface-raised p-4">
              <SkeletonRow columns={2}/>
              <SkeletonRow columns={2}/>
            </div>))) : targets.length === 0 ? (<EmptyState title={t('kpi.noTargetsTitle')} body={t('kpi.noTargetsBody')}/>) : (targets.map((target) => (<MachineCaptureCard key={`${target.id}|${dateStr}`} target={target} defs={defs.filter((d) => (d.machine_id ?? JH_TARGET) === target.id)} entry={entryMap.get(target.id) ?? null} entered={entryMap.has(target.id)} date={date} dateStr={dateStr} groupId={groupId} lang={i18n.language}/>)))}
      </div>
    </CaptureColumn>);
}
