import { describe, it, expect } from 'vitest';
import { mdmKeys, normalizeFilters, toMdmError, requireRows, sanitizeSearchTerm, MdmError, } from './keys';
describe('mdm query keys', () => {
    it('same filters in different key order produce the SAME key', () => {
        const a = mdmKeys.machines({ jhGroupId: 'g1', machineType: 'press' });
        const b = mdmKeys.machines({ machineType: 'press', jhGroupId: 'g1' });
        expect(a).toEqual(b);
    });
    it('different filters produce different keys', () => {
        expect(mdmKeys.workers({ role: 'apprentice' })).not.toEqual(mdmKeys.workers({ role: 'admin' }));
    });
    it('undefined/empty filter values are dropped (no-filter === empty-filter)', () => {
        expect(mdmKeys.machines({})).toEqual(mdmKeys.machines({ jhGroupId: undefined, areaId: '' }));
    });
    it('membership keys scope by worker id', () => {
        expect(mdmKeys.memberships('w1')).not.toEqual(mdmKeys.memberships('w2'));
    });
    it('all keys share the mdm root (one invalidation domain)', () => {
        expect(mdmKeys.modules()[0]).toBe('mdm');
        expect(mdmKeys.orgStructure()[0]).toBe('mdm');
        expect(mdmKeys.machines()[0]).toBe('mdm');
    });
    it('normalizeFilters is deterministic and sorted', () => {
        expect(normalizeFilters({ b: 1, a: 2 })).toBe(normalizeFilters({ a: 2, b: 1 }));
    });
});
describe('toMdmError (D5: clean coded errors, no raw DB text)', () => {
    it('maps unique violations to duplicate', () => {
        expect(toMdmError({ code: '23505', message: 'duplicate key value violates "ux_wgm_worker_jh"' }).code).toBe('duplicate');
    });
    it('maps FK violations to fk_violation', () => {
        expect(toMdmError({ code: '23503' }).code).toBe('fk_violation');
    });
    it('maps CHECK violations to check_violation', () => {
        expect(toMdmError({ code: '23514' }).code).toBe('check_violation');
    });
    it('maps RLS/privilege failures to denied (42501 and HTTP 401/403)', () => {
        expect(toMdmError({ code: '42501' }).code).toBe('denied');
        expect(toMdmError({ status: 401 }).code).toBe('denied');
        expect(toMdmError({ status: 403 }).code).toBe('denied');
    });
    it('never leaks the raw DB message — the Error message is the code itself', () => {
        const err = toMdmError({ code: '23505', message: 'constraint "secret_constraint_name" on table worker_profile' });
        expect(err.message).toBe('duplicate');
        expect(err.message).not.toContain('constraint');
    });
    it('unknown shapes become unknown', () => {
        expect(toMdmError(undefined).code).toBe('unknown');
        expect(toMdmError({ code: 'XX000' }).code).toBe('unknown');
    });
});
describe('requireRows (RLS-filtered writes return zero rows silently)', () => {
    it('throws denied on empty result — the mocked governance check', () => {
        expect(() => requireRows([])).toThrowError(MdmError);
        try {
            requireRows(null);
        }
        catch (e) {
            expect(e.code).toBe('denied');
        }
    });
    it('passes rows through when present', () => {
        expect(requireRows([{ id: '1' }])).toEqual([{ id: '1' }]);
    });
});
describe('sanitizeSearchTerm', () => {
    it('strips PostgREST or() metacharacters', () => {
        expect(sanitizeSearchTerm('ram,(or)')).toBe('ramor');
    });
    it('trims whitespace', () => {
        expect(sanitizeSearchTerm('  ram  ')).toBe('ram');
    });
});
