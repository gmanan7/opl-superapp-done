import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Loader2, UserPlus, Trash2, Gauge, Crown } from 'lucide-react';
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
import { useDmtTiers, useDmtTierMembers, useDmtTierKpis, useDmtTierMutations } from '../lib/useDmtTiers';
import { useDmtKpiMaster } from '../lib/useDmtKpi';

function useWorkerNames() {
    return useQuery({ queryKey: ['worker-names'], queryFn: dmtApi.workerNames, staleTime: 1000 * 60 * 5 });
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
    const { kpis } = useDmtKpiMaster('all');
    const { setKpis } = useDmtTierMutations();
    const [selected, setSelected] = useState(new Set(currentKpiIds));
    const toggle = (id) => setSelected((prev) => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader><DialogTitle>KPIs shown to {tier.name}</DialogTitle></DialogHeader>
                <p className="text-xs text-slate-500">Pick any active KPI, from any department, to show this tier.</p>
                <div className="max-h-80 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                    {(kpis.rows || []).map((k) => {
                        const isChecked = selected.has(k.id);
                        return (
                            <label
                                key={k.id}
                                className={`flex items-center gap-2 rounded-md border p-2 text-sm cursor-pointer transition-colors ${
                                    isChecked ? 'border-blue-600/40 bg-blue-50' : 'border-transparent hover:bg-slate-50'
                                }`}
                            >
                                <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => toggle(k.id)}
                                    className="h-3.5 w-3.5 rounded border-slate-300 text-blue-700 focus:ring-blue-700"
                                />
                                <span className="flex-1 truncate">{k.name}</span>
                                <span className="text-xs text-slate-400">{k.department?.name || '—'}</span>
                            </label>
                        );
                    })}
                    {!kpis.isLoading && (kpis.rows || []).length === 0 && (
                        <p className="p-2 text-sm text-slate-400">No KPIs exist yet.</p>
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

function TierCard({ tier, isBeLead, myEmpId }) {
    const members = useDmtTierMembers(tier.id);
    const tierKpis = useDmtTierKpis(tier.id);
    const { updateTier, removeMember } = useDmtTierMutations();
    const { data: people = [] } = useWorkerNames();
    const [addOpen, setAddOpen] = useState(false);
    const [kpiOpen, setKpiOpen] = useState(false);

    const isLead = tier.lead_emp_id === myEmpId;
    const canManage = isBeLead || isLead;

    return (
        <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-slate-900">{tier.name}</h3>
                    <Badge variant={tier.is_active ? 'default' : 'outline'}>{tier.is_active ? 'Active' : 'Inactive'}</Badge>
                </div>
                {isBeLead && (
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                        <span>Active</span>
                        <Switch
                            checked={tier.is_active}
                            onCheckedChange={(v) => updateTier.mutate(
                                { id: tier.id, is_active: v },
                                { onError: (e) => toast.error(e.message) },
                            )}
                        />
                    </div>
                )}
            </div>

            {isBeLead && (
                <div className="flex items-center gap-2">
                    <Crown className="h-4 w-4 text-amber-500" />
                    <span className="text-sm text-slate-600">Lead:</span>
                    <Select
                        value={tier.lead_emp_id || '__none__'}
                        onValueChange={(v) => updateTier.mutate(
                            { id: tier.id, lead_emp_id: v === '__none__' ? null : v },
                            { onError: (e) => toast.error(e.message) },
                        )}
                    >
                        <SelectTrigger className="h-9 w-56"><SelectValue placeholder="No lead appointed" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="__none__">No lead</SelectItem>
                            {people.filter((p) => p.is_active).map((p) => (
                                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            )}
            {!isBeLead && (
                <p className="text-sm text-slate-600">Lead: <span className="font-medium text-slate-900">{tier.lead_name || 'Not appointed'}</span></p>
            )}

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
                    {canManage && (
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

export function DmtTiers() {
    const { user, tierAtLeast } = useDmtMe();
    const isBeLead = tierAtLeast('be_lead');
    const tiers = useDmtTiers();
    const { createTier } = useDmtTierMutations();
    const [newName, setNewName] = useState('');
    const [addOpen, setAddOpen] = useState(false);

    return (
        <div className="mx-auto max-w-4xl space-y-5">
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-bold text-slate-900">Tiers</h1>
                {isBeLead && (
                    <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
                        <Plus className="h-4 w-4" /> New tier
                    </Button>
                )}
            </div>

            {tiers.isLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
            ) : (
                <div className="space-y-4">
                    {(tiers.data || []).map((t) => (
                        <TierCard key={t.id} tier={t} isBeLead={isBeLead} myEmpId={user?.emp_id} />
                    ))}
                    {(tiers.data || []).length === 0 && (
                        <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
                            {isBeLead ? 'No tiers yet — create one to get started.' : 'No tiers you\'re part of yet.'}
                        </p>
                    )}
                </div>
            )}

            <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader><DialogTitle>New tier</DialogTitle></DialogHeader>
                    <Input placeholder="e.g. T4" value={newName} onChange={(e) => setNewName(e.target.value)} className="h-11" />
                    <DialogFooter>
                        <Button
                            disabled={!newName.trim() || createTier.isPending}
                            onClick={() => createTier.mutate(newName.trim(), {
                                onSuccess: () => { toast.success('Tier created'); setAddOpen(false); setNewName(''); },
                                onError: (e) => toast.error(e.message),
                            })}
                        >
                            {createTier.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Create
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
