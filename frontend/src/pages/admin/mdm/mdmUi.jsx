import { useTranslation } from 'react-i18next';
import { XCircle, CheckCircle2, CircleDot, Info } from 'lucide-react';
import { MdmError } from '@/hooks/mdm';
// 3-channel status (FOUNDATIONS §05): color + symbol + label, never color alone.
export function ActiveBadge({ active }) {
    const { t } = useTranslation();
    const isActive = active !== false;
    return isActive ? (<span className="inline-flex items-center gap-1 rounded-full border border-success-border bg-success-bg px-2 py-0.5 text-2xs font-medium text-success-fg">
      <CheckCircle2 size={12} aria-hidden/>
      {t('mdm.common.active')}
    </span>) : (<span className="inline-flex items-center gap-1 rounded-full border border-neutral-border bg-neutral-bg px-2 py-0.5 text-2xs font-medium text-neutral-fg">
      <CircleDot size={12} aria-hidden/>
      {t('mdm.common.inactive')}
    </span>);
}
export function MdmErrorNote({ error }) {
    const { t } = useTranslation();
    if (!error)
        return null;
    const code = error instanceof MdmError ? error.code : 'unknown';
    return (<div role="alert" className="flex items-start gap-2 rounded border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-fg">
      <XCircle size={16} className="mt-0.5 shrink-0" aria-hidden/>
      <span>{t(`mdm.errors.${code}`)}</span>
    </div>);
}
export function InfoNote({ text }) {
    return (<div className="flex items-start gap-2 rounded border border-info-border bg-info-bg px-3 py-2 text-sm text-info-fg">
      <Info size={16} className="mt-0.5 shrink-0" aria-hidden/>
      <span>{text}</span>
    </div>);
}
