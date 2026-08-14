import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { safeStorage } from '../lib/safeStorage';
import en from './en.json';
import hi from './hi.json';
import gu from './gu.json';
// Tamil: resolvable AND (since Step 5, D-008 gate open) user-selectable — in both
// RESOLVABLE_LANGS and SELECTABLE_LANGS.
import ta from './ta.json';
export const RESOLVABLE_LANGS = ['en', 'hi', 'gu', 'ta'];
export const SELECTABLE_LANGS = ['en', 'hi', 'gu', 'ta'];
// All four languages the switcher DISPLAYS. Tamil is shown but disabled until Step 5
// (DESIGN_SYSTEM §3.4 spells the footer as "English · हिंदी · ગુજરાતી · தமிழ்" —
// all four visible). `selectable` drives the disabled/greyed state in <LanguageSwitcher>.
export const DISPLAY_LANGS = [
    { code: 'en', label: 'English', native: 'English', selectable: true },
    { code: 'hi', label: 'Hindi', native: 'हिन्दी', selectable: true },
    { code: 'gu', label: 'Gujarati', native: 'ગુજરાતી', selectable: true },
    { code: 'ta', label: 'Tamil', native: 'தமிழ்', selectable: true }, // Step 5: enabled (D-008 gate open)
];
export function getInitialLang() {
    // 1. Active session lang_pref (highest priority — authenticated user preference).
    //    Resolves against RESOLVABLE_LANGS so an existing 'ta' worker renders Tamil.
    try {
        const raw = safeStorage.getItem('tpm_session');
        if (raw) {
            const s = JSON.parse(raw);
            const lang = s?.worker?.lang_pref ?? s?.lang_pref;
            if (lang && RESOLVABLE_LANGS.includes(lang))
                return lang;
        }
    }
    catch { /* ignore */ }
    // 2. Login-page language preference (persists across sessions, pre-auth).
    try {
        const ui = safeStorage.getItem('tpm_ui_lang');
        if (ui && RESOLVABLE_LANGS.includes(ui))
            return ui;
    }
    catch { /* ignore */ }
    // 3. Default
    return 'en';
}
i18n.use(initReactI18next).init({
    resources: {
        en: { translation: en },
        hi: { translation: hi },
        gu: { translation: gu },
        ta: { translation: ta }, // registered + resolvable; selectability gated (D-008)
    },
    lng: getInitialLang(),
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
});
export default i18n;
