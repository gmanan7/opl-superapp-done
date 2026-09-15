import { useState } from 'react';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Badge } from '../../components/ui/badge';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
} from '../../components/ui/dialog';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../../components/ui/table';
import { RadioGroup, RadioGroupItem } from '../../components/ui/radio-group';
import { useDmtKpiMaster, useDmtKpiMutations } from '../lib/useDmtKpi';
import { useDmtMe } from '../lib/useDmt';
import { formatIndianNumber } from '../lib/dmtFormat';

const TYPE_LABELS = { numeric: 'Numeric', descriptive: 'Descriptive', project_tracker: 'Project Tracker' };
const FREQ_LABELS = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };
const DIR_LABELS = { higher_is_better: 'Higher is Better', lower_is_better: 'Lower is Better', target_is_exact: 'Target is Exact' };
const MTD_AGG_LABELS = {
    sum: 'Sum — add all daily values',
    average: 'Average — mean of daily values',
    weighted_average: 'Weighted Average — for % KPIs',
};

const EMPTY = {
    department_id: '', name: '', kpi_type: 'numeric', description: '', display_order: 0,
    unit: '', frequency: 'daily', direction: 'higher_is_better',
    target_value: '', green_threshold: '', amber_threshold: '', mtd_aggregation: 'sum',
};

function Label({ children }) {
    return <label className="block text-sm font-medium text-slate-700">{children}</label>;
}

function KpiFormDialog({ initial, departments, onClose }) {
    const [form, setForm] = useState(initial || EMPTY);
    const { save } = useDmtKpiMutations();
    const isEdit = !!initial?.id;
    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    const submit = (e) => {
        e.preventDefault();
        const p = {
            department_id: form.department_id,
            name: form.name,
            kpi_type: form.kpi_type,
            description: form.description || null,
            display_order: form.display_order,
        };
        if (form.kpi_type === 'numeric') {
            p.unit = form.unit || null;
            p.frequency = form.frequency;
            p.direction = form.direction;
            p.mtd_aggregation = form.mtd_aggregation;
            p.target_value = form.target_value ? parseFloat(form.target_value) : null;
            p.green_threshold = form.green_threshold ? parseFloat(form.green_threshold) : null;
            p.amber_threshold = form.amber_threshold ? parseFloat(form.amber_threshold) : null;
        } else if (form.kpi_type === 'descriptive') {
            p.frequency = form.frequency;
            p.unit = null; p.target_value = null; p.green_threshold = null; p.amber_threshold = null;
            p.direction = 'higher_is_better';
        } else {
            p.frequency = 'daily';
            p.unit = null; p.target_value = null; p.green_threshold = null; p.amber_threshold = null;
            p.direction = 'higher_is_better';
        }
        save.mutate(
            { id: form.id, payload: p },
            {
                onSuccess: () => { toast.success(isEdit ? 'KPI updated' : 'KPI created'); onClose(); },
                onError: (err) => toast.error(err.message),
            },
        );
    };

    return (
        <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{isEdit ? 'Edit KPI' : 'Add KPI'}</DialogTitle></DialogHeader>
            <form className="max-h-[70vh] space-y-4 overflow-y-auto" onSubmit={submit}>
                <div className="space-y-2">
                    <Label>Department *</Label>
                    <Select value={form.department_id} onValueChange={(v) => set('department_id', v)}>
                        <SelectTrigger className="h-11"><SelectValue placeholder="Select department" /></SelectTrigger>
                        <SelectContent>
                            {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label>KPI Name *</Label>
                    <Input value={form.name} onChange={(e) => set('name', e.target.value)} required className="h-11" />
                </div>
                <div className="space-y-2">
                    <Label>KPI Type *</Label>
                    <RadioGroup value={form.kpi_type} onValueChange={(v) => set('kpi_type', v)} className="flex gap-4">
                        {Object.entries(TYPE_LABELS).map(([k, v]) => (
                            <label key={k} className="flex cursor-pointer items-center gap-2">
                                <RadioGroupItem value={k} /><span className="text-sm">{v}</span>
                            </label>
                        ))}
                    </RadioGroup>
                </div>
                <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={2} />
                </div>
                <div className="space-y-2">
                    <Label>Display Order</Label>
                    <Input type="number" value={form.display_order} onChange={(e) => set('display_order', parseInt(e.target.value, 10) || 0)} className="h-11" />
                </div>

                {form.kpi_type === 'numeric' && (
                    <div className="space-y-4 border-t pt-4">
                        <p className="text-sm font-semibold">Numeric Settings</p>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label>Unit</Label>
                                <Input value={form.unit} onChange={(e) => set('unit', e.target.value)} placeholder="%, Nos, kg" className="h-11" />
                            </div>
                            <div className="space-y-2">
                                <Label>Frequency</Label>
                                <Select value={form.frequency} onValueChange={(v) => set('frequency', v)}>
                                    <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                                    <SelectContent>{Object.entries(FREQ_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Direction</Label>
                            <Select value={form.direction} onValueChange={(v) => set('direction', v)}>
                                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                                <SelectContent>{Object.entries(DIR_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>MTD Aggregation</Label>
                            <Select value={form.mtd_aggregation} onValueChange={(v) => set('mtd_aggregation', v)}>
                                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                                <SelectContent>{Object.entries(MTD_AGG_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            <div className="space-y-2"><Label>Target</Label><Input type="number" step="any" value={form.target_value} onChange={(e) => set('target_value', e.target.value)} className="h-11" /></div>
                            <div className="space-y-2"><Label>Green ≥</Label><Input type="number" step="any" value={form.green_threshold} onChange={(e) => set('green_threshold', e.target.value)} className="h-11" /></div>
                            <div className="space-y-2"><Label>Amber ≥</Label><Input type="number" step="any" value={form.amber_threshold} onChange={(e) => set('amber_threshold', e.target.value)} className="h-11" /></div>
                        </div>
                    </div>
                )}

                {form.kpi_type === 'descriptive' && (
                    <div className="space-y-4 border-t pt-4">
                        <p className="text-sm font-semibold">Descriptive Settings</p>
                        <div className="space-y-2">
                            <Label>Frequency</Label>
                            <Select value={form.frequency} onValueChange={(v) => set('frequency', v)}>
                                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                                <SelectContent>{Object.entries(FREQ_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <p className="text-xs text-slate-500">This KPI accepts text updates only. No numeric targets.</p>
                    </div>
                )}

                {form.kpi_type === 'project_tracker' && (
                    <div className="border-t pt-4">
                        <p className="text-xs text-slate-500">Tracks individual jobs/projects through stages. No numeric targets.</p>
                    </div>
                )}

                <Button type="submit" className="h-11 w-full" disabled={save.isPending || !form.department_id || !form.name}>
                    {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isEdit ? 'Save Changes' : 'Create KPI'}
                </Button>
            </form>
        </DialogContent>
    );
}

export function DmtKpiMaster() {
    const [deptFilter, setDeptFilter] = useState('all');
    const [editKpi, setEditKpi] = useState(null);
    const [showCreate, setShowCreate] = useState(false);
    const { tierAtLeast } = useDmtMe();
    const canEdit = tierAtLeast('leadership');
    const { departments, kpis } = useDmtKpiMaster(deptFilter);
    const { remove } = useDmtKpiMutations();

    const openEdit = (k) => setEditKpi({
        id: k.id, department_id: k.department_id, name: k.name, kpi_type: k.kpi_type,
        description: k.description || '', display_order: k.display_order, unit: k.unit || '',
        frequency: k.frequency, direction: k.direction,
        target_value: k.target_value?.toString() || '',
        green_threshold: k.green_threshold?.toString() || '',
        amber_threshold: k.amber_threshold?.toString() || '',
        mtd_aggregation: k.mtd_aggregation || 'sum',
    });

    return (
        <div className="mx-auto max-w-6xl space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h1 className="text-xl font-bold text-slate-900">KPI Master</h1>
                <div className="flex items-center gap-3">
                    <Select value={deptFilter} onValueChange={setDeptFilter}>
                        <SelectTrigger className="h-10 w-full sm:w-48"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Departments</SelectItem>
                            {(departments.data || []).map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    {canEdit && (
                        <Button size="sm" className="shrink-0 gap-1.5" onClick={() => setShowCreate(true)}>
                            <Plus className="h-4 w-4" /> Add KPI
                        </Button>
                    )}
                </div>
            </div>

            {kpis.isLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
            ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>KPI Name</TableHead>
                                <TableHead>Department</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Unit</TableHead>
                                <TableHead>Target</TableHead>
                                <TableHead>Frequency</TableHead>
                                <TableHead>Active</TableHead>
                                {canEdit && <TableHead className="text-right">Actions</TableHead>}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {kpis.rows.map((k) => (
                                <TableRow key={k.id} className={!k.is_active ? 'opacity-60' : ''}>
                                    <TableCell className="font-medium">{k.name}</TableCell>
                                    <TableCell className="text-slate-500">{k.department?.name || '—'}</TableCell>
                                    <TableCell><Badge variant="outline" className="text-xs">{TYPE_LABELS[k.kpi_type]}</Badge></TableCell>
                                    <TableCell>{k.unit || '—'}</TableCell>
                                    <TableCell>{formatIndianNumber(k.target_value)}</TableCell>
                                    <TableCell>{FREQ_LABELS[k.frequency]}</TableCell>
                                    <TableCell><Badge variant={k.is_active ? 'default' : 'outline'}>{k.is_active ? 'Yes' : 'No'}</Badge></TableCell>
                                    {canEdit && (
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-1">
                                                <Button variant="ghost" size="icon" onClick={() => openEdit(k)}><Pencil className="h-4 w-4" /></Button>
                                                <Button
                                                    variant="ghost" size="icon" className="text-rose-600"
                                                    onClick={() => remove.mutate(k.id, { onError: (e) => toast.error(e.message), onSuccess: () => toast.success('KPI removed') })}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    )}
                                </TableRow>
                            ))}
                            {kpis.rows.length === 0 && (
                                <TableRow><TableCell colSpan={canEdit ? 9 : 8} className="py-8 text-center text-slate-400">No KPIs found</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            )}

            <Dialog open={showCreate} onOpenChange={setShowCreate}>
                {showCreate && departments.data && (
                    <KpiFormDialog departments={departments.data} onClose={() => setShowCreate(false)} />
                )}
            </Dialog>
            <Dialog open={!!editKpi} onOpenChange={() => setEditKpi(null)}>
                {editKpi && departments.data && (
                    <KpiFormDialog initial={editKpi} departments={departments.data} onClose={() => setEditKpi(null)} />
                )}
            </Dialog>
        </div>
    );
}
