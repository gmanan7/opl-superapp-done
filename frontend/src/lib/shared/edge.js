// edge — shared Edge-Function plumbing (manage-user + bulk-import).
// Web-API-only, no imports: stays testable from Vitest and portable in Deno.
export const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-worker-id',
};
export function json(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
}
// Decode JWT payload without re-verification.
// The Supabase Edge Function gateway has already verified the signature before
// this code runs — re-verification with auth.getUser() is unnecessary and fails
// for ES256-signed tokens in this context.
export function decodeJwtPayload(jwt) {
    const base64Payload = jwt.split('.')[1] ?? '';
    const padded = base64Payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(padded);
    return JSON.parse(decoded);
}
/** Crypto-random 4-digit PIN, leading zeros preserved. */
export function generatePinDigits() {
    return String(crypto.getRandomValues(new Uint32Array(1))[0] % 10000).padStart(4, '0');
}
