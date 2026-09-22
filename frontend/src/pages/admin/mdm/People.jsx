import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MoreHorizontal, Search, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { StatusBadge, EmptyState, ErrorState, SkeletonRow } from '@/components/patterns';
import { api } from '../../../lib/api';
import { getSessionContext } from '../../../hooks/useAbnormalities';
import { PeopleOnboard, usePeopleMeta } from './PeopleOnboard';
import { PeopleEdit } from './PeopleEdit';
import { PeoplePasswordReset } from './PeoplePasswordReset';

const PAGE_SIZE = 25;
const ALL = 'all';

export function People() {
  const qc = useQueryClient();
  const me = getSessionContext();
  const meta = usePeopleMeta(true);
  const list = useQuery({ queryKey: ['people', 'list'], queryFn: api.getWorkers });
  const [q, setQ] = useState('');
  const [role, setRole] = useState(ALL);
  const [plant, setPlant] = useState(ALL);
  const [status, setStatus] = useState('active');
  const [page, setPage] = useState(0);
  const [onboardOpen, setOnboardOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [toggleTarget, setToggleTarget] = useState(null);
  const [toggling, setToggling] = useState(false);

  const roleName = useMemo(() => Object.fromEntries((meta.data?.roles ?? []).map((r) => [r.code, r.name])), [meta.data]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (list.data ?? []).filter((p) => {
      if (role !== ALL && p.role !== role) return false;
      if (plant !== ALL && p.default_plant !== plant) return false;
      if (status === 'active' && p.is_active === false) return false;
      if (status === 'inactive' && p.is_active !== false) return false;
      if (!needle) return true;
      return [p.name, p.emp_id, p.email, p.department_name, p.jh_group_name].some((v) => String(v ?? '').toLowerCase().includes(needle));
    });
  }, [list.data, q, role, plant, status]);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const shown = rows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const filtersActive = q !== '' || role !== ALL || plant !== ALL || status !== 'active';
  const setF = (fn) => (v) => { fn(v); setPage(0); };

  async function confirmToggle() {
    setToggling(true);
    try {
      await api.peopleUpdate(toggleTarget.emp_id, { is_active: !(toggleTarget.is_active !== false) });
      toast.success(toggleTarget.is_active !== false ? 'Deactivated' : 'Reactivated');
      qc.invalidateQueries({ queryKey: ['people'] });
      qc.invalidateQueries({ queryKey: ['mdm'] });
      setToggleTarget(null);
    } catch (e) { toast.error(e.message); } finally { setToggling(false); }
  }

  const actions = (p) => (
    <>
      <DropdownMenuItem onSelect={() => setEditTarget(p)}>Edit</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => setResetTarget(p)}>Reset password</DropdownMenuItem>
      {p.emp_id !== me?.worker_id && p.emp_id !== me?.emp_id && (
        <DropdownMenuItem className={p.is_active !== false ? 'text-danger-fg focus:text-danger-fg' : ''} onSelect={() => setToggleTarget(p)}>
          {p.is_active !== false ? 'Deactivate' : 'Reactivate'}
        </DropdownMenuItem>
      )}
    </>
  );
  const menu = (p) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`Actions for ${p.name}`}><MoreHorizontal size={16} /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>{actions(p)}</DropdownMenuContent>
    </DropdownMenu>
  );
  const badge = (p) => (p.is_active !== false ? <StatusBadge status="success" label="Active" /> : <StatusBadge status="neutral" label="Inactive" />);

  return (
    <div className="mx-auto max-w-6xl px-gutter py-6 lg:px-gutter-lg">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-4xl font-semibold text-ink-strong">People</h1>
          <p className="text-sm text-ink-muted">{list.data ? `${list.data.length} people` : ' '}</p>
        </div>
        <Button onClick={() => setOnboardOpen(true)}><UserPlus size={16} className="mr-1.5" /> Onboard people</Button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-subtle" />
          <Input className="pl-8" value={q} onChange={(e) => setF(setQ)(e.target.value)} placeholder="Search name, ID, email, department, group" />
        </div>
        <Select value={role} onValueChange={setF(setRole)}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Role" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All roles</SelectItem>
            {(meta.data?.roles ?? []).map((r) => <SelectItem key={r.code} value={r.code}>{r.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {(meta.data?.plants?.length ?? 0) > 1 && (
          <Select value={plant} onValueChange={setF(setPlant)}>
            <SelectTrigger className="w-32"><SelectValue placeholder="Plant" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All plants</SelectItem>
              {meta.data.plants.map((p) => <SelectItem key={p.id} value={p.code}>{p.code}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={status} onValueChange={setF(setStatus)}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value={ALL}>All</SelectItem>
          </SelectContent>
        </Select>
        {filtersActive && <Button variant="ghost" size="sm" onClick={() => { setQ(''); setRole(ALL); setPlant(ALL); setStatus('active'); setPage(0); }}>Clear</Button>}
      </div>

      {list.isLoading && <div>{Array.from({ length: 8 }, (_, i) => <SkeletonRow key={i} columns={6} />)}</div>}
      {list.error && <ErrorState title="Could not load people" message={list.error.message} onRetry={() => list.refetch()} />}
      {list.data && rows.length === 0 && (
        filtersActive
          ? <EmptyState glyph="⌕" title="No one matches" body="Try different filters or search." action={{ label: 'Clear filters', onClick: () => { setQ(''); setRole(ALL); setPlant(ALL); setStatus('active'); } }} />
          : <EmptyState title="No people yet" body="Onboard your first people to get started." action={{ label: 'Onboard people', onClick: () => setOnboardOpen(true) }} />
      )}

      {list.data && rows.length > 0 && (
        <>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-surface-sunken">
                  {['Name', 'Role', 'Plant', 'Department', 'Module', 'JH Group', 'Status'].map((h) => (
                    <TableHead key={h} className="text-xs uppercase tracking-wider text-ink-muted">{h}</TableHead>
                  ))}
                  <TableHead className="w-[5ch]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((p) => (
                  <TableRow key={p.emp_id} className="hover:bg-surface-hover">
                    <TableCell>
                      <span className="block text-base text-ink-strong">{p.name}</span>
                      <span className="block font-mono text-2xs text-ink-muted">{p.emp_id}{p.email ? ` · ${p.email}` : ''}</span>
                    </TableCell>
                    <TableCell className="text-sm text-ink">{roleName[p.role] || p.role}</TableCell>
                    <TableCell className="text-sm text-ink">{p.default_plant || '—'}</TableCell>
                    <TableCell className="text-sm text-ink">{p.department_name || '—'}</TableCell>
                    <TableCell className="text-sm text-ink">{p.module_name || '—'}</TableCell>
                    <TableCell className="text-sm text-ink">{p.jh_group_name || '—'}</TableCell>
                    <TableCell>{badge(p)}</TableCell>
                    <TableCell>{menu(p)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="md:hidden">
            {shown.map((p) => (
              <li key={p.emp_id} className="flex items-start justify-between gap-2 border-b border-line-subtle px-1 py-3">
                <div className="min-w-0">
                  <span className="block text-base font-medium text-ink-strong">{p.name}</span>
                  <span className="block text-sm text-ink-muted">{roleName[p.role] || p.role} · <span className="font-mono">{p.emp_id}</span> · {p.default_plant || '—'}</span>
                  <span className="block text-xs text-ink-subtle">{[p.department_name, p.module_name, p.jh_group_name].filter(Boolean).join(' · ') || '—'}</span>
                </div>
                <div className="flex shrink-0 items-center gap-1">{badge(p)}{menu(p)}</div>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between gap-2 py-3 text-sm text-ink-muted">
            <span>{safePage * PAGE_SIZE + 1}–{Math.min(rows.length, (safePage + 1) * PAGE_SIZE)} of {rows.length}</span>
            {pageCount > 1 && (
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Prev</Button>
                <Button variant="outline" size="sm" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>Next</Button>
              </div>
            )}
          </div>
        </>
      )}

      <PeopleOnboard open={onboardOpen} onOpenChange={setOnboardOpen} />
      <PeopleEdit person={editTarget} onOpenChange={(o) => !o && setEditTarget(null)} isSelf={editTarget?.emp_id === me?.worker_id || editTarget?.emp_id === me?.emp_id} />
      <PeoplePasswordReset person={resetTarget} onOpenChange={(o) => !o && setResetTarget(null)} />

      <Dialog open={toggleTarget !== null} onOpenChange={(o) => !toggling && !o && setToggleTarget(null)}>
        <DialogContent className="max-w-[440px] bg-surface-raised">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-ink-strong">
              {toggleTarget?.is_active !== false ? 'Deactivate' : 'Reactivate'} {toggleTarget?.name}?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-ink-muted">
            {toggleTarget?.is_active !== false
              ? 'They will no longer be able to sign in. Their past work stays on file, and you can reactivate them any time.'
              : 'They will be able to sign in again with their current password.'}
          </p>
          <DialogFooter>
            <Button variant="outline" disabled={toggling} onClick={() => setToggleTarget(null)}>Cancel</Button>
            <Button variant={toggleTarget?.is_active !== false ? 'destructive' : 'default'} disabled={toggling} onClick={confirmToggle}>
              {toggling ? 'Working…' : toggleTarget?.is_active !== false ? 'Deactivate' : 'Reactivate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
