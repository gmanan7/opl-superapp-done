import { describe, it, expect, beforeEach } from 'vitest';
import { getPinSession } from '../lib/pinSession';
describe('getPinSession', () => {
    beforeEach(() => {
        localStorage.clear();
    });
    it('returns null when localStorage is empty', () => {
        expect(getPinSession()).toBeNull();
    });
    it('returns parsed object when valid PIN session JSON is in localStorage', () => {
        const session = {
            type: 'pin',
            worker: {
                worker_id: 'w-123',
                employee_id: 'EMP042',
                name: 'Priya Shah',
                tpm_role: 'apprentice',
                factory_id: 'factory-abc',
                jh_group_id: 'group-xyz',
                dmt_id: null,
                lang_pref: 'gu',
            },
        };
        localStorage.setItem('tpm_session', JSON.stringify(session));
        const result = getPinSession();
        expect(result).not.toBeNull();
        expect(result?.worker?.worker_id).toBe('w-123');
        expect(result?.worker?.tpm_role).toBe('apprentice');
        expect(result?.worker?.lang_pref).toBe('gu');
        expect(result?.type).toBe('pin');
    });
    it('returns null when localStorage contains invalid JSON (does not throw)', () => {
        localStorage.setItem('tpm_session', '{invalid:::json}}}');
        expect(() => getPinSession()).not.toThrow();
        expect(getPinSession()).toBeNull();
    });
    it('returns null when tpm_session key exists but value is null string', () => {
        localStorage.setItem('tpm_session', 'null');
        expect(getPinSession()).toBeNull();
    });
    it('handles email session stored under the same key (returns it as-is)', () => {
        const emailSession = {
            type: 'email',
            worker_id: 'w-email-1',
            factory_id: 'factory-abc',
        };
        localStorage.setItem('tpm_session', JSON.stringify(emailSession));
        const result = getPinSession();
        expect(result).not.toBeNull();
        expect(result?.type).toBe('email');
        expect(result?.worker).toBeUndefined();
    });
});
