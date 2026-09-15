import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { loadSession, getRole } from '../lib/auth';
import { api } from '../lib/api';
export function useAuth() {
    const [session, setSession] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    function refresh() {
        setSession(loadSession());
        setIsLoading(false);
    }
    useEffect(() => { refresh(); }, []);
    const workerId = session?.worker_id ?? null;
    const { data: fetchedName } = useQuery({
        queryKey: ['display-name', workerId],
        enabled: !!workerId,
        staleTime: 1000 * 60 * 30,
        queryFn: async () => {
            const names = await api.getWorkerNames();
            const found = names.find((n) => n.id === workerId);
            return found?.name ?? null;
        },
    });
    const name = session == null ? '' : (fetchedName ?? session.name ?? session.email);
    return { session, role: getRole(session), name, isLoading, refresh };
}
