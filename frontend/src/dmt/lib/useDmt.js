// DMT identity hook — replaces the old Supabase useAuth() in the DMT app.
import { useQuery } from '@tanstack/react-query';
import { dmtApi, dmtTierAtLeast } from './dmtApi';

export function useDmtMe() {
    const q = useQuery({
        queryKey: ['dmt', 'me'],
        queryFn: dmtApi.me,
        staleTime: 1000 * 60 * 10,
        retry: 0,
    });
    const user = q.data || null;
    return {
        user,
        loading: q.isLoading,
        error: q.error,
        tier: user?.tier || null,
        tierAtLeast: (min) => dmtTierAtLeast(user?.tier, min),
    };
}
