import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dmtApi } from './dmtApi';
import { buildStages } from './pdCycle';

// The PD Cycle stage list (managed by BE Admin) plus the helpers built from it.
export function usePdStages() {
    const q = useQuery({ queryKey: ['dmt', 'pd-stages'], queryFn: dmtApi.pdStages, staleTime: 1000 * 30 });
    const stages = useMemo(() => buildStages(q.data || []), [q.data]);
    return { ...stages, isLoading: q.isLoading, error: q.error };
}
