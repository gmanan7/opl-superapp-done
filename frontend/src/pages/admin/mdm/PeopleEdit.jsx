import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { api } from '../../../lib/api';
import { usePeopleMeta } from './PeopleOnboard';

const NONE = '__none__';

export function PeopleEdit({ person, onOpenChange, isSelf }) {
  const qc = useQueryClient();
  const open = person !== null;
  const meta = usePeopleMeta(open);
  const [f, setF] = useState({ name: '', email: '', role: '', department_id: '', module_id: '', jh_group_id: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (person) {
      setF({
        name: person.name || '', email: person.email || '', role: person.role || '',
        department_id: person.department_id || '', module_id: person.module_id || '', jh_group_id: person.jh_group_id || '',
      });
      setError('');
    }
  }, [person]);

  const m = meta.data;
  const plantId = useMemo(() => m?.plants?.find((p) => p.code === person?.default_plant)?.id, [m, person]);
  const jhGroups = (m?.jhGroups ?? []).filter((g) => !plantId || g.factory_id === plantId);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v === NONE ? '' : v }));

  async function save() {
    setBusy(true); setError('');
    try {
      const body = { name: f.name, email: f.email, department_id: f.department_id, module_id: f.module_id, jh_group_id: f.jh_group_id };
      if (!isSelf) body.role = f.role;
      await api.peopleUpdate(person.emp_id, body);
      toast.success('Saved');
      qc.invalidateQueries({ queryKey: ['mdm'] });
      qc.invalidateQueries({ queryKey: ['people'] });
      onOpenChange(false);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[90dvh] max-w-[560px] overflow-y-auto bg-surface-raised">
        <DialogHeader><DialogTitle className="text-2xl font-semibold text-ink-strong">Edit person</DialogTitle></DialogHeader>
        {person && (
          <div className="space-y-3">
            <p className="text-sm text-ink-muted">Employee ID <span className="font-mono font-semibold text-ink">{person.emp_id}</span> · Plant <span className="font-semibold text-ink">{person.default_plant || '—'}</span> (cannot be changed here)</p>
            <label className="block text-sm text-ink-muted">Name *
              <Input className="mt-1" value={f.name} maxLength={120} onChange={(e) => set('name')(e.target.value)} />
            </label>
            <label className="block text-sm text-ink-muted">Email *
              <Input className="mt-1" type="email" value={f.email} maxLength={120} onChange={(e) => set('email')(e.target.value)} />
            </label>
            <label className="block text-sm text-ink-muted">Role {isSelf && <span className="text-2xs text-ink-subtle">(you cannot change your own role)</span>}
              <Select value={f.role || undefined} onValueChange={set('role')} disabled={isSelf || !m}>
                <SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{(m?.roles ?? []).map((r) => <SelectItem key={r.code} value={r.code}>{r.name}</SelectItem>)}</SelectContent>
              </Select>
            </label>
            <label className="block text-sm text-ink-muted">Department *
              <Select value={f.department_id || undefined} onValueChange={set('department_id')} disabled={!m}>
                <SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  
                  {(m?.departments ?? []).map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
            <label className="block text-sm text-ink-muted">Module *
              <Select value={f.module_id || undefined} onValueChange={set('module_id')} disabled={!m}>
                <SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  
                  {(m?.modules ?? []).map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
            <label className="block text-sm text-ink-muted">JH Group *
              <Select value={f.jh_group_id || undefined} onValueChange={set('jh_group_id')} disabled={!m}>
                <SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  
                  {jhGroups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
            {error && <p role="alert" className="text-sm text-danger-fg">{error}</p>}
            <DialogFooter>
              <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button disabled={busy || !f.name.trim() || !f.email.trim() || !f.department_id || !f.module_id || !f.jh_group_id} onClick={save}>{busy ? 'Saving…' : 'Save'}</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
