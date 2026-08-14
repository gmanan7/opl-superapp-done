// PATTERNS §5 UX adapted per D-021: PIN reveal is cryptographically impossible
// (pin_hash = bcrypt), so this modal GENERATES a new PIN and shows it once.
// Component name stays PinRevealModal (matches PATTERNS imports); the
// user-facing copy is honest about generation.
// Contract kept: reason capture is MANDATORY before the server is called;
// PIN is never in the DOM before that; 12s non-skippable auto-hide; Copy
// schedules a clipboard clear.
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, } from '@/components/ui/dialog';
import { MdmError } from '@/hooks/mdm';
const REASONS = ['forgot', 'device_pairing', 'audit', 'other'];
export function PinRevealModal({ open, onOpenChange, user, onReveal, autoHideMs = 12_000, presetPin }) {
    const { t } = useTranslation();
    const [reason, setReason] = useState('');
    const [otherText, setOtherText] = useState('');
    const [pin, setPin] = useState(null);
    const [working, setWorking] = useState(false);
    const [error, setError] = useState(null);
    const [copied, setCopied] = useState(false);
    // B1 fix: the countdown is STATE that ticks — the displayed number was a
    // static string before (UAT: "stuck at 12s").
    const [secondsLeft, setSecondsLeft] = useState(0);
    const hideTimer = useRef(null);
    const tickTimer = useRef(null);
    function clearTimers() {
        if (hideTimer.current)
            clearTimeout(hideTimer.current);
        if (tickTimer.current)
            clearInterval(tickTimer.current);
    }
    useEffect(() => {
        if (!open) {
            setReason('');
            setOtherText('');
            setPin(null);
            setError(null);
            setCopied(false);
            setSecondsLeft(0);
            clearTimers();
        }
        else if (presetPin) {
            // Invite flow: start revealed, same non-skippable auto-hide contract.
            setPin(presetPin);
            setSecondsLeft(Math.round(autoHideMs / 1000));
            tickTimer.current = setInterval(() => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
            hideTimer.current = setTimeout(() => onOpenChange(false), autoHideMs);
        }
        return clearTimers; // cleanup on unmount
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, presetPin]);
    const canReveal = reason !== '' && (reason !== 'other' || otherText.trim().length > 0);
    async function reveal() {
        if (!canReveal || working)
            return;
        setWorking(true);
        setError(null);
        try {
            const res = await onReveal(reason, reason === 'other' ? otherText.trim() : undefined);
            setPin(res.pin);
            // Auto-hide is non-skippable ("keep visible" is not an option).
            setSecondsLeft(Math.round(autoHideMs / 1000));
            tickTimer.current = setInterval(() => {
                setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
            }, 1000);
            hideTimer.current = setTimeout(() => onOpenChange(false), autoHideMs);
        }
        catch (e) {
            setError(e instanceof MdmError ? t(`mdm.errors.${e.code}`) : t('mdm.errors.unknown'));
        }
        finally {
            setWorking(false);
        }
    }
    async function copy() {
        if (!pin)
            return;
        try {
            await navigator.clipboard.writeText(pin);
            setCopied(true);
            // Best-effort clipboard clear at auto-hide.
            setTimeout(() => { navigator.clipboard.writeText('').catch(() => { }); }, autoHideMs);
        }
        catch {
            setCopied(false);
        }
    }
    return (<Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px] bg-surface-raised">
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold text-ink-strong">
            {pin === null
            ? t('people.pin.generateTitle', { name: user.displayName })
            : t('people.pin.showTitle', { name: user.displayName })}
          </DialogTitle>
          <DialogDescription className="text-sm text-ink-muted">
            {user.roleLabel} · {user.primaryAssignment}
          </DialogDescription>
        </DialogHeader>

        {pin === null ? (<div className="space-y-4">
            <p className="text-sm text-ink">{t('people.pin.honestNote')}</p>
            <p className="text-sm font-medium text-ink-strong">{t('people.pin.reasonPrompt')}</p>
            <RadioGroup value={reason} onValueChange={(v) => setReason(v)}>
              {REASONS.map((r) => (<label key={r} className="flex min-h-touch items-center gap-3 text-sm text-ink">
                  <RadioGroupItem value={r} aria-label={t(`people.pin.reasons.${r}`)}/>
                  {t(`people.pin.reasons.${r}`)}
                </label>))}
            </RadioGroup>
            {reason === 'other' && (<Input value={otherText} onChange={(e) => setOtherText(e.target.value)} maxLength={200} placeholder={t('people.pin.otherPlaceholder')}/>)}
            {error && (<p role="alert" className="text-sm text-danger-fg">{error}</p>)}
            <Button className="w-full" disabled={!canReveal || working} onClick={reveal}>
              {working ? t('common.loading') : t('people.pin.generateCta')}
            </Button>
          </div>) : (<div className="space-y-4">
            <div className="flex justify-center gap-2" data-numeric aria-label={t('people.pin.showTitle', { name: user.displayName })}>
              {pin.split('').map((d, i) => (<span key={i} className="flex h-12 w-10 items-center justify-center rounded border border-line-strong bg-surface-sunken text-data font-bold tabular">
                  {d}
                </span>))}
            </div>
            <div className="space-y-1">
              {/* PATTERNS §5 countdown progress bar: brand.subtle track, brand fill */}
              <div className="h-1 w-full overflow-hidden rounded-full bg-brand-subtle" aria-hidden>
                <div className="h-full bg-brand transition-all duration-slow" style={{ width: `${(secondsLeft / Math.max(1, Math.round(autoHideMs / 1000))) * 100}%` }}/>
              </div>
              <p className="text-center text-2xs text-ink-subtle" data-testid="pin-countdown">
                {t('people.pin.autoHide', { s: secondsLeft })}
              </p>
            </div>
            <div className="flex justify-center gap-2">
              <Button variant="outline" onClick={copy}>
                {copied ? t('people.pin.copied') : t('people.pin.copy')}
              </Button>
              <Button onClick={() => onOpenChange(false)}>{t('common.close')}</Button>
            </div>
          </div>)}
      </DialogContent>
    </Dialog>);
}
