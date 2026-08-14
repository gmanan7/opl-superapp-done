import { describe, it, expect } from 'vitest';
import { nextDueAt, isDue, nextCycle, daysOverdue, orderDueQueue, capQueue, computeEffectiveAudience, } from '../lib/oplTraining';
const NOW = new Date('2026-06-18T00:00:00Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
describe('isDue / nextDueAt', () => {
    it('never trained is always due', () => {
        expect(isDue(null, 90, NOW)).toBe(true);
        expect(nextDueAt(null, 90)).toBeNull();
    });
    it('within the cadence is not due', () => {
        expect(isDue(daysAgo(10), 90, NOW)).toBe(false);
    });
    it('past the cadence is due', () => {
        expect(isDue(daysAgo(200), 90, NOW)).toBe(true);
    });
    it('next due is trained_at + freq days', () => {
        expect(nextDueAt('2026-01-01T00:00:00Z', 90)?.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    });
});
describe('nextCycle (the server cycle rule, mirrored)', () => {
    it('no prior event → cycle 1', () => {
        expect(nextCycle(null, null, 90, NOW)).toBe(1);
    });
    it('due retrain → previous + 1', () => {
        expect(nextCycle(2, daysAgo(200), 90, NOW)).toBe(3);
    });
    it('not yet due → null (blocked by UNIQUE server-side)', () => {
        expect(nextCycle(2, daysAgo(10), 90, NOW)).toBeNull();
    });
});
describe('daysOverdue', () => {
    it('0 when not past due', () => {
        expect(daysOverdue(new Date(NOW.getTime() + 86_400_000), NOW)).toBe(0);
    });
    it('whole days past due', () => {
        expect(daysOverdue(new Date(NOW.getTime() - 3 * 86_400_000), NOW)).toBe(3);
    });
    it('null due → 0', () => {
        expect(daysOverdue(null, NOW)).toBe(0);
    });
});
describe('orderDueQueue (star-first, then most overdue; never-trained ranks most overdue)', () => {
    const row = (over) => ({ is_star: false, never_trained: false, days_overdue: 0, ...over });
    it('starred lessons come first', () => {
        const out = orderDueQueue([row({ days_overdue: 100 }), row({ is_star: true, days_overdue: 1 })]);
        expect(out[0].is_star).toBe(true);
    });
    it('never-trained outranks an overdue retrain', () => {
        const out = orderDueQueue([row({ days_overdue: 50 }), row({ never_trained: true, days_overdue: null })]);
        expect(out[0].never_trained).toBe(true);
    });
    it('more overdue comes before less overdue', () => {
        const out = orderDueQueue([row({ days_overdue: 5 }), row({ days_overdue: 40 })]);
        expect(out[0].days_overdue).toBe(40);
    });
    it('does not mutate the input', () => {
        const input = [row({ days_overdue: 1 }), row({ days_overdue: 9 })];
        const copy = [...input];
        orderDueQueue(input);
        expect(input).toEqual(copy);
    });
});
describe('capQueue (no-drowning cap)', () => {
    it('caps the visible list and reports the remainder', () => {
        const rows = Array.from({ length: 8 }, (_, i) => i);
        const { visible, moreCount } = capQueue(rows, 5);
        expect(visible).toHaveLength(5);
        expect(moreCount).toBe(3);
    });
    it('no remainder when under the cap', () => {
        expect(capQueue([1, 2], 5)).toEqual({ visible: [1, 2], moreCount: 0 });
    });
});
describe('computeEffectiveAudience (primary ∪ included − excluded)', () => {
    it('default audience is the active primary members', () => {
        expect(computeEffectiveAudience(['a', 'b', 'c']).sort()).toEqual(['a', 'b', 'c']);
    });
    it('excludes removed primary members', () => {
        expect(computeEffectiveAudience(['a', 'b', 'c'], [], ['b']).sort()).toEqual(['a', 'c']);
    });
    it('adds included non-members (D-013 opt-in)', () => {
        expect(computeEffectiveAudience(['a'], ['x'], []).sort()).toEqual(['a', 'x']);
    });
    it('exclude wins over a redundant include of a primary member', () => {
        // a primary member who is both excluded and (redundantly) not included stays out
        expect(computeEffectiveAudience(['a', 'b'], [], ['a'])).toEqual(['b']);
    });
});
