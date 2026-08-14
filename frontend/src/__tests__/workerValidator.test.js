// Step 8 — worker-validator matrix: every result code reachable, resolved
// payload correct, within-file duplicate handling (both rows fail).
import { describe, it, expect } from 'vitest';
import { validateWorkerRow, validateWorkerRows, } from '../lib/shared/worker-validator.js';
const G1 = 'g1-uuid';
const G2 = 'g2-uuid';
const G_INACTIVE = 'g3-uuid';
const D1 = 'd1-uuid';
const D2 = 'd2-uuid';
function ctx(overrides = {}) {
    return {
        factoryId: 'f1-uuid',
        jhGroupsByCode: new Map([
            ['jh-a', { id: G1, dmtId: D1, active: true }],
            ['jh-b', { id: G2, dmtId: D2, active: true }],
            ['jh-x', { id: G_INACTIVE, dmtId: D1, active: false }],
        ]),
        dmtsByCode: new Map([
            ['dmt-1', { id: D1 }],
            ['dmt-2', { id: D2 }],
        ]),
        existingEmployeeIds: new Set(['emp-100']),
        existingNameGroupPairs: new Set([`ram patel|${G1}`]),
        existingEmails: new Set(['taken@npf.co']),
        ...overrides,
    };
}
const validApprentice = {
    name: 'Sita Devi',
    role: 'apprentice',
    jh_group_code: 'JH-A',
    apprentice_type: 'NAPS',
    employee_id: 'EMP-201',
};
function codesOf(result) {
    return result.codes.map((c) => `${c.field}:${c.code}`);
}
describe('validateWorkerRow — ok paths', () => {
    it('valid apprentice resolves group, derives dmt from group, defaults lang to en', () => {
        const r = validateWorkerRow(validApprentice, ctx(), 'admin');
        expect(r.tier).toBe('ok');
        expect(r.resolved).toMatchObject({
            name: 'Sita Devi',
            role: 'apprentice',
            apprentice_type: 'NAPS',
            jh_group_id: G1,
            dmt_id: D1,
            employee_id: 'emp-201',
            lang_pref: 'en',
            email: null,
        });
    });
    it('lowercase apprentice_type accepted and upcased in resolved payload', () => {
        const r = validateWorkerRow({ ...validApprentice, apprentice_type: 'cat' }, ctx(), 'admin');
        expect(r.tier).toBe('ok');
        expect(r.resolved?.apprentice_type).toBe('CAT');
    });
    it('valid on_roll without apprentice_type; ta lang accepted server-side (D-008)', () => {
        const r = validateWorkerRow({ name: 'Mohan Bhai', role: 'on_roll', jh_group_code: 'jh-b', lang_pref: 'ta' }, ctx(), 'admin');
        expect(r.tier).toBe('ok');
        expect(r.resolved?.apprentice_type).toBeNull();
        expect(r.resolved?.lang_pref).toBe('ta');
        expect(r.resolved?.dmt_id).toBe(D2);
    });
    it('leader role with email; explicit consistent dmt_code resolves', () => {
        const r = validateWorkerRow({ name: 'Lead One', role: 'jh_leader', jh_group_code: 'jh-a', dmt_code: 'DMT-1', email: 'lead@npf.co' }, ctx(), 'admin');
        expect(r.tier).toBe('ok');
        expect(r.resolved?.dmt_id).toBe(D1);
        expect(r.resolved?.email).toBe('lead@npf.co');
    });
    it('additional memberships resolve to ids', () => {
        const r = validateWorkerRow({ ...validApprentice, additional_jh_codes: 'JH-B', additional_dmt_codes: 'DMT-2' }, ctx(), 'admin');
        expect(r.tier).toBe('ok');
        expect(r.resolved?.additional_jh_group_ids).toEqual([G2]);
        expect(r.resolved?.additional_dmt_ids).toEqual([D2]);
    });
});
describe('validateWorkerRow — error codes', () => {
    it('required_field_missing: name, role; jh_group for shop-floor roles', () => {
        const r = validateWorkerRow({ role: 'apprentice' }, ctx(), 'admin');
        expect(codesOf(r)).toContain('name:required_field_missing');
        expect(codesOf(r)).toContain('jh_group_code:required_field_missing');
        const r2 = validateWorkerRow({ name: 'X' }, ctx(), 'admin');
        expect(codesOf(r2)).toContain('role:required_field_missing');
    });
    it('name_invalid beyond 100 chars (multibyte counted as chars)', () => {
        const r = validateWorkerRow({ ...validApprentice, name: 'न'.repeat(101) }, ctx(), 'admin');
        expect(codesOf(r)).toContain('name:name_invalid');
        expect(validateWorkerRow({ ...validApprentice, name: 'न'.repeat(100) }, ctx(), 'admin').tier).toBe('ok');
    });
    it('invalid_role for unknown roles AND for admin (never importable)', () => {
        expect(codesOf(validateWorkerRow({ ...validApprentice, role: 'boss' }, ctx(), 'admin'))).toContain('role:invalid_role');
        expect(codesOf(validateWorkerRow({ ...validApprentice, role: 'admin' }, ctx(), 'admin'))).toContain('role:invalid_role');
    });
    it('role_above_caller when target outranks caller', () => {
        const r = validateWorkerRow({ name: 'X', role: 'pillar_champion', email: 'x@npf.co' }, ctx(), 'dmt_leader');
        expect(codesOf(r)).toContain('role:role_above_caller');
    });
    it('jh_group_not_found / jh_group_inactive', () => {
        expect(codesOf(validateWorkerRow({ ...validApprentice, jh_group_code: 'nope' }, ctx(), 'admin'))).toContain('jh_group_code:jh_group_not_found');
        expect(codesOf(validateWorkerRow({ ...validApprentice, jh_group_code: 'jh-x' }, ctx(), 'admin'))).toContain('jh_group_code:jh_group_inactive');
    });
    it('dmt_not_found / dmt_inconsistent_with_jh_group (Step 6 CHECK parity)', () => {
        expect(codesOf(validateWorkerRow({ ...validApprentice, dmt_code: 'nope' }, ctx(), 'admin'))).toContain('dmt_code:dmt_not_found');
        expect(codesOf(validateWorkerRow({ ...validApprentice, dmt_code: 'dmt-2' }, ctx(), 'admin'))).toContain('dmt_code:dmt_inconsistent_with_jh_group');
    });
    it('employee_id format + duplicate vs ALL factory rows (case-insensitive)', () => {
        expect(codesOf(validateWorkerRow({ ...validApprentice, employee_id: 'has space!' }, ctx(), 'admin'))).toContain('employee_id:employee_id_invalid_format');
        expect(codesOf(validateWorkerRow({ ...validApprentice, employee_id: 'EMP-100' }, ctx(), 'admin'))).toContain('employee_id:employee_id_duplicate_in_db');
    });
    it('name_group_duplicate_in_db vs ACTIVE workers, whitespace/case-insensitive', () => {
        const r = validateWorkerRow({ ...validApprentice, name: '  RAM   patel ' }, ctx(), 'admin');
        expect(codesOf(r)).toContain('name:name_group_duplicate_in_db');
    });
    it('apprentice_type required for apprentice; invalid values rejected', () => {
        const { apprentice_type: _omit, ...noType } = validApprentice;
        expect(codesOf(validateWorkerRow(noType, ctx(), 'admin'))).toContain('apprentice_type:apprentice_type_required_for_apprentice');
        expect(codesOf(validateWorkerRow({ ...validApprentice, apprentice_type: 'DIPLOMA' }, ctx(), 'admin'))).toContain('apprentice_type:invalid_apprentice_type');
    });
    it('invalid_lang_pref', () => {
        expect(codesOf(validateWorkerRow({ ...validApprentice, lang_pref: 'fr' }, ctx(), 'admin'))).toContain('lang_pref:invalid_lang_pref');
    });
    it('email_required_for_role for jh_leader+; format; duplicate vs auth.users', () => {
        expect(codesOf(validateWorkerRow({ name: 'L', role: 'dmt_member' }, ctx(), 'admin'))).toContain('email:email_required_for_role');
        expect(codesOf(validateWorkerRow({ name: 'L', role: 'dmt_member', email: 'not-an-email' }, ctx(), 'admin'))).toContain('email:email_invalid_format');
        expect(codesOf(validateWorkerRow({ name: 'L', role: 'dmt_member', email: 'TAKEN@npf.co' }, ctx(), 'admin'))).toContain('email:email_duplicate');
    });
    it('additional_membership_resolution_failed for unknown or inactive codes', () => {
        const r = validateWorkerRow({ ...validApprentice, additional_jh_codes: 'jh-b;jh-x' }, ctx(), 'admin');
        expect(codesOf(r)).toContain('additional_jh_codes:additional_membership_resolution_failed');
        const r2 = validateWorkerRow({ ...validApprentice, additional_dmt_codes: 'dmt-9' }, ctx(), 'admin');
        expect(codesOf(r2)).toContain('additional_dmt_codes:additional_membership_resolution_failed');
    });
    it('error rows carry no resolved payload', () => {
        const r = validateWorkerRow({ ...validApprentice, role: 'boss' }, ctx(), 'admin');
        expect(r.tier).toBe('error');
        expect(r.resolved).toBeUndefined();
    });
});
describe('validateWorkerRows — within-file duplicates (both rows fail)', () => {
    it('employee_id_duplicate_in_file flags every colliding row', () => {
        const rows = [
            { ...validApprentice, name: 'A One', employee_id: 'EMP-300' },
            { ...validApprentice, name: 'B Two', employee_id: 'emp-300' },
        ];
        const results = validateWorkerRows(rows, ctx(), 'admin');
        for (const r of results) {
            expect(r.tier).toBe('error');
            expect(codesOf(r)).toContain('employee_id:employee_id_duplicate_in_file');
            expect(r.resolved).toBeUndefined();
        }
    });
    it('name_group_duplicate_in_file and email_duplicate in-file', () => {
        const rows = [
            { name: 'Same Name', role: 'on_roll', jh_group_code: 'jh-a', employee_id: 'E1' },
            { name: 'same  name', role: 'on_roll', jh_group_code: 'JH-A', employee_id: 'E2' },
            { name: 'L One', role: 'dmt_member', email: 'dup@npf.co', employee_id: 'E3' },
            { name: 'L Two', role: 'dmt_member', email: 'DUP@npf.co', employee_id: 'E4' },
        ];
        const results = validateWorkerRows(rows, ctx(), 'admin');
        expect(codesOf(results[0])).toContain('name:name_group_duplicate_in_file');
        expect(codesOf(results[1])).toContain('name:name_group_duplicate_in_file');
        expect(codesOf(results[2])).toContain('email:email_duplicate');
        expect(codesOf(results[3])).toContain('email:email_duplicate');
        expect(results.every((r) => r.tier === 'error')).toBe(true);
    });
    it('preserves row order and leaves clean rows ok', () => {
        const rows = [
            { ...validApprentice, name: 'Clean Row', employee_id: 'EMP-400' },
            { ...validApprentice, name: 'Broken Row', role: 'boss', employee_id: 'EMP-401' },
        ];
        const results = validateWorkerRows(rows, ctx(), 'admin');
        expect(results[0].tier).toBe('ok');
        expect(results[1].tier).toBe('error');
    });
});
