import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dmtApi } from './dmtApi';
import { useDmtWorkers } from './useDmtTasks';

export function useDmtMeetings(statusFilter = 'all') {
    const workers = useDmtWorkers();
    const meetings = useQuery({
        queryKey: ['dmt', 'meetings', statusFilter],
        queryFn: () => dmtApi.list('meetings', statusFilter !== 'all' ? { status: statusFilter } : undefined),
    });
    const nameById = Object.fromEntries((workers.data || []).map((w) => [w.id || w.emp_id, w.name]));
    const rows = (meetings.data || [])
        .slice()
        .sort((a, b) => (b.scheduled_date || '').localeCompare(a.scheduled_date || ''))
        .map((m) => ({ ...m, facilitator_name: nameById[m.facilitator_id] || m.facilitator_id }));
    return { meetings: { ...meetings, rows }, workers, nameById };
}

export function useDmtMeeting(id) {
    return useQuery({
        queryKey: ['dmt', 'meeting', id],
        queryFn: () => dmtApi.get('meetings', id),
        enabled: !!id,
        staleTime: 0,
    });
}

export function useMeetingChildren(meetingId) {
    const invitees = useQuery({
        queryKey: ['dmt', 'meeting-invitees', meetingId],
        queryFn: () => dmtApi.list('meeting-invitees', { meeting_id: meetingId }),
        enabled: !!meetingId,
    });
    const attendance = useQuery({
        queryKey: ['dmt', 'meeting-attendance', meetingId],
        queryFn: () => dmtApi.list('meeting-attendance', { meeting_id: meetingId }),
        enabled: !!meetingId,
    });
    const points = useQuery({
        queryKey: ['dmt', 'discussion-points', meetingId],
        queryFn: () => dmtApi.list('meeting-discussion-points', { meeting_id: meetingId }),
        enabled: !!meetingId,
    });
    const decisions = useQuery({
        queryKey: ['dmt', 'meeting-decisions', meetingId],
        queryFn: () => dmtApi.list('meeting-decisions', { meeting_id: meetingId }),
        enabled: !!meetingId,
    });
    return { invitees, attendance, points, decisions };
}

export function useMeetingMutations(meetingId) {
    const qc = useQueryClient();
    const inv = (key) => qc.invalidateQueries({ queryKey: ['dmt', key, meetingId] });

    return {
        setMeeting: useMutation({
            mutationFn: (patch) => dmtApi.update('meetings', meetingId, patch),
            onSuccess: () => { qc.invalidateQueries({ queryKey: ['dmt', 'meeting', meetingId] }); qc.invalidateQueries({ queryKey: ['dmt', 'meetings'] }); },
        }),
        addInvitee: useMutation({ mutationFn: (b) => dmtApi.create('meeting-invitees', { meeting_id: meetingId, ...b }), onSuccess: () => inv('meeting-invitees') }),
        markAttendance: useMutation({
            mutationFn: async ({ existing, inviteeId, status, marked_by, remarks }) => {
                if (existing) return dmtApi.update('meeting-attendance', existing.id, { status, remarks: remarks || null });
                return dmtApi.create('meeting-attendance', { meeting_id: meetingId, invitee_id: inviteeId, status, marked_by, remarks: remarks || null });
            },
            onSuccess: () => inv('meeting-attendance'),
        }),
        addPoint: useMutation({ mutationFn: (b) => dmtApi.create('meeting-discussion-points', { meeting_id: meetingId, ...b }), onSuccess: () => inv('discussion-points') }),
        updatePoint: useMutation({ mutationFn: ({ id, ...patch }) => dmtApi.update('meeting-discussion-points', id, patch), onSuccess: () => inv('discussion-points') }),
        addDecision: useMutation({ mutationFn: (b) => dmtApi.create('meeting-decisions', { meeting_id: meetingId, ...b }), onSuccess: () => inv('meeting-decisions') }),
    };
}
