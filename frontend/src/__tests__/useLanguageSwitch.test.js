import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
// Mock the Supabase client (also the one auth.ts imports) and the toast host.
const rpc = vi.fn();
vi.mock('../lib/supabase', () => ({ supabase: { rpc: (...args) => rpc(...args) } }));
const toastSuccess = vi.fn();
vi.mock('sonner', () => ({ toast: { success: (...args) => toastSuccess(...args) } }));
import i18n from '../i18n';
import { useLanguageSwitch } from '../hooks/useLanguageSwitch';
beforeEach(async () => {
    localStorage.clear();
    rpc.mockReset().mockResolvedValue({ error: null });
    toastSuccess.mockReset();
    await i18n.changeLanguage('en');
});
describe('useLanguageSwitch', () => {
    it('email user: switches i18n, persists via set_my_lang_pref RPC, mirrors session, toasts', async () => {
        localStorage.setItem('tpm_session', JSON.stringify({ type: 'email', lang_pref: 'en', worker_id: 'w1' }));
        const { result } = renderHook(() => useLanguageSwitch());
        await act(async () => { await result.current.change('hi'); });
        expect(i18n.language).toBe('hi');
        expect(rpc).toHaveBeenCalledWith('set_my_lang_pref', { p_lang: 'hi' });
        expect(JSON.parse(localStorage.getItem('tpm_session')).lang_pref).toBe('hi');
        expect(toastSuccess).toHaveBeenCalledTimes(1);
    });
    it('PIN user: persists via RPC and updates the nested worker.lang_pref', async () => {
        localStorage.setItem('tpm_session', JSON.stringify({ type: 'pin', worker: { lang_pref: 'en' } }));
        const { result } = renderHook(() => useLanguageSwitch());
        await act(async () => { await result.current.change('gu'); });
        expect(i18n.language).toBe('gu');
        expect(rpc).toHaveBeenCalledWith('set_my_lang_pref', { p_lang: 'gu' });
        expect(JSON.parse(localStorage.getItem('tpm_session')).worker.lang_pref).toBe('gu');
    });
    it('pre-auth (no session): persists tpm_ui_lang and does NOT call the RPC', async () => {
        const { result } = renderHook(() => useLanguageSwitch());
        await act(async () => { await result.current.change('hi'); });
        expect(i18n.language).toBe('hi');
        expect(localStorage.getItem('tpm_ui_lang')).toBe('hi');
        expect(rpc).not.toHaveBeenCalled();
    });
    it('selecting the current language is a no-op (no RPC)', async () => {
        localStorage.setItem('tpm_session', JSON.stringify({ type: 'email', lang_pref: 'en', worker_id: 'w1' }));
        const { result } = renderHook(() => useLanguageSwitch());
        await act(async () => { await result.current.change('en'); });
        expect(rpc).not.toHaveBeenCalled();
    });
    it('RPC failure is a soft failure: UI still switches, no toast, no throw', async () => {
        rpc.mockResolvedValue({ error: { message: 'lang_not_enabled' } });
        localStorage.setItem('tpm_session', JSON.stringify({ type: 'email', lang_pref: 'en', worker_id: 'w1' }));
        const { result } = renderHook(() => useLanguageSwitch());
        await act(async () => { await result.current.change('hi'); });
        expect(i18n.language).toBe('hi');
        expect(toastSuccess).not.toHaveBeenCalled();
    });
});
