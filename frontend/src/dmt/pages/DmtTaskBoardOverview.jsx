import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Trash2, UserPlus, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../../components/ui/dialog';
import { dmtApi } from '../lib/dmtApi';
import { useDmtMe } from '../lib/useDmt';

function useWorkerNames() {
    return useQuery({ queryKey: ['worker-names'], queryFn: dmtApi.workerNames, staleTime: 1000 * 60 * 5 });
}
function useGlobalTaskViewers() {
    return useQuery({ queryKey: ['dmt', 'global-task-viewers'], queryFn: dmtApi.listGlobalTaskViewers });
}
function useGlobalTaskViewerMutations() {
    const qc = useQueryClient();
    const invalidate = () => qc.invalidateQueries({ queryKey: ['dmt', 'global-task-viewers'] });
    const add = useMutation({ mutationFn: (empId) => dmtApi.addGlobalTaskViewer(empId), onSuccess: invalidate });
    const remove = useMutation({ mutationFn: (empId) => dmtApi.removeGlobalTaskViewer(empId), onSuccess: invalidate });
    return { add, remove };
}

function AddViewerDialog({ open, onOpenChange, existingEmpIds }) {
    const { data: people = [] } = useWorkerNames();
    const { add } = useGlobalTaskViewerMutations();
    const [empId, setEmpId] = useState('');
    const candidates = people.filter((p) => p.is_active && !existingEmpIds.includes(p.id));

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle>Give someone full Task Board visibility</DialogTitle></DialogHeader>
                <p className="text-xs text-slate-500">
                    They'll see every group's tasks factory-wide — not just their own group's. Private tasks are unaffected; those stay visible only to their owner, assignor, and creator.
                </p>
                <Select value={empId} onValueChange={setEmpId}>
                    <SelectTrigger className="h-11"><SelectValue placeholder="Select a person" /></SelectTrigger>
                    <SelectContent>
                        {candidates.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.role})</SelectItem>)}
                    </SelectContent>
                </Select>
                <DialogFooter>
                    <Button
                        disabled={!empId || add.isPending}
                        onClick={() => add.mutate(empId, {
                            onSuccess: () => { toast.success('Visibility granted'); onOpenChange(false); setEmpId(''); },
                            onError: (e) => toast.error(e.message),
                        })}
                    >
                        {add.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Add
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export function DmtTaskBoardOverview() {
    const { tierAtLeast } = useDmtMe();
    const isBeLead = tierAtLeast('be_lead');
    const viewers = useGlobalTaskViewers();
    const { remove } = useGlobalTaskViewerMutations();
    const [showAdd, setShowAdd] = useState(false);

    if (!isBeLead) {
        return (
            <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
                Only BE Admin can configure factory-wide Task Board visibility.
            </p>
        );
    }

    return (
        <div className="mx-auto max-w-2xl space-y-4">
            <div>
                <h2 className="text-base font-semibold text-slate-900">Who sees every group's tasks</h2>
                <p className="mt-1 text-sm text-slate-500">
                    By default, only <span className="font-medium text-slate-700">BE Admin</span> sees every group's Task Board — that's automatic and not listed here.
                    Add anyone else who should get that same factory-wide view, without making them BE Admin.
                    This never affects private tasks — those stay visible only to their owner, assignor, and creator.
                </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between">
                    <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                        <Eye className="h-3.5 w-3.5" /> Extra people with full visibility ({viewers.data?.length ?? 0})
                    </h3>
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowAdd(true)}>
                        <UserPlus className="h-3.5 w-3.5" /> Add
                    </Button>
                </div>
                <div className="mt-3 space-y-1.5">
                    {viewers.isLoading ? (
                        <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-slate-400" /></div>
                    ) : (viewers.data || []).length === 0 ? (
                        <p className="text-sm text-slate-400">Nobody extra has been added yet.</p>
                    ) : (
                        (viewers.data || []).map((v) => (
                            <div key={v.emp_id} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm">
                                <span>{v.name} <span className="text-xs text-slate-400">({v.role})</span></span>
                                <button
                                    type="button"
                                    className="text-slate-400 hover:text-rose-600"
                                    onClick={() => remove.mutate(v.emp_id, {
                                        onSuccess: () => toast.success('Removed'),
                                        onError: (e) => toast.error(e.message),
                                    })}
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {showAdd && (
                <AddViewerDialog
                    open
                    onOpenChange={setShowAdd}
                    existingEmpIds={(viewers.data || []).map((v) => v.emp_id)}
                />
            )}
        </div>
    );
}
