import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '../../../i18n';
const { idleMutation, MACHINES } = vi.hoisted(() => {
    const idleMutation = () => ({ mutate: vi.fn(), isPending: false, error: null, reset: vi.fn() });
    const M = (over) => ({
        id: 'm1', factory_id: 'f1', name: 'Press 1', code: 'P1',
        jh_group_id: 'g1', area_id: 'a1', machine_type: 'Offset Press',
        is_active: true, created_at: null,
        jh_group: { name: 'C&C' }, area: { name: 'Press Bay' },
        ...over,
    });
    const MACHINES = [
        M({ id: 'm1', name: 'Press 1' }),
        M({ id: 'm2', name: 'Cutter 1', machine_type: 'Die Cutter' }),
        M({ id: 'm3', name: 'HVAC 1', jh_group_id: 'g9', jh_group: { name: 'Utilities' }, area_id: 'a9', area: { name: 'Roof' }, machine_type: 'HVAC' }),
        M({ id: 'm4', name: 'Old Press', is_active: false }),
    ];
    return { idleMutation, MACHINES };
});
vi.mock('@/hooks/mdm', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        useMachines: vi.fn(() => ({ data: MACHINES, isLoading: false })),
        useOrgStructure: vi.fn(() => ({
            data: {
                dmts: [{
                        id: 'd1', factory_id: 'f1', name: 'Delta', code: 'DL', created_at: null,
                        jhGroups: [{ id: 'g1', factory_id: 'f1', dmt_id: 'd1', name: 'C&C', code: 'CC', is_active: true, created_at: null, areas: [] }],
                    }],
                // g9 has NO DMT — its machines must still surface with the noDmt label
                unassignedJhGroups: [{ id: 'g9', factory_id: 'f1', dmt_id: null, name: 'Utilities', code: 'UT', is_active: true, created_at: null, areas: [] }],
            },
            isLoading: false,
        })),
        useCreateMachine: vi.fn(idleMutation),
        useUpdateMachine: vi.fn(idleMutation),
        useSetMachineActive: vi.fn(idleMutation),
    };
});
import { Machines, filterMachines, groupMachines } from './Machines';
const ROWS = MACHINES;
describe('filterMachines (pure filter logic)', () => {
    it('hides inactive machines by default and shows them with showInactive', () => {
        const base = { groupId: '__all__', areaId: '__all__', type: '__all__' };
        expect(filterMachines(ROWS, { ...base, showInactive: false }).map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
        expect(filterMachines(ROWS, { ...base, showInactive: true })).toHaveLength(4);
    });
    it('filters by machine_type', () => {
        const out = filterMachines(ROWS, { groupId: '__all__', areaId: '__all__', type: 'HVAC', showInactive: true });
        expect(out.map((m) => m.id)).toEqual(['m3']);
    });
    it('filters by group and area', () => {
        const out = filterMachines(ROWS, { groupId: 'g1', areaId: 'a1', type: '__all__', showInactive: true });
        expect(out.map((m) => m.id)).toEqual(['m1', 'm2', 'm4']);
    });
});
describe('groupMachines', () => {
    it('keeps machines from no-DMT groups — nothing is dropped', () => {
        const grouped = groupMachines(ROWS);
        const names = grouped.map((g) => g.groupName);
        expect(names).toContain('Utilities');
        expect(grouped.flatMap((g) => g.machines)).toHaveLength(4);
    });
});
describe('Machines screen', () => {
    it('renders every active machine including those under no-DMT groups, with the noDmt label', () => {
        render(<MemoryRouter><Machines /></MemoryRouter>);
        expect(screen.getByText('Press 1')).toBeInTheDocument();
        expect(screen.getByText('HVAC 1')).toBeInTheDocument();
        expect(screen.getByText('No DMT assigned')).toBeInTheDocument(); // first-class case
        expect(screen.queryByText('Old Press')).not.toBeInTheDocument(); // inactive hidden by default
        expect(screen.getByText('3 machines')).toBeInTheDocument();
    });
});
