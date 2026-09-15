// PATTERNS — ListPager. The one pagination control every list surface uses
// (OPL / Kaizen / Abnormality review + repository lists). A bordered footer card:
// left — the total plus a "Per page" size picker; right — Prev · numbered pages ·
// Next (only when there's more than one page). Numbered buttons window down past
// 7 pages so the row never runs off a phone. Stacks and centers on mobile.
import { Button } from '@/components/ui/button';

function pageWindow(current, count) {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i);
  const keep = new Set([0, count - 1, current, current - 1, current + 1]);
  const list = [...keep].filter((i) => i >= 0 && i < count).sort((a, b) => a - b);
  const out = [];
  list.forEach((i, idx) => {
    if (idx > 0 && i - list[idx - 1] > 1) out.push('gap');
    out.push(i);
  });
  return out;
}

export function ListPager({
  total,
  noun = 'items',
  page,
  pageCount,
  pageSize,
  pageSizeOptions = [3, 5, 10],
  onPage,
  onPageSize,
}) {
  if (!total) return null;
  const from = page * pageSize + 1;
  const to = Math.min((page + 1) * pageSize, total);

  return (
    <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-line bg-surface-raised p-3 shadow-xs">
      {/* Total + page-size */}
      <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-3 gap-y-1.5 text-xs text-ink-muted">
        <span>
          <strong className="text-ink-strong">{from}</strong>–<strong className="text-ink-strong">{to}</strong>
          {' of '}
          <strong className="text-ink-strong">{total}</strong> {noun}
        </span>
        <span className="flex items-center gap-1">
          <span className="text-2xs uppercase tracking-wide">Per page</span>
          <span className="flex items-center gap-0.5 rounded-lg border border-line bg-surface-sunken p-0.5">
            {pageSizeOptions.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onPageSize(n)}
                className={`min-w-[1.75rem] rounded-md px-1.5 py-0.5 text-xs font-semibold transition-colors ${
                  pageSize === n
                    ? 'bg-surface-raised text-blue-700 shadow-xs'
                    : 'text-ink-muted hover:text-ink-strong'
                }`}
              >
                {n}
              </button>
            ))}
          </span>
        </span>
      </div>

      {/* Page nav */}
      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-1">
          <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs" disabled={page === 0} onClick={() => onPage(page - 1)}>
            Prev
          </Button>
          <div className="flex items-center gap-0.5">
            {pageWindow(page, pageCount).map((i, idx) =>
              i === 'gap' ? (
                <span key={`gap-${idx}`} className="px-1 text-ink-subtle">…</span>
              ) : (
                <button
                  key={i}
                  type="button"
                  onClick={() => onPage(i)}
                  className={`h-8 min-w-[2rem] rounded-md px-1.5 text-xs font-semibold transition-colors ${
                    i === page
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-ink-muted hover:bg-surface-sunken hover:text-ink-strong'
                  }`}
                >
                  {i + 1}
                </button>
              )
            )}
          </div>
          <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs" disabled={page === pageCount - 1} onClick={() => onPage(page + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
