import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dmtApi } from './dmtApi';
import { nextRecurrence } from './dmtDates';

const KEY = ['dmt', 'planner-items'];

export function useDmtPlanner() {
    const qc = useQueryClient();
    const invalidate = () => qc.invalidateQueries({ queryKey: KEY });

    const query = useQuery({
        queryKey: KEY,
        queryFn: () => dmtApi.list('planner-items'),
    });

    const addItem = useMutation({
        mutationFn: (item) => dmtApi.create('planner-items', item),
        onSuccess: invalidate,
    });

    const updateItem = useMutation({
        mutationFn: ({ id, ...updates }) => dmtApi.update('planner-items', id, updates),
        onSuccess: invalidate,
    });

    const deleteItem = useMutation({
        mutationFn: (id) => dmtApi.remove('planner-items', id),
        onSuccess: invalidate,
    });

    const completeItem = useMutation({
        mutationFn: async (item) => {
            await dmtApi.update('planner-items', item.id, {
                is_completed: true,
                completed_at: new Date().toISOString(),
            });
            if (item.recurrence_type && item.recurrence_type !== 'none') {
                await dmtApi.create('planner-items', {
                    title: item.title,
                    notes: item.notes,
                    due_date: nextRecurrence(item),
                    recurrence_type: item.recurrence_type,
                    recurrence_day_of_week: item.recurrence_day_of_week,
                    recurrence_day_of_month: item.recurrence_day_of_month,
                    origin_context: `recurrence:${item.id}`,
                });
            }
        },
        onSuccess: invalidate,
    });

    const uncompleteItem = useMutation({
        mutationFn: (id) => dmtApi.update('planner-items', id, { is_completed: false, completed_at: null }),
        onSuccess: invalidate,
    });

    const deleteCompleted = useMutation({
        mutationFn: () => dmtApi.clearCompletedPlanner(),
        onSuccess: invalidate,
    });

    return {
        items: query.data ?? [],
        isLoading: query.isLoading,
        addItem, updateItem, deleteItem, completeItem, uncompleteItem, deleteCompleted,
    };
}
