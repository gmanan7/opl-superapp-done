import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Crown, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '../../components/ui/badge';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import { dmtApi } from '../lib/dmtApi';
import { useDmtMe } from '../lib/useDmt';
import { useDmtTiers, useDmtTierMutations } from '../lib/useDmtTiers';
import { tierLabel } from '../lib/taskExtras';
import { resolveDmtHierarchyTree } from '../lib/dmtHierarchyTree';

function useModuleGroups() {
    return useQuery({ queryKey: ['dmt', 'module-groups'], queryFn: dmtApi.moduleGroups, staleTime: 1000 * 60 * 5 });
}
function useJhGroups() {
    return useQuery({ queryKey: ['dmt', 'jh-groups'], queryFn: dmtApi.jhGroups, staleTime: 1000 * 60 * 5 });
}

// Classic top-down org-chart: nested <ul>/<li>, each generation a horizontal row centered
// under its parent, connector lines drawn with ::before/::after borders on each <li> plus a
// vertical drop from each <ul>. Scoped under .dmt-org-tree so it can't leak into any other
// page's <ul>/<li>. Wider than the panel with many groups at one level — the wrapper below
// scrolls horizontally rather than shrinking the chart.
const TREE_CSS = `
.dmt-org-tree ul { padding-top: 28px; position: relative; display: flex; justify-content: center; }
.dmt-org-tree li { display: inline-flex; flex-direction: column; align-items: center; list-style: none; position: relative; padding: 28px 10px 0 10px; }
.dmt-org-tree li::before, .dmt-org-tree li::after { content: ''; position: absolute; top: 0; right: 50%; border-top: 1.5px solid #cbd5e1; width: 50%; height: 28px; }
.dmt-org-tree li::after { right: auto; left: 50%; border-left: 1.5px solid #cbd5e1; }
.dmt-org-tree li:only-child::before, .dmt-org-tree li:only-child::after { display: none; }
.dmt-org-tree li:only-child { padding-top: 0; }
.dmt-org-tree li:first-child::before, .dmt-org-tree li:last-child::after { border: 0 none; }
.dmt-org-tree li:last-child::before { border-right: 1.5px solid #cbd5e1; border-radius: 0 6px 0 0; }
.dmt-org-tree li:first-child::after { border-radius: 6px 0 0 0; }
.dmt-org-tree > ul { padding-top: 0; }
.dmt-org-tree > ul > li::before, .dmt-org-tree > ul > li::after { display: none; }
.dmt-org-tree ul ul::before { content: ''; position: absolute; top: 0; left: 50%; border-left: 1.5px solid #cbd5e1; width: 0; height: 28px; }
`;

// tone is keyed to LEVEL (T4/T3/T2), not nesting depth — a T2 that reports straight to a T4
// (skipping T3) still renders one row up, in the same visual column T3 boxes usually occupy,
// so color is what actually tells you which level a box is, not its position in the chart.
function NodeBox({ label, tier, tone = 'violet' }) {
    const toneClasses = {
        violet: 'border-violet-400 bg-violet-100',
        blue: 'border-blue-400 bg-blue-100',
        emerald: 'border-emerald-400 bg-emerald-100',
    }[tone];
    return (
        <div className={`w-52 shrink-0 space-y-1 rounded-lg border p-2.5 text-left shadow-sm ${toneClasses}`}>
            <p className="truncate text-sm font-semibold text-slate-900" title={label}>{label}</p>
            {tier ? (
                <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={tier.is_active ? 'default' : 'outline'} className="px-1.5 py-0 text-[10px]">
                        {tier.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                    <span className="flex items-center gap-1 text-[11px] text-slate-500">
                        <Crown className="h-3 w-3 text-amber-500" /> {tier.lead_name || 'Not appointed'}
                    </span>
                    <span className="flex items-center gap-1 text-[11px] text-slate-400">
                        <Users className="h-3 w-3" /> {tier.member_count ?? 0}
                    </span>
                </div>
            ) : (
                <Badge variant="outline" className="px-1.5 py-0 text-[10px]">Not set up yet</Badge>
            )}
        </div>
    );
}

// "Reports to" picker shown under a node's box — only to BE Lead / a T4 group's own Lead
// (mirrors the backend's dmtIsBeOrT4Lead gate on parent_tier_id). Blank unless `parent_tier_id`
// was actually set — never pre-filled with a resolved default, so what's shown always matches
// what's actually saved. A mistaken link is undone the same way it was made — no separate
// confirm modal needed, since picking a wrong group here was never destructive to begin with
// (it only ever moves a box in the chart, nothing underneath it is touched or lost) — so an
// extra confirm step would just be friction. Radix Select can't use "" as a real item value, so
// the clear option uses a sentinel that's translated back to `null` on save.
const CLEAR_LINK = '__clear__';
function ReportsToPicker({ tierId, currentValue, options, savedMessage }) {
    const { updateTier } = useDmtTierMutations();
    const [pending, setPending] = useState(undefined);
    const value = pending ?? (currentValue || '');
    return (
        <div className="mt-1.5 w-52">
            <Select
                value={value}
                onValueChange={(v) => {
                    const next = v === CLEAR_LINK ? '' : v;
                    setPending(next);
                    updateTier.mutate(
                        { id: tierId, parent_tier_id: next || null },
                        {
                            onSuccess: () => toast.success(next ? (savedMessage || 'Updated') : 'Link cleared'),
                            onError: (e) => { toast.error(e.message); setPending(undefined); },
                        },
                    );
                }}
            >
                <SelectTrigger className="h-7 text-[11px]"><SelectValue placeholder="Reports to…" /></SelectTrigger>
                <SelectContent>
                    {value && <SelectItem value={CLEAR_LINK} className="text-slate-400">— Clear link —</SelectItem>}
                    {options.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
                </SelectContent>
            </Select>
        </div>
    );
}

// One T3-level box: either a real DMT (moduleGroup set, tier may be null if not yet created)
// or a standalone/custom T3 group (moduleGroup null, tier always set). `nodeKey` uniquely
// identifies this box for grouping T2 children under it.
function T3Node({ nodeKey, label, tier, jhGroupsHere, t2ByJhGroupId, canManageLinks, t3ParentOptions, t2ParentOptions }) {
    return (
        <li>
            <NodeBox label={label} tier={tier} />
            {tier && canManageLinks && t3ParentOptions.length > 0 && (
                <ReportsToPicker
                    tierId={tier.id}
                    currentValue={tier.parent_tier_id}
                    options={t3ParentOptions}
                    savedMessage={`${label} now reports to that T4 group`}
                />
            )}
            {jhGroupsHere.length > 0 && (
                <ul>
                    {jhGroupsHere.map((jg) => {
                        const t2 = t2ByJhGroupId[jg.id];
                        return (
                            <li key={jg.id}>
                                <NodeBox label={jg.name} tier={t2} tone="emerald" />
                                {t2 && canManageLinks && t2ParentOptions.length > 0 && (
                                    <ReportsToPicker
                                        tierId={t2.id}
                                        currentValue={t2.parent_tier_id}
                                        options={t2ParentOptions}
                                        savedMessage={`${jg.name} relinked`}
                                    />
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </li>
    );
}

export function DmtHierarchy() {
    const { user, tierAtLeast } = useDmtMe();
    const isBeLead = tierAtLeast('be_lead');
    const myEmpId = user?.emp_id;
    const tiers = useDmtTiers();
    const { data: moduleGroups = [], isLoading: dmtsLoading } = useModuleGroups();
    const { data: jhGroups = [], isLoading: jhGroupsLoading } = useJhGroups();

    if (tiers.isLoading || dmtsLoading || jhGroupsLoading) {
        return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;
    }

    const allTiers = tiers.data || [];
    const {
        byId, t4Tiers, t2ByJhGroupId, customT3Tiers, customT2Tiers, t3Nodes,
        dmtsUnderT4, jhGroupsByT3Key, jhGroupsByT4Id, t2ByJhGroupIdAll,
    } = resolveDmtHierarchyTree(allTiers, moduleGroups, jhGroups);
    const activeT4Tiers = t4Tiers.filter((t) => t.is_active);
    const isT4Lead = activeT4Tiers.some((t) => t.lead_emp_id === myEmpId);
    const canManageLinks = isBeLead || isT4Lead;

    // Include EVERY T3/T4 as a pickable target, not just active ones — a group's effective
    // (implicit-default) parent can legitimately be an inactive T3/T4, and if that value isn't
    // in the option list, the Select just renders blank instead of showing it (Radix has
    // nothing to look the label up from). Inactive ones are still listed, just labeled, so
    // reparenting AWAY from one remains an active choice, not a dead end.
    const t3ParentOptions = t4Tiers.map((t) => ({ id: t.id, label: (t.display_name || tierLabel(t)) + (t.is_active ? '' : ' (Inactive)') }));
    const t2ParentOptions = [
        ...allTiers.filter((t) => t.name === 'T3' && (t.dmt_id || !t.jh_group_id)).map((t) => ({
            id: t.id,
            label: (t.dmt_id ? `${moduleGroups.find((mg) => mg.id === t.dmt_id)?.module || 'DMT'} (T3)` : `${t.display_name || tierLabel(t)} (T3, custom)`) + (t.is_active ? '' : ' (Inactive)'),
        })),
        ...t4Tiers.map((t) => ({ id: t.id, label: `${t.display_name || tierLabel(t)} (T4, direct)${t.is_active ? '' : ' (Inactive)'}` })),
    ];

    // Groups with no EXPLICIT `parent_tier_id` — they're still placed correctly in the chart
    // above via the implicit default, but that default is easy to miss buried in a long,
    // wide chart. Surfaced separately so a BE Lead / T4 Lead can go confirm or fix each one
    // without having to hunt for it above. The picker itself stays blank here too — nothing is
    // pre-filled anywhere unless it was actually saved.
    const unsetT3Items = t3Nodes
        .filter((n) => n.tier && !n.tier.parent_tier_id)
        .map((n) => ({ key: n.tier.id, level: 'T3', label: n.label, tier: n.tier }));
    const allT2Entries = [
        ...jhGroups.map((jg) => ({ tier: t2ByJhGroupId[jg.id], label: jg.name })),
        ...customT2Tiers.map((t) => ({ tier: t, label: t.display_name || tierLabel(t) })),
    ];
    const unsetT2Items = allT2Entries
        .filter((x) => x.tier && !x.tier.parent_tier_id)
        .map((x) => ({ key: x.tier.id, level: 'T2', label: x.label, tier: x.tier }));
    const unsetItems = [...unsetT3Items, ...unsetT2Items];

    if (t4Tiers.length === 0) {
        return (
            <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
                No T4 group yet — create one from the Tiers tab first.
            </p>
        );
    }

    return (
        <div className="space-y-4">
            <style>{TREE_CSS}</style>
            <p className="text-sm text-slate-500">
                How every group reports up: T4 (factory-wide) over T3 (per DMT, or a standalone group) over T2 (per JH group, or a standalone group) — a T2 can also report straight to a T4, skipping T3.
            </p>
            <div className="overflow-x-auto rounded-lg border border-slate-100 bg-slate-50/50 p-6">
                <div className="dmt-org-tree inline-block min-w-full">
                    <ul>
                        {t4Tiers.map((t4) => {
                            const t3sHere = dmtsUnderT4(t4);
                            const directJhGroups = jhGroupsByT4Id[t4.id] || [];
                            return (
                                <li key={t4.id}>
                                    <NodeBox label={t4.display_name || tierLabel(t4)} tier={t4} tone="blue" />
                                    {(t3sHere.length > 0 || directJhGroups.length > 0) && (
                                        <ul>
                                            {t3sHere.map((node) => (
                                                <T3Node
                                                    key={node.nodeKey}
                                                    nodeKey={node.nodeKey}
                                                    label={node.label}
                                                    tier={node.tier}
                                                    jhGroupsHere={jhGroupsByT3Key[node.nodeKey] || []}
                                                    t2ByJhGroupId={t2ByJhGroupIdAll}
                                                    canManageLinks={canManageLinks}
                                                    t3ParentOptions={t3ParentOptions}
                                                    t2ParentOptions={t2ParentOptions}
                                                />
                                            ))}
                                            {directJhGroups.map((jg) => {
                                                const t2 = t2ByJhGroupIdAll[jg.id];
                                                return (
                                                    <li key={jg.id}>
                                                        <NodeBox label={jg.name} tier={t2} tone="emerald" />
                                                        {t2 && canManageLinks && t2ParentOptions.length > 0 && (
                                                            <ReportsToPicker tierId={t2.id} currentValue={t2.parent_tier_id} options={t2ParentOptions} savedMessage={`${jg.name} relinked`} />
                                                        )}
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            </div>
            {canManageLinks && unsetItems.length > 0 && (
                <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <p className="text-sm font-semibold text-amber-800">
                        {unsetItems.length} group{unsetItems.length === 1 ? '' : 's'} without an explicit link
                    </p>
                    <p className="text-xs text-amber-700">
                        These are still placed correctly above (via the normal default), but easy to miss in a long chart — confirm or change each one here.
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {unsetItems.map((item) => (
                            <div
                                key={item.key}
                                className={`rounded-md border p-2.5 ${item.level === 'T3' ? 'border-violet-400 bg-violet-100' : 'border-emerald-400 bg-emerald-100'}`}
                            >
                                <p className="truncate text-sm font-medium text-slate-800" title={item.label}>{item.label} <span className="text-xs font-normal text-slate-500">({item.level})</span></p>
                                <ReportsToPicker
                                    tierId={item.tier.id}
                                    currentValue={item.tier.parent_tier_id}
                                    options={item.level === 'T3' ? t3ParentOptions : t2ParentOptions}
                                    savedMessage={`${item.label} linked`}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
