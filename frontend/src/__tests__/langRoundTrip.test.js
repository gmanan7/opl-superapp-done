import { describe, it, expect, vi, beforeEach } from 'vitest';
// Layer-(a) regression guard for the lang_pref read-back-and-apply path.
// The bug (get_my_worker_context omitting lang_pref) lived at the RPC boundary;
// these tests assert the FRONTEND correctly maps a returned lang_pref through the
// session AND that getInitialLang() re-resolves it on a fresh app load — i.e. the
// read-back-and-apply half, not just "the RPC fired". The live RPC-shape check
// (layer-b, the guard that actually catches the original bug class) lives in
// docs/sql/migrations/p2_hotfix_get_my_worker_context_lang_pref.sql.
const auth = vi.hoisted(() => ({
    signInWithPassword: vi.fn(),
    signOut: vi.fn(() => Promise.resolve({})),
}));
const rpc = vi.fn();
vi.mock('../lib/supabase', () => ({
    supabase: { auth: auth, rpc: (...args) => rpc(...args) },
}));
import { loginWithEmail, loginWithPin, getLangPref } from '../lib/auth';
import { getInitialLang } from '../i18n';
const CTX = (lang) => ({
    id: 'w1', role: 'admin', factory_id: 'f1', jh_group_id: null, dmt_id: null, lang_pref: lang,
});
function mockEmail(profileLang) {
    auth.signInWithPassword.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.com' } }, error: null });
    rpc.mockImplementation((fn) => fn === 'get_my_worker_context'
        ? Promise.resolve({ data: [CTX(profileLang)], error: null })
        : Promise.resolve({}));
}
function mockPin(profileLang) {
    global.fetch = vi.fn(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
            success: true,
            session: {
                worker_id: 'w2', employee_id: 'E1', name: 'X', tpm_role: 'on_roll',
                factory_id: 'f1', jh_group_id: null, dmt_id: null, lang_pref: profileLang,
            },
        }),
    }));
}
beforeEach(() => {
    localStorage.clear();
    auth.signInWithPassword.mockReset();
    rpc.mockReset();
});
describe('lang_pref round-trip — email identity', () => {
    it('profile value flows through the session AND re-resolves on fresh load', async () => {
        mockEmail('gu');
        const session = await loginWithEmail('a@b.com', 'pw');
        expect(session.lang_pref).toBe('gu'); // mapped into session
        expect(getLangPref(session)).toBe('gu'); // read by the switcher/login
        expect(getInitialLang()).toBe('gu'); // re-resolved from saved session (refresh/re-login)
    });
    it('NULL profile falls back to the login-page selection (§6.2 middle step)', async () => {
        localStorage.setItem('tpm_ui_lang', 'hi');
        mockEmail(null);
        const session = await loginWithEmail('a@b.com', 'pw');
        expect(session.lang_pref).toBe('hi');
    });
    it('NULL profile + no login-page selection falls back to English', async () => {
        mockEmail(null);
        const session = await loginWithEmail('a@b.com', 'pw');
        expect(session.lang_pref).toBe('en');
    });
});
describe('lang_pref round-trip — PIN identity (clean read-back guard)', () => {
    it('resolves from the pin-auth response on a fully-cleared session', async () => {
        mockPin('hi');
        const session = await loginWithPin('E1', '123456');
        expect(session.type).toBe('pin');
        expect(getLangPref(session)).toBe('hi');
        // local session fully derived from the login response (no pre-existing copy)
        expect(getInitialLang()).toBe('hi');
    });
});
