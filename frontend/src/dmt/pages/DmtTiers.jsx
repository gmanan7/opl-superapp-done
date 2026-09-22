import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, UserPlus, Trash2, Gauge, Crown, Plus, Pencil, Check, X, CalendarPlus, Lock, UserCog } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Switch } from '../../components/ui/switch';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../../components/ui/dialog';
import { dmtApi } from '../lib/dmtApi';
import { useDmtMe } from '../lib/useDmt';
import { useDmtTiers, useDmtTierMembers, useDmtTierKpis, useDmtTierMutations, useKpiOwners } from '../lib/useDmtTiers';
import { useDmtKpiMaster } from '../lib/useDmtKpi';
import { CreateMeetingDialog } from './DmtMeetings';
import { tierLabel } from '../lib/taskExtras';

function useWorkerNames() {
    return useQuery({ queryKey: ['worker-names'], queryFn: dmtApi.workerNames, staleTime: 1000 * 60 * 5 });
}

function useModuleGroups() {
    return useQuery({ queryKey: ['dmt', 'module-groups'], queryFn: dmtApi.moduleGroups, staleTime: 1000 * 60 * 5 });
}

function AddMemberDialog({ tier, open, onOpenChange, existingEmpIds }) {
    const { data: people = [] } = useWorkerNames();
    const { addMember } = useDmtTierMutations();
    const [empId, setEmpId] = useState('');
    const candidates = people.filter((p) => p.is_active && !existingEmpIds.includes(p.id));

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle>Add member to {tier.name}</DialogTitle></DialogHeader>
                <Select value={empId} onValueChange={setEmpId}>
                    <SelectTrigger className="h-11"><SelectValue placeholder="Select a person" /></SelectTrigger>
                    <SelectContent>
                        {candidates.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.name} ({p.role})</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <DialogFooter>
                    <Button
                        disabled={!empId || addMember.isPending}
                        onClick={() => addMember.mutate(
                            { tierId: tier.id, empId },
                            {
                                onSuccess: () => { toast.success('Member added'); onOpenChange(false); setEmpId(''); },
                                onError: (e) => toast.error(e.message),
                            },
                        )}
                    >
                        {addMember.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Add
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function KpiPickerDialog({ tier, open, onOpenChange, currentKpiIds }) {
    const [deptFilter, setDeptFilter] = useState('all');
    const { departments, kpis } = useDmtKpiMaster(deptFilter);
    const { setKpis } = useDmtTierMutations();
    const [selected, setSelected] = useState(new Set(currentKpiIds));
    // A KPI can belong to only one group — ones owned by another group are shown but not pickable.
    const owners = useKpiOwners();
    const ownedElsewhere = Object.fromEntries((owners.data || []).filter((o) => o.tier_id !== tier.id).map((o) => [o.kpi_id, o.tier_label]));
    const toggle = (id) => setSelected((prev) => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader><DialogTitle>KPIs shown to {tier.name}</DialogTitle></DialogHeader>
                <p className="text-xs text-slate-500">Pick any active KPI, from any department. A KPI belongs to one group only, and only this group's members can enter its values.</p>
                <Select value={deptFilter} onValueChange={setDeptFilter}>
                    <SelectTrigger className="h-10"><SelectValue placeholder="All departments" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All departments</SelectItem>
                        {(departments.data || []).map((d) => (
                            <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <div className="max-h-80 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                    {(kpis.rows || []).map((k) => {
                        const isChecked = selected.has(k.id);
                        const takenBy = ownedElsewhere[k.id];
                        return (
                            <label
                                key={k.id}
                                className={`flex items-center gap-2 rounded-md border p-2 text-sm transition-colors ${
                                    takenBy ? 'cursor-not-allowed border-transparent opacity-50'
                                        : isChecked ? 'cursor-pointer border-blue-600/40 bg-blue-50' : 'cursor-pointer border-transparent hover:bg-slate-50'
                                }`}
                            >
                                <input
                                    type="checkbox"
                                    checked={isChecked}
                                    disabled={!!takenBy}
                                    onChange={() => toggle(k.id)}
                                    className="h-3.5 w-3.5 rounded border-slate-300 text-blue-700 focus:ring-blue-700"
                                />
                                <span className="flex-1 truncate">{k.name}</span>
                                <span className="text-xs text-slate-400">
                                    {takenBy ? `In ${takenBy}` : k.department ? (k.module ? `${k.module.name} ${k.department.name}` : k.department.name) : '—'}
                                </span>
                            </label>
                        );
                    })}
                    {!kpis.isLoading && (kpis.rows || []).length === 0 && (
                        <p className="p-2 text-sm text-slate-400">
                            {deptFilter === 'all' ? 'No KPIs exist yet.' : 'No KPIs in this department.'}
                        </p>
                    )}
                </div>
                <DialogFooter>
                    <Button
                        disabled={setKpis.isPending}
                        onClick={() => setKpis.mutate(
                            { tierId: tier.id, kpiIds: [...selected] },
                            {
                                onSuccess: () => { toast.success('KPI set updated'); onOpenChange(false); },
                                onError: (e) => toast.error(e.message),
                            },
                        )}
                    >
                        {setKpis.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function TierCard({ tier, isBeLead, myEmpId, moduleLeadEmpId, canChangeLeadOverride }) {
    const members = useDmtTierMembers(tier.id);
    const tierKpis = useDmtTierKpis(tier.id);
    const { updateTier, deleteTier, removeMember } = useDmtTierMutations();
    const { data: people = [] } = useWorkerNames();
    const [addOpen, setAddOpen] = useState(false);
    const [kpiOpen, setKpiOpen] = useState(false);
    const [meetingOpen, setMeetingOpen] = useState(false);
    const [renaming, setRenaming] = useState(false);
    const [nameDraft, setNameDraft] = useState('');
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deactivateOpen, setDeactivateOpen] = useState(false);
    const [pendingLead, setPendingLead] = useState(null); // { id, name } — awaiting confirm
    const [escDraft, setEscDraft] = useState('');

    const isLead = tier.lead_emp_id === myEmpId;
    const canManage = isBeLead || isLead;
    // Renaming (display_name) is the same "manage this tier" rule as members/task-viewers —
    // BE Lead, or that tier's own Lead — for any level (T4, T3, or T2).
    const isT4Level = !tier.dmt_id && !tier.jh_group_id;
    const canRename = canManage;
    // Who can reassign the Lead: BE Lead, always — or, for a DMT-scoped tier (T3), that DMT's
    // own module lead specifically — or, for a JH-group-scoped tier (T2), whatever the caller
    // (T2Panel) already resolved server-side via `can_manage_kpis` (T2's Lead-change and
    // KPI-picking share the exact same authorized set: BE Lead, JH leader, module lead, or a
    // routing incharge for that JH group) — or, for a standalone/custom group with no real
    // DMT/JH group behind it (isT4Level covers both an actual T4 and a free-form extra T3/T2),
    // that group's own current Lead, same as T4.
    const canChangeLead = isBeLead || (isT4Level && isLead) || (moduleLeadEmpId && moduleLeadEmpId === myEmpId) || !!canChangeLeadOverride;

    const saveName = () => {
        const dn = nameDraft.trim();
        updateTier.mutate(
            { id: tier.id, display_name: dn || null },
            {
                onSuccess: () => { toast.success(dn ? 'Renamed' : 'Custom name removed — showing as T4'); setRenaming(false); },
                onError: (e) => toast.error(e.message),
            },
        );
    };

    return (
        <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    {renaming ? (
                        <div className="flex items-center gap-1.5">
                            <Input
                                autoFocus value={nameDraft} onChange={(e) => setNameDraft(e.target.value)}
                                placeholder="T4" className="h-8 w-48"
                                onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setRenaming(false); }}
                            />
                            <button type="button" onClick={saveName} className="text-emerald-600 hover:text-emerald-700"><Check className="h-4 w-4" /></button>
                            <button type="button" onClick={() => setRenaming(false)} className="text-slate-400 hover:text-rose-600"><X className="h-4 w-4" /></button>
                        </div>
                    ) : (
                        <>
                            <h3 className="text-base font-semibold text-slate-900">{tierLabel(tier)}</h3>
                            {tier.display_name && <span className="text-xs text-slate-400">({tier.name})</span>}
                            {canRename && (
                                <button
                                    type="button"
                                    onClick={() => { setNameDraft(tier.display_name || ''); setRenaming(true); }}
                                    className="text-slate-400 hover:text-slate-700"
                                    title="Rename this group"
                                >
                                    <Pencil className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </>
                    )}
                    {/* Only show the raw DMT/JH-group name as a separate badge once a custom
                        display_name has replaced it in the heading above — otherwise the
                        heading (tierLabel) already includes this same name, and the badge is
                        just repeating it. */}
                    {tier.display_name && tier.dmt_name && <Badge variant="outline">{tier.dmt_name}</Badge>}
                    {tier.is_private && (
                        <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" /> Private</Badge>
                    )}
                    {tier.display_name && tier.jh_group_name && <Badge variant="outline">{tier.jh_group_name}</Badge>}
                    <Badge variant={tier.is_active ? 'default' : 'outline'}>{tier.is_active ? 'Active' : 'Inactive'}</Badge>
                </div>
                <div className="flex items-center gap-3">
                    {canManage && (
                        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setMeetingOpen(true)}>
                            <CalendarPlus className="h-3.5 w-3.5" /> Create Meeting
                        </Button>
                    )}
                    {isBeLead && (
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                            <span>Active</span>
                            <Switch
                                checked={tier.is_active}
                                // Turning it ON is harmless and immediate. Turning it OFF hides the
                                // group from everyone but BE admin, so it gets its own confirm —
                                // same weight as the delete prompt below, since deactivating is the
                                // required first step toward deleting it.
                                onCheckedChange={(v) => {
                                    if (v) {
                                        updateTier.mutate({ id: tier.id, is_active: true }, { onError: (e) => toast.error(e.message) });
                                    } else {
                                        setDeactivateOpen(true);
                                    }
                                }}
                            />
                        </div>
                    )}
                    {/* Deleting a group is BE-admin-only, no exception even for its own Lead — undoing
                        a mistaken creation is a BE-admin call. Meetings/tasks already tagged to it
                        just lose that tag (server-side ON DELETE SET NULL); nothing else is touched.
                        Only offered once the group is Inactive — deactivating first is the safety
                        step before the irreversible one. Available at every level now that T3/T2
                        are deliberately created (not silently auto-derived), same as T4. */}
                    {isBeLead && !tier.is_active && (
                        <button type="button" onClick={() => setDeleteOpen(true)} className="text-slate-400 hover:text-rose-600" title="Delete this group">
                            <Trash2 className="h-4 w-4" />
                        </button>
                    )}
                </div>
            </div>
            {tier.name !== 'T4' && !tier.is_private && (isBeLead || tier.escalation_days != null) && (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold text-slate-700">Auto-escalation</p>
                    {isBeLead ? (
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                            <span>Escalate unfinished tasks</span>
                            <Input
                                type="number" min={1} max={365} className="h-8 w-16"
                                value={escDraft !== '' ? escDraft : (tier.escalation_days != null ? String(tier.escalation_days) : '')}
                                onChange={(e) => setEscDraft(e.target.value)} placeholder="—"
                            />
                            <span>days after their due date</span>
                            <Button
                                size="sm" className="h-8"
                                disabled={updateTier.isPending || escDraft === '' || !(Number.isInteger(Number(escDraft)) && Number(escDraft) >= 1 && Number(escDraft) <= 365)}
                                onClick={() => updateTier.mutate({ id: tier.id, escalation_days: Number(escDraft) }, {
                                    onSuccess: () => { toast.success('Auto-escalation saved'); setEscDraft(''); },
                                    onError: (e) => toast.error(e.message),
                                })}
                            >Save</Button>
                            {tier.escalation_days != null && (
                                <Button
                                    size="sm" className="h-8 bg-rose-600 text-white hover:bg-rose-700" disabled={updateTier.isPending}
                                    onClick={() => updateTier.mutate({ id: tier.id, escalation_days: null }, {
                                        onSuccess: () => { toast.success('Auto-escalation turned off'); setEscDraft(''); },
                                        onError: (e) => toast.error(e.message),
                                    })}
                                >Turn off</Button>
                            )}
                        </div>
                    ) : (
                        <p className="mt-1 text-sm text-slate-600">Unfinished tasks escalate {tier.escalation_days} day{tier.escalation_days === 1 ? '' : 's'} after their due date.</p>
                    )}
                    {tier.escalation_days != null && !tier.parent_tier_id && (
                        <p className="mt-1.5 text-xs text-amber-600">No "Reports to" link (set one in Hierarchy) — nothing can escalate yet.</p>
                    )}
                </div>
            )}
            {meetingOpen && (
                <CreateMeetingDialog open onOpenChange={setMeetingOpen} me={myEmpId} initialTierId={tier.id} />
            )}
            <Dialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader><DialogTitle>Make "{tierLabel(tier)}" inactive?</DialogTitle></DialogHeader>
                    <p className="text-sm text-slate-500">
                        It'll be hidden from everyone except BE admins until reactivated. Its meetings, tasks, and members are unaffected.
                    </p>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeactivateOpen(false)}>Cancel</Button>
                        <Button
                            disabled={updateTier.isPending}
                            onClick={() => updateTier.mutate(
                                { id: tier.id, is_active: false },
                                { onSuccess: () => setDeactivateOpen(false), onError: (e) => toast.error(e.message) },
                            )}
                        >
                            {updateTier.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Make Inactive
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader><DialogTitle>Delete "{tierLabel(tier)}"?</DialogTitle></DialogHeader>
                    <p className="text-sm text-slate-500">
                        This permanently removes the group. Any meetings or tasks already tagged to it
                        are kept but lose that tag — nothing else is deleted. This can't be undone.
                    </p>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
                        <Button
                            variant="destructive" disabled={deleteTier.isPending}
                            onClick={() => deleteTier.mutate(tier.id, {
                                onSuccess: () => toast.success('Group deleted'),
                                onError: (e) => toast.error(e.message),
                            })}
                        >
                            {deleteTier.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {canChangeLead ? (
                <div className="flex items-center gap-2">
                    <Crown className="h-4 w-4 text-amber-500" />
                    <span className="text-sm text-slate-600">Lead:</span>
                    <Select
                        value={tier.lead_emp_id || undefined}
                        onValueChange={(v) => {
                            if (v === tier.lead_emp_id) return;
                            const p = people.find((x) => x.id === v);
                            setPendingLead({ id: v, name: p?.name || v });
                        }}
                    >
                        <SelectTrigger className="h-9 w-56"><SelectValue placeholder="Select a lead" /></SelectTrigger>
                        <SelectContent>
                            {people.filter((p) => p.is_active).map((p) => (
                                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            ) : (
                <p className="text-sm text-slate-600">Lead: <span className="font-medium text-slate-900">{tier.lead_name || 'Not appointed'}</span></p>
            )}
            {/* Co-facilitator: runs this group's meetings together with the Lead (who facilitates them by default) — sees the
                full attendance list, marks anyone, adds outside people to a single meeting. BE Lead or the group's Lead sets it. */}
            {canManage ? (
                <div className="flex items-center gap-2">
                    <UserCog className="h-4 w-4 text-blue-500" />
                    <span className="text-sm text-slate-600">Co-facilitator:</span>
                    <Select
                        value={tier.co_facilitator_emp_id || 'none'}
                        onValueChange={(v) => updateTier.mutate(
                            { id: tier.id, co_facilitator_emp_id: v === 'none' ? null : v },
                            {
                                onSuccess: () => toast.success(v === 'none' ? 'Co-facilitator removed' : `Co-facilitator set to ${people.find((x) => x.id === v)?.name || v}`),
                                onError: (e) => toast.error(e.message),
                            },
                        )}
                    >
                        <SelectTrigger className="h-9 w-56"><SelectValue placeholder="None" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {people.filter((p) => p.is_active).map((p) => (
                                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            ) : (
                <p className="text-sm text-slate-600">Co-facilitator: <span className="font-medium text-slate-900">{tier.co_facilitator_name || 'None'}</span></p>
            )}
            <Dialog open={!!pendingLead} onOpenChange={(v) => !v && setPendingLead(null)}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader><DialogTitle>Change Lead?</DialogTitle></DialogHeader>
                    <p className="text-sm text-slate-500">
                        Lead will change from <span className="font-medium text-slate-900">{tier.lead_name || 'Not appointed'}</span> to{' '}
                        <span className="font-medium text-slate-900">{pendingLead?.name}</span>.
                    </p>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPendingLead(null)}>Cancel</Button>
                        <Button
                            disabled={updateTier.isPending}
                            onClick={() => updateTier.mutate(
                                { id: tier.id, lead_emp_id: pendingLead.id },
                                {
                                    onSuccess: () => {
                                        toast.success(`Lead changed from ${tier.lead_name || 'Not appointed'} to ${pendingLead.name}`);
                                        setPendingLead(null);
                                    },
                                    onError: (e) => toast.error(e.message),
                                },
                            )}
                        >
                            {updateTier.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Confirm
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-slate-700">Members ({members.data?.length ?? 0})</h4>
                    {canManage && (
                        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAddOpen(true)}>
                            <UserPlus className="h-3.5 w-3.5" /> Add
                        </Button>
                    )}
                </div>
                {members.isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                ) : (
                    <div className="flex flex-wrap gap-1.5">
                        {(members.data || []).map((m) => (
                            <span key={m.emp_id} className="flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                                {m.name}
                                {canManage && (
                                    <button
                                        type="button"
                                        onClick={() => removeMember.mutate(
                                            { tierId: tier.id, empId: m.emp_id },
                                            { onSuccess: () => toast.success('Removed'), onError: (e) => toast.error(e.message) },
                                        )}
                                        className="text-slate-400 hover:text-rose-600"
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </button>
                                )}
                            </span>
                        ))}
                        {(members.data || []).length === 0 && <span className="text-sm text-slate-400">No members yet.</span>}
                    </div>
                )}
            </div>

            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <h4 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                        <Gauge className="h-3.5 w-3.5" /> KPIs shown ({tierKpis.data?.length ?? 0})
                    </h4>
                    {(canManage || tier.can_manage_kpis) && (
                        <Button size="sm" variant="outline" onClick={() => setKpiOpen(true)}>Manage</Button>
                    )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                    {(tierKpis.data || []).map((k) => (
                        <span key={k.id} className="rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-700">{k.name}</span>
                    ))}
                    {(tierKpis.data || []).length === 0 && <span className="text-sm text-slate-400">No KPIs picked yet.</span>}
                </div>
            </div>

            {addOpen && (
                <AddMemberDialog
                    tier={tier}
                    open
                    onOpenChange={setAddOpen}
                    existingEmpIds={(members.data || []).map((m) => m.emp_id)}
                />
            )}
            {kpiOpen && (
                <KpiPickerDialog
                    tier={tier}
                    open
                    onOpenChange={setKpiOpen}
                    currentKpiIds={(tierKpis.data || []).map((k) => k.kpi_id)}
                />
            )}
        </div>
    );
}

// BE-Admin-only option on every "new group" dialog. Task visibility is identical to any other
// group (its members + BE Admin + Task Board Overview viewers); the flag is for auto-escalation.
function PrivateGroupCheckbox({ checked, onChange }) {
    return (
        <label className="flex cursor-pointer items-start gap-2 rounded-md border border-slate-200 bg-slate-50 p-3">
            <input
                type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300"
            />
            <span className="text-sm">
                <span className="font-medium text-slate-700">Private group</span>
                <span className="block text-xs text-slate-500">
                    Tasks are visible only to the group's members and BE Admin — same as any other group.
                    Marked private so auto-escalation can treat it differently.
                </span>
            </span>
        </label>
    );
}

// A T4-level group is factory-wide (no dmt_id/jh_group_id). BE admins create these by hand —
// unlike T3/T2 (which auto-create one per real DMT/JH group), there's no natural source to
// auto-derive a T4 group or its Lead from, and there can now be any number of them (e.g. a
// "Packing Excellence" group and a "Quality Council" group side by side).
function CreateT4Dialog({ open, onOpenChange, me }) {
    const { data: people = [] } = useWorkerNames();
    const { createTier } = useDmtTierMutations();
    const [name, setName] = useState('');
    const [leadEmpId, setLeadEmpId] = useState('');
    const [isPrivate, setIsPrivate] = useState(false);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle>New T4 Group</DialogTitle></DialogHeader>
                <div className="space-y-3">
                    <div>
                        <label className="text-sm font-medium text-slate-700">Group name *</label>
                        <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-10" />
                    </div>
                    <div>
                        <label className="text-sm font-medium text-slate-700">Lead *</label>
                        <Select value={leadEmpId} onValueChange={setLeadEmpId}>
                            <SelectTrigger className="mt-1 h-10"><SelectValue placeholder="Select a lead" /></SelectTrigger>
                            <SelectContent>
                                {people.filter((p) => p.is_active).map((p) => (
                                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <PrivateGroupCheckbox checked={isPrivate} onChange={setIsPrivate} />
                </div>
                <DialogFooter>
                    <Button
                        disabled={!name.trim() || !leadEmpId || createTier.isPending}
                        onClick={() => createTier.mutate(
                            { name: 'T4', dmtId: null, jhGroupId: null, displayName: name.trim(), leadEmpId, isPrivate },
                            {
                                onSuccess: () => { toast.success('T4 group created'); onOpenChange(false); setName(''); setLeadEmpId(''); setIsPrivate(false); },
                                onError: (e) => toast.error(e.message),
                            },
                        )}
                    >
                        {createTier.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Create
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function T4Panel({ tiers, isBeLead, myEmpId }) {
    const [showCreate, setShowCreate] = useState(false);
    // Active groups first (there can now be several) — inactive ones sink to the bottom
    // instead of being interleaved with the ones people actually use day to day.
    const t4Tiers = (tiers.data || [])
        .filter((t) => t.name === 'T4' && !t.dmt_id && !t.jh_group_id)
        .slice()
        .sort((a, b) => (b.is_active ? 1 : 0) - (a.is_active ? 1 : 0));

    if (tiers.isLoading) {
        return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;
    }

    return (
        <div className="space-y-4">
            {isBeLead && (
                <div className="flex justify-end">
                    <Button size="sm" className="gap-1.5" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> New T4 Group</Button>
                </div>
            )}
            {t4Tiers.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
                    {isBeLead ? 'No T4 groups yet — create one above.' : "You're not part of any T4 group yet."}
                </p>
            ) : (
                t4Tiers.map((tier) => <TierCard key={tier.id} tier={tier} isBeLead={isBeLead} myEmpId={myEmpId} />)
            )}
            {isBeLead && <CreateT4Dialog open={showCreate} onOpenChange={setShowCreate} me={myEmpId} />}
        </div>
    );
}

// Shared dialog for manually creating a T3 or T2 group, with an optional "reports to" pick at
// creation time — a T3 can link to a T4; a T2 can link to a T3 or a T4 directly (skipping T3).
// Left blank, it falls back to the same default the backend applies everywhere else (sole
// active T4 / the JH group's own DMT).
//
// Two modes, same as this level already has for real vs. free-form data elsewhere in the app:
//   - "Linked" (default when available): pick a real DMT/JH group that doesn't have one yet —
//     this is the group TPM already knows about, same as before.
//   - "Custom": a standalone extra group with no real DMT/JH group behind it, exactly like a
//     T4 group today — pick a name and a Lead by hand. Useful for e.g. a cross-DMT taskforce
//     that still needs to sit at the T3/T2 level of the hierarchy.
function CreateScopedGroupDialog({ level, open, onOpenChange, options, optionLabel, parentOptions, isBeLead }) {
    const { data: people = [] } = useWorkerNames();
    const { createTier } = useDmtTierMutations();
    const [mode, setMode] = useState(options.length > 0 ? 'linked' : 'custom');
    const [scopeId, setScopeId] = useState('');
    const [customName, setCustomName] = useState('');
    const [leadEmpId, setLeadEmpId] = useState('');
    const [parentId, setParentId] = useState('');
    const [isPrivate, setIsPrivate] = useState(false);

    const reset = () => { setScopeId(''); setCustomName(''); setLeadEmpId(''); setParentId(''); setIsPrivate(false); };
    const scopeNoun = level === 'T3' ? 'DMT' : 'JH group';

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle>New {level} Group</DialogTitle></DialogHeader>
                <div className="space-y-3">
                    <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
                        <button
                            type="button"
                            onClick={() => options.length > 0 && setMode('linked')}
                            disabled={options.length === 0}
                            title={options.length === 0 ? `Every ${scopeNoun} already has a ${level} group` : undefined}
                            className={`flex-1 rounded-md px-3 py-1.5 font-medium transition-colors ${
                                mode === 'linked' ? 'bg-white text-blue-700 shadow-xs' : options.length === 0 ? 'text-slate-300 cursor-not-allowed' : 'text-slate-500'
                            }`}
                        >
                            Link to a {scopeNoun}
                        </button>
                        <button
                            type="button" onClick={() => setMode('custom')}
                            className={`flex-1 rounded-md px-3 py-1.5 font-medium transition-colors ${mode === 'custom' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-500'}`}
                        >
                            Custom group
                        </button>
                    </div>
                    {mode === 'linked' && options.length === 0 ? (
                        <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                            Every {scopeNoun} already has a {level} group — nothing left to link. Use "Custom group" instead.
                        </p>
                    ) : mode === 'linked' ? (
                        <div>
                            <label className="text-sm font-medium text-slate-700">{scopeNoun} *</label>
                            <Select value={scopeId} onValueChange={setScopeId}>
                                <SelectTrigger className="mt-1 h-10"><SelectValue placeholder={`Select a ${scopeNoun}`} /></SelectTrigger>
                                <SelectContent>
                                    {options.map((o) => <SelectItem key={o.id} value={o.id}>{optionLabel(o)}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    ) : (
                        <>
                            <div>
                                <label className="text-sm font-medium text-slate-700">Group name *</label>
                                <Input value={customName} onChange={(e) => setCustomName(e.target.value)} className="mt-1 h-10" />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-slate-700">Lead *</label>
                                <Select value={leadEmpId} onValueChange={setLeadEmpId}>
                                    <SelectTrigger className="mt-1 h-10"><SelectValue placeholder="Select a lead" /></SelectTrigger>
                                    <SelectContent>
                                        {people.filter((p) => p.is_active).map((p) => (
                                            <SelectItem key={p.id} value={p.id}>{p.name} ({p.role})</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </>
                    )}
                    {parentOptions.length > 0 && (
                        <div>
                            <label className="text-sm font-medium text-slate-700">Reports to</label>
                            <Select value={parentId} onValueChange={setParentId}>
                                <SelectTrigger className="mt-1 h-10"><SelectValue placeholder="Use the default" /></SelectTrigger>
                                <SelectContent>
                                    {parentOptions.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    {isBeLead && <PrivateGroupCheckbox checked={isPrivate} onChange={setIsPrivate} />}
                </div>
                <DialogFooter>
                    <Button
                        disabled={(mode === 'linked' ? !scopeId : !leadEmpId || !customName.trim()) || createTier.isPending}
                        onClick={() => createTier.mutate(
                            {
                                name: level,
                                dmtId: mode === 'linked' && level === 'T3' ? scopeId : undefined,
                                jhGroupId: mode === 'linked' && level === 'T2' ? scopeId : undefined,
                                displayName: mode === 'custom' ? customName.trim() : undefined,
                                leadEmpId: mode === 'custom' ? leadEmpId : undefined,
                                parentTierId: parentId || undefined,
                                isPrivate: isBeLead && isPrivate,
                            },
                            {
                                onSuccess: () => { toast.success(`${level} group created`); onOpenChange(false); reset(); },
                                onError: (e) => toast.error(e.message),
                            },
                        )}
                    >
                        {createTier.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Create
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// T3 is one tier per real DMT — created deliberately (BE Lead or a T4 group's own Lead), no
// longer silently auto-created for every DMT the moment a BE Lead opens this page.
function T3Panel({ tiers, isBeLead, myEmpId }) {
    const { data: moduleGroups = [], isLoading: dmtsLoading } = useModuleGroups();
    const canCreate = isBeLead;
    const [showCreate, setShowCreate] = useState(false);

    const t3Tiers = (tiers.data || []).filter((t) => t.name === 'T3' && t.dmt_id);
    const tierByDmtId = Object.fromEntries(t3Tiers.map((t) => [t.dmt_id, t]));
    const activeT4Tiers = (tiers.data || []).filter((t) => t.name === 'T4' && !t.dmt_id && !t.jh_group_id && t.is_active);
    // Standalone/custom T3 groups — no real DMT behind them, created free-form like a T4.
    const customT3Tiers = (tiers.data || []).filter((t) => t.name === 'T3' && !t.dmt_id && !t.jh_group_id);

    if (tiers.isLoading || dmtsLoading) {
        return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;
    }

    // A BE Lead/T4 Lead sees every DMT (so they can create the missing ones); anyone else only
    // sees the DMTs whose T3 they're already allowed to see (server already filtered `tiers`).
    const visibleDmts = canCreate ? moduleGroups : moduleGroups.filter((mg) => tierByDmtId[mg.id]);
    const dmtsWithoutT3 = moduleGroups.filter((mg) => !tierByDmtId[mg.id]);

    return (
        <div className="space-y-4">
            {canCreate && (
                <div className="flex justify-end">
                    <Button size="sm" className="gap-1.5" onClick={() => setShowCreate(true)}>
                        <Plus className="h-4 w-4" /> New T3 Group
                    </Button>
                </div>
            )}
            {visibleDmts.length === 0 && customT3Tiers.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
                    {canCreate ? 'No T3 groups yet — create one above.' : "You're not part of any T3 you're part of yet."}
                </p>
            ) : (
                <>
                    {visibleDmts.map((mg) => {
                        const tier = tierByDmtId[mg.id];
                        return tier ? (
                            <TierCard key={mg.id} tier={tier} isBeLead={isBeLead} myEmpId={myEmpId} moduleLeadEmpId={mg.module_lead_emp_id} />
                        ) : (
                            <div key={mg.id} className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-400">
                                {mg.module} — no T3 group yet.
                            </div>
                        );
                    })}
                    {customT3Tiers.map((tier) => <TierCard key={tier.id} tier={tier} isBeLead={isBeLead} myEmpId={myEmpId} />)}
                </>
            )}
            {canCreate && (
                <CreateScopedGroupDialog
                    level="T3"
                    isBeLead={isBeLead}
                    open={showCreate}
                    onOpenChange={setShowCreate}
                    options={dmtsWithoutT3}
                    optionLabel={(mg) => mg.module}
                    parentOptions={activeT4Tiers.map((t) => ({ id: t.id, label: t.display_name || tierLabel(t) }))}
                />
            )}
        </div>
    );
}

function useJhGroups() {
    return useQuery({ queryKey: ['dmt', 'jh-groups'], queryFn: dmtApi.jhGroups, staleTime: 1000 * 60 * 5 });
}

// T2 is one tier per real JH group — same deliberate-creation rule as T3 one level up. Lead
// defaults to that JH group's own leader; who can reassign it and pick its KPIs is resolved
// server-side into `can_manage_kpis` on each row (BE Lead, the JH group's own leader, its
// parent DMT's module lead, or a routing incharge).
function T2Panel({ tiers, isBeLead, myEmpId }) {
    const { data: jhGroups = [], isLoading: jhGroupsLoading } = useJhGroups();
    const { data: moduleGroups = [] } = useModuleGroups();
    const canCreate = isBeLead;
    const [showCreate, setShowCreate] = useState(false);

    const t2Tiers = (tiers.data || []).filter((t) => t.name === 'T2' && t.jh_group_id);
    const tierByJhGroupId = Object.fromEntries(t2Tiers.map((t) => [t.jh_group_id, t]));
    const activeT4Tiers = (tiers.data || []).filter((t) => t.name === 'T4' && !t.dmt_id && !t.jh_group_id && t.is_active);
    const activeT3Tiers = (tiers.data || []).filter((t) => t.name === 'T3' && t.dmt_id && t.is_active);
    const dmtNameById = Object.fromEntries(moduleGroups.map((mg) => [mg.id, mg.module]));
    // Standalone/custom T2 groups — no real JH group behind them, created free-form like a T4.
    const customT2Tiers = (tiers.data || []).filter((t) => t.name === 'T2' && !t.dmt_id && !t.jh_group_id);

    if (tiers.isLoading || jhGroupsLoading) {
        return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;
    }

    // A BE Lead/T4 Lead sees every JH group (so they can create the missing ones); anyone else
    // only sees the JH groups whose T2 they're already allowed to see (server-filtered).
    const visibleJhGroups = canCreate ? jhGroups : jhGroups.filter((jg) => tierByJhGroupId[jg.id]);
    const jhGroupsWithoutT2 = jhGroups.filter((jg) => !tierByJhGroupId[jg.id]);

    return (
        <div className="space-y-4">
            {canCreate && (
                <div className="flex justify-end">
                    <Button size="sm" className="gap-1.5" onClick={() => setShowCreate(true)}>
                        <Plus className="h-4 w-4" /> New T2 Group
                    </Button>
                </div>
            )}
            {visibleJhGroups.length === 0 && customT2Tiers.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
                    {canCreate ? 'No T2 groups yet — create one above.' : "You're not part of any T2 you're part of yet."}
                </p>
            ) : (
                <>
                    {visibleJhGroups.map((jg) => {
                        const tier = tierByJhGroupId[jg.id];
                        return tier ? (
                            <TierCard
                                key={jg.id}
                                tier={tier}
                                isBeLead={isBeLead}
                                myEmpId={myEmpId}
                                canChangeLeadOverride={tier.can_manage_kpis}
                            />
                        ) : (
                            <div key={jg.id} className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-400">
                                {jg.name} — no T2 group yet.
                            </div>
                        );
                    })}
                    {customT2Tiers.map((tier) => <TierCard key={tier.id} tier={tier} isBeLead={isBeLead} myEmpId={myEmpId} />)}
                </>
            )}
            {canCreate && (
                <CreateScopedGroupDialog
                    level="T2"
                    isBeLead={isBeLead}
                    open={showCreate}
                    onOpenChange={setShowCreate}
                    options={jhGroupsWithoutT2}
                    optionLabel={(jg) => jg.name}
                    parentOptions={[
                        ...activeT3Tiers.map((t) => ({ id: t.id, label: `${dmtNameById[t.dmt_id] || 'DMT'} (T3)` })),
                        ...activeT4Tiers.map((t) => ({ id: t.id, label: `${t.display_name || tierLabel(t)} (T4, direct)` })),
                    ]}
                />
            )}
        </div>
    );
}

const TIER_TABS = [
    { value: 't4', label: 'T4' },
    { value: 't3', label: 'T3' },
    { value: 't2', label: 'T2' },
];

export function DmtTiers() {
    const { user, tierAtLeast } = useDmtMe();
    const isBeLead = tierAtLeast('be_lead');
    const tiers = useDmtTiers();
    const [tab, setTab] = useState('t4');

    return (
        <div className="mx-auto max-w-4xl space-y-5">
            <h1 className="text-xl font-bold text-slate-900">Tiers</h1>

            <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
                {TIER_TABS.map((t) => (
                    <button
                        key={t.value}
                        type="button"
                        onClick={() => setTab(t.value)}
                        className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                            tab === t.value ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {tab === 't4' && <T4Panel tiers={tiers} isBeLead={isBeLead} myEmpId={user?.emp_id} />}
            {tab === 't3' && <T3Panel tiers={tiers} isBeLead={isBeLead} myEmpId={user?.emp_id} />}
            {tab === 't2' && <T2Panel tiers={tiers} isBeLead={isBeLead} myEmpId={user?.emp_id} />}
        </div>
    );
}
