// KPI landing — role-conditional (owner decision, M1). Shop floor (apprentice/on_roll)
// opens CAPTURE-first; jh_leader+ opens ANALYTICS-first. Shared components; only the
// default tab differs by role-class. Owns the single sticky header (title + tabs +
// group selector + the active control: DateStepper for capture / MonthSelector for
// trends) so there is exactly one sticky region — the surfaces render body-only.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getSessionContext, roleAtLeast } from '../../lib/auth';
import { useJhGroupSelector } from '../../hooks/useJhGroupSelector';
import { useJhGroupInfo } from '../../hooks/useKPIs';
import { CaptureColumn, DateStepper, EmptyState } from '@/components/patterns';
import { localDateStr, todayStr, dayDiff } from '../../lib/kpi';
import { KpiCaptureSurface } from './KpiCaptureSurface';
import { KpiTrendView, MonthSelector } from './KPITrend';
function yesterday() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    d.setHours(0, 0, 0, 0);
    return d;
}
export function KPILanding() {
    const { t } = useTranslation();
    const ctx = getSessionContext();
    const isLeader = roleAtLeast(ctx?.role, 'jh_leader');
    const { selectedJhGroupId, setSelectedJhGroupId, needsGroupSelector, jhGroups } = useJhGroupSelector();
    const groupId = selectedJhGroupId || ctx?.jh_group_id || '';
    const { data: groupInfo } = useJhGroupInfo(groupId);
    const groupName = groupInfo?.name ?? '';
    const [tab, setTab] = useState(isLeader ? 'trends' : 'capture');
    const [date, setDate] = useState(yesterday);
    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth() + 1);
    const diff = dayDiff(localDateStr(date), todayStr());
    const subCaption = diff === 0 ? <span className="font-medium text-warning-fg">{t('kpi.today')}</span>
        : diff === 1 ? t('kpi.yesterday')
            : diff > 1 && diff <= 3 ? t('kpi.daysAgo', { count: diff })
                : null;
    const tabBtn = (active) => `min-h-touch rounded-md px-4 text-sm font-medium ${active ? 'bg-surface-raised text-ink-strong shadow-xs' : 'text-ink-muted'}`;
    return (<div className="min-h-full bg-surface-base">
      <header className="sticky top-0 z-30 border-b border-line bg-surface-raised">
        <CaptureColumn variant={tab === 'trends' ? 'wide' : 'reading'} className="space-y-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-2xl font-semibold text-ink-strong">{t('kpi.title')}</h1>
            <div className="flex gap-1 rounded-lg bg-surface-sunken p-1">
              <button type="button" className={tabBtn(tab === 'capture')} onClick={() => setTab('capture')}>{t('kpi.tabCapture')}</button>
              <button type="button" className={tabBtn(tab === 'trends')} onClick={() => setTab('trends')}>{t('kpi.tabTrends')}</button>
            </div>
          </div>

          {groupId && (<div className="flex flex-wrap items-center gap-2">
              {needsGroupSelector && jhGroups.length > 0 && (<select value={selectedJhGroupId} onChange={(e) => setSelectedJhGroupId(e.target.value)} aria-label={t('kpi.selectGroup')} className="min-h-touch min-w-[10rem] flex-1 rounded-md border border-line bg-surface-raised px-3 text-base text-ink focus:outline-none focus-visible:shadow-focus">
                  {jhGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>)}
              {tab === 'capture' ? (<div className="min-w-[16rem] flex-1"><DateStepper value={date} onChange={setDate} subCaption={subCaption}/></div>) : (<MonthSelector year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }}/>)}
            </div>)}
        </CaptureColumn>
      </header>

      {!groupId ? (<CaptureColumn><div className="py-6"><EmptyState title={t('kpi.noGroup')}/></div></CaptureColumn>) : tab === 'capture' ? (<KpiCaptureSurface groupId={groupId} groupName={groupName} date={date}/>) : (<KpiTrendView groupId={groupId} year={year} month={month} onEnter={() => setTab('capture')}/>)}
    </div>);
}
