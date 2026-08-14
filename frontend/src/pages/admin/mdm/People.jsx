import { useMemo, useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, } from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { StatusBadge, MembershipChip, ConfirmModal, PinRevealModal, SkeletonRow, EmptyState, ErrorState, RlsDeniedNotice, RosterFilterBar, DEFAULT_ROSTER_FILTERS, } from '@/components/patterns';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { useWorkers, useOrgStructure, useMembershipsByWorkers, useDeactivateWorker, useReactivateWorker, useGeneratePin, WORKERS_PAGE_SIZE, MdmError, } from '@/hooks/mdm';
import { getSessionContext } from '../../../hooks/useAbnormalities';
import { PeopleInvite } from './PeopleInvite';
import { PeopleEdit } from './PeopleEdit';
import { PeoplePasswordReset } from './PeoplePasswordReset';
const DEACTIVATION_REASONS = [
    'left_company', 'retired', 'transferred', 'long_leave', 'disciplinary', 'test_cleanup', 'other',
];
// ─── Pure helpers (exported for tests) ───────────────────────────────────────
// §7.2 rule 4: if the chosen DMT no longer fits the chosen JH group, reset it.
export function reconcileFilters(filters, jhGroups) {
    if (filters.jhGroup === 'all' || filters.dmt === 'all' || filters.dmt === 'no_dmt') {
        return { next: filters, dmtWasReset: false };
    }
    const parent = jhGroups?.find((g) => g.id === filters.jhGroup)?.dmtId;
    if (parent === filters.dmt)
        return { next: filters, dmtWasReset: false };
    return { next: { ...filters, dmt: 'all' }, dmtWasReset: true };
}
// PEOPLE_ROSTER §13 boundary: UI filters → wire filters (role groups expand
// in the data layer; the screen never sends canonical role codes).
export function toWorkerFilters(f, page) {
    return {
        roleGroup: f.role,
        jhGroupId: f.jhGroup === 'all' ? undefined : f.jhGroup,
        dmtId: f.dmt === 'all' ? undefined : f.dmt,
        status: f.status,
        search: f.q || undefined,
        page,
    };
}
// §4 col 6: relative ≤ 7 days, absolute beyond. Latin numerals.
export function formatLastLogin(iso, now, locale) {
    if (!iso)
        return '—';
    const d = new Date(iso);
    const diffMs = now.getTime() - d.getTime();
    const hour = 3600_000;
    if (diffMs < hour)
        return `${Math.max(1, Math.round(diffMs / 60000))} min ago`;
    if (diffMs < 24 * hour)
        return `${Math.round(diffMs / hour)} hrs ago`;
    if (diffMs < 48 * hour) {
        return `Yesterday, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
    }
    if (diffMs < 7 * 24 * hour)
        return `${Math.round(diffMs / (24 * hour))} days ago`;
    void locale;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
// TeamMemberList §17 rule: first grapheme of each whitespace token, capped at 2.
export function initialsOf(name) {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((tok) => [...tok][0] ?? '')
        .join('');
}
// ─── Screen ──────────────────────────────────────────────────────────────────
export function People() {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const ctx = getSessionContext();
    const isAdmin = ctx?.role === 'admin' || ctx?.role === 'it_lead';
    const [filters, setFilters] = useState(DEFAULT_ROSTER_FILTERS);
    const [page, setPage] = useState(0);
    const [sheetRow, setSheetRow] = useState(null);
    const [deactivateTarget, setDeactivateTarget] = useState(null);
    const [deactivateReason, setDeactivateReason] = useState('');
    const [deactivateReasonText, setDeactivateReasonText] = useState('');
    const [reactivateTarget, setReactivateTarget] = useState(null);
    const [pinTarget, setPinTarget] = useState(null);
    const [pwResetTarget, setPwResetTarget] = useState(null);
    const [inviteOpen, setInviteOpen] = useState(false);
    const [issuedPin, setIssuedPin] = useState(null);
    const [editTarget, setEditTarget] = useState(null);
    const searchRef = useRef(null);
    const org = useOrgStructure();
    const jhGroups = useMemo(() => {
        if (!org.data)
            return undefined;
        const dmtsList = org.data.dmts ?? [];
        const unassignedList = org.data.unassignedJhGroups ?? [];
        return [
            ...dmtsList.flatMap((d) => (d.jhGroups ?? []).map((g) => ({ id: g.id, label: g.name, dmtId: d.id }))),
            ...unassignedList.map((g) => ({ id: g.id, label: g.name, dmtId: null })),
        ];
    }, [org.data]);
    const dmts = useMemo(() => (org.data?.dmts ?? []).map((d) => ({ id: d.id, label: d.name })), [org.data]);
    const workers = useWorkers(toWorkerFilters(filters, page));
    const rows = workers.data?.rows ?? [];
    const total = workers.data?.total ?? 0;
    const pageCount = Math.max(1, Math.ceil(total / WORKERS_PAGE_SIZE));
    const memberships = useMembershipsByWorkers(rows.map((r) => r.id));
    const additionalByWorker = memberships.data ?? new Map();
    const deactivate = useDeactivateWorker();
    const reactivate = useReactivateWorker();
    const genPin = useGeneratePin();
    function applyFilters(next) {
        const { next: reconciled, dmtWasReset } = reconcileFilters(next, jhGroups);
        if (dmtWasReset)
            toast.info(t('people.filters.dmtReset'));
        setFilters(reconciled);
        setPage(0);
    }
    // §10: '/' focuses search.
    useEffect(() => {
        function onKey(e) {
            if (e.key === '/' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
                e.preventDefault();
                searchRef.current?.querySelector('input')?.focus();
            }
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);
    const now = new Date();
    function statusOf(row) {
        return row.is_active !== false
            ? { key: 'success', label: t('people.statuses.active') }
            : { key: 'neutral', label: t('people.statuses.inactive') };
    }
    function primaryPath(row) {
        return [row.jh_group?.name, row.dmt?.name].filter(Boolean);
    }
    function rowActions(row) {
        const isPinRole = row.role === 'apprentice' || row.role === 'on_roll';
        const active = row.is_active !== false;
        return (<>
        <DropdownMenuItem onSelect={() => setEditTarget(row)}>
          {t('common.edit')}
        </DropdownMenuItem>
        {isPinRole && (isAdmin ? (<DropdownMenuItem onSelect={() => setPinTarget(row)}>
              {t('people.actions.generatePin')}
            </DropdownMenuItem>) : (<RlsDeniedNotice reason={t('people.actions.pinAdminOnly')}/>))}
        {/* Email-identity password reset — admin-only (migrated from /admin/users;
                the manage-user Edge action enforces admin-only server-side). */}
        {!isPinRole && isAdmin && (<DropdownMenuItem onSelect={() => setPwResetTarget(row)}>
            {t('people.actions.resetPassword')}
          </DropdownMenuItem>)}
        {active ? (<DropdownMenuItem className="text-danger-fg focus:text-danger-fg" onSelect={() => setDeactivateTarget(row)}>
            {t('mdm.common.deactivate')}
          </DropdownMenuItem>) : (<DropdownMenuItem onSelect={() => setReactivateTarget(row)}>
            {t('mdm.common.reactivate')}
          </DropdownMenuItem>)}
      </>);
    }
    const tableBody = (() => {
        if (workers.isLoading) {
            return (<div data-testid="roster-loading">
          {Array.from({ length: 8 }, (_, i) => <SkeletonRow key={i} columns={6}/>)}
        </div>);
        }
        if (workers.error) {
            const code = workers.error instanceof MdmError ? workers.error.code.toUpperCase() : 'UNKNOWN';
            return <ErrorState title={t('people.states.errorTitle')} message={code} onRetry={() => workers.refetch()}/>;
        }
        if (rows.length === 0 && total === 0) {
            const filtersActive = filters.q !== '' || filters.role !== 'all' || filters.jhGroup !== 'all' || filters.dmt !== 'all' || filters.status !== 'all';
            if (filtersActive) {
                return (<EmptyState glyph="⌕" title={t('people.states.emptyFilterTitle')} body={t('people.states.emptyFilterBody')} action={{ label: t('people.states.clearFilters'), onClick: () => applyFilters(DEFAULT_ROSTER_FILTERS) }}/>);
            }
            return (<EmptyState title={t('people.states.emptyRosterTitle')} body={t('people.states.emptyRosterBody')} action={{ label: t('people.actions.invite'), onClick: () => setInviteOpen(true) }}/>);
        }
        return null; // table renders
    })();
    return (<TooltipProvider>
      <div className="mx-auto max-w-6xl px-gutter py-6 lg:px-gutter-lg">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-4xl font-semibold text-ink-strong">{t('people.title')}</h1>
            <p className="text-sm text-ink-muted">{t('people.subtitle', { count: dmts?.length ?? 0 })}</p>
          </div>
          <div className="flex gap-2">
            {isAdmin && (<Button variant="secondary" onClick={() => navigate('/admin/mdm/people/import')}>
                {t('people.actions.bulkImport')}
              </Button>)}
            <Button onClick={() => setInviteOpen(true)}>
              + {t('people.actions.invite')}
            </Button>
          </div>
        </div>

        <div ref={searchRef} className="sticky top-0 z-10">
          <RosterFilterBar filters={filters} onChange={applyFilters} totalShown={rows.length} totalAll={total} jhGroups={jhGroups} dmts={dmts} orgLoading={org.isLoading} orgError={!!org.error || (org.data != null && jhGroups?.length === 0)}/>
        </div>

        {tableBody ?? (<>
            {/* Desktop table (≥768px) */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="bg-surface-sunken">
                    <TableHead className="min-w-[28ch] text-xs uppercase tracking-wider text-ink-muted">NAME</TableHead>
                    <TableHead className="min-w-[12ch] text-xs uppercase tracking-wider text-ink-muted">ROLE</TableHead>
                    <TableHead className="min-w-[26ch] text-xs uppercase tracking-wider text-ink-muted">PRIMARY</TableHead>
                    <TableHead className="min-w-[4ch] text-xs uppercase tracking-wider text-ink-muted">
                      <Tooltip>
                        <TooltipTrigger asChild><span tabIndex={0}>+N</span></TooltipTrigger>
                        <TooltipContent>{t('people.tooltips.plusN')}</TooltipContent>
                      </Tooltip>
                    </TableHead>
                    <TableHead className="min-w-[12ch] text-xs uppercase tracking-wider text-ink-muted">
                      <Tooltip>
                        <TooltipTrigger asChild><span tabIndex={0}>STATUS</span></TooltipTrigger>
                        <TooltipContent>{t('people.tooltips.status')}</TooltipContent>
                      </Tooltip>
                    </TableHead>
                    <TableHead className="min-w-[14ch] text-xs uppercase tracking-wider text-ink-muted">LAST LOGIN</TableHead>
                    <TableHead className="w-[5ch]"/>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                const st = statusOf(row);
                const extra = additionalByWorker.get(row.id) ?? [];
                return (<TableRow key={row.id} className="min-h-touch hover:bg-surface-hover">
                        <TableCell className="text-base text-ink-strong">
                          <div className="flex items-center gap-2">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="bg-surface-sunken text-xs text-ink-muted">
                                {initialsOf(row.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <span lang={row.lang_pref ?? undefined} className="block">{row.name}</span>
                              {row.employee_id && (<span className="block font-mono text-2xs text-ink-muted">{row.employee_id}</span>)}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-ink">{t(`people.roles.${row.role}`)}</TableCell>
                        <TableCell className="text-sm text-ink-muted">
                          <MembershipChip path={primaryPath(row)} variant="primary"/>
                        </TableCell>
                        <TableCell>
                          {extra.length === 0 ? (<span className="text-ink-subtle">—</span>) : (<DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" aria-label={t('people.tooltips.plusN')}>
                                  +{extra.length}
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent className="flex flex-col gap-1 p-2">
                                {extra.map((m) => (<MembershipChip key={m.id} path={m.path}/>))}
                              </DropdownMenuContent>
                            </DropdownMenu>)}
                        </TableCell>
                        <TableCell><StatusBadge status={st.key} label={st.label}/></TableCell>
                        <TableCell className="tabular text-sm text-ink-muted">
                          {formatLastLogin(row.last_login_at, now, i18n.language)}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" aria-label={t('people.actions.menu', { name: row.name })}>
                                <MoreHorizontal size={16}/>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>{rowActions(row)}</DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>);
            })}
                </TableBody>
              </Table>
              {pageCount > 1 && (<div className="flex items-center justify-center gap-1 py-3">
                  {Array.from({ length: pageCount }, (_, i) => (<Button key={i} variant={i === page ? 'default' : 'ghost'} size="sm" onClick={() => setPage(i)}>
                      {i + 1}
                    </Button>))}
                </div>)}
            </div>

            {/* Mobile card stack (<768px) */}
            <ul className="md:hidden">
              {rows.map((row) => {
                const st = statusOf(row);
                const extra = additionalByWorker.get(row.id) ?? [];
                return (<li key={row.id} className="border-b border-line-subtle">
                    <button type="button" className="flex w-full items-start justify-between gap-2 px-3 py-3 text-left hover:bg-surface-hover" aria-label={`${row.name}, ${t(`people.roles.${row.role}`)}, ${st.label}`} onClick={() => setSheetRow(row)}>
                      <span className="min-w-0">
                        <span lang={row.lang_pref ?? undefined} className="block text-base font-medium text-ink-strong">
                          {row.name}
                        </span>
                        <span className="block text-sm text-ink-muted">
                          {t(`people.roles.${row.role}`)}
                          {row.employee_id && <span className="font-mono"> · {row.employee_id}</span>}
                          {' · '}{primaryPath(row).join(' · ') || '—'}
                        </span>
                        {extra.length > 0 && (<span className="mt-1 inline-block rounded-full border border-dashed border-line-strong px-2 text-2xs text-ink-muted">
                            +{extra.length}
                          </span>)}
                      </span>
                      <StatusBadge status={st.key} label={st.label}/>
                    </button>
                  </li>);
            })}
              {rows.length < total && (<li className="py-3 text-center">
                  <Button variant="secondary" onClick={() => setPage((p) => p + 1)}>
                    {t('people.actions.loadMore')}
                  </Button>
                </li>)}
            </ul>
          </>)}

        {/* Mobile row sheet */}
        <Sheet open={sheetRow !== null} onOpenChange={(o) => !o && setSheetRow(null)}>
          <SheetContent side="bottom" className="bg-surface-raised">
            {sheetRow && (<>
                <SheetHeader>
                  <SheetTitle lang={sheetRow.lang_pref ?? undefined} className="text-ink-strong">
                    {sheetRow.name}
                  </SheetTitle>
                  <SheetDescription className="text-ink-muted">
                    {t(`people.roles.${sheetRow.role}`)}
                    {sheetRow.employee_id && <span className="font-mono"> · {sheetRow.employee_id}</span>}
                    {' · '}{primaryPath(sheetRow).join(' · ') || '—'}
                  </SheetDescription>
                </SheetHeader>
                <div className="space-y-2 py-2">
                  <StatusBadge status={statusOf(sheetRow).key} label={statusOf(sheetRow).label} size="md"/>
                  <div className="flex flex-wrap gap-1.5">
                    {(additionalByWorker.get(sheetRow.id) ?? []).map((m) => (<MembershipChip key={m.id} path={m.path}/>))}
                  </div>
                  <div className="flex flex-col gap-2 pt-2">
                    <Button variant="outline" onClick={() => { setEditTarget(sheetRow); setSheetRow(null); }}>
                      {t('common.edit')}
                    </Button>
                    {(sheetRow.role === 'apprentice' || sheetRow.role === 'on_roll') && (isAdmin ? (<Button variant="outline" onClick={() => { setPinTarget(sheetRow); setSheetRow(null); }}>
                          {t('people.actions.generatePin')}
                        </Button>) : (<RlsDeniedNotice reason={t('people.actions.pinAdminOnly')}/>))}
                    {!(sheetRow.role === 'apprentice' || sheetRow.role === 'on_roll') && isAdmin && (<Button variant="outline" onClick={() => { setPwResetTarget(sheetRow); setSheetRow(null); }}>
                        {t('people.actions.resetPassword')}
                      </Button>)}
                    {sheetRow.is_active !== false ? (<Button variant="destructive" onClick={() => { setDeactivateTarget(sheetRow); setSheetRow(null); }}>
                        {t('mdm.common.deactivate')}
                      </Button>) : (<Button variant="outline" onClick={() => { setReactivateTarget(sheetRow); setSheetRow(null); }}>
                        {t('mdm.common.reactivate')}
                      </Button>)}
                  </div>
                </div>
              </>)}
          </SheetContent>
        </Sheet>

        {/* Deactivate confirmation — §9.1 verbatim copy via i18n */}
        <ConfirmModal open={deactivateTarget !== null} onOpenChange={(o) => {
            if (!o) {
                setDeactivateTarget(null);
                setDeactivateReason('');
                setDeactivateReasonText('');
            }
        }} title={t('people.deactivate.title', { name: deactivateTarget?.name ?? '' })} description={t('people.deactivate.description')} consequenceList={[
            t('people.deactivate.c1'),
            t('people.deactivate.c2'),
            t('people.deactivate.c3'),
        ]} severity="danger" stepConfirm primaryLabel={t('mdm.common.deactivate')} isWorking={deactivate.isPending} primaryDisabled={deactivateReason === '' ||
            (deactivateReason === 'other' && deactivateReasonText.trim().length < 3)} onConfirm={() => {
            if (!deactivateTarget || deactivateReason === '')
                return;
            deactivate.mutate({
                workerId: deactivateTarget.id,
                reason: deactivateReason,
                reasonText: deactivateReason === 'other' ? deactivateReasonText.trim() : undefined,
            }, {
                onSuccess: () => setDeactivateTarget(null),
                onError: (e) => toast.error(e instanceof MdmError ? t(`mdm.errors.${e.code}`) : t('mdm.errors.unknown')),
            });
        }}>
          {/* B5: mandatory reason capture (same UX class as PinRevealModal) */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-ink-strong">{t('people.deactivate.reasonPrompt')}</p>
            <RadioGroup value={deactivateReason} onValueChange={(v) => setDeactivateReason(v)}>
              {DEACTIVATION_REASONS.map((r) => (<label key={r} className="flex min-h-touch items-center gap-3 text-sm text-ink">
                  <RadioGroupItem value={r} aria-label={t(`people.deactivate.reasons.${r}`)}/>
                  {t(`people.deactivate.reasons.${r}`)}
                </label>))}
            </RadioGroup>
            {deactivateReason === 'other' && (<Textarea value={deactivateReasonText} onChange={(e) => setDeactivateReasonText(e.target.value)} maxLength={300} placeholder={t('people.deactivate.otherPlaceholder')} aria-label={t('people.deactivate.otherPlaceholder')}/>)}
          </div>
        </ConfirmModal>

        {/* B4: reactivate — single-press info confirm */}
        <ConfirmModal open={reactivateTarget !== null} onOpenChange={(o) => !o && setReactivateTarget(null)} title={t('people.reactivate.title', { name: reactivateTarget?.name ?? '' })} description={t('people.reactivate.description')} severity="info" primaryLabel={t('mdm.common.reactivate')} isWorking={reactivate.isPending} onConfirm={() => {
            if (!reactivateTarget)
                return;
            reactivate.mutate({ workerId: reactivateTarget.id }, {
                onSuccess: () => setReactivateTarget(null),
                onError: (e) => toast.error(e instanceof MdmError ? t(`mdm.errors.${e.code}`) : t('mdm.errors.unknown')),
            });
        }}/>

        {/* Invite + Edit (Step 6) */}
        <PeopleInvite open={inviteOpen} onOpenChange={setInviteOpen} jhGroups={jhGroups} dmts={dmts} onPinIssued={(name, pin) => setIssuedPin({ name, pin })}/>
        <PeopleEdit worker={editTarget} onOpenChange={(o) => !o && setEditTarget(null)} jhGroups={jhGroups} dmts={dmts}/>
        <PeoplePasswordReset worker={pwResetTarget} onOpenChange={(o) => !o && setPwResetTarget(null)}/>
        {issuedPin && (<PinRevealModal open={issuedPin !== null} onOpenChange={(o) => !o && setIssuedPin(null)} user={{ id: '', displayName: issuedPin.name, roleLabel: '', primaryAssignment: '' }} onReveal={async () => ({ pin: issuedPin.pin })} presetPin={issuedPin.pin}/>)}

        {/* Generate new PIN — D-021 honest copy, PATTERNS §5 UX */}
        {pinTarget && (<PinRevealModal open={pinTarget !== null} onOpenChange={(o) => !o && setPinTarget(null)} user={{
                id: pinTarget.id,
                displayName: pinTarget.name,
                roleLabel: t(`people.roles.${pinTarget.role}`),
                primaryAssignment: primaryPath(pinTarget).join(' · ') || '—',
            }} onReveal={async (reason, otherText) => {
                const res = await genPin.mutateAsync({ workerId: pinTarget.id, reason, reasonText: otherText });
                return { pin: res.pin };
            }}/>)}
      </div>
    </TooltipProvider>);
}
