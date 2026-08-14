import { describe, it, expect, vi, beforeEach } from 'vitest';
import { saveSession, clearSession } from './auth';
// ─── Supabase mock ────────────────────────────────────────────────────────────
const { mockInvoke, mockGetSession } = vi.hoisted(() => ({
    mockInvoke: vi.fn(),
    mockGetSession: vi.fn(),
}));
vi.mock('./supabase', () => ({
    supabase: {
        auth: { getSession: mockGetSession },
        functions: { invoke: mockInvoke },
    },
}));
// ─── Helpers ──────────────────────────────────────────────────────────────────
// getSession is called twice per manageUserCall: once for the guard, once
// inside getAuthHeaders — mockResolvedValue covers both calls.
function sessionFor(role = 'admin') {
    mockGetSession.mockResolvedValue({ data: { session: { access_token: `jwt-${role}` } } });
}
function noSession() {
    mockGetSession.mockResolvedValue({ data: { session: null } });
}
function invokeOk(body) {
    mockInvoke.mockResolvedValue({ data: body, error: null });
}
function invokeErr(message) {
    mockInvoke.mockResolvedValue({ data: null, error: { message } });
}
function invokeDataErr(errMsg) {
    // Function returned 200 but body contains { error: '...' }
    mockInvoke.mockResolvedValue({ data: { error: errMsg }, error: null });
}
// ─── Auth header selection ────────────────────────────────────────────────────
describe('manageUserCall — auth header selection', () => {
    beforeEach(() => { clearSession(); mockGetSession.mockReset(); mockInvoke.mockReset(); });
    it('sends explicit Authorization Bearer header for email session', async () => {
        sessionFor('admin');
        invokeOk({ success: true });
        const { manageUserCall } = await import('./manageUser');
        await manageUserCall('test', {});
        const [, opts] = mockInvoke.mock.calls[0];
        expect(opts.headers['Authorization']).toBe('Bearer jwt-admin');
        expect(opts.headers['x-worker-id']).toBeUndefined();
    });
    it('sends x-worker-id for PIN session with no Supabase token', async () => {
        noSession();
        invokeOk({ success: true });
        const pinSession = {
            type: 'pin',
            worker: { worker_id: 'w-abc', employee_id: 'E1', name: 'T', tpm_role: 'jh_leader', factory_id: 'f1', jh_group_id: 'g1', dmt_id: null, lang_pref: 'en' },
        };
        saveSession(pinSession);
        const { manageUserCall } = await import('./manageUser');
        await manageUserCall('test', {});
        const [, opts] = mockInvoke.mock.calls[0];
        expect(opts.headers['x-worker-id']).toBe('w-abc');
        expect(opts.headers['Authorization']).toBeUndefined();
    });
    it('invokes the "manage-user" function by name', async () => {
        sessionFor();
        invokeOk({ success: true });
        const { manageUserCall } = await import('./manageUser');
        await manageUserCall('test', {});
        expect(mockInvoke.mock.calls[0][0]).toBe('manage-user');
    });
    it('throws when no session of any kind exists', async () => {
        noSession();
        const { manageUserCall } = await import('./manageUser');
        await expect(manageUserCall('test', {})).rejects.toThrow('No active session');
    });
});
// ─── Request body ─────────────────────────────────────────────────────────────
describe('manageUserCall — request body', () => {
    beforeEach(() => { clearSession(); mockGetSession.mockReset(); mockInvoke.mockReset(); });
    it('merges action into body', async () => {
        sessionFor();
        invokeOk({ success: true });
        const { manageUserCall } = await import('./manageUser');
        await manageUserCall('create_pin_user', { name: 'Ramesh', employee_id: 'E1' });
        const body = mockInvoke.mock.calls[0][1].body;
        expect(body.action).toBe('create_pin_user');
        expect(body.name).toBe('Ramesh');
    });
    it('throws from error.message on invoke error', async () => {
        sessionFor();
        invokeErr('Unauthorized');
        const { manageUserCall } = await import('./manageUser');
        await expect(manageUserCall('any', {})).rejects.toThrow('Unauthorized');
    });
    it('throws from data.error when invoke returns 200 with error body', async () => {
        sessionFor();
        invokeDataErr('Admin only');
        const { manageUserCall } = await import('./manageUser');
        await expect(manageUserCall('create_email_user', {})).rejects.toThrow('Admin only');
    });
});
// ─── PIN user creation flows ──────────────────────────────────────────────────
describe('createPinUser — apprentice NAPS', () => {
    beforeEach(() => { clearSession(); mockGetSession.mockReset(); mockInvoke.mockReset(); });
    it('sends correct payload', async () => {
        sessionFor('jh_leader');
        invokeOk({ success: true, profile: { id: 'w1' } });
        const { createPinUser } = await import('./manageUser');
        await createPinUser({ name: 'Ramu', employee_id: 'E1', role: 'apprentice', apprentice_type: 'NAPS', jh_group_id: 'g1', pin: '123456' });
        const body = mockInvoke.mock.calls[0][1].body;
        expect(body.action).toBe('create_pin_user');
        expect(body.role).toBe('apprentice');
        expect(body.apprentice_type).toBe('NAPS');
        expect(body.pin).toBe('123456');
    });
});
describe('createPinUser — apprentice CAT', () => {
    beforeEach(() => { clearSession(); mockGetSession.mockReset(); mockInvoke.mockReset(); });
    it('sends apprentice_type CAT', async () => {
        sessionFor('jh_leader');
        invokeOk({ success: true, profile: { id: 'w2' } });
        const { createPinUser } = await import('./manageUser');
        await createPinUser({ name: 'Sita', employee_id: 'E2', role: 'apprentice', apprentice_type: 'CAT', jh_group_id: 'g1', pin: '654321' });
        expect(mockInvoke.mock.calls[0][1].body.apprentice_type).toBe('CAT');
    });
});
describe('createPinUser — on_roll', () => {
    beforeEach(() => { clearSession(); mockGetSession.mockReset(); mockInvoke.mockReset(); });
    it('sends role on_roll with null apprentice_type', async () => {
        sessionFor('jh_leader');
        invokeOk({ success: true, profile: { id: 'w3' } });
        const { createPinUser } = await import('./manageUser');
        await createPinUser({ name: 'Gita', employee_id: 'E3', role: 'on_roll', apprentice_type: null, jh_group_id: 'g1', pin: '111222' });
        const body = mockInvoke.mock.calls[0][1].body;
        expect(body.role).toBe('on_roll');
        expect(body.apprentice_type).toBeNull();
    });
});
// ─── Email user creation flows ────────────────────────────────────────────────
describe('createEmailUser — jh_leader', () => {
    beforeEach(() => { clearSession(); mockGetSession.mockReset(); mockInvoke.mockReset(); });
    it('sends jh_group_id, no dmt_id', async () => {
        sessionFor('admin');
        invokeOk({ success: true, profile: { id: 'u1' } });
        const { createEmailUser } = await import('./manageUser');
        await createEmailUser({ name: 'L', employee_id: 'L1', email: 'l@f.com', password: 'pass1234', role: 'jh_leader', jh_group_id: 'g1', dmt_id: null });
        const body = mockInvoke.mock.calls[0][1].body;
        expect(body.action).toBe('create_email_user');
        expect(body.role).toBe('jh_leader');
        expect(body.jh_group_id).toBe('g1');
        expect(body.dmt_id).toBeNull();
    });
});
describe('createEmailUser — dmt_leader', () => {
    beforeEach(() => { clearSession(); mockGetSession.mockReset(); mockInvoke.mockReset(); });
    it('sends dmt_id, no jh_group_id', async () => {
        sessionFor('admin');
        invokeOk({ success: true, profile: { id: 'u2' } });
        const { createEmailUser } = await import('./manageUser');
        await createEmailUser({ name: 'D', employee_id: 'D1', email: 'd@f.com', password: 'pass1234', role: 'dmt_leader', jh_group_id: null, dmt_id: 'dmt1' });
        const body = mockInvoke.mock.calls[0][1].body;
        expect(body.role).toBe('dmt_leader');
        expect(body.dmt_id).toBe('dmt1');
        expect(body.jh_group_id).toBeNull();
    });
});
describe('createEmailUser — pillar_champion', () => {
    beforeEach(() => { clearSession(); mockGetSession.mockReset(); mockInvoke.mockReset(); });
    it('sends factory-wide role with no group or dmt', async () => {
        sessionFor('admin');
        invokeOk({ success: true, profile: { id: 'u3' } });
        const { createEmailUser } = await import('./manageUser');
        await createEmailUser({ name: 'P', employee_id: 'P1', email: 'p@f.com', password: 'pass1234', role: 'pillar_champion', jh_group_id: null, dmt_id: null });
        const body = mockInvoke.mock.calls[0][1].body;
        expect(body.role).toBe('pillar_champion');
        expect(body.jh_group_id).toBeNull();
        expect(body.dmt_id).toBeNull();
    });
});
describe('createEmailUser — be_team', () => {
    beforeEach(() => { clearSession(); mockGetSession.mockReset(); mockInvoke.mockReset(); });
    it('sends be_team role', async () => {
        sessionFor('admin');
        invokeOk({ success: true, profile: { id: 'u4' } });
        const { createEmailUser } = await import('./manageUser');
        await createEmailUser({ name: 'B', employee_id: 'B1', email: 'b@f.com', password: 'pass1234', role: 'be_team' });
        expect(mockInvoke.mock.calls[0][1].body.role).toBe('be_team');
    });
    it('throws Unauthorized on 401', async () => {
        sessionFor('admin');
        invokeErr('Unauthorized');
        const { createEmailUser } = await import('./manageUser');
        await expect(createEmailUser({ name: 'B', employee_id: 'B1', email: 'b@f.com', password: 'pass1234', role: 'be_team' })).rejects.toThrow('Unauthorized');
    });
    it('throws Admin only on 403', async () => {
        sessionFor('jh_leader');
        invokeDataErr('Admin only');
        const { createEmailUser } = await import('./manageUser');
        await expect(createEmailUser({ name: 'B', employee_id: 'B1', email: 'b@f.com', password: 'pass1234', role: 'be_team' })).rejects.toThrow('Admin only');
    });
});
describe('createEmailUser — admin', () => {
    beforeEach(() => { clearSession(); mockGetSession.mockReset(); mockInvoke.mockReset(); });
    it('sends admin role', async () => {
        sessionFor('admin');
        invokeOk({ success: true, profile: { id: 'u5' } });
        const { createEmailUser } = await import('./manageUser');
        await createEmailUser({ name: 'A', employee_id: 'A1', email: 'a@f.com', password: 'pass1234', role: 'admin' });
        expect(mockInvoke.mock.calls[0][1].body.role).toBe('admin');
    });
});
// ─── Other mutations ──────────────────────────────────────────────────────────
describe('other mutation wrappers', () => {
    beforeEach(() => { clearSession(); mockGetSession.mockReset(); mockInvoke.mockReset(); });
    it('resetPIN sends worker_id and new_pin', async () => {
        sessionFor();
        invokeOk({ success: true });
        const { resetPIN } = await import('./manageUser');
        await resetPIN('w1', '999888');
        const body = mockInvoke.mock.calls[0][1].body;
        expect(body.action).toBe('reset_pin');
        expect(body.worker_id).toBe('w1');
        expect(body.new_pin).toBe('999888');
    });
    it('resetPassword sends worker_id and new_password', async () => {
        sessionFor();
        invokeOk({ success: true });
        const { resetPassword } = await import('./manageUser');
        await resetPassword('u1', 'newpass99');
        const body = mockInvoke.mock.calls[0][1].body;
        expect(body.action).toBe('reset_password');
        expect(body.new_password).toBe('newpass99');
    });
    it('deactivateUser sends worker_id', async () => {
        sessionFor();
        invokeOk({ success: true });
        const { deactivateUser } = await import('./manageUser');
        await deactivateUser('w1');
        const body = mockInvoke.mock.calls[0][1].body;
        expect(body.action).toBe('deactivate_user');
        expect(body.worker_id).toBe('w1');
    });
    it('reactivateUser sends worker_id', async () => {
        sessionFor();
        invokeOk({ success: true });
        const { reactivateUser } = await import('./manageUser');
        await reactivateUser('w1');
        expect(mockInvoke.mock.calls[0][1].body.action).toBe('reactivate_user');
    });
    it('updateUser merges fields correctly', async () => {
        sessionFor();
        invokeOk({ success: true, profile: {} });
        const { updateUser } = await import('./manageUser');
        await updateUser('w1', { name: 'New Name', lang_pref: 'hi' });
        const body = mockInvoke.mock.calls[0][1].body;
        expect(body.action).toBe('update_user');
        expect(body.worker_id).toBe('w1');
        expect(body.name).toBe('New Name');
        expect(body.lang_pref).toBe('hi');
    });
});
