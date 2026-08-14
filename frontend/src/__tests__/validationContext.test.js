// Step 8 — validation-context builders against a mocked service-role client.
// Pins the prefetch shapes the pure validators depend on, including the
// real-constraint behavior: employee_ids collected across ALL rows (active
// AND inactive), name+group pairs across ACTIVE only.
import { describe, it, expect } from 'vitest';
import { buildWorkerContext, buildMachineContext, addEmailExistence, } from '../lib/shared/validation-context.js';
function mockDb(tables, rpcResult = []) {
    const rpcCalls = [];
    return {
        rpcCalls,
        from(table) {
            return {
                select() {
                    return {
                        eq() {
                            return Promise.resolve({ data: tables[table] ?? [], error: null });
                        },
                    };
                },
            };
        },
        rpc(name, args) {
            rpcCalls.push({ name, args });
            return Promise.resolve({ data: rpcResult, error: null });
        },
    };
}
function failingDb(failTable) {
    return {
        from(table) {
            return {
                select() {
                    return {
                        eq() {
                            return Promise.resolve(table === failTable ? { data: null, error: { message: 'boom' } } : { data: [], error: null });
                        },
                    };
                },
            };
        },
        rpc() {
            return Promise.resolve({ data: null, error: { message: 'boom' } });
        },
    };
}
const FACTORY = 'f1-uuid';
describe('buildWorkerContext', () => {
    const tables = {
        jh_group: [
            { id: 'g1', code: 'JH-A', dmt_id: 'd1', is_active: true },
            { id: 'g2', code: 'JH-X', dmt_id: null, is_active: false },
        ],
        dmt: [{ id: 'd1', code: 'DMT-1' }],
        worker_profile: [
            { name: 'Ram  Patel', employee_id: 'EMP-1', jh_group_id: 'g1', is_active: true },
            { name: 'Gone Worker', employee_id: 'EMP-2', jh_group_id: 'g1', is_active: false },
            { name: 'No Group', employee_id: null, jh_group_id: null, is_active: true },
        ],
    };
    it('maps groups and dmts by lowercased code with active flags', async () => {
        const ctx = await buildWorkerContext(mockDb(tables), FACTORY);
        expect(ctx.jhGroupsByCode.get('jh-a')).toEqual({ id: 'g1', dmtId: 'd1', active: true });
        expect(ctx.jhGroupsByCode.get('jh-x')?.active).toBe(false);
        expect(ctx.dmtsByCode.get('dmt-1')).toEqual({ id: 'd1' });
    });
    it('collects employee_ids across ALL rows (real UNIQUE constraint shape)', async () => {
        const ctx = await buildWorkerContext(mockDb(tables), FACTORY);
        expect(ctx.existingEmployeeIds.has('emp-1')).toBe(true);
        expect(ctx.existingEmployeeIds.has('emp-2')).toBe(true); // inactive row still blocks
    });
    it('collects name+group pairs for ACTIVE workers only, normalized', async () => {
        const ctx = await buildWorkerContext(mockDb(tables), FACTORY);
        expect(ctx.existingNameGroupPairs.has('ram patel|g1')).toBe(true);
        expect(ctx.existingNameGroupPairs.has('gone worker|g1')).toBe(false);
    });
    it('starts with empty existingEmails (filled by addEmailExistence)', async () => {
        const ctx = await buildWorkerContext(mockDb(tables), FACTORY);
        expect(ctx.existingEmails.size).toBe(0);
    });
    it('throws sanitized context_fetch_failed on query error (D5)', async () => {
        await expect(buildWorkerContext(failingDb('worker_profile'), FACTORY)).rejects.toThrow('context_fetch_failed');
    });
});
describe('addEmailExistence', () => {
    const tables = { jh_group: [], dmt: [], worker_profile: [] };
    it('dedupes + lowercases inputs, fills the context set from the RPC result', async () => {
        const db = mockDb(tables, ['taken@npf.co']);
        const ctx = await buildWorkerContext(db, FACTORY);
        await addEmailExistence(db, ctx, ['Taken@NPF.co', 'taken@npf.co', 'free@npf.co']);
        expect(db.rpcCalls).toHaveLength(1);
        expect(db.rpcCalls[0].name).toBe('check_emails_exist');
        expect(db.rpcCalls[0].args).toEqual({ emails: ['taken@npf.co', 'free@npf.co'] });
        expect(ctx.existingEmails.has('taken@npf.co')).toBe(true);
        expect(ctx.existingEmails.has('free@npf.co')).toBe(false);
    });
    it('skips the RPC entirely when no emails are present', async () => {
        const db = mockDb(tables);
        const ctx = await buildWorkerContext(db, FACTORY);
        await addEmailExistence(db, ctx, []);
        expect(db.rpcCalls).toHaveLength(0);
    });
});
describe('buildMachineContext', () => {
    const tables = {
        jh_group: [{ id: 'g1', code: 'JH-A', dmt_id: 'd1', is_active: true }],
        area: [
            { id: 'a1', jh_group_id: 'g1', name: ' Filling  Line ', is_active: true },
            { id: 'a2', jh_group_id: 'g1', name: 'Old Area', is_active: false },
        ],
        machine: [
            {
                name: 'Tub Filler 1',
                code: 'MX-100',
                machine_type: 'Tub & Lid',
                jh_group_id: 'g1',
                area_id: 'a1',
                is_active: true,
            },
            {
                name: 'Retired Press',
                code: 'MX-OLD',
                machine_type: 'Offset Press',
                jh_group_id: 'g1',
                area_id: null,
                is_active: false,
            },
        ],
    };
    it('maps ACTIVE areas per group by normalized name', async () => {
        const ctx = await buildMachineContext(mockDb(tables), FACTORY);
        expect(ctx.areasByGroup.get('g1')?.get('filling line')).toBe('a1');
        expect(ctx.areasByGroup.get('g1')?.has('old area')).toBe(false);
    });
    it('collects ACTIVE machine codes only, lowercased', async () => {
        const ctx = await buildMachineContext(mockDb(tables), FACTORY);
        expect(ctx.existingMachineCodes.has('mx-100')).toBe(true);
        expect(ctx.existingMachineCodes.has('mx-old')).toBe(false);
    });
    it('builds (name|group|areaName) triples for ACTIVE machines', async () => {
        const ctx = await buildMachineContext(mockDb(tables), FACTORY);
        expect(ctx.existingNameGroupAreaTriples.has('tub filler 1|g1|filling line')).toBe(true);
    });
    it('knownMachineTypes includes types from inactive machines (taxonomy memory)', async () => {
        const ctx = await buildMachineContext(mockDb(tables), FACTORY);
        expect(ctx.knownMachineTypes.has('tub & lid')).toBe(true);
        expect(ctx.knownMachineTypes.has('offset press')).toBe(true);
    });
    it('throws sanitized context_fetch_failed on query error (D5)', async () => {
        await expect(buildMachineContext(failingDb('machine'), FACTORY)).rejects.toThrow('context_fetch_failed');
    });
});
