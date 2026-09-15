import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

export function useDepartments() {
    return useQuery({
        queryKey: ['departments'],
        queryFn: async () => api.getDepartments(),
    });
}
