import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import {
    DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuSeparator,
    DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuPortal,
} from '../../components/ui/dropdown-menu';
import { cn } from '../../lib/utils';
import { dmtApi } from '../lib/dmtApi';
import { useDmtTiers } from '../lib/useDmtTiers';
import { useDmtMe } from '../lib/useDmt';
import { resolveDmtHierarchyTree } from '../lib/dmtHierarchyTree';
import { tierLabel } from '../lib/taskExtras';

// Pick one or more groups (T4 / DMTs / JH groups, laid out exactly like the Hierarchy tab) to narrow a list — e.g. the
// meetings on the Meetings page or the Decision Log. `selected` is a Set of group (tier) ids; empty = any group.
// A group that isn't linked into the Hierarchy tree yet still gets listed, at the bottom, so no meeting is ever
// impossible to filter by. Only the groups this person is part of are offered (BE Admin: all groups).
// `only` (optional Set of group ids) narrows the offer further — used by cascading filters so the menu lists just the
// groups that still have something to show given the other filters. The tree keeps its shape; hidden groups are skipped.
export function GroupFilter({ selected, onChange, only = null }) {
    const tiers = useDmtTiers();
    const moduleGroups = useQuery({ queryKey: ['dmt', 'module-groups'], queryFn: dmtApi.moduleGroups, staleTime: 1000 * 60 * 5 });
    const jhGroups = useQuery({ queryKey: ['dmt', 'jh-groups'], queryFn: dmtApi.jhGroups, staleTime: 1000 * 60 * 5 });
    const { user, tierAtLeast } = useDmtMe();
    const isBe = tierAtLeast('be_lead');
    const all = useMemo(
        () => (tiers.data || []).filter((t) => isBe || t.is_member || t.lead_emp_id === user?.emp_id),
        [tiers.data, user?.emp_id, isBe],
    );

    const tree = useMemo(() => resolveDmtHierarchyTree(all, moduleGroups.data || [], jhGroups.data || []), [all, moduleGroups.data, jhGroups.data]);
    const unlinked = useMemo(() => {
        const placed = new Set();
        for (const t4 of tree.t4Tiers) {
            placed.add(t4.id);
            for (const node of tree.dmtsUnderT4(t4)) {
                if (node.tier) placed.add(node.tier.id);
                for (const jg of tree.jhGroupsByT3Key[node.nodeKey] || []) { const t = tree.t2ByJhGroupIdAll[jg.id]; if (t) placed.add(t.id); }
            }
            for (const jg of tree.jhGroupsByT4Id[t4.id] || []) { const t = tree.t2ByJhGroupIdAll[jg.id]; if (t) placed.add(t.id); }
        }
        return all.filter((t) => !placed.has(t.id));
    }, [tree, all]);

    if (all.length === 0) return null;
    const show = (tier) => !!tier && (!only || only.has(tier.id));
    const toggle = (id) => {
        const next = new Set(selected);
        if (next.has(id)) next.delete(id); else next.add(id);
        onChange(next);
    };
    const item = (tier, label, extra) => (
        <DropdownMenuCheckboxItem key={tier.id} checked={selected.has(tier.id)} onCheckedChange={() => toggle(tier.id)} onSelect={(e) => e.preventDefault()}>
            {label}{extra}
        </DropdownMenuCheckboxItem>
    );

    // build each top-level block first, so a block with nothing left to offer is skipped altogether
    const blocks = tree.t4Tiers.map((t4) => {
        const rows = [];
        if (show(t4)) rows.push(item(t4, t4.display_name || tierLabel(t4)));
        for (const node of tree.dmtsUnderT4(t4)) {
            const jhVisible = (tree.jhGroupsByT3Key[node.nodeKey] || []).filter((jg) => show(tree.t2ByJhGroupIdAll[jg.id]));
            if (jhVisible.length === 0) {
                if (show(node.tier)) rows.push(item(node.tier, node.label));
                continue;
            }
            rows.push(
                <DropdownMenuSub key={node.nodeKey}>
                    <DropdownMenuSubTrigger className={cn(selected.has(node.tier.id) && 'font-semibold text-blue-700')}>{node.label}</DropdownMenuSubTrigger>
                    <DropdownMenuPortal>
                        <DropdownMenuSubContent className="w-56">
                            {show(node.tier) && item(node.tier, `Whole DMT — ${node.label}`)}
                            {show(node.tier) && <DropdownMenuSeparator />}
                            {jhVisible.map((jg) => item(tree.t2ByJhGroupIdAll[jg.id], jg.name || jg.jh_group_name))}
                        </DropdownMenuSubContent>
                    </DropdownMenuPortal>
                </DropdownMenuSub>,
            );
        }
        for (const jg of tree.jhGroupsByT4Id[t4.id] || []) {
            const t2Tier = tree.t2ByJhGroupIdAll[jg.id];
            if (show(t2Tier)) rows.push(item(t2Tier, jg.name || jg.jh_group_name, <span className="ml-1 text-[10px] text-slate-400">(direct)</span>));
        }
        return { t4, rows };
    }).filter((b) => b.rows.length > 0);
    const otherRows = unlinked.filter(show);

    return (
        <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-slate-400">Groups:</span>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button type="button" className="flex h-10 items-center gap-1 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600">
                        {selected.size > 0 ? `${selected.size} group${selected.size === 1 ? '' : 's'} selected` : 'Any group'}
                        <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-80 w-64 overflow-y-auto">
                    {blocks.length === 0 && otherRows.length === 0 && <p className="px-2 py-2 text-xs text-slate-500">No groups match the other filters.</p>}
                    {blocks.map(({ t4, rows }) => (
                        <div key={t4.id}>
                            {tree.t4Tiers.length > 1 && (
                                <p className="px-2 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t4.display_name || tierLabel(t4)}</p>
                            )}
                            {rows}
                        </div>
                    ))}
                    {otherRows.length > 0 && (
                        <div>
                            {blocks.length > 0 && <DropdownMenuSeparator />}
                            <p className="px-2 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Other groups</p>
                            {otherRows.map((t) => item(t, t.display_name || tierLabel(t)))}
                        </div>
                    )}
                    {selected.size > 0 && (
                        <>
                            <DropdownMenuSeparator />
                            <button type="button" onClick={() => onChange(new Set())} className="w-full px-2 py-1.5 text-left text-xs text-slate-400 underline">Clear all</button>
                        </>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
