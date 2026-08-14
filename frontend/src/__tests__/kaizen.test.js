import { describe, it, expect } from 'vitest';
import { kaizenTotalScore, scoreComplete, isScoreValue, SCORE_MAX, SCORE_OPTIONS } from '../lib/kaizen';
describe('kaizen scoring (D-020: straight 1/3/9 sum → /36, mirrors approve_kaizen)', () => {
    it('options are exactly 1/3/9 and max is 36', () => {
        expect(SCORE_OPTIONS).toEqual([1, 3, 9]);
        expect(SCORE_MAX).toBe(36);
    });
    it('isScoreValue accepts only 1/3/9', () => {
        expect([1, 3, 9].every(isScoreValue)).toBe(true);
        expect(isScoreValue(2)).toBe(false);
        expect(isScoreValue(0)).toBe(false);
        expect(isScoreValue(null)).toBe(false);
    });
    it('total is the straight sum, not a weighted average', () => {
        expect(kaizenTotalScore(9, 3, 9, 3)).toBe(24);
        expect(kaizenTotalScore(9, 9, 9, 9)).toBe(36);
        expect(kaizenTotalScore(1, 1, 1, 1)).toBe(4);
    });
    it('null until all four dimensions are scored', () => {
        expect(kaizenTotalScore(9, 3, 9, null)).toBeNull();
        expect(kaizenTotalScore(null, null, null, null)).toBeNull();
        expect(scoreComplete(9, 3, 9, 3)).toBe(true);
        expect(scoreComplete(9, 3, 9, null)).toBe(false);
    });
    it('rejects out-of-rubric values (defense for a crafted client)', () => {
        // 2 is not a valid score; total must refuse it (server also validates)
        expect(kaizenTotalScore(2, 3, 9, 3)).toBeNull();
    });
});
