// PATTERNS §4 — ConfirmModal. Generic destructive-action confirmation.
// Step-confirm: two presses with a 600ms cool-off — NOT typed confirmation.
// First focus on Cancel (floor users triple-tap; that must not destroy a record).
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, } from '@/components/ui/dialog';
const COOL_OFF_MS = 600;
export function ConfirmModal({ open, onOpenChange, title, description, consequenceList, severity = 'caution', primaryLabel, cancelLabel, stepConfirm = false, isWorking = false, primaryDisabled = false, children, onConfirm, }) {
    const { t } = useTranslation();
    const [armed, setArmed] = useState(false);
    const [coolingOff, setCoolingOff] = useState(false);
    const cancelRef = useRef(null);
    useEffect(() => {
        if (!open) {
            setArmed(false);
            setCoolingOff(false);
        }
    }, [open]);
    function handlePrimary() {
        if (!stepConfirm || armed) {
            void onConfirm();
            return;
        }
        setArmed(true);
        setCoolingOff(true);
        setTimeout(() => setCoolingOff(false), COOL_OFF_MS);
    }
    const variant = severity === 'danger' ? 'destructive' : severity === 'neutral' ? 'secondary' : 'default';
    return (<Dialog open={open} onOpenChange={(o) => !isWorking && onOpenChange(o)}>
      <DialogContent className="max-w-[480px] bg-surface-raised" onOpenAutoFocus={(e) => {
            e.preventDefault();
            cancelRef.current?.focus(); // first focus = Cancel, per pattern
        }}>
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold text-ink-strong">{title}</DialogTitle>
          {description && (<DialogDescription className="text-base text-ink">{description}</DialogDescription>)}
        </DialogHeader>
        {consequenceList && consequenceList.length > 0 && (<ul className="list-disc space-y-1 pl-5 text-sm text-ink-muted">
            {consequenceList.map((c) => <li key={c}>{c}</li>)}
          </ul>)}
        {children}
        {stepConfirm && armed && (<p className="text-sm font-medium text-danger-fg" role="status">
            {t('patterns.confirm.pressAgain')}
          </p>)}
        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button ref={cancelRef} variant="outline" disabled={isWorking} onClick={() => onOpenChange(false)}>
            {cancelLabel ?? t('common.cancel')}
          </Button>
          <Button variant={variant} disabled={isWorking || coolingOff || primaryDisabled} onClick={handlePrimary}>
            {isWorking ? t('common.loading') : armed ? t('patterns.confirm.confirmNow') : primaryLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>);
}
