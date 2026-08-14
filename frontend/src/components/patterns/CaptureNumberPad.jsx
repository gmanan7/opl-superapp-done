// PATTERNS §3 — CaptureNumberPad. The numeric input control for KPI capture,
// optimised faster-than-paper (Law 1). The native numeric keyboard is the primary
// path on mobile (inputmode="decimal"); the custom 10-key pad is the rare-path
// fallback (gloves / keyboard covers the row), opened by long-press on the input.
// Label · unit · target hint live on KpiCaptureRow §11; this renders only the input
// (+ optional pad). Internal store is a string so partial entry / leading zeros
// round-trip cleanly; '.' is always the decimal separator (Latin numerals, Law Q2).
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
// Accept only a valid partial decimal: optional leading '-', digits, one '.'.
function sanitize(raw) {
    let s = raw.replace(/[^0-9.-]/g, '');
    // single leading minus only
    s = s.replace(/(?!^)-/g, '');
    // collapse to a single dot
    const firstDot = s.indexOf('.');
    if (firstDot !== -1) {
        s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, '');
    }
    return s;
}
export function CaptureNumberPad({ value, onChange, ariaLabel, invalid = false, disabled = false, padOpen = false, onPadToggle, }) {
    const { t } = useTranslation();
    const longPress = useRef(null);
    function startLongPress() {
        if (!onPadToggle || disabled)
            return;
        longPress.current = setTimeout(() => onPadToggle(!padOpen), 500);
    }
    function cancelLongPress() {
        if (longPress.current)
            clearTimeout(longPress.current);
    }
    function press(key) {
        if (disabled)
            return;
        if (key === '⌫')
            return onChange(sanitize(value.slice(0, -1)));
        onChange(sanitize(value + key));
    }
    const PAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];
    return (<div>
      <input type="text" inputMode="decimal" enterKeyHint="next" aria-label={ariaLabel} aria-invalid={invalid || undefined} disabled={disabled} value={value} placeholder="—" onChange={(e) => onChange(sanitize(e.target.value))} onTouchStart={startLongPress} onTouchEnd={cancelLongPress} onTouchMove={cancelLongPress} className={cn('h-field w-full rounded-md border bg-surface-raised px-4 text-right text-data tabular-nums lining-nums text-ink-strong', 'focus:outline-none focus-visible:shadow-focus', invalid ? 'border-danger-fg' : 'border-line-strong', disabled && 'cursor-not-allowed bg-surface-sunken text-ink-subtle')}/>

      {padOpen && !disabled && (<div className="mt-2 grid grid-cols-3 gap-2" role="group" aria-label={`${ariaLabel} · ${t('common.numericKeypad')}`}>
          {PAD_KEYS.map((k) => (<button key={k} type="button" onClick={() => press(k)} className={cn('h-touch-lg rounded-md border border-line bg-surface-raised text-xl font-semibold text-ink-strong', 'transition-none active:bg-surface-hover')}>
              {k}
            </button>))}
        </div>)}
    </div>);
}
