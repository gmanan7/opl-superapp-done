// Shared CORS for browser-invoked Edge Functions (SECURITY_VAPT C1; D-025 browser
// round-trip). Origin-ALLOW-LISTED, never '*': production + this project's Cloudflare
// Pages preview deploys + local dev + any ALLOWED_ORIGINS env entries. Production is
// HARDCODED so CORS never silently breaks if the env var is unset.
//
// Allow-Headers: the PREFLIGHT response ECHOES the browser's Access-Control-Request-
// Headers, so EVERY header the client actually sends passes — x-factory-id + x-worker-id
// (PIN identity, injected by pinAwareFetch), authorization, apikey, content-type,
// x-client-info, and any future custom header — permanently. (Round 1 listed a static
// set that omitted x-factory-id → the PIN client's preflight was rejected with
// "Request header field x-factory-id is not allowed"; echoing removes the whole class.)
// This is ADDITIVE: it changes only response headers + OPTIONS handling; it never relaxes
// a function's own §F authorization/validation.
const PROD = ['https://tpm-fulcrum.pages.dev'];
const DEV = ['http://localhost:5173', 'http://localhost:4173'];
// Cloudflare Pages preview deploys for this project: <hash>.tpm-fulcrum.pages.dev
const PREVIEW = /^https:\/\/[a-z0-9-]+\.tpm-fulcrum\.pages\.dev$/;
// Fallback list when a preflight arrives without Access-Control-Request-Headers (rare /
// non-browser). Mirrors the real client header set incl. x-factory-id (the round-1 miss).
const DEFAULT_ALLOW_HEADERS = 'authorization, apikey, content-type, x-client-info, x-worker-id, x-factory-id';
export function isAllowedOrigin(origin) {
    if (!origin)
        return false;
    const rawEnv = (typeof globalThis.Deno !== 'undefined' && globalThis.Deno.env) ? globalThis.Deno.env.get('ALLOWED_ORIGINS') : (typeof process !== 'undefined' && process.env) ? process.env.ALLOWED_ORIGINS : '';
    const env = (rawEnv ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    return PROD.includes(origin) || DEV.includes(origin) || env.includes(origin) || PREVIEW.test(origin);
}
export function corsHeaders(origin) {
    // Echo the caller's origin only when allow-listed; otherwise fall back to PROD so a
    // disallowed origin gets a mismatched ACAO and the browser blocks it (fail-closed).
    const o = isAllowedOrigin(origin) ? origin : PROD[0];
    return {
        'Access-Control-Allow-Origin': o,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': DEFAULT_ALLOW_HEADERS,
        'Vary': 'Origin',
    };
}
// 204 preflight for OPTIONS (no body); null for any other method. ECHOES the requested
// headers so the preflight can never reject a header the client sends.
export function preflightResponse(req) {
    if (req.method !== 'OPTIONS')
        return null;
    const requested = req.headers.get('access-control-request-headers');
    return new Response(null, {
        status: 204,
        headers: {
            ...corsHeaders(req.headers.get('origin')),
            'Access-Control-Allow-Headers': requested && requested.trim() ? requested : DEFAULT_ALLOW_HEADERS,
            'Vary': 'Origin, Access-Control-Request-Headers',
        },
    });
}
