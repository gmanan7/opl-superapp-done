import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dmtApi } from './dmtApi';

export function useDmtWorkers() {
    return useQuery({ queryKey: ['dmt', 'worker-names'], queryFn: dmtApi.workerNames, staleTime: 6e5 });
}

// Tasks with owner names resolved client-side. (Tasks belong to a group, never to a department.)
export function useDmtTasks({ priority = 'all' } = {}) {
    const workers = useDmtWorkers();
    const params = {};
    if (priority !== 'all') params.priority = priority;

    const tasks = useQuery({
        queryKey: ['dmt', 'tasks', priority],
        queryFn: () => dmtApi.list('tasks', Object.keys(params).length ? params : undefined),
    });

    const workerName = Object.fromEntries((workers.data || []).map((w) => [w.id || w.emp_id, w.name]));
    const rows = (tasks.data || []).map((t) => ({
        ...t,
        owner_name: workerName[t.owner_id] || t.owner_id,
        assigned_by_name: workerName[t.assigned_by] || t.assigned_by,
    }));

    return { tasks: { ...tasks, rows }, workers, workerName };
}

export function useTaskActivity(taskId) {
    return useQuery({
        queryKey: ['dmt', 'task-updates', taskId],
        queryFn: () => dmtApi.list('task-updates', { task_id: taskId }),
        enabled: !!taskId,
    });
}

export function useTaskMutations() {
    const qc = useQueryClient();
    const done = () => {
        qc.invalidateQueries({ queryKey: ['dmt', 'tasks'] });
        qc.invalidateQueries({ queryKey: ['dmt', 'task-updates'] });
    };
    return {
        create: useMutation({ mutationFn: (body) => dmtApi.create('tasks', body), onSuccess: done }),
        setStatus: useMutation({ mutationFn: ({ id, status, note }) => dmtApi.setTaskStatus(id, status, note), onSuccess: done }),
        setDueDate: useMutation({ mutationFn: ({ id, date, reason }) => dmtApi.setTaskDueDate(id, date, reason), onSuccess: done }),
        setFields: useMutation({ mutationFn: ({ id, fields }) => dmtApi.setTaskFields(id, fields), onSuccess: done }),
        comment: useMutation({ mutationFn: ({ id, text }) => dmtApi.addTaskComment(id, text), onSuccess: done }),
        escalate: useMutation({ mutationFn: ({ id, body }) => dmtApi.escalateTask(id, body), onSuccess: done }),
    };
}

export function useEscalationTargets() {
    return useQuery({ queryKey: ['dmt', 'escalation-targets'], queryFn: dmtApi.escalationTargets, staleTime: 1000 * 60 * 5 });
}
