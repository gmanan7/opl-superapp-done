import { api } from './api';
import { RESOLVABLE_LANGS } from '../i18n';
import { safeStorage } from './safeStorage';
export function getLangPref(session) {
    return session.lang_pref;
}
function resolveAuthedLang(profileLang) {
    if (profileLang && RESOLVABLE_LANGS.includes(profileLang))
        return profileLang;
    const ui = safeStorage.getItem('tpm_ui_lang');
    if (ui && RESOLVABLE_LANGS.includes(ui))
        return ui;
    return 'en';
}
const SESSION_KEY = 'tpm_session';
export const LOGIN_AT_KEY = 'tpm_login_at';
export function saveSession(session) {
    safeStorage.setItem(SESSION_KEY, JSON.stringify(session));
    safeStorage.setItem(LOGIN_AT_KEY, String(Date.now()));
}
export function loadSession() {
    const raw = safeStorage.getItem(SESSION_KEY);
    if (!raw)
        return null;
    try {
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
export function clearSession() {
    safeStorage.removeItem(SESSION_KEY);
    safeStorage.removeItem(LOGIN_AT_KEY);
}
export async function loginWithEmail(emailOrEmpId, password) {
    const res = await api.login(emailOrEmpId, password);
    const user = res.user;
    if (!user) {
        throw new Error('Account not found. Contact your administrator.');
    }
    const session = {
        type: 'email',
        userId: user.emp_id || user.id,
        emp_id: user.emp_id || user.id,
        worker_id: user.emp_id || user.id,
        name: user.name,
        email: user.email || emailOrEmpId,
        role: user.role || 'operator',
        factory_id: user.factory_id ?? null,
        jh_group_id: user.jh_group_id ?? null,
        dmt_id: user.dmt_id ?? null,
        lang_pref: resolveAuthedLang(user.lang_pref),
    };
    saveSession(session);
    return session;
}
export function updateSessionLangPref(lang) {
    const raw = safeStorage.getItem(SESSION_KEY);
    if (!raw)
        return;
    try {
        const s = JSON.parse(raw);
        s.lang_pref = lang;
        safeStorage.setItem(SESSION_KEY, JSON.stringify(s));
    }
    catch { /* ignore */ }
}
export async function logout() {
    clearSession();
}
export function getRole(session) {
    if (!session)
        return null;
    return session.role || null;
}
export function getName(session) {
    if (!session)
        return '';
    return session.name || session.email || session.emp_id || '';
}
const ROLE_ORDER = [
    'operator',
    'jh_lead',
    'module_lead',
    'admin_5s',
    'area_champion_5s',
    'auditor_pool',
    'be_lead',
    'it_lead',
    'leadership'
];
export function roleAtLeast(role, minimum) {
    if (!role)
        return false;
    return ROLE_ORDER.indexOf(role) >= ROLE_ORDER.indexOf(minimum);
}
export function getSessionContext() {
    const session = loadSession();
    if (!session)
        return null;
    return {
        worker_id: session.worker_id,
        factory_id: session.factory_id,
        jh_group_id: session.jh_group_id,
        dmt_id: session.dmt_id,
        role: session.role,
    };
}
