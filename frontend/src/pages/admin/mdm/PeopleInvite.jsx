import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, } from '@/components/ui/select';
import { MdmError, useInvitePinWorker, useInviteEmailWorker } from '@/hooks/mdm';
import { getSessionContext } from '../../../hooks/useAbnormalities';
const EMPLOYEE_ID_RE = /^[A-Za-z0-9\-_/]{1,30}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PIN_ROLES_LIST = ['operator', 'apprentice', 'on_roll'];
const EMAIL_ROLES = [
  'jh_lead', 'module_lead', 'admin_5s', 'area_champion_5s', 'auditor_pool',
  'be_lead', 'it_lead', 'leadership', 'jh_leader', 'dmt_member', 'dmt_leader',
  'pillar_champion', 'be_team'
];
export function PeopleInvite({ open, onOpenChange, jhGroups, dmts, onPinIssued }) {
    const { t } = useTranslation();
    const ctx = getSessionContext();
    const isAdmin = ctx?.role === 'admin';
    const [identity, setIdentity] = useState('pin');
    const [name, setName] = useState('');
    const [employeeId, setEmployeeId] = useState('');
    const [role, setRole] = useState('apprentice');
    const [jhGroup, setJhGroup] = useState('');
    const [apprenticeType, setApprenticeType] = useState('');
    const [langPref, setLangPref] = useState('en');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [formError, setFormError] = useState(null);
    const invitePin = useInvitePinWorker();
    const inviteEmail = useInviteEmailWorker();
    const working = invitePin.isPending || inviteEmail.isPending;
    const derivedDmt = useMemo(() => {
        const g = jhGroups?.find((x) => x.id === jhGroup);
        if (!g)
            return null;
        return dmts?.find((d) => d.id === g.dmtId)?.label ?? t('people.filters.noDmt');
    }, [jhGroup, jhGroups, dmts, t]);
    function reset() {
        setIdentity('pin');
        setName('');
        setEmployeeId('');
        setRole('apprentice');
        setJhGroup('');
        setApprenticeType('');
        setLangPref('en');
        setEmail('');
        setPassword('');
        setFormError(null);
    }
    const valid = name.trim().length > 0 && name.length <= 120 && jhGroup !== '' &&
        (identity === 'pin'
            ? EMPLOYEE_ID_RE.test(employeeId)
            : EMAIL_RE.test(email) && password.length >= 8 && (employeeId === '' || EMPLOYEE_ID_RE.test(employeeId)));
    async function submit() {
        if (!valid || working)
            return;
        setFormError(null);
        try {
            if (identity === 'pin') {
                const res = await invitePin.mutateAsync({
                    name: name.trim(),
                    employee_id: employeeId,
                    role: role,
                    apprentice_type: role === 'apprentice' && apprenticeType ? apprenticeType : null,
                    jh_group_id: jhGroup,
                    lang_pref: langPref,
                });
                onOpenChange(false);
                if (res.pin)
                    onPinIssued(name.trim(), res.pin);
                toast.success(t('people.invite.added', { name: name.trim() }));
            }
            else {
                await inviteEmail.mutateAsync({
                    name: name.trim(),
                    ...(employeeId ? { employee_id: employeeId } : {}),
                    email: email.trim(),
                    password,
                    role: role,
                    jh_group_id: jhGroup,
                    lang_pref: langPref,
                });
                onOpenChange(false);
                toast.success(t('people.invite.added', { name: name.trim() }));
            }
            reset();
        }
        catch (e) {
            setFormError(e instanceof MdmError ? t(`mdm.errors.${e.code}`) : t('mdm.errors.unknown'));
        }
    }
    return (<Dialog open={open} onOpenChange={(o) => { if (!working) {
        onOpenChange(o);
        if (!o)
            reset();
    } }}>
      <DialogContent className="max-h-[90dvh] max-w-[520px] overflow-y-auto bg-surface-raised">
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold text-ink-strong">{t('people.invite.title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <RadioGroup value={identity} onValueChange={(v) => { setIdentity(v); setRole(v === 'pin' ? 'apprentice' : 'jh_leader'); }} className="flex gap-6">
            <label className="flex min-h-touch items-center gap-2 text-sm text-ink">
              <RadioGroupItem value="pin" aria-label={t('people.invite.pinIdentity')}/>
              {t('people.invite.pinIdentity')}
            </label>
            <label className="flex min-h-touch items-center gap-2 text-sm text-ink">
              <RadioGroupItem value="email" aria-label={t('people.invite.emailIdentity')} disabled={!isAdmin}/>
              {t('people.invite.emailIdentity')}
              {!isAdmin && <span className="text-2xs text-ink-subtle">({t('people.invite.adminOnly')})</span>}
            </label>
          </RadioGroup>

          <label className="block text-sm text-ink-muted">
            {t('mdm.common.name')} *
            <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} maxLength={120}/>
          </label>

          <label className="block text-sm text-ink-muted">
            {t('people.invite.employeeId')} {identity === 'pin' ? '*' : `(${t('common.optional')})`}
            <Input className="mt-1 font-mono" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} maxLength={30} placeholder="NPF-1234"/>
            <span className="mt-0.5 block text-2xs text-ink-subtle">{t('people.invite.employeeIdHint')}</span>
          </label>

          <label className="block text-sm text-ink-muted">
            {t('people.filters.role')} *
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {identity === 'pin'
            ? PIN_ROLES_LIST.map((r) => (<SelectItem key={r} value={r}>{t(`people.roles.${r}`)}</SelectItem>))
            : EMAIL_ROLES.map((r) => (<SelectItem key={r} value={r}>{t(`people.roles.${r}`)}</SelectItem>))}
              </SelectContent>
            </Select>
          </label>

          {identity === 'pin' && role === 'apprentice' && (<label className="block text-sm text-ink-muted">
              {t('people.invite.apprenticeType')}
              <Select value={apprenticeType || undefined} onValueChange={(v) => setApprenticeType(v)}>
                <SelectTrigger className="mt-1 w-full"><SelectValue placeholder="—"/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NAPS">NAPS</SelectItem>
                  <SelectItem value="CAT">CAT</SelectItem>
                </SelectContent>
              </Select>
            </label>)}

          <label className="block text-sm text-ink-muted">
            {t('people.filters.jhGroup')} *
            <Select value={jhGroup || undefined} onValueChange={setJhGroup}>
              <SelectTrigger className="mt-1 w-full"><SelectValue placeholder="—"/></SelectTrigger>
              <SelectContent>
                {(jhGroups ?? []).map((g) => <SelectItem key={g.id} value={g.id}>{g.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {jhGroup && (<span className="mt-0.5 block text-2xs text-ink-subtle">
                {t('people.invite.dmtDerived', { dmt: derivedDmt ?? '—' })}
              </span>)}
          </label>

          {identity === 'email' && (<>
              <label className="block text-sm text-ink-muted">
                {t('people.invite.email')} *
                <Input className="mt-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120}/>
              </label>
              <label className="block text-sm text-ink-muted">
                {t('people.invite.password')} *
                <Input className="mt-1" type="password" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={72}/>
                <span className="mt-0.5 block text-2xs text-ink-subtle">{t('people.invite.passwordHint')}</span>
              </label>
            </>)}

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

          {formError && <p role="alert" className="text-sm text-danger-fg">{formError}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={working} onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button disabled={!valid || working} onClick={submit}>
            {working
            ? t('common.loading')
            : identity === 'pin'
                ? t('people.invite.ctaPin')
                : t('people.invite.ctaEmail')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>);
}
