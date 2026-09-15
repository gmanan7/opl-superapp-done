import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useResetWorkerPassword } from '@/hooks/mdm';
// Email-identity password reset, migrated from the retired /admin/users Leaders tab.
// Admin-only at the UI here; the backend endpoint is admin-only + same-factory
// regardless (the real gate). Min-8 + confirm is the client-side complexity check.
export function PeoplePasswordReset({ worker, onOpenChange, }) {
    const { t } = useTranslation();
    const reset = useResetWorkerPassword();
    const [pw, setPw] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState('');
    useEffect(() => {
        if (worker) {
            setPw('');
            setConfirm('');
            setError('');
        }
    }, [worker]);
    function submit() {
        if (pw.length < 8) {
            setError(t('people.passwordReset.lengthError'));
            return;
        }
        if (pw !== confirm) {
            setError(t('people.passwordReset.matchError'));
            return;
        }
        if (!worker)
            return;
        reset.mutate({ workerId: worker.id, newPassword: pw }, {
            onSuccess: () => { toast.success(t('people.passwordReset.success')); onOpenChange(false); },
            onError: (e) => setError(e instanceof Error ? e.message : t('mdm.errors.unknown')),
        });
    }
    return (<Dialog open={worker !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-ink-strong">{t('people.passwordReset.title')}</DialogTitle>
          <DialogDescription className="text-ink-muted">{worker?.name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Input type="password" autoComplete="new-password" placeholder={t('people.passwordReset.newPassword')} aria-label={t('people.passwordReset.newPassword')} value={pw} onChange={(e) => setPw(e.target.value)}/>
          <Input type="password" autoComplete="new-password" placeholder={t('people.passwordReset.confirmPassword')} aria-label={t('people.passwordReset.confirmPassword')} value={confirm} onChange={(e) => setConfirm(e.target.value)}/>
          {error && <p className="text-sm text-danger-fg">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button onClick={submit} disabled={reset.isPending}>
            {reset.isPending ? t('common.submitting') : t('people.passwordReset.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>);
}
