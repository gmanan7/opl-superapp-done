// Dummy stub replacing Supabase client for Node/Express + PgSQL backend
export function buildPinHeaders(raw) {
    if (!raw)
        return {};
    try {
        const s = JSON.parse(raw);
        const out = {};
        if (s?.worker?.factory_id)
            out['x-factory-id'] = s.worker.factory_id;
        if (s?.worker?.worker_id)
            out['x-worker-id'] = s.worker.worker_id;
        return out;
    }
    catch {
        return {};
    }
}
export function pinAwareFetch(baseFetch) {
    return (input, init) => {
        return baseFetch(input, init);
    };
}
export const supabase = {
    from: () => ({
        select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: null }), order: async () => ({ data: [] }) }),
            order: async () => ({ data: [] }),
        }),
    }),
    auth: {
        signOut: async () => { },
        resetPasswordForEmail: async () => { },
    },
    rpc: async () => ({ data: null, error: null }),
};
