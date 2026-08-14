import { describe, it, expect } from 'vitest';
import { detectScript, detectContentLang, resolveSourceLang, planRequest, usageStatus, yearMonth, FREE_TIER_CHARS, } from '../lib/shared/translation.js';
describe('detectScript / detectContentLang', () => {
    it('detects dominant Indic scripts ignoring digits/latin noise', () => {
        expect(detectScript('मीटिंग में 6500 sheets')).toBe('devanagari');
        expect(detectScript('મીટિંગ area')).toBe('gujarati');
        expect(detectScript('கூட்டம்')).toBe('tamil');
        expect(detectScript('All Foil lines')).toBe('latin');
    });
    it('maps script → content lang', () => {
        expect(detectContentLang('समस्या')).toBe('hi');
        expect(detectContentLang('સમસ્યા')).toBe('gu');
        expect(detectContentLang('Problem')).toBe('en');
    });
});
describe('resolveSourceLang (borrowed Hub transliteration pattern)', () => {
    it('trusts a human-asserted source even for romanized Indic (escape hatch)', () => {
        // "meeting me problem tha" declared Hindi + asserted → trust hi (romanized)
        expect(resolveSourceLang({ declared: 'hi', sourceAsserted: true, text: 'meeting me problem tha' })).toBe('hi');
    });
    it('downgrades a declared source to auto when the script contradicts it (not asserted)', () => {
        expect(resolveSourceLang({ declared: 'hi', sourceAsserted: false, text: 'plain english text' })).toBe('auto');
    });
    it('keeps a declared source when the script matches', () => {
        expect(resolveSourceLang({ declared: 'gu', sourceAsserted: false, text: 'મીટિંગ' })).toBe('gu');
    });
    it('passes auto through', () => {
        expect(resolveSourceLang({ declared: 'auto', sourceAsserted: false, text: 'anything' })).toBe('auto');
    });
});
describe('planRequest — cost-control decision core', () => {
    it('CACHE HIT IS FREE — never bills (the regression guard)', () => {
        const p = planRequest({ enabled: true, cacheHit: true, charsThisMonth: 0, incomingChars: 100 });
        expect(p).toEqual({ action: 'served_cache', bill: false });
    });
    it('disabled → no bill, no call', () => {
        expect(planRequest({ enabled: false, cacheHit: false, charsThisMonth: 0, incomingChars: 100 }))
            .toEqual({ action: 'disabled', bill: false });
    });
    it('cache miss within budget → translate + bill', () => {
        expect(planRequest({ enabled: true, cacheHit: false, charsThisMonth: 0, incomingChars: 100 }))
            .toEqual({ action: 'translate', bill: true });
    });
    it('cache miss that would cross the 95% hard cap → refused, no bill', () => {
        const near = Math.floor(FREE_TIER_CHARS * 0.95) - 10;
        expect(planRequest({ enabled: true, cacheHit: false, charsThisMonth: near, incomingChars: 100 }))
            .toEqual({ action: 'refused_limit', bill: false });
    });
});
describe('usageStatus thresholds (80/95)', () => {
    it('ok below 80%', () => expect(usageStatus(FREE_TIER_CHARS * 0.5)).toBe('ok'));
    it('warn at/above 80%', () => expect(usageStatus(FREE_TIER_CHARS * 0.85)).toBe('warn'));
    it('hard at/above 95%', () => expect(usageStatus(FREE_TIER_CHARS * 0.96)).toBe('hard'));
});
describe('yearMonth', () => {
    it('formats UTC YYYY-MM', () => {
        expect(yearMonth(new Date(Date.UTC(2026, 5, 14)))).toBe('2026-06');
    });
});
