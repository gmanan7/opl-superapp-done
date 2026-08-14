// Step 8 — row-hash is THE single normalization+hash used at preview AND
// commit; these tests pin its behavior so idempotency can't drift silently.
import { describe, it, expect } from 'vitest';
import { normalizeRow, canonicalJson, rowHash, } from '../lib/shared/row-hash.js';
describe('normalizeRow', () => {
    it('trims and collapses internal whitespace', () => {
        expect(normalizeRow({ name: '  Ram   Patel ' })).toEqual({ name: 'Ram Patel' });
    });
    it('drops null, undefined and empty-after-trim values', () => {
        expect(normalizeRow({ a: null, b: undefined, c: '   ', name: 'x' })).toEqual({ name: 'x' });
    });
    it('lowercases case-insensitive fields only', () => {
        const out = normalizeRow({
            employee_id: 'EMP-01',
            email: 'A@B.CO',
            code: 'MX-1',
            jh_group_code: 'JH-A',
            dmt_code: 'DMT-1',
            additional_jh_codes: 'JH-B;JH-C',
            additional_dmt_codes: 'DMT-2',
            name: 'Ram Patel',
            machine_type: 'Die Cutter',
        });
        expect(out.employee_id).toBe('emp-01');
        expect(out.email).toBe('a@b.co');
        expect(out.code).toBe('mx-1');
        expect(out.jh_group_code).toBe('jh-a');
        expect(out.dmt_code).toBe('dmt-1');
        expect(out.additional_jh_codes).toBe('jh-b;jh-c');
        expect(out.additional_dmt_codes).toBe('dmt-2');
        expect(out.name).toBe('Ram Patel');
        expect(out.machine_type).toBe('Die Cutter');
    });
    it('NFC-normalizes multibyte text (composed === decomposed)', () => {
        const composed = normalizeRow({ name: 'José' });
        const decomposed = normalizeRow({ name: 'José' });
        expect(composed.name).toBe(decomposed.name);
    });
    it('stringifies non-string scalars', () => {
        expect(normalizeRow({ employee_id: 42 })).toEqual({ employee_id: '42' });
    });
});
describe('canonicalJson', () => {
    it('is key-order independent', () => {
        expect(canonicalJson({ b: '2', a: '1' })).toBe(canonicalJson({ a: '1', b: '2' }));
    });
});
describe('rowHash', () => {
    it('returns sha256:<64 hex chars>', async () => {
        expect(await rowHash({ name: 'x' })).toMatch(/^sha256:[0-9a-f]{64}$/);
    });
    it('is stable across calls (preview hash === commit hash)', async () => {
        const row = { name: 'Ram Patel', role: 'on_roll', jh_group_code: 'JH-A' };
        expect(await rowHash(row)).toBe(await rowHash({ ...row }));
    });
    it('is key-order independent', async () => {
        const a = await rowHash({ name: 'Ram', role: 'on_roll', jh_group_code: 'jh-a' });
        const b = await rowHash({ jh_group_code: 'jh-a', role: 'on_roll', name: 'Ram' });
        expect(a).toBe(b);
    });
    it('changes when any field value changes', async () => {
        const base = await rowHash({ name: 'Ram', role: 'on_roll' });
        expect(await rowHash({ name: 'Ram', role: 'apprentice' })).not.toBe(base);
    });
    it('treats empty optional fields as absent (CSV blank === XLSX missing)', async () => {
        const a = await rowHash({ name: 'Ram', role: 'on_roll', dmt_code: '' });
        const b = await rowHash({ name: 'Ram', role: 'on_roll' });
        expect(a).toBe(b);
    });
    it('is case-insensitive for code/email fields, case-sensitive for names', async () => {
        expect(await rowHash({ name: 'Ram', employee_id: 'EMP-9' })).toBe(await rowHash({ name: 'Ram', employee_id: 'emp-9' }));
        expect(await rowHash({ name: 'RAM' })).not.toBe(await rowHash({ name: 'Ram' }));
    });
});
