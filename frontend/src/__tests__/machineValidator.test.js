// Step 8 — machine-validator matrix. machine.code has NO DB unique constraint
// (verified 2026-06-11): this validator is the only duplicate enforcement.
import { describe, it, expect } from 'vitest';
import { validateMachineRow, validateMachineRows, } from '../lib/shared/machine-validator.js';
const G1 = 'g1-uuid';
const G_INACTIVE = 'g2-uuid';
const AREA1 = 'a1-uuid';
function ctx(overrides = {}) {
    return {
        factoryId: 'f1-uuid',
        jhGroupsByCode: new Map([
            ['jh-a', { id: G1, dmtId: 'd1-uuid', active: true }],
            ['jh-x', { id: G_INACTIVE, dmtId: null, active: false }],
        ]),
        areasByGroup: new Map([[G1, new Map([['filling line', AREA1]])]]),
        existingMachineCodes: new Set(['mx-100']),
        existingNameGroupAreaTriples: new Set([`tub filler 1|${G1}|filling line`]),
        knownMachineTypes: new Set(['die cutter', 'tub & lid']),
        ...overrides,
    };
}
const validMachine = {
    name: 'Gluer 7',
    code: 'MX-200',
    machine_type: 'Die Cutter',
    jh_group_code: 'JH-A',
    area_name: 'Filling Line',
};
function codesOf(result) {
    return result.codes.map((c) => `${c.field}:${c.code}`);
}
describe('validateMachineRow — ok and warning tiers', () => {
    it('valid machine with known type → ok, area resolved within group', () => {
        const r = validateMachineRow(validMachine, ctx());
        expect(r.tier).toBe('ok');
        expect(r.resolved).toMatchObject({
            name: 'Gluer 7',
            code: 'mx-200',
            machine_type: 'Die Cutter',
            new_machine_type: false,
            jh_group_id: G1,
            area_id: AREA1,
        });
    });
    it('new machine_type → warning tier, row still resolvable (commits)', () => {
        const r = validateMachineRow({ ...validMachine, machine_type: 'Laser Welder' }, ctx());
        expect(r.tier).toBe('warning');
        expect(codesOf(r)).toContain('machine_type:new_machine_type_warning');
        expect(r.resolved?.new_machine_type).toBe(true);
        expect(r.resolved?.machine_type).toBe('Laser Welder');
    });
    it('machine_type comparison is case-insensitive (no spurious warning)', () => {
        const r = validateMachineRow({ ...validMachine, machine_type: 'TUB & LID' }, ctx());
        expect(r.tier).toBe('ok');
    });
    it('optional code and area_name may be absent', () => {
        const r = validateMachineRow({ name: 'Bare Machine', jh_group_code: 'jh-a' }, ctx());
        expect(r.tier).toBe('ok');
        expect(r.resolved?.code).toBeNull();
        expect(r.resolved?.area_id).toBeNull();
    });
});
describe('validateMachineRow — error codes', () => {
    it('required_field_missing: name and jh_group_code', () => {
        const r = validateMachineRow({}, ctx());
        expect(codesOf(r)).toContain('name:required_field_missing');
        expect(codesOf(r)).toContain('jh_group_code:required_field_missing');
    });
    it('name_invalid beyond 100 chars', () => {
        expect(codesOf(validateMachineRow({ ...validMachine, name: 'x'.repeat(101) }, ctx()))).toContain('name:name_invalid');
    });
    it('jh_group_not_found / jh_group_inactive', () => {
        expect(codesOf(validateMachineRow({ ...validMachine, jh_group_code: 'nope' }, ctx()))).toContain('jh_group_code:jh_group_not_found');
        expect(codesOf(validateMachineRow({ ...validMachine, jh_group_code: 'jh-x' }, ctx()))).toContain('jh_group_code:jh_group_inactive');
    });
    it('machine_code format + duplicate vs ACTIVE machines (case-insensitive)', () => {
        expect(codesOf(validateMachineRow({ ...validMachine, code: 'bad*code' }, ctx()))).toContain('code:machine_code_invalid_format');
        expect(codesOf(validateMachineRow({ ...validMachine, code: 'MX-100' }, ctx()))).toContain('code:machine_code_duplicate_in_db');
    });
    it('area_not_found_in_jh_group — no create-on-the-fly', () => {
        expect(codesOf(validateMachineRow({ ...validMachine, area_name: 'Ghost Area' }, ctx()))).toContain('area_name:area_not_found_in_jh_group');
    });
    it('name_group_duplicate_in_db on the (name, group, area) triple', () => {
        const r = validateMachineRow({ name: ' TUB  Filler 1 ', code: 'MX-300', jh_group_code: 'jh-a', area_name: 'Filling Line' }, ctx());
        expect(codesOf(r)).toContain('name:name_group_duplicate_in_db');
    });
    it('error rows never carry the new-type warning or a resolved payload', () => {
        const r = validateMachineRow({ name: '', machine_type: 'Brand New Type', jh_group_code: 'jh-a' }, ctx());
        expect(r.tier).toBe('error');
        expect(codesOf(r)).not.toContain('machine_type:new_machine_type_warning');
        expect(r.resolved).toBeUndefined();
    });
});
describe('validateMachineRows — within-file duplicates (both rows fail)', () => {
    it('machine_code_duplicate_in_file flags every colliding row', () => {
        const results = validateMachineRows([
            { name: 'M One', code: 'MX-500', jh_group_code: 'jh-a' },
            { name: 'M Two', code: 'mx-500', jh_group_code: 'jh-a' },
        ], ctx());
        for (const r of results) {
            expect(r.tier).toBe('error');
            expect(codesOf(r)).toContain('code:machine_code_duplicate_in_file');
        }
    });
    it('name_group_duplicate_in_file on matching triples; distinct areas stay ok', () => {
        const results = validateMachineRows([
            { name: 'Press A', jh_group_code: 'jh-a', area_name: 'Filling Line' },
            { name: 'press  a', jh_group_code: 'JH-A', area_name: 'Filling Line' },
            { name: 'Press A', jh_group_code: 'jh-a' },
        ], ctx());
        expect(codesOf(results[0])).toContain('name:name_group_duplicate_in_file');
        expect(codesOf(results[1])).toContain('name:name_group_duplicate_in_file');
        expect(results[2].tier).toBe('ok');
    });
    it('warning rows survive the bulk wrapper as warnings', () => {
        const results = validateMachineRows([{ ...validMachine, code: 'MX-700', machine_type: 'Laser Welder' }], ctx());
        expect(results[0].tier).toBe('warning');
    });
});
