import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
function ymd(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDays(d, n) {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
}
export function DateStepper({ value, onChange, min, max, subCaption }) {
    const { t } = useTranslation();
    const upper = max ?? new Date();
    const atMax = ymd(value) >= ymd(upper);
    const atMin = min ? ymd(value) <= ymd(min) : false;
    const label = value.toLocaleDateString('en-IN', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
    const stepBtn = 'flex h-touch w-touch shrink-0 items-center justify-center rounded-md text-ink-muted ' +
        'hover:bg-surface-hover disabled:opacity-40 disabled:hover:bg-transparent';
    return (<div className="rounded-md border border-line bg-surface-raised px-2 py-1.5">
      <div className="flex items-center justify-between gap-1">
        <button type="button" aria-label={t('common.prevDay')} disabled={atMin} onClick={() => onChange(addDays(value, -1))} className={stepBtn}>
          <ChevronLeft size={22}/>
        </button>

        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-lg font-medium tabular-nums lining-nums text-ink-strong">{label}</p>
        </div>

        <button type="button" aria-label={t('common.nextDay')} disabled={atMax} onClick={() => onChange(addDays(value, 1))} className={stepBtn}>
          <ChevronRight size={22}/>
        </button>

        <label className={cn(stepBtn, 'relative cursor-pointer')} aria-label={t('common.pickDate')}>
          <Calendar size={20}/>
          <input type="date" value={ymd(value)} min={min ? ymd(min) : undefined} max={ymd(upper)} onChange={(e) => {
            if (!e.target.value)
                return;
            onChange(new Date(e.target.value + 'T00:00:00'));
        }} className="absolute inset-0 cursor-pointer opacity-0"/>
        </label>
      </div>

      {subCaption && <div className="pb-0.5 text-center text-sm text-ink-muted">{subCaption}</div>}
    </div>);
}
