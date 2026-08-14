import { describe, it, expect, beforeEach } from 'vitest';
import { getSessionContext } from '../hooks/useAbnormalities';
function setSession(session) {
    localStorage.setItem('tpm_session', JSON.stringify(session));
}
const PIN_SESSION = {
    type: 'pin',
    worker: {
        worker_id: 'worker-pin-1',
        employee_id: 'EMP001',
        name: 'Ramesh Patel',
        tpm_role: 'on_roll',
        factory_id: 'factory-abc',
        jh_group_id: 'group-xyz',
        dmt_id: null,
        lang_pref: 'hi',
    },
};
const EMAIL_SESSION = {
    type: 'email',
    userId: 'supabase-user-123',
    worker_id: 'worker-email-1',
    email: 'leader@factory.com',
    role: 'jh_leader',
    factory_id: 'factory-abc',
    jh_group_id: 'group-xyz',
    dmt_id: null,
    lang_pref: 'en',
};
describe('getSessionContext', () => {
    beforeEach(() => {
        localStorage.clear();
    });
    it('returns null when no session exists', () => {
        expect(getSessionContext()).toBeNull();
    });
    it('returns correct shape for PIN session', () => {
        setSession(PIN_SESSION);
        const ctx = getSessionContext();
        expect(ctx).not.toBeNull();
        expect(ctx?.worker_id).toBe('worker-pin-1');
        expect(ctx?.factory_id).toBe('factory-abc');
        expect(ctx?.jh_group_id).toBe('group-xyz');
        expect(ctx?.dmt_id).toBeNull();
        expect(ctx?.role).toBe('on_roll');
    });
    it('PIN factory_id comes from session.worker.factory_id, not top level', () => {
        setSession(PIN_SESSION);
        const ctx = getSessionContext();
        expect(ctx?.factory_id).toBe('factory-abc');
        // Confirm the PIN session object itself has no top-level factory_id
        expect(PIN_SESSION.factory_id).toBeUndefined();
    });
    it('returns correct shape for email session', () => {
        setSession(EMAIL_SESSION);
        const ctx = getSessionContext();
        expect(ctx).not.toBeNull();
        expect(ctx?.worker_id).toBe('worker-email-1');
        expect(ctx?.factory_id).toBe('factory-abc');
        expect(ctx?.jh_group_id).toBe('group-xyz');
        expect(ctx?.role).toBe('jh_leader');
    });
    it('returns null for invalid JSON in localStorage', () => {
        localStorage.setItem('tpm_session', '{invalid json}}}');
        expect(getSessionContext()).toBeNull();
    });
    it('PIN role comes from worker.tpm_role, not session.role', () => {
        setSession(PIN_SESSION);
        const ctx = getSessionContext();
        expect(ctx?.role).toBe('on_roll');
        expect(PIN_SESSION.role).toBeUndefined();
    });
});
