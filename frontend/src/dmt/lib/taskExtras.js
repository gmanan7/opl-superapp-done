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

// ---- tiers (replaced the old ad-hoc task groups — see taskVisibility below) ----
export const truncateGroupName = (name, max = 12) =>
    !name ? '' : (name.length <= max ? name : `${name.slice(0, max - 1)}…`);

// "T4" (or a BE-admin-chosen custom name), "T3 · <DMT name>", or "T2 · <JH group name>" —
// dmt_name/jh_group_name come from GET /api/dmt/tiers's join; `name` itself is always just
// "T4"/"T3"/"T2" internally, regardless of what's shown. A custom `display_name` (currently
// only settable on T4-level groups) always wins over the generated label.
export function tierLabel(tier) {
    if (!tier) return '';
    if (tier.display_name) return tier.display_name;
    if (tier.jh_group_name) return `${tier.name} · ${tier.jh_group_name}`;
    if (tier.dmt_name) return `${tier.name} · ${tier.dmt_name}`;
    return tier.name;
}

// "Visible to" choice -> {is_private, tier_id}
export function taskVisibility(choice) {
    if (choice === 'everyone') return { is_private: false, tier_id: null };
    if (choice === 'private') return { is_private: true, tier_id: null };
    return { is_private: false, tier_id: choice };
}
