import { useMutation } from '@tanstack/react-query';
import { resetPassword } from '../../lib/manageUser';
// Migrated from the retired /admin/users Leaders tab into the MDM People roster.
// Reuses the SAME manage-user 'reset_password' Edge action, which enforces
// admin-only + same-factory authorization server-side (SECURITY_VAPT B2/B6/B7).
// The surface moved; the authorization did NOT — a non-admin caller is rejected at
// the Edge regardless of UI placement.
export function useResetWorkerPassword() {
    return useMutation({
        mutationFn: ({ workerId, newPassword }) => resetPassword(workerId, newPassword),
    });
}
