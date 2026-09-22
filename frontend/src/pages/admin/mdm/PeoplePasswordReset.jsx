import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { api } from '../../../lib/api';
import { CredentialsDialog } from './PeopleOnboard';

// Generates a new temporary password (shown once). The old password stops working immediately.
export function PeoplePasswordReset({ person, onOpenChange }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  async function reset() {
    setBusy(true);
    try {
      const res = await api.peopleResetPassword(person.emp_id);
      setResult([{ resolved: { emp_id: person.emp_id, name: person.name }, temp_password: res.temp_password }]);
      onOpenChange(false);
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }

  return (
    <>
      <Dialog open={person !== null} onOpenChange={(o) => !busy && onOpenChange(o)}>
        <DialogContent className="max-w-[460px] bg-surface-raised">
          <DialogHeader><DialogTitle className="text-xl font-semibold text-ink-strong">Reset password</DialogTitle></DialogHeader>
          <p className="text-sm text-ink-muted">
            This gives <strong>{person?.name}</strong> a new temporary password and their current one stops working immediately. The new password is shown once.
          </p>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button disabled={busy} onClick={reset}>{busy ? 'Working…' : 'Reset password'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <CredentialsDialog open={result !== null} onOpenChange={(o) => !o && setResult(null)} results={result} title="New temporary password" />
    </>
  );
}
