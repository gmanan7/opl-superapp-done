import { tierLabel } from './taskExtras';

// Builds the exact same explicit-link-based org structure the Hierarchy tab renders — a group
// with no `parent_tier_id` set isn't placed anywhere in this tree, same as the chart. Any other
// screen that needs "the org structure" (e.g. Task Board's group filter) should derive it from
// here instead of keeping a second, independent notion of "which DMT owns which JH group" — the
// old jh_group_dmt_id-based grouping ignored explicit Hierarchy links entirely, so a group could
// show up under a different parent in the filter than where it actually sat in the chart.
export function resolveDmtHierarchyTree(allTiers, moduleGroups, jhGroups) {
    const byId = Object.fromEntries(allTiers.map((t) => [t.id, t]));
    const t4Tiers = allTiers.filter((t) => t.name === 'T4' && !t.dmt_id && !t.jh_group_id);
    const t3ByDmtId = Object.fromEntries(allTiers.filter((t) => t.name === 'T3' && t.dmt_id).map((t) => [t.dmt_id, t]));
    const t2ByJhGroupId = Object.fromEntries(allTiers.filter((t) => t.name === 'T2' && t.jh_group_id).map((t) => [t.jh_group_id, t]));
    const customT3Tiers = allTiers.filter((t) => t.name === 'T3' && !t.dmt_id && !t.jh_group_id);
    const customT2Tiers = allTiers.filter((t) => t.name === 'T2' && !t.dmt_id && !t.jh_group_id);

    // Unified list of T3-level boxes — a real DMT (nodeKey `dmt:<id>`) or a standalone/custom
    // T3 group (nodeKey `custom:<tier id>`) — so T2 grouping below can nest under either kind.
    const t3Nodes = [
        ...moduleGroups.map((mg) => ({ nodeKey: `dmt:${mg.id}`, label: mg.module, tier: t3ByDmtId[mg.id] || null })),
        ...customT3Tiers.map((t) => ({ nodeKey: `custom:${t.id}`, label: t.display_name || tierLabel(t), tier: t })),
    ];

    const dmtsUnderT4 = (t4) => t3Nodes.filter((node) => node.tier?.parent_tier_id === t4.id);

    const jhGroupsByT3Key = {};
    const jhGroupsByT4Id = {};
    const placeT2 = (t2Row, asJhGroup) => {
        const linked = t2Row?.parent_tier_id && byId[t2Row.parent_tier_id];
        if (!linked) return; // unlinked — not part of the tree
        if (!linked.dmt_id && !linked.jh_group_id) (jhGroupsByT4Id[linked.id] ||= []).push(asJhGroup);
        else if (linked.name === 'T3') {
            const key = linked.dmt_id ? `dmt:${linked.dmt_id}` : `custom:${linked.id}`;
            (jhGroupsByT3Key[key] ||= []).push(asJhGroup);
        }
    };
    for (const jg of jhGroups) placeT2(t2ByJhGroupId[jg.id], jg);
    const customT2AsJhGroups = customT2Tiers.map((t) => ({ id: `t2:${t.id}`, name: t.display_name || tierLabel(t), __customTier: t }));
    for (const cjg of customT2AsJhGroups) placeT2(cjg.__customTier, cjg);
    const t2ByJhGroupIdAll = { ...t2ByJhGroupId, ...Object.fromEntries(customT2AsJhGroups.map((c) => [c.id, c.__customTier])) };

    return {
        byId, t4Tiers, t3ByDmtId, t2ByJhGroupId, customT3Tiers, customT2Tiers,
        t3Nodes, dmtsUnderT4, jhGroupsByT3Key, jhGroupsByT4Id, t2ByJhGroupIdAll,
    };
}
