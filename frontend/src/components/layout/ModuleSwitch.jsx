import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeftRight } from 'lucide-react';

// One-click jump between the two apps — Lumos (TPM) and CloseLoop (DMT) — without going back through the module
// chooser. Lives in both shells. `current` is the app you are in now; the button always points at the other one.
const TARGETS = {
    lumos: { name: 'CloseLoop', to: '/dmt' },      // shown while you are in Lumos
    closeloop: { name: 'Lumos', to: '/home' },     // shown while you are in CloseLoop
};

export function ModuleSwitch({ current, variant = 'sidebar' }) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const target = TARGETS[current];
    const label = t('nav.switchModule', { name: target.name, defaultValue: 'Switch to {{name}}' });

    if (variant === 'mobile') {
        return (
            <button type="button" onClick={() => navigate(target.to)} aria-label={label}
                className="flex shrink-0 items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 active:bg-slate-100">
                <ArrowLeftRight size={13} strokeWidth={2} /> {target.name}
            </button>
        );
    }
    return (
        <button type="button" onClick={() => navigate(target.to)}
            className="flex w-full items-center gap-2 rounded border border-white/15 px-2.5 py-1.5 text-xs font-medium text-stone-200 outline-none transition-colors hover:bg-white/10 hover:text-white">
            <ArrowLeftRight size={14} strokeWidth={1.8} />
            {label}
        </button>
    );
}
