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
    const emailWorkerId = session?.type === 'email' ? session.worker_id : null;
    const { data: emailName } = useQuery({
        queryKey: ['display-name', emailWorkerId],
        enabled: !!emailWorkerId,
        staleTime: 1000 * 60 * 30,
        queryFn: async () => {
            const names = await api.getWorkerNames();
            const found = names.find((n) => n.id === emailWorkerId);
            return found?.name ?? null;
        },
    });
    const name = session == null
        ? ''
        : session.type === 'pin'
            ? session.worker.name
            : (emailName ?? session.email);
    return { session, role: getRole(session), name, isLoading, refresh };
}
