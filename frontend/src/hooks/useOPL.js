import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { getSessionContext, roleAtLeast } from '../lib/auth';
export function useOPLs(filter = 'all') {
    const ctx = getSessionContext();
    return useQuery({
        queryKey: ['opls', filter, ctx?.worker_id],
        staleTime: 1000 * 60 * 2,
        queryFn: async () => {
            const data = await api.getOPLs();
            return data;
        },
    });
}
export function useOPL(id) {
    return useQuery({
        queryKey: ['opl', id],
        enabled: !!id,
        staleTime: 1000 * 60 * 2,
        queryFn: async () => {
            const data = await api.getOPLs();
            const found = data.find((d) => d.id === id);
            return found ? found : null;
        },
    });
}
export function useOplDetails() {
    return useQuery({
        queryKey: ['opl-details'],
        staleTime: 1000 * 60 * 2,
        queryFn: async () => {
            const data = await api.getOplDetails();
            return data;
        },
    });
}
export function useCreateOplDetail() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (data) => {
            return api.createOplDetail(data);
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['opl-details'] });
            qc.invalidateQueries({ queryKey: ['opl-audit-trail'] });
        }
    });
}
export function useUpdateOplDetail() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, ...data }) => {
            return api.updateOplDetail(id, data);
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['opl-details'] });
            qc.invalidateQueries({ queryKey: ['opl-audit-trail'] });
        }
    });
}
export function useOplAuditTrail(oplId) {
    return useQuery({
        queryKey: ['opl-audit-trail', oplId],
        queryFn: async () => {
            return api.getOplAuditTrail(oplId);
        }
    });
}
export function useCreateOplAuditTrail() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (data) => {
            return api.createOplAuditTrail(data);
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['opl-audit-trail'] });
        }
    });
}
export function useCreateOPL() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (input) => {
            return api.createOPL(input);
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['opls'] });
        }
    });
}
export function useUpdateOPL() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, ...fields }) => {
            return api.createOPL({ id, ...fields });
        },
        onSuccess: (_d, { id }) => {
            qc.invalidateQueries({ queryKey: ['opl', id] });
            qc.invalidateQueries({ queryKey: ['opls'] });
        },
    });
}
export function useSubmitOPL() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, performed_by }) => {
            return api.updateOplDetail(id, {
                status: 'pending_jh_review',
                action: 'submitted_for_review',
                comments: 'Submitted for JH Group Lead review',
                performed_by
            });
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['opl-details'] });
            qc.invalidateQueries({ queryKey: ['opls'] });
            qc.invalidateQueries({ queryKey: ['opl-audit-trail'] });
        }
    });
}

export function useJhAcceptOPL() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, classification, is_star, comments, performed_by }) => {
            return api.updateOplDetail(id, {
                status: 'approved',
                classification,
                is_star: is_star !== undefined ? Boolean(is_star) : false,
                action: 'jh_accepted',
                comments: comments || (is_star ? 'Approved as Critical OPL by JH Group Lead' : 'Approved by JH Group Lead'),
                performed_by
            });
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['opl-details'] });
            qc.invalidateQueries({ queryKey: ['opls'] });
            qc.invalidateQueries({ queryKey: ['opl-audit-trail'] });
        }
    });
}

export function useJhRejectOPL() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, reason, performed_by }) => {
            return api.updateOplDetail(id, {
                status: 'rejected',
                rejection_reason: reason,
                action: 'jh_rejected',
                comments: reason,
                performed_by
            });
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['opl-details'] });
            qc.invalidateQueries({ queryKey: ['opls'] });
            qc.invalidateQueries({ queryKey: ['opl-audit-trail'] });
        }
    });
}

export function useBeAcceptOPL() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, classification, comments, performed_by }) => {
            return api.updateOplDetail(id, {
                status: 'approved',
                classification,
                action: 'be_accepted',
                comments: comments || 'Approved by Plant BE Lead',
                performed_by
            });
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['opl-details'] });
            qc.invalidateQueries({ queryKey: ['opls'] });
            qc.invalidateQueries({ queryKey: ['opl-audit-trail'] });
        }
    });
}

export function useBeRejectOPL() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, reason, performed_by }) => {
            return api.updateOplDetail(id, {
                status: 'rejected',
                rejection_reason: reason,
                action: 'be_rejected',
                comments: reason,
                performed_by
            });
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['opl-details'] });
            qc.invalidateQueries({ queryKey: ['opls'] });
            qc.invalidateQueries({ queryKey: ['opl-audit-trail'] });
        }
    });
}

export function useSetStarOPL() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, is_star, performed_by }) => {
            return api.updateOplDetail(id, {
                is_star,
                action: is_star ? 'starred' : 'unstarred',
                comments: is_star ? 'Star marked OPL' : 'Removed star mark',
                performed_by
            });
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['opl-details'] });
            qc.invalidateQueries({ queryKey: ['opls'] });
            qc.invalidateQueries({ queryKey: ['opl-audit-trail'] });
        }
    });
}

export function useUpdateOplClassification() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, classification, performed_by }) => {
            return api.updateOplDetail(id, {
                classification,
                action: 'classification_changed',
                comments: `Updated classification to "${classification}"`,
                performed_by
            });
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['opl-details'] });
            qc.invalidateQueries({ queryKey: ['opls'] });
            qc.invalidateQueries({ queryKey: ['opl-audit-trail'] });
        }
    });
}

export function useDeleteOPL() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id }) => {
            return api.updateOplDetail(id, { status: 'deleted' });
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['opl-details'] });
            qc.invalidateQueries({ queryKey: ['opls'] });
        }
    });
}
export const useApproveOPL = useJhAcceptOPL;
export const useRejectOPL = useJhRejectOPL;
export { roleAtLeast };
