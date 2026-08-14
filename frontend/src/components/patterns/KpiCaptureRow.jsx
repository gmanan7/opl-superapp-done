// PATTERNS §11 — KpiCaptureRow. One row of KPI entry: label · unit · target hint
// · numeric input (CaptureNumberPad §3) · non-blocking deviation micro-hint · an
// OPTIONAL deviation-reason note (kept per owner decision — optional + non-blocking,
// never gates save, never steals focus). Out-of-target is real data: the ▲/▼ hint
// never blocks save; only a type/validation error does (KPI_ENTRY §5).
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { deviationLevel, targetSymbol } from '@/lib/kpi';
import { CaptureNumberPad } from './CaptureNumberPad';
export function KpiCaptureRow({ kpi, locale, value, onChange, error, disabled = false, note = '', onNoteChange, }) {
    const { t } = useTranslation();
    const [padOpen, setPadOpen] = useState(false);
    const dev = disabled ? 'none' : deviationLevel(kpi.direction, kpi.target, value);
    const hasTarget = kpi.target != null;
    const devHint = dev === 'over' ? `▲ ${t('kpi.aboveTarget')}`
        : dev === 'under' ? `▼ ${t('kpi.belowTarget')}`
            : dev === 'off' ? t('kpi.offTarget')
                : null;
    return (<div className="border-b border-line-subtle py-4">
      {/* label + unit */}
      <div className="flex items-start justify-between gap-3">
        <p lang={locale} className="min-w-0 flex-1 break-words text-lg font-medium text-ink-strong">
          {kpi.name}
        </p>
        {kpi.unit && (<span className={cn('shrink-0 whitespace-nowrap text-sm font-medium text-ink-muted', kpi.unitVariant === 'code' && 'font-mono')}>
            {kpi.unit}
          </span>)}
      </div>

      {/* target hint — Latin numerals + comparison glyph, all locales (§9) */}
      {hasTarget && (<p className="mt-0.5 text-sm text-ink-muted">
          {t('kpi.target')} {targetSymbol(kpi.direction)}{' '}
          <span className="tabular-nums lining-nums">{kpi.target}</span>
        </p>)}

      {/* input */}
      <div className="mt-3">
        <CaptureNumberPad value={value} onChange={onChange} ariaLabel={[kpi.name, kpi.unit].filter(Boolean).join(', ')} invalid={!!error} disabled={disabled} padOpen={padOpen} onPadToggle={setPadOpen}/>
      </div>

      {/* validation error replaces the micro-hint; both are below the input */}
      {error ? (<p className="mt-1.5 text-sm font-medium text-danger-fg">✕ {error}</p>) : devHint ? (<p className="mt-1.5 text-sm font-medium text-warning-fg">{devHint}</p>) : null}

      {/* optional, non-blocking deviation reason — only when off-target */}
      {onNoteChange && dev !== 'none' && (<textarea value={note} onChange={(e) => onNoteChange(e.target.value)} placeholder={t('kpi.deviationReason')} rows={2} maxLength={500} disabled={disabled} className={cn('mt-2 w-full resize-none rounded-md border border-line-strong bg-surface-raised px-3 py-2 text-base text-ink', 'focus:outline-none focus-visible:shadow-focus')}/>)}
    </div>);
}
