// PATTERNS §16 — RosterFilterBar, with the PEOPLE_ROSTER §13 canonical
// RosterFilters contract (R1 role grouping + R2 dynamic org), which supersedes
// the §16 sketch until PATTERNS v1.2.
// The chip rail shows GROUP LABELS (× Leaders), never expanded code lists.
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from './HonestStates';
export const DEFAULT_ROSTER_FILTERS = {
    q: '', role: 'all', jhGroup: 'all', dmt: 'all', status: 'all',
};
const ROLE_GROUPS = ['all', 'shop_floor', 'leaders', 'champions_teams', 'admin'];
const STATUSES = ['all', 'active', 'inactive', 'pending_reauth'];
export function RosterFilterBar({ filters, onChange, totalShown, totalAll, jhGroups, dmts, orgLoading, orgError, }) {
    const { t } = useTranslation();
    // Active chips: label what the user chose (group/status labels, org names).
    const chips = [];
    if (filters.role !== 'all')
        chips.push({ key: 'role', label: t(`people.roleGroups.${filters.role}`) });
    if (filters.jhGroup !== 'all') {
        chips.push({ key: 'jhGroup', label: jhGroups?.find((g) => g.id === filters.jhGroup)?.label ?? filters.jhGroup });
    }
    if (filters.dmt !== 'all') {
        chips.push({
            key: 'dmt',
            label: filters.dmt === 'no_dmt' ? t('people.filters.noDmt') : (dmts?.find((d) => d.id === filters.dmt)?.label ?? filters.dmt),
        });
    }
    if (filters.status !== 'all')
        chips.push({ key: 'status', label: t(`people.statuses.${filters.status}`) });
    // §7.2: DMT options narrow to the selected JH group's parent + sentinel.
    const visibleDmts = (() => {
        if (!dmts)
            return [];
        if (filters.jhGroup === 'all')
            return dmts;
        const parent = jhGroups?.find((g) => g.id === filters.jhGroup)?.dmtId;
        return dmts.filter((d) => d.id === parent);
    })();
    if (orgError) {
        return <ErrorState title={t('people.filters.orgError')}/>;
    }
    return (<div className="space-y-2 border-b border-line bg-surface-raised px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" aria-hidden>⌕</span>
          <Input className="h-field pl-8" value={filters.q} placeholder={t('people.filters.search')} aria-label={t('people.filters.search')} onChange={(e) => onChange({ ...filters, q: e.target.value })}/>
        </div>
        {orgLoading ? (<>
            <Skeleton className="h-9 w-36 bg-surface-sunken"/>
            <Skeleton className="h-9 w-36 bg-surface-sunken"/>
          </>) : (<>
            <Select value={filters.role} onValueChange={(v) => onChange({ ...filters, role: v })}>
              <SelectTrigger className="w-40" aria-label={t('people.filters.role')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_GROUPS.map((g) => (<SelectItem key={g} value={g}>{t(`people.roleGroups.${g}`)}</SelectItem>))}
              </SelectContent>
            </Select>
            <Select value={filters.jhGroup} onValueChange={(v) => onChange({ ...filters, jhGroup: v })}>
              <SelectTrigger className="w-40" aria-label={t('people.filters.jhGroup')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('people.filters.allGroups')}</SelectItem>
                {(jhGroups ?? []).map((g) => <SelectItem key={g.id} value={g.id}>{g.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.dmt} onValueChange={(v) => onChange({ ...filters, dmt: v })}>
              <SelectTrigger className="w-44" aria-label={t('people.filters.dmt')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('people.filters.allDmts')}</SelectItem>
                {visibleDmts.map((d) => <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>)}
                <SelectItem value="no_dmt">{t('people.filters.noDmt')}</SelectItem>
              </SelectContent>
            </Select>
          </>)}
        <Select value={filters.status} onValueChange={(v) => onChange({ ...filters, status: v })}>
          <SelectTrigger className="w-44" aria-label={t('people.filters.status')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{t(`people.statuses.${s}`)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {(chips.length > 0 || totalAll > 0) && (<div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-ink-muted">
            {t('people.filters.showing', { shown: totalShown, total: totalAll })}
          </span>
          {chips.map((c) => (<Badge key={c.key} variant="secondary" className="gap-1">
              {c.label}
              <Button variant="ghost" size="sm" className="h-4 w-4 p-0 text-ink-muted" aria-label={t('people.filters.removeFilter', { label: c.label })} onClick={() => onChange({ ...filters, [c.key]: c.key === 'q' ? '' : 'all' })}>
                ×
              </Button>
            </Badge>))}
        </div>)}
    </div>);
}
