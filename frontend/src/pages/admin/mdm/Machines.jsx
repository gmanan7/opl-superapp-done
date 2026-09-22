import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, } from '@/components/ui/select';
import { useMachines, useCreateMachine, useUpdateMachine, useSetMachineActive, useOrgStructure, } from '@/hooks/mdm';
import { ActiveBadge, MdmErrorNote } from './mdmUi';
import { getSessionContext } from '../../../hooks/useAbnormalities';
const ALL = '__all__';
const NONE = '__none__';
const NEW_TYPE = '__new__';
// Pure filter, exported for tests.
export function filterMachines(rows, f) {
    return rows.filter((m) => (f.showInactive || m.is_active !== false)
        && (f.groupId === ALL || m.jh_group_id === f.groupId)
        && (f.moduleId === ALL || m.module_id === f.moduleId)
        && (f.type === ALL || m.machine_type === f.type));
}
// Pure grouping by JH group, exported for tests. Every machine surfaces —
// groups whose DMT is NULL are first-class, never dropped (live data has 8
// machines under no-DMT groups; an inner DMT join would lose them).
export function groupMachines(rows) {
    const byGroup = new Map();
    for (const m of rows) {
        const entry = byGroup.get(m.jh_group_id) ?? {
            groupId: m.jh_group_id,
            groupName: m.jh_group?.name ?? m.jh_group_id ?? '', // '' = machine has no JH group yet (shown as "No JH Group")
            machines: [],
        };
        entry.machines.push(m);
        byGroup.set(m.jh_group_id, entry);
    }
    return [...byGroup.values()].sort((a, b) => a.groupName.localeCompare(b.groupName));
}
export function Machines() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const isAdmin = getSessionContext()?.role === 'admin';
    // One query, all rows (40 machines) — filters are client-side.
    const { data: machines, isLoading } = useMachines({ includeInactive: true });
    const { data: org } = useOrgStructure();
    const [filters, setFilters] = useState({ groupId: ALL, moduleId: ALL, type: ALL, showInactive: false });
    const [dialog, setDialog] = useState(null);
    const [formError, setFormError] = useState(null);
    const [name, setName] = useState('');
    const [typeSel, setTypeSel] = useState(NEW_TYPE);
    const [typeNew, setTypeNew] = useState('');
    const [groupSel, setGroupSel] = useState('');
    // Module (SFM / RFM / …) and the critical flag live on the machine; the PM Schedule reads them.
    const [moduleSel, setModuleSel] = useState(NONE);
    const [critical, setCritical] = useState(true);
    const createMachine = useCreateMachine();
    const updateMachine = useUpdateMachine();
    const setMachineActive = useSetMachineActive();
    const pending = createMachine.isPending || updateMachine.isPending;
    const allGroups = useMemo(() => {
        if (!org)
            return [];
        return [...(org.dmts ?? []).flatMap((d) => d.jhGroups ?? []), ...(org.unassignedJhGroups ?? [])];
    }, [org]);
    const modules = org?.moduleNames ?? [];
    const dmtNameByGroup = useMemo(() => {
        const m = new Map();
        if (org) {
            for (const d of (org.dmts ?? []))
                for (const g of (d.jhGroups ?? []))
                    m.set(g.id, d.name);
            for (const g of (org.unassignedJhGroups ?? []))
                m.set(g.id, null);
        }
        return m;
    }, [org]);
    const types = useMemo(() => [...new Set((machines ?? []).map((m) => m.machine_type).filter(Boolean))].sort(), [machines]);
    const visible = useMemo(() => filterMachines(machines ?? [], filters), [machines, filters]);
    const grouped = useMemo(() => groupMachines(visible), [visible]);
    function open(state) {
        setFormError(null);
        if (state.mode === 'edit') {
            setName(state.target.name);
            setTypeSel(state.target.machine_type ?? NEW_TYPE);
            setTypeNew('');
            setGroupSel(state.target.jh_group_id ?? '');
            setModuleSel(state.target.module_id ?? NONE);
            setCritical(state.target.is_critical !== false);
        }
        else {
            setName('');
            setTypeSel(NEW_TYPE);
            setTypeNew('');
            setGroupSel('');
            setModuleSel(NONE);
            setCritical(true);
        }
        setDialog(state);
    }
    function submit() {
        // A JH group is required for a NEW machine; an existing group-less machine (e.g. copied in for
        // the PM Schedule) can be edited without being forced to pick one.
        if (!dialog || !name.trim() || (!groupSel && dialog.mode === 'create'))
            return;
        const machine_type = typeSel === NEW_TYPE ? (typeNew.trim() || null) : typeSel;
        const payload = {
            name: name.trim(),
            machine_type,
            jh_group_id: groupSel || null,
            module_id: moduleSel === NONE ? null : moduleSel,
            is_critical: critical,
        };
        const opts = { onSuccess: () => setDialog(null), onError: (e) => setFormError(e) };
        if (dialog.mode === 'create')
            createMachine.mutate(payload, opts);
        else
            updateMachine.mutate({ id: dialog.target.id, ...payload }, opts);
    }
    function confirmSetActive(m, makeActive) {
        if (!makeActive && !window.confirm(t('mdm.machines.confirmDeactivate', { name: m.name })))
            return;
        setMachineActive.mutate({ id: m.id, is_active: makeActive }, { onError: (e) => setFormError(e) });
    }
    return (<div className="mx-auto max-w-4xl px-gutter py-6 lg:px-gutter-lg">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-ink-strong">{t('mdm.machines.title')}</h1>
        <div className="flex gap-2">
          {isAdmin && (<Button variant="secondary" onClick={() => navigate('/admin/mdm/machines/import')}>
              {t('mdm.machines.bulkImport')}
            </Button>)}
          <Button onClick={() => open({ mode: 'create' })}>
            <Plus size={16} aria-hidden/>
            {t('mdm.machines.newMachine')}
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select value={filters.groupId} onValueChange={(v) => setFilters((f) => ({ ...f, groupId: v }))}>
          <SelectTrigger className="w-44" aria-label={t('mdm.machines.fieldGroup')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('mdm.machines.allGroups')}</SelectItem>
            {allGroups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.moduleId} onValueChange={(v) => setFilters((f) => ({ ...f, moduleId: v }))}>
          <SelectTrigger className="w-40" aria-label={t('mdm.machines.fieldModule')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('mdm.machines.allModules')}</SelectItem>
            {modules.map((mo) => <SelectItem key={mo.id} value={mo.id}>{mo.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.type} onValueChange={(v) => setFilters((f) => ({ ...f, type: v }))}>
          <SelectTrigger className="w-40" aria-label={t('mdm.machines.fieldType')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('mdm.machines.allTypes')}</SelectItem>
            {types.map((ty) => <SelectItem key={ty} value={ty}>{ty}</SelectItem>)}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <Switch checked={filters.showInactive} onCheckedChange={(v) => setFilters((f) => ({ ...f, showInactive: v }))} aria-label={t('mdm.common.showInactive')}/>
          {t('mdm.common.showInactive')}
        </label>
        <span className="ml-auto text-sm text-ink-muted">{t('mdm.machines.machinesCount', { count: visible.length })}</span>
      </div>

      {formError != null && !dialog && <div className="mb-3"><MdmErrorNote error={formError}/></div>}
      {isLoading && <p className="text-sm text-ink-muted">{t('common.loading')}</p>}

      <div className="space-y-4">
        {grouped.map(({ groupId, groupName, machines: rows }) => (<section key={groupId ?? 'no-group'} className="rounded-lg border border-line bg-surface-raised shadow-xs">
            <header className="flex items-baseline gap-2 border-b border-line-subtle bg-surface-sunken px-4 py-2">
              <h2 className="text-sm font-semibold text-ink-strong">{groupName || t('mdm.machines.noJhGroup')}</h2>
              <span className="text-2xs text-ink-subtle">
                {dmtNameByGroup.get(groupId) ?? t('mdm.machines.noDmt')}
              </span>
            </header>
            <ul>
              {rows.map((m) => (<li key={m.id} className="flex items-center gap-3 border-b border-line-subtle px-4 py-2 last:border-b-0 hover:bg-surface-hover">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{m.name}</p>
                  </div>
                  {m.module && <Badge variant="secondary">{m.module.name}</Badge>}
                  {m.is_critical === false && <Badge variant="secondary">{t('mdm.machines.nonCritical')}</Badge>}
                  {m.machine_type && <Badge variant="secondary">{m.machine_type}</Badge>}
                  <ActiveBadge active={m.is_active}/>
                  <Button variant="ghost" size="sm" onClick={() => open({ mode: 'edit', target: m })}>
                    <Pencil size={14} aria-hidden/>
                    {t('common.edit')}
                  </Button>
                  <Button variant="ghost" size="sm" className={m.is_active !== false ? 'text-danger-fg hover:text-danger-fg' : 'text-success-fg hover:text-success-fg'} onClick={() => confirmSetActive(m, m.is_active === false)}>
                    {m.is_active !== false ? t('mdm.common.deactivate') : t('mdm.common.reactivate')}
                  </Button>
                </li>))}
            </ul>
          </section>))}
      </div>

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="bg-surface-raised">
          <DialogHeader>
            <DialogTitle className="text-ink-strong">
              {dialog?.mode === 'create' ? t('mdm.machines.newMachine') : t('mdm.machines.editMachine')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block text-sm text-ink-muted">
              {t('mdm.common.name')}
              <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} maxLength={120}/>
            </label>
            <label className="block text-sm text-ink-muted">
              {t('mdm.machines.fieldGroup')}
              <Select value={groupSel || undefined} onValueChange={setGroupSel}>
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allGroups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
            <label className="block text-sm text-ink-muted">
              {t('mdm.machines.fieldModule')}
              <Select value={moduleSel} onValueChange={setModuleSel}>
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t('mdm.common.none')}</SelectItem>
                  {modules.map((mo) => <SelectItem key={mo.id} value={mo.id}>{mo.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
            <label className="block text-sm text-ink-muted">
              {t('mdm.machines.fieldType')}
              <Select value={typeSel} onValueChange={setTypeSel}>
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {types.map((ty) => <SelectItem key={ty} value={ty}>{ty}</SelectItem>)}
                  <SelectItem value={NEW_TYPE}>{t('mdm.machines.addNewType')}</SelectItem>
                </SelectContent>
              </Select>
              {typeSel === NEW_TYPE && (<Input className="mt-2" value={typeNew} onChange={(e) => setTypeNew(e.target.value)} maxLength={40} placeholder={t('mdm.machines.fieldType')}/>)}
              <span className="mt-1 block text-2xs text-ink-subtle">{t('mdm.machines.typeHint')}</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-ink-muted">
              <input type="checkbox" checked={critical} onChange={(e) => setCritical(e.target.checked)} className="h-4 w-4"/>
              {t('mdm.machines.fieldCritical')}
            </label>
            <span className="block text-2xs text-ink-subtle">{t('mdm.machines.pmHint')}</span>
            <MdmErrorNote error={formError}/>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>{t('common.cancel')}</Button>
            <Button onClick={submit} disabled={pending || !name.trim() || (!groupSel && dialog?.mode === 'create')}>
              {dialog?.mode === 'create' ? t('mdm.common.create') : t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>);
}
