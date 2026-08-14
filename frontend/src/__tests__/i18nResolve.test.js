import { describe, it, expect, beforeEach } from 'vitest';
import { getInitialLang, RESOLVABLE_LANGS, SELECTABLE_LANGS } from '../i18n';
beforeEach(() => localStorage.clear());
describe('getInitialLang (active-language resolution, ARCHITECTURE §6.2)', () => {
    it('resolves ta from a PIN session even though ta is not user-selectable (D-008)', () => {
        localStorage.setItem('tpm_session', JSON.stringify({ type: 'pin', worker: { lang_pref: 'ta' } }));
        expect(getInitialLang()).toBe('ta');
    });
    it('resolves ta from an email session', () => {
        localStorage.setItem('tpm_session', JSON.stringify({ type: 'email', lang_pref: 'ta' }));
        expect(getInitialLang()).toBe('ta');
    });
    it('session lang_pref wins over the login-page tpm_ui_lang', () => {
        localStorage.setItem('tpm_ui_lang', 'hi');
        localStorage.setItem('tpm_session', JSON.stringify({ type: 'pin', worker: { lang_pref: 'gu' } }));
        expect(getInitialLang()).toBe('gu');
    });
    it('falls back to the login-page tpm_ui_lang when there is no session', () => {
        localStorage.setItem('tpm_ui_lang', 'hi');
        expect(getInitialLang()).toBe('hi');
    });
    it('defaults to en when nothing is set', () => {
        expect(getInitialLang()).toBe('en');
    });
    it('ignores invalid language codes', () => {
        localStorage.setItem('tpm_ui_lang', 'xx');
        expect(getInitialLang()).toBe('en');
    });
    it('ta is resolvable AND (Step 5, D-008 gate open) selectable', () => {
        expect(RESOLVABLE_LANGS).toContain('ta');
        expect(SELECTABLE_LANGS).toContain('ta');
    });
});
