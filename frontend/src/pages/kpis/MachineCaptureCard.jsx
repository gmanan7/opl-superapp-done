// One machine's capture card (FIX 2): MachineContextHeader + entered/not-entered
// status as the card header, a KpiCaptureRow stack as the body, a per-machine
// "Save N KPIs" as the (sticky) footer. Owns its own values/notes/save state +
// localStorage crash-buffer keyed by {group, target, date}; the parent remounts it
// (key = target+date) so a date/target change re-seeds cleanly. Scales to any KPI
// count (FIX 3) — the page scrolls; the footer stays reachable via MachineCard.
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { MachineCard, MachineContextHeader, KpiCaptureRow, StatusBadge, ErrorState } from '@/components/patterns';
import { useUpsertKpiEntry, resolveKpiName, } from '../../hooks/useKPIs';
function rowError(v, t) {
    if (!v || v.trim() === '')
        return null;
    const n = parseFloat(v);
    if (Number.isNaN(n))
        return t('kpi.invalidNumber');
    if (n < 0)
        return t('kpi.noNegative');
    return null;
}
export function MachineCaptureCard({ target, defs, entry, date, dateStr, groupId, lang, entered, }) {
    const { t } = useTranslation();
    const upsert = useUpsertKpiEntry();
    const draftKey = `fulcrum.kpi.draft.${groupId}.${target.id}.${dateStr}`;
    const editedRef = useRef(false);
    const [saveFailed, setSaveFailed] = useState(false);
    const [seed] = useState(() => {
        const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(draftKey) : null;
        if (raw) {
            try {
                const d = JSON.parse(raw);
                return { values: d.values ?? {}, notes: d.notes ?? {}, restored: true };
            }
            catch { /* fall through */ }
        }
        const base = {};
        for (const [k, v] of Object.entries(entry?.kpi_values ?? {}))
            base[k] = String(v);
        return { values: base, notes: {}, restored: false };
    });
    const [values, setValues] = useState(seed.values);
    const [notes, setNotes] = useState(seed.notes);
    const [restored, setRestored] = useState(seed.restored);
    useEffect(() => {
        if (editedRef.current && typeof localStorage !== 'undefined') {
            localStorage.setItem(draftKey, JSON.stringify({ values, notes }));
        }
    }, [values, notes, draftKey]);
    function onValue(key, v) { editedRef.current = true; setValues((p) => ({ ...p, [key]: v })); }
    function onNote(key, v) { editedRef.current = true; setNotes((p) => ({ ...p, [key]: v })); }
    const enteredCount = defs.filter((d) => (values[d.kpi_key] ?? '').trim() !== '').length;
    const anyError = defs.some((d) => rowError(values[d.kpi_key] ?? '', t) !== null);
    const canSave = enteredCount > 0 && !anyError && !upsert.isPending;
    async function save() {
        const numeric = {};
        for (const d of defs) {
            const s = values[d.kpi_key];
            if (s && s.trim() !== '')
                numeric[d.kpi_key] = parseFloat(s);
        }
        const noteLines = defs
            .filter((d) => (notes[d.kpi_key] ?? '').trim() !== '')
            .map((d) => `${resolveKpiName(d, lang)}: ${notes[d.kpi_key].trim()}`);
        try {
            setSaveFailed(false);
            await upsert.mutateAsync({
                jhGroupId: groupId, machineId: target.machineId, date: dateStr,
                values: numeric, notes: noteLines.length ? noteLines.join('\n') : null,
            });
            if (typeof localStorage !== 'undefined')
                localStorage.removeItem(draftKey);
            editedRef.current = false;
            setRestored(false);
            toast.success(t('kpi.savedToast', {
                count: Object.keys(numeric).length,
                name: target.name,
                date: date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }),
            }));
        }
        catch {
            setSaveFailed(true);
        }
    }
    const meta = [
        target.kind === 'jh' ? t('kpi.jhOverview') : target.type,
        t('kpi.kpiCount', { count: defs.length }),
    ].filter(Boolean).join(' · ');
    const header = (<MachineContextHeader name={target.name} path={target.path} meta={meta} trailing={<StatusBadge status={entered ? 'success' : 'neutral'} label={entered ? t('kpi.entered') : t('kpi.notEntered')}/>}/>);
    const saveLabel = upsert.isPending
        ? t('kpi.saving')
        : enteredCount > 0 ? t('kpi.saveCount', { count: enteredCount }) : t('kpi.enterAtLeastOne');
    const footer = (<div>
      <Button onClick={save} disabled={!canSave} className="h-touch-lg w-full text-base">{saveLabel}</Button>
      {anyError && <p className="mt-1.5 text-center text-sm text-ink-muted">{t('kpi.fixErrors')}</p>}
    </div>);
    return (<MachineCard header={header} footer={footer}>
      {saveFailed ? (<div className="py-4"><ErrorState title={t('kpi.couldntSave')} onRetry={save}/></div>) : (<>
          {restored && (<div className="mt-3 flex items-center gap-2 rounded-md border border-info-border bg-info-bg px-3 py-2 text-sm text-info-fg">
              <span aria-hidden>ⓘ</span>
              <span className="flex-1">{t('kpi.restoredDraft')}</span>
              <button type="button" onClick={() => {
                    if (typeof localStorage !== 'undefined')
                        localStorage.removeItem(draftKey);
                    editedRef.current = false;
                    const base = {};
                    for (const [k, v] of Object.entries(entry?.kpi_values ?? {}))
                        base[k] = String(v);
                    setValues(base);
                    setNotes({});
                    setRestored(false);
                }} className="font-medium underline underline-offset-2">
                {t('kpi.discard')}
              </button>
            </div>)}
          {defs.map((d) => (<KpiCaptureRow key={d.id} locale={lang} kpi={{ id: d.id, name: resolveKpiName(d, lang), unit: d.unit, target: d.target_value, direction: d.direction }} value={values[d.kpi_key] ?? ''} onChange={(v) => onValue(d.kpi_key, v)} error={rowError(values[d.kpi_key] ?? '', t)} note={notes[d.kpi_key] ?? ''} onNoteChange={(v) => onNote(d.kpi_key, v)}/>))}
        </>)}
    </MachineCard>);
}
