import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dmtApi } from './dmtApi';
import { useDmtDepartments } from './useDmtKpi';

export function useDmtWorkers() {
    return useQuery({ queryKey: ['dmt', 'worker-names'], queryFn: dmtApi.workerNames, staleTime: 6e5 });
}

// Tasks with owner + department names resolved client-side.
export function useDmtTasks({ department = 'all', priority = 'all' } = {}) {
    const departments = useDmtDepartments();
    const workers = useDmtWorkers();
    const params = {};
    if (department !== 'all') params.department_id = department;
    if (priority !== 'all') params.priority = priority;

    const tasks = useQuery({
        queryKey: ['dmt', 'tasks', department, priority],
        queryFn: () => dmtApi.list('tasks', Object.keys(params).length ? params : undefined),
    });

    const deptName = Object.fromEntries((departments.data || []).map((d) => [d.id, d.name]));
    const workerName = Object.fromEntries((workers.data || []).map((w) => [w.id || w.emp_id, w.name]));
    const rows = (tasks.data || []).map((t) => ({
        ...t,
        dept_name: deptName[t.department_id] || null,
        owner_name: workerName[t.owner_id] || t.owner_id,
        assigned_by_name: workerName[t.assigned_by] || t.assigned_by,
    }));

    return { tasks: { ...tasks, rows }, departments, workers, workerName };
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
    };
}
