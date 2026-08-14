// PATTERNS §1 — StatusBadge. 3-channel state: color + symbol + label, never
// color alone. There is no color-only variant in the API — it cannot be misused.
import { cn } from '@/lib/utils';
const STATUS_STYLE = {
    success: { symbol: '✓', cls: 'border-success-border bg-success-bg text-success-fg' },
    warning: { symbol: '▲', cls: 'border-warning-border bg-warning-bg text-warning-fg' },
    danger: { symbol: '✕', cls: 'border-danger-border bg-danger-bg text-danger-fg' },
    neutral: { symbol: '●', cls: 'border-neutral-border bg-neutral-bg text-neutral-fg' },
    info: { symbol: 'ⓘ', cls: 'border-info-border bg-info-bg text-info-fg' },
};
export function StatusBadge({ status, label, size = 'sm', className }) {
    const s = STATUS_STYLE[status] ?? STATUS_STYLE.neutral;
    return (<span aria-label={`Status: ${label ?? ''}`} className={cn('inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium', size === 'sm' ? 'text-sm' : 'text-base', s.cls, className)}>
      <span aria-hidden>{s.symbol}</span>
      {label ?? ''}
    </span>);
}
