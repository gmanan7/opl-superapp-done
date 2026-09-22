import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, UserPlus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import { dmtApi } from '../lib/dmtApi';
import { useDmtMe } from '../lib/useDmt';

const when = (ts) => new Date(ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// Organisation → "PM Schedule Edit Access": everyone can VIEW the PM Schedule; only the people
// listed here can edit it. BE Admin manages the list; leadership can see it.
export function DmtPmEditAccess() {
    const qc = useQueryClient();
    const { tierAtLeast } = useDmtMe();
    const isBe = tierAtLeast('be_lead');
    const [empId, setEmpId] = useState('');

    const editors = useQuery({ queryKey: ['dmt', 'pm-editors'], queryFn: dmtApi.pmEditors });
    const people = useQuery({ queryKey: ['worker-names'], queryFn: dmtApi.workerNames, staleTime: 1000 * 60 * 5, enabled: isBe });

    const refresh = () => {
        qc.invalidateQueries({ queryKey: ['dmt', 'pm-editors'] });
        qc.invalidateQueries({ queryKey: ['dmt', 'pm-edit-access'] });
    };
    const add = useMutation({
        mutationFn: () => dmtApi.addPmEditor(empId),
        onSuccess: () => { toast.success('Edit access granted'); setEmpId(''); refresh(); },
        onError: (e) => toast.error(e.message),
    });
    const remove = useMutation({
        mutationFn: (id) => dmtApi.removePmEditor(id),
        onSuccess: () => { toast.success('Edit access removed'); refresh(); },
        onError: (e) => toast.error(e.message),
    });

    const list = editors.data || [];
    const taken = new Set(list.map((e) => e.emp_id));
    const candidates = (people.data || []).filter((p) => p.is_active && !taken.has(p.id));

    return (
        <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
                <h2 className="text-base font-semibold text-slate-900">Who can edit the PM Schedule</h2>
                <p className="mt-1 text-sm text-slate-500">
                    Everyone can view the PM Schedule. Only the people below get the <strong>Edit</strong> button to plan maintenance
                    and record what was done. BE Admin can always edit; everyone else needs BE Admin to add them here.
                </p>
            </div>

            {isBe && (
                <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center">
                    <div className="sm:w-80">
                        <Select value={empId} onValueChange={setEmpId}>
                            <SelectTrigger className="h-10"><SelectValue placeholder="Select a person" /></SelectTrigger>
                            <SelectContent>
                                {candidates.map((p) => (
                                    <SelectItem key={p.id} value={p.id}>{p.name} ({p.role})</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <Button className="h-10 gap-1.5" disabled={!empId || add.isPending} onClick={() => add.mutate()}>
                        {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Give edit access
                    </Button>
                </div>
            )}

            {editors.isLoading && <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>}
            {editors.error && <p className="text-sm text-rose-600">{editors.error.message}</p>}
            {editors.data && list.length === 0 && (
                <p className="rounded-lg border border-dashed border-slate-300 py-8 text-center text-sm text-slate-500">
                    No one has been added yet, so only BE Admin can edit the PM Schedule.
                </p>
            )}

            <div className="space-y-2">
                {list.map((e) => (
                    <div key={e.emp_id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3">
                        <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-900">{e.name} <span className="font-normal text-slate-400">({e.role})</span></p>
                            <p className="text-xs text-slate-500">Added by {e.added_by_name || e.added_by || '—'} on {when(e.added_at)}</p>
                        </div>
                        {isBe && (
                            <Button variant="ghost" size="sm" className="shrink-0 gap-1 text-rose-600 hover:text-rose-700"
                                disabled={remove.isPending} onClick={() => remove.mutate(e.emp_id)}>
                                <Trash2 className="h-4 w-4" /> Remove
                            </Button>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
