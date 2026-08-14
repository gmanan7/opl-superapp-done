import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { loadSession, updateSessionLangPref } from '../lib/auth';
import { safeStorage } from '../lib/safeStorage';
import { DISPLAY_LANGS } from '../i18n';
export function useLanguageSwitch() {
    const { t, i18n } = useTranslation();
    const current = i18n.language;
    async function change(code) {
        if (code === current)
            return;
        i18n.changeLanguage(code);
        const session = loadSession();
        if (!session) {
            safeStorage.setItem('tpm_ui_lang', code);
            return;
        }
        updateSessionLangPref(code);
        try {
            const workerId = session.type === 'pin' ? session.worker.worker_id : session.worker_id;
            await api.setLanguage(code, workerId);
            toast.success(t('common.langUpdated'));
        }
        catch {
            /* soft failure */
        }
    }
    return { current, change, languages: DISPLAY_LANGS };
}
