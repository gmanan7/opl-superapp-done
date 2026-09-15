import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ScrollText, Loader2 } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import { cn } from '../../lib/utils';
import { dmtApi } from '../lib/dmtApi';
import { fmtLong } from '../lib/dmtDates';

const TABLES = [
    ['all', 'All'], ['dmt_tasks', 'Tasks'], ['dmt_kpi_master', 'KPI Master'],
    ['dmt_kpi_entries', 'KPI Entries'], ['dmt_meetings', 'Meetings'],
    ['dmt_meeting_decisions', 'Decisions'], ['dmt_pd_jobs', 'PD Jobs'],
    ['dmt_department', 'Departments'], ['dmt_pm_machines', 'PM Machines'],
    ['dmt_project_tracker_items', 'Project Items'],
];
const ACTION_CLS = {
    INSERT: 'bg-emerald-100 text-emerald-700',
    UPDATE: 'bg-amber-100 text-amber-700',
    DELETE: 'bg-rose-100 text-rose-700',
};

function diffFields(oldV, newV) {
    if (!oldV || !newV) return null;
    const keys = new Set([...Object.keys(oldV), ...Object.keys(newV)]);
    const changes = [];
    for (const k of keys) {
        if (['updated_at', 'created_at', 'submitted_at'].includes(k)) continue;
        if (JSON.stringify(oldV[k]) !== JSON.stringify(newV[k])) {
            changes.push(`${k}: ${JSON.stringify(oldV[k]) ?? '∅'} → ${JSON.stringify(newV[k]) ?? '∅'}`);
        }
    }
    return changes.length ? changes : null;
}

export function DmtAdminAudit() {
    const [table, setTable] = useState('all');
    const rows = useQuery({
        queryKey: ['dmt', 'audit', table],
        queryFn: () => dmtApi.audit(table !== 'all' ? { table } : undefined),
    });

    return (
        <div className="mx-auto max-w-5xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h1 className="text-xl font-bold text-slate-900">Audit Log</h1>
                <Select value={table} onValueChange={setTable}>
                    <SelectTrigger className="h-9 w-44 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>{TABLES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                </Select>
            </div>

            {rows.isLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
            ) : (rows.data || []).length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
                    <ScrollText className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                    <p className="text-sm text-slate-500">No changes logged yet.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {(rows.data || []).map((r) => {
                        const changes = r.action === 'UPDATE' ? diffFields(r.old_values, r.new_values) : null;
                        return (
                            <div key={r.id} className="rounded-lg border border-slate-200 bg-white p-3">
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                    <Badge className={cn('text-[10px]', ACTION_CLS[r.action])}>{r.action}</Badge>
                                    <span className="font-medium text-slate-700">{r.table_name.replace('dmt_', '')}</span>
                                    <span className="text-slate-400">by {r.performed_by_name || r.performed_by || 'system'}</span>
                                    <span className="text-slate-400">· {fmtLong(r.performed_at)}</span>
                                </div>
                                {changes && (
                                    <ul className="mt-1.5 space-y-0.5 text-xs text-slate-500">
                                        {changes.map((c, i) => <li key={i} className="font-mono">{c}</li>)}
                                    </ul>
                                )}
                                {r.action === 'INSERT' && r.new_values?.title && (
                                    <p className="mt-1 text-xs text-slate-500">Created: {r.new_values.title}</p>
                                )}
                                {r.action === 'DELETE' && r.old_values?.title && (
                                    <p className="mt-1 text-xs text-slate-500">Deleted: {r.old_values.title}</p>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
