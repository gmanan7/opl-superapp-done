// PATTERNS §13 — Skeleton primitives. Honest loading (Law 8) — heights match
// the destination so arrival doesn't reflow the page (Law 6).
import { Skeleton } from '@/components/ui/skeleton';
export function SkeletonText({ lines = 3, lastLineWidth = '60%' }) {
    return (<div className="space-y-2" aria-hidden>
      {Array.from({ length: lines }, (_, i) => (<Skeleton key={i} className="h-4 bg-surface-sunken" style={{ width: i === lines - 1 ? lastLineWidth : '100%' }}/>))}
    </div>);
}
export function SkeletonRow({ columns = 6, height = 56 }) {
    return (<div className="flex items-center gap-3 border-b border-line-subtle px-4" style={{ height }} aria-hidden>
      <Skeleton className="h-8 w-8 shrink-0 rounded-full bg-surface-sunken"/>
      {Array.from({ length: columns }, (_, i) => (<Skeleton key={i} className="h-4 flex-1 bg-surface-sunken"/>))}
    </div>);
}
