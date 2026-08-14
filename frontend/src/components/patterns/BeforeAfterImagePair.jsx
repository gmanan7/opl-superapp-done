// PATTERNS §9 — BeforeAfterImagePair. Side-by-side image slots that resolve signed
// URLs (via useStorageUrl → sign-url Edge) and never collapse: each slot is aspect-
// locked 4:3 (Law 6 — layout reserved before the image loads) with a pulsing
// placeholder while resolving and a "—" glyph when empty. Captions render verbatim;
// translation is applied OUTSIDE this component (TranslateControl over the remarks).
import { useStorageUrl } from '../../hooks/useStorageUrl';
import { cn } from '@/lib/utils';
function ImageSlot({ label, path, caption }) {
    const url = useStorageUrl(path);
    return (<div className="overflow-hidden rounded-lg border border-line bg-surface-raised">
      <div className="border-b border-line-subtle px-4 py-2">
        <p className="text-sm font-medium text-ink-strong">{label}</p>
      </div>
      <div className="aspect-[4/3] bg-surface-sunken">
        {path ? (url ? (<a href={url} target="_blank" rel="noopener noreferrer" className="block h-full w-full">
              <img src={url} alt={label} className="h-full w-full object-contain"/>
            </a>) : (<div className="h-full w-full animate-pulse bg-surface-sunken" aria-label="loading"/>)) : (<div className="flex h-full w-full items-center justify-center text-5xl text-ink-subtle" aria-hidden>—</div>)}
      </div>
      {caption && <p lang="auto" className="whitespace-pre-wrap px-4 py-2 text-sm text-ink-muted">{caption}</p>}
    </div>);
}
export function BeforeAfterImagePair({ before, after, beforeLabel, afterLabel, className }) {
    return (<div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2', className)}>
      <ImageSlot label={beforeLabel} path={before.path} caption={before.caption}/>
      <ImageSlot label={afterLabel} path={after.path} caption={after.caption}/>
    </div>);
}
