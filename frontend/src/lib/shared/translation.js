// Pure, dependency-free, isomorphic (Deno + Node 22) translation logic shared by
// the translate-content Edge Function and Vitest. NO Deno/Node globals here so it is
// unit-testable via relative import (same pattern as row-hash.ts).
// Dominant script of a string by counting code points in each Indic/Latin block.
// Whitespace/digits/punctuation are ignored so "6500 SHEETS चल रही" reads as devanagari-ish.
export function detectScript(text) {
    let latin = 0, deva = 0, guj = 0, tamil = 0;
    for (const ch of text) {
        const c = ch.codePointAt(0);
        if ((c >= 0x0900 && c <= 0x097f))
            deva++;
        else if (c >= 0x0a80 && c <= 0x0aff)
            guj++;
        else if (c >= 0x0b80 && c <= 0x0bff)
            tamil++;
        else if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a))
            latin++;
    }
    const max = Math.max(latin, deva, guj, tamil);
    if (max === 0)
        return 'other';
    if (max === deva)
        return 'devanagari';
    if (max === guj)
        return 'gujarati';
    if (max === tamil)
        return 'tamil';
    return 'latin';
}
const LANG_SCRIPT = {
    en: 'latin', hi: 'devanagari', gu: 'gujarati', ta: 'tamil',
};
// Best-effort content language from dominant script — a DISPLAY hint for the
// strapline/lang attribute (the authoritative source resolution still happens via
// resolveSourceLang + the provider). Avoids needing a source-language column on
// content tables (§6.2(b): "captured OR detected").
export function detectContentLang(text) {
    switch (detectScript(text)) {
        case 'devanagari': return 'hi';
        case 'gujarati': return 'gu';
        case 'tamil': return 'ta';
        default: return 'en';
    }
}
// Resolve the source language to send to the provider (Hub pattern):
// - sourceAsserted (a human explicitly declared it): TRUST it, even for romanized
//   Indic — the provider handles transliteration. This is the escape hatch.
// - declared but the text's script contradicts it: DOWNGRADE to 'auto' (let the
//   provider detect) — guards against a stale/wrong declaration.
// - otherwise: pass the declaration (or 'auto').
export function resolveSourceLang(input) {
    const { declared, sourceAsserted, text } = input;
    if (declared === 'auto')
        return 'auto';
    if (sourceAsserted)
        return declared;
    const script = detectScript(text);
    const expected = LANG_SCRIPT[declared];
    // Latin text under an Indic declaration = romanized; without assertion, detect.
    if (script !== expected)
        return 'auto';
    return declared;
}
// ─── Cost controls (D-022) — config constants, not magic numbers ─────────────
export const FREE_TIER_CHARS = 500_000; // Google Cloud Translation monthly free tier
export const WARN_PCT = 0.80;
export const HARD_PCT = 0.95;
export function usageStatus(charsThisMonth, ceiling = FREE_TIER_CHARS, warnPct = WARN_PCT, hardPct = HARD_PCT) {
    if (charsThisMonth >= ceiling * hardPct)
        return 'hard';
    if (charsThisMonth >= ceiling * warnPct)
        return 'warn';
    return 'ok';
}
// The Edge Function's decision core. CACHE HITS ARE FREE — they must never bill.
// The hard-cap guard is computed from the month's usage row, so it self-resets at
// the month boundary and stays distinct from the admin kill switch (`enabled`).
export function planRequest(input, ceiling = FREE_TIER_CHARS, hardPct = HARD_PCT) {
    if (!input.enabled)
        return { action: 'disabled', bill: false };
    if (input.cacheHit)
        return { action: 'served_cache', bill: false };
    if (input.charsThisMonth + input.incomingChars > ceiling * hardPct) {
        return { action: 'refused_limit', bill: false };
    }
    return { action: 'translate', bill: true };
}
// 'YYYY-MM' bucket for the monthly usage rollup. Caller passes the timestamp
// (no Date.now() here — keeps this pure/testable).
export function yearMonth(d) {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
