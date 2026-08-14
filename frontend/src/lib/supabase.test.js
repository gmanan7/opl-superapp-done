import { describe, it, expect, vi } from 'vitest';
import { buildPinHeaders, pinAwareFetch } from './supabase';
const PIN_SESSION = JSON.stringify({
    type: 'pin',
    worker: {
        worker_id: '62ba0c25-8978-4ad4-8f45-6c3bd0c47a51',
        factory_id: '00000000-0000-0000-0000-000000000001',
        jh_group_id: '00000002-0000-0000-0000-000000000001',
        dmt_id: null,
        name: 'Test Apprentice',
        role: 'apprentice',
        lang_pref: 'gu',
    },
});
describe('buildPinHeaders', () => {
    it('returns both identity headers from a PIN session', () => {
        expect(buildPinHeaders(PIN_SESSION)).toEqual({
            'x-factory-id': '00000000-0000-0000-0000-000000000001',
            'x-worker-id': '62ba0c25-8978-4ad4-8f45-6c3bd0c47a51',
        });
    });
    it('returns empty for no session (email users have no tpm_session)', () => {
        expect(buildPinHeaders(null)).toEqual({});
    });
    it('returns empty for malformed JSON', () => {
        expect(buildPinHeaders('{not json')).toEqual({});
    });
    it('omits x-worker-id when the session lacks worker_id (pre-rollout sessions)', () => {
        const legacy = JSON.stringify({
            type: 'pin',
            worker: { factory_id: '00000000-0000-0000-0000-000000000001' },
        });
        expect(buildPinHeaders(legacy)).toEqual({
            'x-factory-id': '00000000-0000-0000-0000-000000000001',
        });
    });
    it('returns empty when the worker object is missing (factory_id must be nested)', () => {
        const flat = JSON.stringify({ type: 'pin', factory_id: 'x', worker_id: 'y' });
        expect(buildPinHeaders(flat)).toEqual({});
    });
});
describe('pinAwareFetch', () => {
    it('injects BOTH headers for a PIN session', async () => {
        localStorage.setItem('tpm_session', PIN_SESSION);
        const baseFetch = vi.fn().mockResolvedValue(new Response('{}'));
        await pinAwareFetch(baseFetch)('https://x.test/rest/v1/factory_module');
        const init = baseFetch.mock.calls[0][1];
        const headers = new Headers(init.headers);
        expect(headers.get('x-factory-id')).toBe('00000000-0000-0000-0000-000000000001');
        expect(headers.get('x-worker-id')).toBe('62ba0c25-8978-4ad4-8f45-6c3bd0c47a51');
    });
    it('injects NO identity headers for email users (no tpm_session)', async () => {
        const baseFetch = vi.fn().mockResolvedValue(new Response('{}'));
        await pinAwareFetch(baseFetch)('https://x.test/rest/v1/factory_module', {
            headers: { Authorization: 'Bearer jwt' },
        });
        const init = baseFetch.mock.calls[0][1];
        const headers = new Headers(init?.headers);
        expect(headers.get('x-factory-id')).toBeNull();
        expect(headers.get('x-worker-id')).toBeNull();
        expect(headers.get('Authorization')).toBe('Bearer jwt'); // existing headers untouched
    });
    it('preserves caller headers while adding identity headers', async () => {
        localStorage.setItem('tpm_session', PIN_SESSION);
        const baseFetch = vi.fn().mockResolvedValue(new Response('{}'));
        await pinAwareFetch(baseFetch)('https://x.test/rest/v1/rpc/my_jh_group_ids', {
            method: 'POST',
            headers: { apikey: 'anon-key' },
        });
        const init = baseFetch.mock.calls[0][1];
        const headers = new Headers(init.headers);
        expect(headers.get('apikey')).toBe('anon-key');
        expect(headers.get('x-worker-id')).toBe('62ba0c25-8978-4ad4-8f45-6c3bd0c47a51');
        expect(init.method).toBe('POST');
    });
});
