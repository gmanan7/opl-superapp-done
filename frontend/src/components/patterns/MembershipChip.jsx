// PATTERNS §6 — MembershipChip. Primary authority = plain text; additional
// participation = dashed-border chip. Never amber (membership ≠ CTA).
// Path separator is '·' — never '/' or '>'.
import { cn } from '@/lib/utils';
export function MembershipChip({ path, variant = 'additional', onClick }) {
    const text = path.filter(Boolean).join(' · ');
    if (variant === 'primary') {
        return <span className="text-sm font-medium text-ink-strong">{text}</span>;
    }
    const cls = cn('inline-flex min-h-7 items-center gap-1 rounded-full border border-dashed border-line-strong', 'bg-surface-raised px-2.5 py-0.5 text-sm text-ink', onClick && 'hover:border-solid hover:bg-surface-hover focus-visible:shadow-focus');
    const body = (<>
      <span className="text-ink-muted" aria-hidden>+</span>
      {text}
    </>);
    return onClick ? (<button type="button" onClick={onClick} className={cls}>{body}</button>) : (<span className={cls}>{body}</span>);
}
