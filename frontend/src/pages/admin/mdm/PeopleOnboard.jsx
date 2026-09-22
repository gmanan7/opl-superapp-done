import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, Download, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { api } from '../../../lib/api';
import { downloadPeopleTemplate, parsePeopleFile, downloadCredentials } from '../../../lib/peopleExcel';

const NONE = '__none__';

export function usePeopleMeta(enabled = true) {
  return useQuery({ queryKey: ['people', 'meta'], queryFn: api.peopleMeta, enabled, staleTime: 60_000 });
}

// Shows temporary passwords once, with copy / download.
export function CredentialsDialog({ open, onOpenChange, results, title = 'Temporary passwords' }) {
  const rows = results || [];
  const copyAll = async () => {
    const text = rows.map((r) => `${r.resolved.emp_id}\t${r.resolved.name}\t${r.temp_password}`).join('\n');
    try { await navigator.clipboard.writeText(text); toast.success('Copied'); } catch { toast.error('Could not copy'); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-[560px] overflow-y-auto bg-surface-raised">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <p className="text-sm text-ink-muted">These passwords are shown <strong>only now</strong> and cannot be looked up later. Share them with each person securely, then close this window. (A forgotten password can be reset from the People page.)</p>
        <div className="max-h-72 overflow-y-auto rounded border border-line-subtle">
          <table className="w-full text-sm">
            <thead><tr className="bg-surface-sunken text-left text-xs uppercase text-ink-muted"><th className="px-2 py-1">Emp ID</th><th className="px-2 py-1">Name</th><th className="px-2 py-1">Password</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.resolved.emp_id} className="border-t border-line-subtle">
                  <td className="px-2 py-1 font-mono">{r.resolved.emp_id}</td>
                  <td className="px-2 py-1">{r.resolved.name}</td>
                  <td className="px-2 py-1 font-mono font-semibold">{r.temp_password}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={copyAll}><Copy size={14} className="mr-1" /> Copy</Button>
          <Button variant="outline" onClick={() => downloadCredentials(rows)}><Download size={14} className="mr-1" /> Download Excel</Button>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const emptyForm = { emp_id: '', name: '', email: '', role: '', plant: '', department: '', module: '', jh_group: '' };

export function PeopleOnboard({ open, onOpenChange }) {
  const qc = useQueryClient();
  const meta = usePeopleMeta(open);
  const [tab, setTab] = useState('one');
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [formErrors, setFormErrors] = useState([]);
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState(null);   // { rows, errors }
  const [preview, setPreview] = useState(null); // server dry-run response
  const [created, setCreated] = useState(null); // results with temp passwords

  const m = meta.data;
  const plants = m?.plants ?? [];
  const jhForPlant = useMemo(() => {
    const f = plants.find((p) => p.code === form.plant);
    return (m?.jhGroups ?? []).filter((g) => !f || g.factory_id === f.id);
  }, [m, plants, form.plant]);

  function reset() {
    setTab('one'); setForm(emptyForm); setFormErrors([]); setFileName(''); setParsed(null); setPreview(null); setBusy(false);
  }
  function close(o) { if (!busy) { onOpenChange(o); if (!o) reset(); } }
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v === NONE ? '' : v }));
  const finish = (results) => { qc.invalidateQueries({ queryKey: ['people'] }); qc.invalidateQueries({ queryKey: ['mdm'] }); onOpenChange(false); reset(); setCreated(results); };

  const oneValid = form.emp_id.trim() && form.name.trim() && form.email.trim() && form.role && form.plant && form.department && form.module && form.jh_group;
  async function submitOne() {
    setBusy(true); setFormErrors([]);
    const row = { ...form };
    try {
      const res = await api.peopleOnboard([row]);
      toast.success(`${row.name} onboarded`);
      finish(res.results);
    } catch (e) {
      setFormErrors([e.message]);
    } finally { setBusy(false); }
  }
  // The server returns per-row problems with a 400; surface them as text.
  async function submitOneWithDetails() {
    setBusy(true); setFormErrors([]);
    const row = { ...form };
    try {
      const dry = await api.peopleOnboard([row], true);
      if (!dry.all_ok) { setFormErrors(dry.results[0].errors); setBusy(false); return; }
    } catch (e) { setFormErrors([e.message]); setBusy(false); return; }
    setBusy(false);
    await submitOne();
  }

  async function pickFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setFileName(file.name); setPreview(null); setParsed(null); setBusy(true);
    try {
      const p = await parsePeopleFile(file);
      setParsed(p);
      if (p.errors.length === 0) setPreview(await api.peopleOnboard(p.rows, true));
    } catch (err) {
      setParsed({ rows: [], errors: [err?.message || 'Could not read that file. Please upload the .xlsx you downloaded.'] });
    } finally { setBusy(false); }
  }
  async function submitImport() {
    setBusy(true);
    try {
      const res = await api.peopleOnboard(parsed.rows);
      toast.success(`${res.count} people onboarded`);
      finish(res.results);
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }
  const okCount = preview?.results?.filter((r) => r.ok).length ?? 0;
  const badCount = preview ? preview.results.length - okCount : 0;

  return (
    <>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="max-h-[90dvh] max-w-[760px] overflow-y-auto bg-surface-raised">
          <DialogHeader><DialogTitle className="text-2xl font-semibold text-ink-strong">Onboard people</DialogTitle></DialogHeader>

          <div className="flex gap-2">
            {[{ v: 'one', l: 'Add one person' }, { v: 'excel', l: 'Import from Excel' }].map((o) => (
              <button key={o.v} type="button" onClick={() => setTab(o.v)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${tab === o.v ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600'}`}>{o.l}</button>
            ))}
          </div>

          {meta.isLoading && <p className="text-sm text-ink-muted">Loading…</p>}
          {meta.error && <p className="text-sm text-danger-fg">{meta.error.message}</p>}

          {m && tab === 'one' && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm text-ink-muted">Employee ID *
                  <Input className="mt-1 font-mono" value={form.emp_id} maxLength={30} onChange={(e) => set('emp_id')(e.target.value)} />
                </label>
                <label className="block text-sm text-ink-muted">Name *
                  <Input className="mt-1" value={form.name} maxLength={120} onChange={(e) => set('name')(e.target.value)} />
                </label>
                <label className="block text-sm text-ink-muted">Email *
                  <Input className="mt-1" type="email" value={form.email} maxLength={120} onChange={(e) => set('email')(e.target.value)} />
                </label>
                <label className="block text-sm text-ink-muted">Role *
                  <Select value={form.role || undefined} onValueChange={set('role')}>
                    <SelectTrigger className="mt-1 w-full"><SelectValue placeholder="Select role" /></SelectTrigger>
                    <SelectContent>{m.roles.map((r) => <SelectItem key={r.code} value={r.code}>{r.name}</SelectItem>)}</SelectContent>
                  </Select>
                </label>
                <label className="block text-sm text-ink-muted">Plant *
                  <Select value={form.plant || undefined} onValueChange={(v) => setForm((f) => ({ ...f, plant: v, jh_group: '' }))}>
                    <SelectTrigger className="mt-1 w-full"><SelectValue placeholder="Select plant" /></SelectTrigger>
                    <SelectContent>{plants.map((p) => <SelectItem key={p.id} value={p.code}>{p.code}</SelectItem>)}</SelectContent>
                  </Select>
                </label>
                <label className="block text-sm text-ink-muted">Department *
                  <Select value={form.department || undefined} onValueChange={set('department')}>
                    <SelectTrigger className="mt-1 w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      
                      {[...new Set(m.departments.map((d) => d.name))].map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </label>
                <label className="block text-sm text-ink-muted">Module *
                  <Select value={form.module || undefined} onValueChange={set('module')}>
                    <SelectTrigger className="mt-1 w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      
                      {m.modules.map((x) => <SelectItem key={x.id} value={x.name}>{x.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </label>
                <label className="block text-sm text-ink-muted">JH Group *
                  <Select value={form.jh_group || undefined} onValueChange={set('jh_group')}>
                    <SelectTrigger className="mt-1 w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      
                      {jhForPlant.map((g) => <SelectItem key={g.id} value={g.name}>{g.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </label>
              </div>
              <p className="text-xs text-ink-subtle">A temporary password is generated for the person and shown once after you save.</p>
              {formErrors.map((er, i) => <p key={i} role="alert" className="text-sm text-danger-fg">{er}</p>)}
              <DialogFooter>
                <Button variant="outline" disabled={busy} onClick={() => close(false)}>Cancel</Button>
                <Button disabled={!oneValid || busy} onClick={submitOneWithDetails}>{busy ? 'Saving…' : 'Onboard person'}</Button>
              </DialogFooter>
            </div>
          )}

          {m && tab === 'excel' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => downloadPeopleTemplate(m)}><Download size={14} className="mr-1" /> 1. Download template</Button>
                <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent">
                  <Upload size={14} /> 2. Upload filled sheet
                  <input type="file" accept=".xlsx,.xls" className="hidden" onChange={pickFile} disabled={busy} />
                </label>
              </div>
              {busy && <p className="text-sm text-ink-muted">Checking…</p>}
              {parsed?.errors?.map((er, i) => <p key={i} className="text-sm font-medium text-danger-fg">{er}</p>)}
              {preview && (
                <div className="space-y-2">
                  <p className="text-sm text-ink">
                    Preview of <strong>{fileName}</strong>: {okCount} ready{badCount > 0 && <>, <span className="font-semibold text-danger-fg">{badCount} with problems</span></>}
                  </p>
                  <div className="max-h-72 overflow-auto rounded border border-line-subtle">
                    <table className="w-full text-xs">
                      <thead><tr className="sticky top-0 bg-surface-sunken text-left uppercase text-ink-muted">
                        {['Row', 'Emp ID', 'Name', 'Role', 'Plant', 'Department', 'Module', 'JH Group', 'Status'].map((h) => <th key={h} className="px-2 py-1">{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {preview.results.map((r) => (
                          <tr key={r.line} className={`border-t border-line-subtle align-top ${r.ok ? '' : 'bg-rose-50'}`}>
                            <td className="px-2 py-1 text-ink-subtle">{r.line}</td>
                            <td className="px-2 py-1 font-mono">{r.resolved.emp_id || '—'}</td>
                            <td className="px-2 py-1">{r.resolved.name || '—'}</td>
                            <td className="px-2 py-1">{r.resolved.role_name || '—'}</td>
                            <td className="px-2 py-1">{r.resolved.plant_code || '—'}</td>
                            <td className="px-2 py-1">{r.resolved.department_name || '—'}</td>
                            <td className="px-2 py-1">{r.resolved.module_name || '—'}</td>
                            <td className="px-2 py-1">{r.resolved.jh_group_name || '—'}</td>
                            <td className="px-2 py-1">{r.ok ? <span className="font-semibold text-emerald-700">Ready</span> : <span className="font-medium text-danger-fg">{r.errors.join('; ')}</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {badCount > 0 && <p className="text-xs text-ink-subtle">Nothing is created until every row is fine. Fix the highlighted rows in your sheet and upload it again.</p>}
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" disabled={busy} onClick={() => close(false)}>Cancel</Button>
                <Button disabled={!preview || badCount > 0 || okCount === 0 || busy} onClick={submitImport}>
                  {busy ? 'Working…' : `Onboard ${okCount || ''} ${okCount === 1 ? 'person' : 'people'}`}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <CredentialsDialog open={created !== null} onOpenChange={(o) => !o && setCreated(null)} results={created} title="People onboarded — temporary passwords" />
    </>
  );
}
