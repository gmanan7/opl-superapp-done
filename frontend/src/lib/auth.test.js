import { describe, it, expect } from 'vitest';
import { saveSession, loadSession, clearSession, getRole, getName, } from './auth';
// ─── Fixtures ─────────────────────────────────────────────────────────────────
const pinSession = {
    type: 'pin',
    worker: {
        worker_id: 'w1',
        employee_id: 'EMP001',
        name: 'Ramesh Patel',
        tpm_role: 'on_roll',
        factory_id: 'f1',
        jh_group_id: 'g1',
        dmt_id: null,
        lang_pref: 'en',
    },
};
const emailSession = {
    type: 'email',
    userId: 'u1',
    worker_id: 'w-leader',
    email: 'leader@factory.com',
    role: 'jh_leader',
    factory_id: 'f1',
    jh_group_id: 'g1',
    dmt_id: null,
};
const adminSession = {
    type: 'email',
    userId: 'u2',
    worker_id: 'w-admin',
    email: 'admin@factory.com',
    role: 'admin',
    factory_id: 'f1',
    jh_group_id: null,
    dmt_id: null,
};
// ─── saveSession / loadSession / clearSession ──────────────────────────────
describe('session persistence', () => {
    it('saves and reloads a PIN session', () => {
        saveSession(pinSession);
        expect(loadSession()).toEqual(pinSession);
    });
    it('saves and reloads an email session', () => {
        saveSession(emailSession);
        expect(loadSession()).toEqual(emailSession);
    });
    it('returns null when nothing saved', () => {
        expect(loadSession()).toBeNull();
    });
    it('clearSession removes stored session', () => {
        saveSession(pinSession);
        clearSession();
        expect(loadSession()).toBeNull();
    });
    it('handles corrupt localStorage gracefully', () => {
        localStorage.setItem('tpm_session', 'not-json{{{');
        expect(loadSession()).toBeNull();
    });
    it('overwrites previous session on second save', () => {
        saveSession(pinSession);
        saveSession(emailSession);
        expect(loadSession()).toEqual(emailSession);
    });
});
// ─── getRole ──────────────────────────────────────────────────────────────────
describe('getRole', () => {
    it('returns null for null session', () => {
        expect(getRole(null)).toBeNull();
    });
    it('returns tpm_role for PIN session', () => {
        expect(getRole(pinSession)).toBe('on_roll');
    });
    it('returns role for email session', () => {
        expect(getRole(emailSession)).toBe('jh_leader');
    });
    it('returns admin role correctly', () => {
        expect(getRole(adminSession)).toBe('admin');
    });
});
// ─── getName ──────────────────────────────────────────────────────────────────
describe('getName', () => {
    it('returns empty string for null', () => {
        expect(getName(null)).toBe('');
    });
    it('returns worker name for PIN session', () => {
        expect(getName(pinSession)).toBe('Ramesh Patel');
    });
    it('returns email for email session', () => {
        expect(getName(emailSession)).toBe('leader@factory.com');
    });
});
// ─── AuthSession shape ────────────────────────────────────────────────────────
describe('email AuthSession fields', () => {
    it('includes factory_id, jh_group_id, dmt_id', () => {
        saveSession(emailSession);
        const loaded = loadSession();
        expect(loaded.type).toBe('email');
        if (loaded.type === 'email') {
            expect(loaded.factory_id).toBe('f1');
            expect(loaded.jh_group_id).toBe('g1');
            expect(loaded.dmt_id).toBeNull();
        }
    });
    it('admin session has null jh_group_id', () => {
        saveSession(adminSession);
        const loaded = loadSession();
        if (loaded.type === 'email') {
            expect(loaded.jh_group_id).toBeNull();
        }
    });
});
