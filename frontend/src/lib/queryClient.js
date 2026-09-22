import { QueryClient } from '@tanstack/react-query';
// Single shared client so auth.js can wipe cached per-user data on login/logout.
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: 1,
            staleTime: 1000 * 60 * 5,
        },
    },
});
