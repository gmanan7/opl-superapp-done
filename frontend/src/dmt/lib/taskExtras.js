// Task Board helpers ported from dmt/src/lib/{taskSort,taskCarryover,taskGroups}.ts

// ---- sort ----
export const TASK_SORT_OPTIONS = [
    { value: 'created_desc', label: 'Newest first' },
    { value: 'created_asc', label: 'Oldest first' },
    { value: 'due_asc', label: 'Due date ↑' },
    { value: 'due_desc', label: 'Due date ↓' },
];

export function sortTasks(tasks, key) {
    const a = [...tasks];
    switch (key) {
        case 'created_asc': return a.sort((x, y) => (x.created_at || '').localeCompare(y.created_at || ''));
        case 'due_asc': return a.sort((x, y) => {
            if (!x.due_date && !y.due_date) return 0;
            if (!x.due_date) return 1;
            if (!y.due_date) return -1;
            return x.due_date.localeCompare(y.due_date);
        });
        case 'due_desc': return a.sort((x, y) => {
            if (!x.due_date && !y.due_date) return 0;
            if (!x.due_date) return -1;
            if (!y.due_date) return 1;
            return y.due_date.localeCompare(x.due_date);
        });
        default: return a.sort((x, y) => (y.created_at || '').localeCompare(x.created_at || ''));
    }
}

// ---- carryover ----
// task_id set = ids with >=1 due_date_change row; carryover = in set AND not terminal.
export function buildPushCounts(rows) {
    const m = new Map();
    for (const r of rows || []) if (r.task_id) m.set(r.task_id, (m.get(r.task_id) || 0) + 1);
    return m;
}
export function isCarryover(task, historyIds) {
    if (!task?.id) return false;
    if (task.status === 'completed' || task.status === 'cancelled') return false;
    return historyIds.has(task.id);
}

// ---- groups ----
export const GROUP_COLOR_PRESETS = [
    { name: 'Indigo', value: '#6366f1' }, { name: 'Rose', value: '#f43f5e' },
    { name: 'Amber', value: '#f59e0b' }, { name: 'Green', value: '#10b981' },
    { name: 'Teal', value: '#14b8a6' }, { name: 'Orange', value: '#f97316' },
    { name: 'Purple', value: '#a855f7' }, { name: 'Slate', value: '#64748b' },
];
export const truncateGroupName = (name, max = 12) =>
    !name ? '' : (name.length <= max ? name : `${name.slice(0, max - 1)}…`);

// tier: 'jh_lead' | 'module_lead' | 'leadership' | 'be_lead'
export const canCreateGroup = (tier) => ['module_lead', 'leadership', 'be_lead'].includes(tier);
export const canDeleteGroup = (tier) => ['leadership', 'be_lead'].includes(tier);
export function canManageGroupMembers(group, me, tier) {
    if (['leadership', 'be_lead'].includes(tier)) return true;
    return tier === 'module_lead' && group?.created_by === me;
}
export const canManageLeaders = (group, me, tier) =>
    ['leadership', 'be_lead'].includes(tier) || group?.created_by === me;

// "Visible to" choice -> {is_private, task_group_id}
export function taskVisibility(choice) {
    if (choice === 'everyone') return { is_private: false, task_group_id: null };
    if (choice === 'private') return { is_private: true, task_group_id: null };
    return { is_private: false, task_group_id: choice };
}
