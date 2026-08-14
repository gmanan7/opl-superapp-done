import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '../../../i18n';
const { state, idle } = vi.hoisted(() => {
    const idle = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, error: null, reset: vi.fn() });
    const state = {
        workers: { rows: [], total: 0 },
        loading: false,
        error: null,
        org: {
            dmts: [{ id: 'd1', factory_id: 'f1', name: 'Delta', code: 'DL', created_at: null,
                    jhGroups: [{ id: 'g1', factory_id: 'f1', dmt_id: 'd1', name: 'C&C', code: 'CC', is_active: true, created_at: null, areas: [] }] }],
            unassignedJhGroups: [],
        },
        deactivateMutate: vi.fn(),
        session: { worker_id: 'admin1', factory_id: 'f1', jh_group_id: null, dmt_id: null, role: 'admin' },
    };
    return { state, idle };
});
vi.mock('@/hooks/mdm', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        useWorkers: vi.fn(() => ({
            data: state.loading || state.error ? undefined : state.workers,
            isLoading: state.loading,
            error: state.error,
            refetch: vi.fn(),
        })),
        useOrgStructure: vi.fn(() => ({ data: state.org, isLoading: false, error: null })),
        useMembershipsByWorkers: vi.fn(() => ({ data: new Map([['w2', [{ id: 'm1', path: ['C&C', 'Delta'] }]]]) })),
        useDeactivateWorker: vi.fn(() => ({ ...idle(), mutate: state.deactivateMutate })),
        useReactivateWorker: vi.fn(idle),
        useGeneratePin: vi.fn(idle),
        useResetWorkerPassword: vi.fn(idle),
        useInvitePinWorker: vi.fn(idle),
        useInviteEmailWorker: vi.fn(idle),
        useUpdateWorker: vi.fn(idle),
        useWorkerMemberships: vi.fn(() => ({ data: [], isLoading: false })),
        useAddMembership: vi.fn(idle),
        useRemoveMembership: vi.fn(idle),
    };
});
vi.mock('../../../hooks/useAbnormalities', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, getSessionContext: () => state.session };
});
import { People, reconcileFilters, toWorkerFilters, formatLastLogin, initialsOf } from './People';
import { expandRoleGroup, ROLE_GROUP_MAP, MdmError } from '@/hooks/mdm';
import { DEFAULT_ROSTER_FILTERS } from '@/components/patterns';
const W = (over) => ({
    id: 'w1', factory_id: 'f1', employee_id: 'E1', name: 'Anu Rao', role: 'apprentice',
    apprentice_type: null, jh_group_id: 'g1', dmt_id: 'd1', lang_pref: 'en',
    is_active: true, created_at: null, last_login_at: '2026-06-11T08:00:00Z', deactivated_at: null,
    jh_group: { name: 'C&C' }, dmt: { name: 'Delta' }, ...over,
});
beforeEach(() => {
    state.workers = { rows: [], total: 0 };
    state.loading = false;
    state.error = null;
    state.deactivateMutate.mockClear();
});
describe('expandRoleGroup (§7.1 — the single mapping)', () => {
    it('expands every group to canonical codes', () => {
        expect(expandRoleGroup('all')).toBeNull();
        expect(expandRoleGroup('shop_floor')).toEqual(['apprentice', 'on_roll']);
        expect(expandRoleGroup('leaders')).toEqual(['jh_leader', 'dmt_member', 'dmt_leader']);
        expect(expandRoleGroup('champions_teams')).toEqual(['pillar_champion', 'be_team']);
        expect(expandRoleGroup('admin')).toEqual(['admin']);
    });
    it('covers all eight canonical codes exactly once across groups', () => {
        const all = Object.values(ROLE_GROUP_MAP).flat().sort();
        expect(all).toEqual(['admin', 'apprentice', 'be_team', 'dmt_leader', 'dmt_member', 'jh_leader', 'on_roll', 'pillar_champion']);
    });
});
describe('reconcileFilters (§7.2 cascading reset)', () => {
    const groups = [{ id: 'g1', label: 'C&C', dmtId: 'd1' }, { id: 'g9', label: 'Util', dmtId: null }];
    it('resets DMT when it is not the parent of the chosen JH group', () => {
        const { next, dmtWasReset } = reconcileFilters({ ...DEFAULT_ROSTER_FILTERS, jhGroup: 'g1', dmt: 'd2' }, groups);
        expect(dmtWasReset).toBe(true);
        expect(next.dmt).toBe('all');
    });
    it('keeps DMT when it matches the group parent', () => {
        const { dmtWasReset } = reconcileFilters({ ...DEFAULT_ROSTER_FILTERS, jhGroup: 'g1', dmt: 'd1' }, groups);
        expect(dmtWasReset).toBe(false);
    });
    it('never resets the no_dmt sentinel', () => {
        const { dmtWasReset } = reconcileFilters({ ...DEFAULT_ROSTER_FILTERS, jhGroup: 'g1', dmt: 'no_dmt' }, groups);
        expect(dmtWasReset).toBe(false);
    });
});
describe('toWorkerFilters (UI → wire boundary)', () => {
    it('sends the group key and the no_dmt sentinel through', () => {
        const wf = toWorkerFilters({ q: 'ram', role: 'leaders', jhGroup: 'g1', dmt: 'no_dmt', status: 'active' }, 2);
        expect(wf).toEqual({ roleGroup: 'leaders', jhGroupId: 'g1', dmtId: 'no_dmt', status: 'active', search: 'ram', page: 2 });
    });
});
describe('formatLastLogin / initialsOf', () => {
    const now = new Date('2026-06-11T12:00:00Z');
    it('relative within 7 days, absolute beyond', () => {
        expect(formatLastLogin('2026-06-11T10:00:00Z', now, 'en')).toBe('2 hrs ago');
        expect(formatLastLogin('2026-05-01T10:00:00Z', now, 'en')).toMatch(/1 May 2026/);
        expect(formatLastLogin(null, now, 'en')).toBe('—');
    });
    it('initials: first grapheme of first two tokens (multi-script)', () => {
        expect(initialsOf('Anu Rao')).toBe('AR');
        expect(initialsOf('रमेश कुमार शर्मा')).toBe('रक');
        expect(initialsOf('M.')).toBe('M');
    });
});
describe('People screen — the five states', () => {
    it('loading renders 8 skeleton rows', () => {
        state.loading = true;
        render(<MemoryRouter><People /></MemoryRouter>);
        expect(screen.getByTestId('roster-loading').children).toHaveLength(8);
    });
    it('empty-filter state offers Clear filters', () => {
        state.workers = { rows: [], total: 0 };
        render(<MemoryRouter><People /></MemoryRouter>);
        // activate a filter via the filter bar state by searching
        fireEvent.change(screen.getByLabelText('Search name, role…'), { target: { value: 'zz' } });
        expect(screen.getByText('No people match these filters')).toBeInTheDocument();
        expect(screen.getByText('Clear filters')).toBeInTheDocument();
    });
    it('empty-onboarding state (no filters, zero people)', () => {
        render(<MemoryRouter><People /></MemoryRouter>);
        expect(screen.getByText('No people in this roster yet')).toBeInTheDocument();
    });
    it('error state shows the code and retry', () => {
        state.error = new MdmError('denied');
        render(<MemoryRouter><People /></MemoryRouter>);
        expect(screen.getByText("Couldn't load roster")).toBeInTheDocument();
        expect(screen.getByText('DENIED')).toBeInTheDocument();
        expect(screen.getByText('Try again')).toBeInTheDocument();
    });
    it('rows render with status badge, membership +N, and lang attr', () => {
        state.workers = {
            rows: [W({}), W({ id: 'w2', name: 'रमेश कुमार शर्मा', lang_pref: 'hi', role: 'on_roll' })],
            total: 2,
        };
        render(<MemoryRouter><People /></MemoryRouter>);
        const hindiCells = screen.getAllByText('रमेश कुमार शर्मा');
        expect(hindiCells.some((el) => el.getAttribute('lang') === 'hi')).toBe(true);
        expect(screen.getAllByText('✓').length).toBeGreaterThanOrEqual(2);
        expect(screen.getByRole('button', { name: 'Additional memberships beyond the primary' })).toHaveTextContent('+1');
    });
});
describe('Deactivate flow — B5 reason required before confirm', () => {
    it('primary stays disabled until a reason is selected; other requires text', () => {
        state.workers = { rows: [W({})], total: 1 };
        render(<MemoryRouter><People /></MemoryRouter>);
        fireEvent.click(screen.getByRole('button', { name: 'Anu Rao, Apprentice, Active' }));
        fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
        const primary = screen.getByRole('button', { name: 'Deactivate' });
        expect(primary).toBeDisabled(); // no reason yet
        fireEvent.click(screen.getByLabelText('Other (specify)'));
        expect(primary).toBeDisabled(); // other without text
        fireEvent.change(screen.getByPlaceholderText('Reason (min 3 characters)…'), { target: { value: 'duplicate row' } });
        expect(primary).toBeEnabled();
        fireEvent.click(screen.getByLabelText('Retired'));
        expect(primary).toBeEnabled();
    });
});
describe('Deactivate flow (§9.1 step-confirm)', () => {
    it('first press arms, second press confirms — mutate fires exactly once, after cool-off', async () => {
        vi.useFakeTimers();
        state.workers = { rows: [W({})], total: 1 };
        render(<MemoryRouter><People /></MemoryRouter>);
        // Open via the mobile card → row sheet (Radix dropdowns don't open on
        // jsdom click events; the sheet path exercises the identical modal).
        fireEvent.click(screen.getByRole('button', { name: 'Anu Rao, Apprentice, Active' }));
        fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
        // modal open — B5: select a reason so the primary enables
        fireEvent.click(screen.getByLabelText('Retired'));
        const primary = screen.getByRole('button', { name: 'Deactivate' });
        fireEvent.click(primary);
        expect(state.deactivateMutate).not.toHaveBeenCalled(); // armed, not fired
        expect(screen.getAllByText(/Press again to confirm/).length).toBeGreaterThanOrEqual(1);
        // during cool-off the button is disabled
        fireEvent.click(screen.getByRole('button', { name: 'Press again to confirm' }));
        expect(state.deactivateMutate).not.toHaveBeenCalled();
        await act(async () => { vi.advanceTimersByTime(700); });
        fireEvent.click(screen.getByRole('button', { name: 'Press again to confirm' }));
        expect(state.deactivateMutate).toHaveBeenCalledTimes(1);
        vi.useRealTimers();
    });
});
