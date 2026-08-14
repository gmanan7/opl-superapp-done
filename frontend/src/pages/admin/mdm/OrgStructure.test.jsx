import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../../i18n';
const { idleMutation, GROUP_A, GROUP_UNASSIGNED } = vi.hoisted(() => {
    const idleMutation = () => ({ mutate: vi.fn(), isPending: false, error: null, reset: vi.fn() });
    const GROUP_A = {
        id: 'g1', factory_id: 'f1', dmt_id: 'd1', name: 'C&C', code: 'CC',
        is_active: true, created_at: null,
        areas: [
            { id: 'a1', factory_id: 'f1', jh_group_id: 'g1', name: 'Press Bay', is_active: true },
            { id: 'a2', factory_id: 'f1', jh_group_id: 'g1', name: 'Old Bay', is_active: false },
        ],
    };
    const GROUP_UNASSIGNED = {
        id: 'g9', factory_id: 'f1', dmt_id: null, name: 'Utilities', code: 'UT',
        is_active: true, created_at: null, areas: [],
    };
    return { idleMutation, GROUP_A, GROUP_UNASSIGNED };
});
vi.mock('@/hooks/mdm', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        useOrgStructure: vi.fn(() => ({
            data: {
                dmts: [{ id: 'd1', factory_id: 'f1', name: 'Delta', code: 'DL', created_at: null, jhGroups: [GROUP_A] }],
                unassignedJhGroups: [GROUP_UNASSIGNED],
            },
            isLoading: false,
        })),
        useCreateDmt: vi.fn(idleMutation), useUpdateDmt: vi.fn(idleMutation),
        useCreateJhGroup: vi.fn(idleMutation), useUpdateJhGroup: vi.fn(idleMutation),
        useSetJhGroupActive: vi.fn(idleMutation),
        useCreateArea: vi.fn(idleMutation), useUpdateArea: vi.fn(idleMutation),
        useSetAreaActive: vi.fn(idleMutation),
    };
});
import { OrgStructure, visibleGroups } from './OrgStructure';
beforeEach(() => {
    localStorage.clear();
});
describe('visibleGroups (active/inactive filter logic)', () => {
    it('hides inactive areas by default', () => {
        const v = visibleGroups([GROUP_A], false);
        expect(v[0].areas.map((a) => a.name)).toEqual(['Press Bay']);
    });
    it('shows inactive areas when showInactive', () => {
        const v = visibleGroups([GROUP_A], true);
        expect(v[0].areas).toHaveLength(2);
    });
    it('hides inactive groups by default', () => {
        const inactive = { ...GROUP_A, is_active: false };
        expect(visibleGroups([inactive], false)).toHaveLength(0);
        expect(visibleGroups([inactive], true)).toHaveLength(1);
    });
});
describe('OrgStructure screen', () => {
    it('renders the DMT and the unassigned JH-group bucket', () => {
        render(<OrgStructure />);
        expect(screen.getByText('Delta')).toBeInTheDocument();
        expect(screen.getByText('Utilities')).toBeInTheDocument();
        expect(screen.getByText('JH Groups without a DMT')).toBeInTheDocument();
    });
    it('expands a DMT to reveal its JH groups, then a group to reveal areas', () => {
        render(<OrgStructure />);
        expect(screen.queryByText('C&C')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Delta' }));
        expect(screen.getByText('C&C')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'C&C' }));
        expect(screen.getByText('Press Bay')).toBeInTheDocument();
        expect(screen.queryByText('Old Bay')).not.toBeInTheDocument(); // inactive hidden by default
    });
    it('has no DMT deactivate action (dmt has no is_active — contract §5)', () => {
        render(<OrgStructure />);
        // Top-level DMT row offers Edit only; Deactivate appears only on group/area rows.
        const deactivates = screen.queryAllByText('Deactivate');
        expect(deactivates.length).toBe(1); // the visible unassigned group row only (tree collapsed)
    });
});
