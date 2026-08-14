// PATTERNS §14 — EmptyState · ErrorState · RlsDeniedNotice (the honest-states
// family, Law 8). Shared envelope: centered Unicode glyph (never raster),
// title, single-sentence body, optional action.
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
export function EmptyState({ glyph = '—', title, body, action }) {
    return (<div className="flex flex-col items-center gap-3 py-12 text-center">
      <span className="text-5xl text-ink-subtle" aria-hidden>{glyph}</span>
      <p className="text-xl font-semibold text-ink-strong">{title}</p>
      {body && <p className="max-w-md text-base text-ink-muted">{body}</p>}
      {action && (<Button variant="secondary" onClick={action.onClick}>{action.label}</Button>)}
    </div>);
}
export function ErrorState({ title, message, onRetry }) {
    const { t } = useTranslation();
    return (<div role="alert" className="flex flex-col items-center gap-3 py-12 text-center">
      <span className="text-5xl text-danger-fg" aria-hidden>✕</span>
      <p className="text-xl font-semibold text-ink-strong">{title}</p>
      {message && <p className="font-mono text-xs text-ink-muted">{message}</p>}
      {onRetry && <Button onClick={onRetry}>{t('patterns.states.tryAgain')}</Button>}
    </div>);
}
// Renders IN PLACE OF a denied action item — the user must see the action
// isn't theirs, not learn it after the fact. No retry: denied is denied.
export function RlsDeniedNotice({ reason }) {
    return (<div className="flex items-start gap-2 px-2 py-1.5 text-sm text-ink-muted">
      <span aria-hidden>🔒</span>
      <span>{reason}</span>
    </div>);
}
