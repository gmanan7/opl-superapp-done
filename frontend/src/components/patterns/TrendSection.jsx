// PATTERNS — TrendSection. Groups analysis charts under a clear section header
// (one per machine, plus a delineated rollup section) so a trend page reads as
// structured machine groups, not a flat grid. Collapsible. Reusable by OPL/Kaizen
// analysis surfaces. Title is verbatim (machine name) or caller-translated.
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
export function TrendSection({ title, subtitle, meta, defaultOpen = true, children }) {
    const [open, setOpen] = useState(defaultOpen);
    return (<section className="space-y-3">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-h-touch w-full items-center gap-2 border-b border-line-subtle pb-2 text-left">
        <ChevronDown size={18} className={cn('shrink-0 text-ink-muted transition-transform', !open && '-rotate-90')} aria-hidden/>
        <div className="min-w-0 flex-1">
          <h2 className="break-words text-lg font-semibold text-ink-strong">{title}</h2>
          {subtitle && <p className="text-sm text-ink-muted">{subtitle}</p>}
        </div>
        {meta && <span className="shrink-0 text-sm text-ink-muted">{meta}</span>}
      </button>
      {open && children}
    </section>);
}
