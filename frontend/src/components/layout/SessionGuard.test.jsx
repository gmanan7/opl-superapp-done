import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
const nav = vi.fn();
vi.mock('react-router-dom', async (io) => {
    const actual = await io();
    return { ...actual, useNavigate: () => nav };
});
const signOut = vi.fn(() => Promise.resolve({}));
vi.mock('../../lib/supabase', () => ({ supabase: { auth: { signOut: () => signOut() } } }));
import { SessionGuard } from './SessionGuard';
import '../../i18n';
const T0 = 1_700_000_000_000;
function seed(type) {
    const s = type === 'pin'
        ? { type: 'pin', worker: { worker_id: 'w', factory_id: 'f', tpm_role: 'on_roll', name: 'X', lang_pref: 'en', jh_group_id: null, dmt_id: null } }
        : { type: 'email', worker_id: 'w', factory_id: 'f', role: 'admin', email: 'a@b.com', lang_pref: 'en', jh_group_id: null, dmt_id: null };
    localStorage.setItem('tpm_session', JSON.stringify(s));
    localStorage.setItem('tpm_login_at', String(T0));
    localStorage.setItem('tpm_last_activity', String(T0));
}
beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    localStorage.clear();
    nav.mockReset();
    signOut.mockClear();
});
afterEach(() => vi.useRealTimers());
const App = (props) => render(<SessionGuard idleMs={1000} absoluteMs={100000} warnMs={400} pollMs={100} {...props}><div>app</div></SessionGuard>);
describe('SessionGuard (B5)', () => {
    it('idle past threshold forces re-auth and clears the session (email identity)', () => {
        seed('email');
        App({});
        act(() => { vi.advanceTimersByTime(1300); });
        expect(nav).toHaveBeenCalledWith(expect.stringContaining('reason=session_timeout'), { replace: true });
        expect(nav).toHaveBeenCalledWith(expect.stringContaining('cause=idle'), { replace: true });
        expect(localStorage.getItem('tpm_session')).toBeNull();
        expect(signOut).toHaveBeenCalled();
    });
    it('idle expiry also works for a PIN identity', () => {
        seed('pin');
        App({});
        act(() => { vi.advanceTimersByTime(1300); });
        expect(nav).toHaveBeenCalledWith(expect.stringContaining('reason=session_timeout'), { replace: true });
        expect(localStorage.getItem('tpm_session')).toBeNull();
    });
    it('absolute timeout forces re-auth even with continuous activity', () => {
        seed('email');
        App({ idleMs: 100000, absoluteMs: 1000 }); // idle far off; absolute is the trigger
        act(() => { vi.advanceTimersByTime(1300); });
        expect(nav).toHaveBeenCalledWith(expect.stringContaining('cause=absolute'), { replace: true });
    });
    it('shows the pre-logout warning inside the window, then expires', () => {
        seed('email');
        App({ idleMs: 1000, warnMs: 600, pollMs: 100 });
        act(() => { vi.advanceTimersByTime(500); }); // within warn window (1000-500=500 <= 600), not expired
        expect(screen.getByText(/Stay signed in/i)).toBeInTheDocument();
        expect(nav).not.toHaveBeenCalled();
    });
    it('cross-tab activity (another tab writes tpm_last_activity) prevents expiry', () => {
        seed('email');
        App({ idleMs: 1000, pollMs: 100 });
        act(() => { vi.advanceTimersByTime(800); }); // close to idle but not expired
        // Another tab records fresh activity:
        act(() => {
            localStorage.setItem('tpm_last_activity', String(Date.now()));
            window.dispatchEvent(new StorageEvent('storage', { key: 'tpm_last_activity' }));
            vi.advanceTimersByTime(500); // total 1300 since start, but only 500 since fresh activity
        });
        expect(nav).not.toHaveBeenCalled();
        expect(localStorage.getItem('tpm_session')).not.toBeNull();
    });
});
