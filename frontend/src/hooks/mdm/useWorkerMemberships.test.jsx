// Step 7 Fix 1 — membership mutations must invalidate the workers list AND
// the batch-membership query (the +N column went stale until manual refresh).
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const { state } = vi.hoisted(() => ({
    state: { rows: [{ id: 'm1', worker_profile_id: 'w1', jh_group_id: 'g1', dmt_id: null, is_active: true }] },
}));
vi.mock('../../lib/supabase', () => {
    const builder = () => {
        const b = {};
        const chain = ['insert', 'update', 'select', 'eq', 'in', 'order'];
        for (const m of chain)
            b[m] = vi.fn(() => b);
        b.then = (resolve) => resolve({ data: state.rows, error: null });
        return b;
    };
    return { supabase: { from: vi.fn(builder) } };
});
vi.mock('../useAbnormalities', () => ({
    getSessionContext: () => ({ worker_id: 'admin1', factory_id: 'f1', jh_group_id: null, dmt_id: null, role: 'admin' }),
}));
import { useAddMembership, useRemoveMembership } from './useWorkerMemberships';
function setup() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }) => (<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>);
    return { queryClient, spy, wrapper };
}
function invalidatedKeys(spy) {
    return spy.mock.calls.map((c) => JSON.stringify(c[0].queryKey));
}
describe('membership mutation invalidations (Step 7 Fix 1)', () => {
    it('useAddMembership invalidates per-worker, batch, AND workers list', async () => {
        const { spy, wrapper } = setup();
        const { result } = renderHook(() => useAddMembership(), { wrapper });
        result.current.mutate({ workerId: 'w1', jhGroupId: 'g1' });
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        const keys = invalidatedKeys(spy);
        expect(keys).toContain(JSON.stringify(['mdm', 'memberships', 'w1']));
        expect(keys).toContain(JSON.stringify(['mdm', 'memberships-batch']));
        expect(keys).toContain(JSON.stringify(['mdm', 'workers']));
    });
    it('useRemoveMembership invalidates per-worker, batch, AND workers list', async () => {
        const { spy, wrapper } = setup();
        const { result } = renderHook(() => useRemoveMembership(), { wrapper });
        result.current.mutate({ membershipId: 'm1', workerId: 'w1' });
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        const keys = invalidatedKeys(spy);
        expect(keys).toContain(JSON.stringify(['mdm', 'memberships', 'w1']));
        expect(keys).toContain(JSON.stringify(['mdm', 'memberships-batch']));
        expect(keys).toContain(JSON.stringify(['mdm', 'workers']));
    });
});
