import { describe, it, expect, beforeEach } from 'vitest';
import { roleAtLeast, getSessionContext } from './useAbnormalities';
import { saveSession, clearSession } from '../lib/auth';
// ─── roleAtLeast ──────────────────────────────────────────────────────────────
describe('roleAtLeast', () => {
    const HIERARCHY = ['apprentice', 'on_roll', 'jh_leader', 'dmt_leader', 'pillar_champion', 'be_team', 'admin'];
    it('returns false for null role', () => {
        expect(roleAtLeast(null, 'apprentice')).toBe(false);
        expect(roleAtLeast(undefined, 'admin')).toBe(false);
    });
    it('each role satisfies its own minimum', () => {
        HIERARCHY.forEach(role => {
            expect(roleAtLeast(role, role)).toBe(true);
        });
    });
    it('higher roles satisfy lower minimums', () => {
        expect(roleAtLeast('admin', 'apprentice')).toBe(true);
        expect(roleAtLeast('dmt_leader', 'jh_leader')).toBe(true);
        expect(roleAtLeast('jh_leader', 'on_roll')).toBe(true);
    });
    it('lower roles do not satisfy higher minimums', () => {
        expect(roleAtLeast('apprentice', 'jh_leader')).toBe(false);
        expect(roleAtLeast('on_roll', 'dmt_leader')).toBe(false);
        expect(roleAtLeast('jh_leader', 'admin')).toBe(false);
    });
    it('Leaders tab visibility: dmt_leader+ can see, jh_leader cannot', () => {
        expect(roleAtLeast('jh_leader', 'dmt_leader')).toBe(false);
        expect(roleAtLeast('dmt_leader', 'dmt_leader')).toBe(true);
        expect(roleAtLeast('pillar_champion', 'dmt_leader')).toBe(true);
        expect(roleAtLeast('admin', 'dmt_leader')).toBe(true);
    });
    it('People nav: jh_leader+ can see', () => {
        expect(roleAtLeast('on_roll', 'jh_leader')).toBe(false);
        expect(roleAtLeast('apprentice', 'jh_leader')).toBe(false);
        expect(roleAtLeast('jh_leader', 'jh_leader')).toBe(true);
    });
});
// ─── getSessionContext ────────────────────────────────────────────────────────
describe('getSessionContext', () => {
    beforeEach(() => clearSession());
    it('returns null when no session', () => {
        expect(getSessionContext()).toBeNull();
    });
    it('returns full context for PIN session', () => {
        const session = {
            type: 'pin',
            worker: {
                worker_id: 'w1',
                employee_id: 'EMP001',
                name: 'Test Worker',
                tpm_role: 'on_roll',
                factory_id: 'fac1',
                jh_group_id: 'grp1',
                dmt_id: null,
                lang_pref: 'en',
            },
        };
        saveSession(session);
        const ctx = getSessionContext();
        expect(ctx.worker_id).toBe('w1');
        expect(ctx.factory_id).toBe('fac1');
        expect(ctx.jh_group_id).toBe('grp1');
        expect(ctx.dmt_id).toBeNull();
        expect(ctx.role).toBe('on_roll');
    });
    it('returns factory/org context for email session (not null)', () => {
        const session = {
            type: 'email',
            userId: 'u1',
            worker_id: 'w-u1',
            email: 'jh@factory.com',
            role: 'jh_leader',
            factory_id: 'fac1',
            jh_group_id: 'grp1',
            dmt_id: null,
        };
        saveSession(session);
        const ctx = getSessionContext();
        expect(ctx.worker_id).toBe('w-u1');
        expect(ctx.factory_id).toBe('fac1'); // was null before the fix
        expect(ctx.jh_group_id).toBe('grp1'); // was null before the fix
        expect(ctx.role).toBe('jh_leader');
    });
    it('dmt_leader email session carries dmt_id', () => {
        const session = {
            type: 'email',
            userId: 'u2',
            worker_id: 'w-u2',
            email: 'dmt@factory.com',
            role: 'dmt_leader',
            factory_id: 'fac1',
            jh_group_id: null,
            dmt_id: 'dmt1',
        };
        saveSession(session);
        const ctx = getSessionContext();
        expect(ctx.dmt_id).toBe('dmt1');
        expect(ctx.jh_group_id).toBeNull();
    });
    it('admin email session has null jh_group_id and dmt_id', () => {
        const session = {
            type: 'email',
            userId: 'u3',
            worker_id: 'w-u3',
            email: 'admin@factory.com',
            role: 'admin',
            factory_id: 'fac1',
            jh_group_id: null,
            dmt_id: null,
        };
        saveSession(session);
        const ctx = getSessionContext();
        expect(ctx.jh_group_id).toBeNull();
        expect(ctx.dmt_id).toBeNull();
        expect(ctx.factory_id).toBe('fac1');
    });
});
