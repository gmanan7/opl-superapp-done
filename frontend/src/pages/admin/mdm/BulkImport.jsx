// BulkImport — Step 8 (MDM_SPEC §5a, D-014): admin-only bulk CREATE flow for
// workers and machines. Four steps: Template & Upload → Preview → Confirm
// (modal) → Result. Create-only; error rows never commit.
//
// PINs (workers): shown once on the result step with per-row Copy; the
// explicit "I've distributed all PINs" button calls acknowledge_pins (audited)
// and wipes them from memory. Nothing recoverable remains (D-021).
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Copy, Download, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, } from '@/components/ui/table';
import { StatusBadge, ConfirmModal, EmptyState } from '@/components/patterns';
import { useOrgStructure } from '@/hooks/mdm';
import { templateFor, parseUpload, previewFile, commitRows, acknowledgePins, abandonBatch, downloadTemplate, downloadErrorRows, referenceRows, BulkImportError, } from '../../../lib/bulkImport';
const TIER_BADGE = {
    ok: 'success',
    warning: 'warning',
    error: 'danger',
};
export function BulkImport({ entity }) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const org = useOrgStructure();
    const template = templateFor(entity);
    const [step, setStep] = useState('upload');
    const [busy, setBusy] = useState(false);
    const [upload, setUpload] = useState(null);
    const [preview, setPreview] = useState(null);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [result, setResult] = useState(null);
    const [pinsCleared, setPinsCleared] = useState(false);
    const fileRef = useRef(null);
    const describeIssue = (issue) => t(`mdmImport.codes.${issue.code}`, { defaultValue: issue.code }) +
        (issue.field && issue.field !== '_file' ? ` (${t(`mdmImport.columns.${issue.field}`, { defaultValue: issue.field })})` : '');
    const commitable = preview ? preview.totals.valid + preview.totals.warning : 0;
    // Preview-order data for the commit call: non-error rows only, in order.
    const commitPayloadRows = useMemo(() => {
        if (!upload || !preview)
            return [];
        const errorNumbers = new Set(preview.rows.filter((r) => r.tier === 'error').map((r) => r.row_number));
        return upload.rows.filter((r) => !errorNumbers.has(r.row_number));
    }, [upload, preview]);
    async function handleFile(file) {
        setBusy(true);
        try {
            const parsed = await parseUpload(file, entity);
            const res = await previewFile(entity, parsed.filename, parsed.format, parsed.fileB64);
            setUpload(parsed);
            setPreview(res);
            setStep('preview');
            if (res.ignored_headers.length > 0) {
                toast.warning(t('mdmImport.upload.ignoredHeaders', { headers: res.ignored_headers.join(', ') }));
            }
        }
        catch (e) {
            const code = e instanceof BulkImportError ? e.code : 'internal_error';
            toast.error(t(`mdmImport.fileErrors.${code}`, { defaultValue: t('mdmImport.fileErrors.internal_error') }));
        }
        finally {
            setBusy(false);
            if (fileRef.current)
                fileRef.current.value = '';
        }
    }
    async function handleCommit() {
        if (!preview || !upload)
            return;
        setBusy(true);
        try {
            const res = await commitRows(entity, preview.batch_id, commitPayloadRows.map((r) => r.data));
            setResult(res);
            setStep('result');
            setConfirmOpen(false);
        }
        catch {
            toast.error(t('mdmImport.fileErrors.internal_error'));
        }
        finally {
            setBusy(false);
        }
    }
    async function handleAbandon() {
        if (preview) {
            try {
                await abandonBatch(preview.batch_id);
            }
            catch { /* batch expires server-side either way */ }
        }
        setUpload(null);
        setPreview(null);
        setStep('upload');
    }
    async function handleClearPins() {
        if (!result)
            return;
        setBusy(true);
        try {
            await acknowledgePins(result.batch_id);
            // Wipe PINs from memory — the only remaining copy is whatever the admin
            // distributed. This is the D-021 one-shot contract, bulk edition.
            setResult({ ...result, created: result.created.map(({ pin: _pin, ...rest }) => rest) });
            setPinsCleared(true);
            toast.success(t('mdmImport.result.pinsCleared'));
        }
        catch {
            toast.error(t('mdmImport.fileErrors.internal_error'));
        }
        finally {
            setBusy(false);
        }
    }
    const hasPins = !!result?.created.some((c) => c.pin);
    // Commit-response row_number indexes commitPayloadRows; translate back to
    // the preview row numbers the admin saw.
    const previewNumberOf = (commitRowNumber) => commitPayloadRows[commitRowNumber - 1]?.row_number ?? commitRowNumber;
    const steps = [
        { key: 'upload', label: t('mdmImport.steps.upload') },
        { key: 'preview', label: t('mdmImport.steps.preview') },
        { key: 'result', label: t('mdmImport.steps.result') },
    ];
    const stepIndex = steps.findIndex((s) => s.key === step);
    return (<div className="mx-auto max-w-5xl px-gutter py-6 lg:px-gutter-lg">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-strong">
            {t(`mdmImport.title.${entity}`)}
          </h1>
          <p className="text-sm text-ink-muted">{t('mdmImport.subtitle')}</p>
        </div>
        <Button variant="ghost" onClick={() => navigate(-1)}>{t('common.back', { defaultValue: '← Back' })}</Button>
      </div>

      {/* Stepper strip — composed from tokens (no PATTERNS Stepper yet; v1.2 candidate) */}
      <ol className="mb-6 flex items-center gap-2" aria-label={t('mdmImport.steps.label')}>
        {steps.map((s, i) => (<li key={s.key} className="flex items-center gap-2">
            <span className={'flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium ' +
                (i < stepIndex
                    ? 'bg-success-bg text-success-fg'
                    : i === stepIndex
                        ? 'bg-brand text-white'
                        : 'bg-surface-sunken text-ink-muted')} aria-current={i === stepIndex ? 'step' : undefined}>
              {i + 1}
            </span>
            <span className={'text-sm ' + (i === stepIndex ? 'font-medium text-ink-strong' : 'text-ink-muted')}>
              {s.label}
            </span>
            {i < steps.length - 1 && <span className="mx-1 text-ink-subtle">—</span>}
          </li>))}
      </ol>

      {step === 'upload' && (<div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="rounded-lg border border-line bg-surface-raised p-6">
            <h2 className="mb-2 text-lg font-medium text-ink-strong">{t('mdmImport.upload.title')}</h2>
            <p className="mb-4 text-sm text-ink-muted">{t('mdmImport.upload.body', { max: 500 })}</p>
            <div className="mb-6 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => downloadTemplate(entity, 'xlsx', org.data)}>
                <Download size={16} aria-hidden/> {t('mdmImport.upload.templateXlsx')}
              </Button>
              <Button variant="secondary" onClick={() => downloadTemplate(entity, 'csv', org.data)}>
                <Download size={16} aria-hidden/> {t('mdmImport.upload.templateCsv')}
              </Button>
            </div>
            <input ref={fileRef} type="file" accept=".csv,.xlsx" className="hidden" data-testid="import-file-input" onChange={(e) => {
                const f = e.target.files?.[0];
                if (f)
                    void handleFile(f);
            }}/>
            <Button onClick={() => fileRef.current?.click()} disabled={busy}>
              <Upload size={16} aria-hidden/>
              {busy ? t('mdmImport.upload.checking') : t('mdmImport.upload.choose')}
            </Button>
            <p className="mt-3 text-xs text-ink-muted">{t('mdmImport.upload.rules')}</p>
          </div>

          {/* Reference side panel — same data as the XLSX sidecar sheet */}
          <aside className="rounded-lg border border-line bg-surface-raised p-4">
            <h3 className="mb-2 text-sm font-medium uppercase tracking-wide text-ink-muted">
              {t('mdmImport.upload.referenceTitle')}
            </h3>
            {org.data ? (<div className="max-h-96 overflow-y-auto font-mono text-xs leading-5 text-ink">
                {referenceRows(entity, org.data).map((r, i) => (<div key={i} className={r.length <= 1 && r[0] ? 'mt-2 font-semibold text-ink-strong' : ''}>
                    {r.join(' · ') || ' '}
                  </div>))}
              </div>) : (<p className="text-sm text-ink-muted">{t('mdmImport.upload.referenceLoading')}</p>)}
          </aside>
        </div>)}

      {step === 'preview' && preview && upload && (<div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status="success" size="sm" label={t('mdmImport.preview.okCount', { count: preview.totals.valid })}/>
              <StatusBadge status="warning" size="sm" label={t('mdmImport.preview.warningCount', { count: preview.totals.warning })}/>
              <StatusBadge status="danger" size="sm" label={t('mdmImport.preview.errorCount', { count: preview.totals.invalid })}/>
              <span className="text-sm text-ink-muted">
                {t('mdmImport.preview.fileLine', { name: upload.filename, total: preview.totals.total })}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {preview.totals.invalid > 0 && (<Button variant="secondary" onClick={() => downloadErrorRows(entity, upload, preview, describeIssue)}>
                  <Download size={16} aria-hidden/> {t('mdmImport.preview.downloadErrors')}
                </Button>)}
              <Button variant="ghost" onClick={() => void handleAbandon()}>{t('mdmImport.preview.discard')}</Button>
              <Button disabled={commitable === 0 || busy} onClick={() => setConfirmOpen(true)}>
                {t('mdmImport.preview.commit', { count: commitable })}
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-line">
            <Table>
              <TableHeader>
                <TableRow className="bg-surface-sunken">
                  <TableHead className="w-12">#</TableHead>
                  {template.columns.slice(0, 5).map((c) => (<TableHead key={c}>{t(`mdmImport.columns.${c}`, { defaultValue: c })}</TableHead>))}
                  <TableHead>{t('mdmImport.preview.statusCol')}</TableHead>
                  <TableHead>{t('mdmImport.preview.issuesCol')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.rows.map((row) => {
                const data = upload.rows.find((r) => r.row_number === row.row_number)?.data ?? {};
                return (<TableRow key={row.row_number} data-testid={`preview-row-${row.row_number}`}>
                      <TableCell className="font-mono text-xs text-ink-muted">{row.row_number}</TableCell>
                      {template.columns.slice(0, 5).map((c) => (<TableCell key={c} className="max-w-48 break-words">{data[c] ?? ''}</TableCell>))}
                      <TableCell>
                        <StatusBadge status={TIER_BADGE[row.tier]} size="sm" label={t(`mdmImport.tiers.${row.tier}`)}/>
                      </TableCell>
                      <TableCell className="max-w-72 text-xs text-ink-muted">
                        {row.codes.map(describeIssue).join('; ')}
                      </TableCell>
                    </TableRow>);
            })}
              </TableBody>
            </Table>
          </div>

          <ConfirmModal open={confirmOpen} onOpenChange={setConfirmOpen} severity="caution" title={t('mdmImport.confirm.title', { count: commitable })} description={t('mdmImport.confirm.body', { errors: preview.totals.invalid })} consequenceList={[t('mdmImport.confirm.logged'), t('mdmImport.confirm.createOnly')]} primaryLabel={t('mdmImport.confirm.primary', { count: commitable })} primaryDisabled={commitable === 0} isWorking={busy} onConfirm={() => void handleCommit()}/>
        </div>)}

      {step === 'result' && result && (<div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <StatusBadge status="success" label={t('mdmImport.result.committed', { count: result.committed_count })}/>
            {result.stale_count > 0 && (<StatusBadge status="warning" label={t('mdmImport.result.stale', { count: result.stale_count })}/>)}
            {result.discrepancy_count > 0 && (<StatusBadge status="danger" label={t('mdmImport.result.discrepancy', { count: result.discrepancy_count })}/>)}
          </div>

          {hasPins && !pinsCleared && (<div className="mb-4 rounded-lg border border-warning-fg/30 bg-warning-bg p-4">
              <p className="mb-3 text-sm font-medium text-warning-fg">{t('mdmImport.result.pinNotice')}</p>
              <Button onClick={() => void handleClearPins()} disabled={busy}>
                {t('mdmImport.result.clearPins')}
              </Button>
            </div>)}

          {result.created.length > 0 ? (<div className="mb-6 overflow-x-auto rounded-lg border border-line">
              <Table>
                <TableHeader>
                  <TableRow className="bg-surface-sunken">
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>{t('mdmImport.result.rowCol')}</TableHead>
                    {entity === 'workers' && <TableHead>{t('mdmImport.result.pinCol')}</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.created.map((c) => {
                    const n = previewNumberOf(c.row_number);
                    const data = upload?.rows.find((r) => r.row_number === n)?.data;
                    return (<TableRow key={c.entity_id} data-testid={`created-row-${n}`}>
                        <TableCell className="font-mono text-xs text-ink-muted">{n}</TableCell>
                        <TableCell>{data?.name ?? c.entity_id}</TableCell>
                        {entity === 'workers' && (<TableCell>
                            {c.pin ? (<span className="inline-flex items-center gap-2">
                                <span className="font-mono text-lg font-bold tabular-nums tracking-widest">{c.pin}</span>
                                <Button variant="ghost" size="sm" aria-label={t('mdmImport.result.copyPin', { name: data?.name ?? '' })} onClick={() => {
                                    void navigator.clipboard.writeText(c.pin ?? '');
                                    toast.success(t('mdmImport.result.pinCopied'));
                                }}>
                                  <Copy size={14} aria-hidden/>
                                </Button>
                              </span>) : (<span className="text-sm text-ink-muted">
                                {pinsCleared && hasPinRole(data) ? t('mdmImport.result.pinClearedCell') : '—'}
                              </span>)}
                          </TableCell>)}
                      </TableRow>);
                })}
                </TableBody>
              </Table>
            </div>) : (<EmptyState title={t('mdmImport.result.nothingCreated')} body={t('mdmImport.result.nothingCreatedBody')}/>)}

          {result.skipped.length > 0 && (<div className="mb-6">
              <h3 className="mb-2 text-sm font-medium uppercase tracking-wide text-ink-muted">
                {t('mdmImport.result.skippedTitle')}
              </h3>
              <ul className="space-y-1 text-sm text-ink-muted">
                {result.skipped.map((s, i) => (<li key={i} data-testid={`skipped-row-${s.row_number}`}>
                    {t('mdmImport.result.skippedLine', {
                        row: previewNumberOf(s.row_number),
                        reason: t(`mdmImport.codes.${s.reason}`),
                        detail: s.detail ? t(`mdmImport.codes.${s.detail}`, { defaultValue: s.detail }) : '',
                    })}
                  </li>))}
              </ul>
            </div>)}

          <Button variant="secondary" disabled={hasPins && !pinsCleared} onClick={() => navigate(entity === 'workers' ? '/admin/mdm/people' : '/admin/mdm/machines')}>
            {t('mdmImport.result.done')}
          </Button>
          {hasPins && !pinsCleared && (<p className="mt-2 text-xs text-ink-muted">{t('mdmImport.result.doneBlocked')}</p>)}
        </div>)}
    </div>);
}
function hasPinRole(data) {
    const role = (data?.role ?? '').toLowerCase();
    return role === 'apprentice' || role === 'on_roll';
}
