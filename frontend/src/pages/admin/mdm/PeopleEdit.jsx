// Step 6 — Edit worker. All fields visible; the SERVER arbitrates per the
// Step 3a policies mirrored in manage-user.update_user (D5: denials surface
// inline, controls aren't role-hidden). Role select is the one exception —
// the server is certainly strict (admin-only), so non-admins see the
// RlsDeniedNotice in its place. Includes additional-memberships management
// (D-013): remove = is_active=false, never delete; add = JH group XOR DMT.
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { X, Building2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, } from '@/components/ui/select';
import { RlsDeniedNotice } from '@/components/patterns';
import { MdmError, useUpdateWorker, useOrgStructure, useGrantUserPlantAccess, useRevokeUserPlantAccess } from '@/hooks/mdm';
import { getSessionContext } from '../../../hooks/useAbnormalities';
const ROLE_OPTIONS = [
  'operator', 'jh_lead', 'module_lead', 'admin_5s', 'area_champion_5s',
  'auditor_pool', 'be_lead', 'it_lead', 'leadership',
  'apprentice', 'on_roll', 'jh_leader', 'dmt_member', 'dmt_leader', 'pillar_champion', 'be_team'
];
const NONE = '__none__';
export function PeopleEdit({ worker, onOpenChange, jhGroups, dmts }) {
    const { t } = useTranslation();
    const ctx = getSessionContext();
    const isAdmin = ctx?.role === 'admin';
    const [name, setName] = useState('');
    const [employeeId, setEmployeeId] = useState('');
    const [role, setRole] = useState('');
    const [jhGroup, setJhGroup] = useState(NONE);
    const [apprenticeType, setApprenticeType] = useState(NONE);
    const [langPref, setLangPref] = useState('en');
    const [formError, setFormError] = useState(null);
    useEffect(() => {
        if (worker) {
            setName(worker.name);
            setEmployeeId(worker.employee_id ?? '');
            setRole(worker.role);
            setJhGroup(worker.jh_group_id ?? NONE);
            setApprenticeType(worker.apprentice_type ?? NONE);
            setLangPref((worker.lang_pref === 'ta' ? 'en' : worker.lang_pref) ?? 'en');
            setFormError(null);
        }
    }, [worker]);
    const update = useUpdateWorker();
    const org = useOrgStructure();
    const grantPlantAccess = useGrantUserPlantAccess();
    const revokePlantAccess = useRevokeUserPlantAccess();
    const [selectedNewPlant, setSelectedNewPlant] = useState('');

    const workerEmpId = worker?.employee_id || worker?.emp_id || worker?.id;
    const userPlantAccesses = useMemo(() => {
        if (!org.data?.plantAccess || !workerEmpId) return [];
        return org.data.plantAccess.filter(upa => upa.emp_id === workerEmpId && upa.is_active !== false);
    }, [org.data?.plantAccess, workerEmpId]);

    const availableFactoriesForUser = useMemo(() => {
        const grantedFactoryIds = userPlantAccesses.map(upa => upa.factory_id);
        return (org.data?.factories || []).filter(f => !grantedFactoryIds.includes(f.id));
    }, [org.data?.factories, userPlantAccesses]);
    const dirty = useMemo(() => {
        if (!worker)
            return false;
        return (name !== worker.name ||
            employeeId !== (worker.employee_id ?? '') ||
            role !== worker.role ||
            jhGroup !== (worker.jh_group_id ?? NONE) ||
            apprenticeType !== (worker.apprentice_type ?? NONE) ||
            langPref !== (worker.lang_pref ?? 'en'));
    }, [worker, name, employeeId, role, jhGroup, apprenticeType, langPref]);
    function submit() {
        if (!worker || !dirty)
            return;
        setFormError(null);
        const fields = {};
        if (name !== worker.name)
            fields.name = name.trim();
        if (employeeId !== (worker.employee_id ?? ''))
            fields.employee_id = employeeId;
        if (role !== worker.role)
            fields.role = role;
        if (jhGroup !== (worker.jh_group_id ?? NONE))
            fields.jh_group_id = jhGroup === NONE ? null : jhGroup;
        if (apprenticeType !== (worker.apprentice_type ?? NONE)) {
            fields.apprentice_type = apprenticeType === NONE ? null : apprenticeType;
        }
        if (langPref !== (worker.lang_pref ?? 'en'))
            fields.lang_pref = langPref;
        update.mutate({ workerId: worker.id, fields }, {
            onSuccess: () => {
                toast.success(t('people.edit.saved', { name: name.trim() }));
                onOpenChange(false);
            },
            onError: (e) => setFormError(e instanceof MdmError ? t(`mdm.errors.${e.code}`) : t('mdm.errors.unknown')),
        });
    }
    return (<Sheet open={worker !== null} onOpenChange={(o) => !update.isPending && onOpenChange(o)}>
      <SheetContent side="right" className="w-full overflow-y-auto bg-surface-raised sm:max-w-md">
        {worker && (<>
            <SheetHeader>
              <SheetTitle lang={worker.lang_pref ?? undefined} className="text-ink-strong">
                {t('people.edit.title', { name: worker.name })}
              </SheetTitle>
              <SheetDescription className="text-ink-muted">
                {t(`people.roles.${worker.role}`)}
                {worker.employee_id && <span className="font-mono"> · {worker.employee_id}</span>}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-4 py-4">
              <label className="block text-sm text-ink-muted">
                {t('mdm.common.name')}
                <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} maxLength={120}/>
              </label>

              <label className="block text-sm text-ink-muted">
                {t('people.invite.employeeId')}
                <Input className="mt-1 font-mono" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} maxLength={30}/>
              </label>

              <div className="block text-sm text-ink-muted">
                {t('people.filters.role')}
                {isAdmin ? (<Select value={role} onValueChange={setRole}>
                    <SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((r) => (<SelectItem key={r} value={r}>{t(`people.roles.${r}`)}</SelectItem>))}
                    </SelectContent>
                  </Select>) : (<div className="mt-1 rounded border border-line bg-surface-sunken px-2 py-1">
                    <p className="text-sm text-ink">{t(`people.roles.${worker.role}`)}</p>
                    <RlsDeniedNotice reason={t('people.edit.roleAdminOnly')}/>
                  </div>)}
              </div>

              <label className="block text-sm text-ink-muted">
                {t('people.filters.jhGroup')}
                <Select value={jhGroup} onValueChange={setJhGroup}>
                  <SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t('mdm.common.none')}</SelectItem>
                    {(jhGroups ?? []).map((g) => <SelectItem key={g.id} value={g.id}>{g.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <span className="mt-0.5 block text-2xs text-ink-subtle">{t('people.edit.dmtFollowsGroup')}</span>
              </label>

              {(role === 'apprentice') && (<label className="block text-sm text-ink-muted">
                  {t('people.invite.apprenticeType')}
                  <Select value={apprenticeType} onValueChange={setApprenticeType}>
                    <SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>{t('mdm.common.none')}</SelectItem>
                      <SelectItem value="NAPS">NAPS</SelectItem>
                      <SelectItem value="CAT">CAT</SelectItem>
                    </SelectContent>
                  </Select>
                </label>)}

              <label className="block text-sm text-ink-muted">
                {t('people.invite.langPref')}
                <Select value={langPref} onValueChange={(v) => setLangPref(v)}>
                  <SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="hi">हिन्दी</SelectItem>
                    <SelectItem value="gu">ગુજરાતી</SelectItem>
                  </SelectContent>
                </Select>
              </label>

              {/* ── User Plant Access Management ── */}
              <section className="space-y-2 border-t border-line pt-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-ink-strong flex items-center gap-1.5">
                      <Building2 size={15} className="text-brand" />
                      User Plant Access
                    </h3>
                    <p className="text-2xs text-ink-subtle">Authorized plants this user can view and access DMTs in</p>
                  </div>
                </div>

                {userPlantAccesses.length === 0 ? (
                  <p className="text-xs text-ink-muted italic">Default plant access assigned automatically on user creation.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {userPlantAccesses.map((upa) => (
                      <li key={upa.id} className="flex items-center justify-between rounded border border-line bg-surface px-2.5 py-1.5 text-xs">
                        <span className="font-medium text-ink-strong">
                          {upa.factory_name || upa.factory_code || upa.factory_id}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-ink-subtle hover:text-danger-fg"
                          disabled={revokePlantAccess.isPending}
                          onClick={() => {
                            revokePlantAccess.mutate(upa.id, {
                              onSuccess: () => toast.success(`Revoked access for ${upa.factory_name || 'plant'}`),
                              onError: () => toast.error('Failed to revoke plant access')
                            });
                          }}
                        >
                          <X size={14} />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}

                {availableFactoriesForUser.length > 0 && (
                  <div className="flex items-center gap-2 pt-1">
                    <Select value={selectedNewPlant} onValueChange={setSelectedNewPlant}>
                      <SelectTrigger className="h-8 text-xs flex-1">
                        <SelectValue placeholder="Select plant to grant access..." />
                      </SelectTrigger>
                      <SelectContent>
                        {availableFactoriesForUser.map(f => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.name} ({f.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-8 text-xs gap-1"
                      disabled={!selectedNewPlant || grantPlantAccess.isPending}
                      onClick={() => {
                        if (!selectedNewPlant || !workerEmpId) return;
                        grantPlantAccess.mutate({ emp_id: workerEmpId, factory_id: selectedNewPlant }, {
                          onSuccess: () => {
                            toast.success('Granted plant access successfully');
                            setSelectedNewPlant('');
                          },
                          onError: () => toast.error('Failed to grant plant access')
                        });
                      }}
                    >
                      <Plus size={13} />
                      Grant
                    </Button>
                  </div>
                )}
              </section>

              {formError && <p role="alert" className="text-sm text-danger-fg">{formError}</p>}

              <div className="flex justify-end gap-2 border-t border-line pt-3">
                <Button variant="outline" disabled={update.isPending} onClick={() => onOpenChange(false)}>
                  {t('common.cancel')}
                </Button>
                <Button disabled={!dirty || update.isPending} onClick={submit}>
                  {update.isPending ? t('common.loading') : t('common.save')}
                </Button>
              </div>
            </div>
          </>)}
      </SheetContent>
    </Sheet>);
}
