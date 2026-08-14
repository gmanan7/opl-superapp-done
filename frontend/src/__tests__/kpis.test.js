import { describe, it, expect } from 'vitest';
import { yesterdayStr, todayStr, computeMissingDates, daysInMonth, dayDiff, isOnTarget, deviationLevel, targetSymbol, } from '../lib/kpi';
describe('yesterdayStr / todayStr', () => {
    it('yesterday is never today and never future', () => {
        expect(yesterdayStr()).not.toBe(todayStr());
        expect(yesterdayStr() < todayStr()).toBe(true);
    });
    it('returns a valid YYYY-MM-DD string', () => {
        expect(yesterdayStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
    it('is exactly one day before today', () => {
        expect(dayDiff(yesterdayStr(), todayStr())).toBe(1);
    });
});
describe('dayDiff', () => {
    it('counts whole days b - a', () => {
        expect(dayDiff('2026-06-01', '2026-06-04')).toBe(3);
        expect(dayDiff('2026-06-04', '2026-06-04')).toBe(0);
        expect(dayDiff('2026-06-10', '2026-06-09')).toBe(-1);
    });
});
describe('computeMissingDates', () => {
    it('returns empty when all days entered', () => {
        const entries = ['01', '02', '03', '04', '05'].map((d) => ({ entry_date: `2025-02-${d}` }));
        expect(computeMissingDates(entries, 2025, 2, '2025-02-05')).toEqual([]);
    });
    it('finds gaps up to yesterday', () => {
        const entries = [{ entry_date: '2025-02-01' }, { entry_date: '2025-02-03' }, { entry_date: '2025-02-05' }];
        expect(computeMissingDates(entries, 2025, 2, '2025-02-07'))
            .toEqual(['2025-02-02', '2025-02-04', '2025-02-06', '2025-02-07']);
    });
    it('stops at yesterday, excludes today/future', () => {
        expect(computeMissingDates([], 2025, 3, '2025-03-03')).toEqual(['2025-03-01', '2025-03-02', '2025-03-03']);
    });
    it('empty when yesterday precedes the month', () => {
        expect(computeMissingDates([], 2025, 2, '2025-01-31')).toEqual([]);
    });
    it('treats repeated dates (machine + JH rows) as one entered day', () => {
        const entries = [{ entry_date: '2025-02-01' }, { entry_date: '2025-02-01' }, { entry_date: '2025-02-02' }];
        expect(computeMissingDates(entries, 2025, 2, '2025-02-03')).toEqual(['2025-02-03']);
    });
});
describe('daysInMonth', () => {
    it('handles Feb leap/non-leap and 30/31 months', () => {
        expect(daysInMonth(2025, 2)).toBe(28);
        expect(daysInMonth(2024, 2)).toBe(29);
        expect(daysInMonth(2025, 1)).toBe(31);
        expect(daysInMonth(2025, 4)).toBe(30);
    });
});
describe('targetSymbol — all three directions', () => {
    it('maps direction to comparison glyph', () => {
        expect(targetSymbol('higher_better')).toBe('≥');
        expect(targetSymbol('lower_better')).toBe('≤');
        expect(targetSymbol('target_exact')).toBe('=');
    });
});
describe('isOnTarget — three directions + NULL target', () => {
    it('lower_better: on-target when avg <= target', () => {
        expect(isOnTarget('lower_better', 25, 30)).toBe(true);
        expect(isOnTarget('lower_better', 30, 30)).toBe(true);
        expect(isOnTarget('lower_better', 35, 30)).toBe(false);
    });
    it('higher_better: on-target when avg >= target', () => {
        expect(isOnTarget('higher_better', 85, 80)).toBe(true);
        expect(isOnTarget('higher_better', 80, 80)).toBe(true);
        expect(isOnTarget('higher_better', 70, 80)).toBe(false);
    });
    it('target_exact: on-target only at the value', () => {
        expect(isOnTarget('target_exact', 50, 50)).toBe(true);
        expect(isOnTarget('target_exact', 49, 50)).toBe(false);
    });
    it('NULL target → null verdict (no coloring)', () => {
        expect(isOnTarget('higher_better', 5, null)).toBeNull();
        expect(isOnTarget('lower_better', 5, undefined)).toBeNull();
    });
});
describe('deviationLevel — non-blocking out-of-target classification', () => {
    it('empty / non-numeric / NULL target → none', () => {
        expect(deviationLevel('higher_better', 10, '')).toBe('none');
        expect(deviationLevel('higher_better', 10, '   ')).toBe('none');
        expect(deviationLevel('higher_better', 10, 'abc')).toBe('none');
        expect(deviationLevel('higher_better', null, '5')).toBe('none');
    });
    it('higher_better: under when below target', () => {
        expect(deviationLevel('higher_better', 4.2, '4.0')).toBe('under');
        expect(deviationLevel('higher_better', 4.2, '4.2')).toBe('none');
        expect(deviationLevel('higher_better', 4.2, '5')).toBe('none');
    });
    it('lower_better: over when above target', () => {
        expect(deviationLevel('lower_better', 0.8, '0.9')).toBe('over');
        expect(deviationLevel('lower_better', 0.8, '0.8')).toBe('none');
        expect(deviationLevel('lower_better', 0.8, '0.5')).toBe('none');
    });
    it('target_exact: off when value differs', () => {
        expect(deviationLevel('target_exact', 12, '13')).toBe('off');
        expect(deviationLevel('target_exact', 12, '12')).toBe('none');
    });
});
