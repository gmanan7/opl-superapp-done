import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// Control the module-enablement hook; keep buildEnabledSet real.
const mod = vi.hoisted(() => ({ data: [] }));
vi.mock('../../hooks/mdm', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, useFactoryModules: () => ({ data: mod.data }) };
});
// supabase: LanguageSwitcher hook + useAuth's worker_names lookup. The name query
// resolves to null here (tests assert nav, not the display name).
vi.mock('../../lib/supabase', () => ({
    supabase: {
        rpc: vi.fn(),
        auth: { signOut: vi.fn() },
        from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }),
    },
}));
import i18n from '../../i18n';
import { AppShell } from './AppShell';
function setSession(role, type = 'email') {
    const s = type === 'pin'
        ? { type: 'pin', worker: { worker_id: 'w', factory_id: 'f', jh_group_id: null, dmt_id: null, tpm_role: role, name: 'Tester', lang_pref: 'en' } }
        : { type: 'email', worker_id: 'w', factory_id: 'f', jh_group_id: null, dmt_id: null, role, email: 'a@b.com', lang_pref: 'en' };
    localStorage.setItem('tpm_session', JSON.stringify(s));
}
const modules = (keys) => keys.map((k) => ({ id: k, factory_id: 'f', module_key: k, is_enabled: true, enabled_at: null }));
beforeEach(async () => {
    localStorage.clear();
    mod.data = [];
    await i18n.changeLanguage('en');
});
const renderShell = () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={qc}><MemoryRouter><AppShell /></MemoryRouter></QueryClientProvider>);
};
describe('AppShell — module + role driven navigation', () => {
    it('admin with all modules sees capture nav + the MDM admin group', () => {
        setSession('admin');
        mod.data = modules(['abnormality', 'jh_kpi', 'opl', 'kaizen']);
        renderShell();
        expect(screen.getAllByText('Issues').length).toBeGreaterThan(0); // abnormality (capture, dup desktop+mobile)
        expect(screen.getByText('Master Data')).toBeInTheDocument(); // admin group header (desktop only)
        expect(screen.getByText('Org Structure')).toBeInTheDocument(); // admin-only entry
    });
    it('disabling the kaizen module removes its nav entry (live module-driven nav)', () => {
        setSession('admin');
        mod.data = modules(['abnormality', 'jh_kpi', 'opl']); // kaizen OFF
        renderShell();
        expect(screen.queryByText('Kaizen')).toBeNull();
        expect(screen.getAllByText('OPL').length).toBeGreaterThan(0);
    });
    it('a shop-floor PIN role sees capture surfaces but no admin group', () => {
        setSession('on_roll', 'pin');
        mod.data = modules(['abnormality', 'jh_kpi', 'opl', 'kaizen']);
        renderShell();
        expect(screen.queryByText('Master Data')).toBeNull();
        expect(screen.queryByText('Org Structure')).toBeNull();
        expect(screen.getAllByText('Issues').length).toBeGreaterThan(0);
    });
    it('jh_leader sees People but not Org Structure', () => {
        setSession('jh_leader');
        mod.data = modules(['opl']);
        renderShell();
        expect(screen.getByText('Master Data')).toBeInTheDocument();
        expect(screen.getByText('People')).toBeInTheDocument();
        expect(screen.queryByText('Org Structure')).toBeNull();
    });
});
