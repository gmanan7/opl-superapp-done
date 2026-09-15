import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Loader2, Trash2, Pause, Play, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../../components/ui/table';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../../components/ui/dialog';
import { cn } from '../../lib/utils';
import { dmtApi } from '../lib/dmtApi';
import { useDmtMe } from '../lib/useDmt';

function DeptDialog({ open, onOpenChange, dept, nextOrder }) {
    const qc = useQueryClient();
    const isEdit = !!dept;
    const [f, setF] = useState(dept ? { name: dept.name } : { name: '' });

    const save = useMutation({
        mutationFn: () => isEdit
            ? dmtApi.update('department', dept.id, { name: f.name })
            // new departments go to the end of the drag-reorderable list
            : dmtApi.create('department', { name: f.name, display_order: nextOrder }),
        onSuccess: () => {
            toast.success(isEdit ? 'Department updated' : 'Department added');
            qc.invalidateQueries({ queryKey: ['dmt', 'admin-departments'] });
            onOpenChange(false);
        },
        onError: (e) => toast.error(e.message),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle>{isEdit ? 'Edit Department' : 'Add Department'}</DialogTitle></DialogHeader>
                <div className="space-y-3">
                    <Input placeholder="Name *" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="h-11" />
                </div>
                <DialogFooter>
                    <Button disabled={!f.name.trim() || save.isPending} onClick={() => save.mutate()}>
                        {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {isEdit ? 'Save' : 'Add'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export function DmtAdminDepartments() {
    const qc = useQueryClient();
    const { tierAtLeast } = useDmtMe();
    const isAdmin = tierAtLeast('be_lead');
    const [add, setAdd] = useState(false);
    const [editDept, setEditDept] = useState(null);
    const [deleteDept, setDeleteDept] = useState(null); // { dept, deps }

    const departments = useQuery({
        queryKey: ['dmt', 'admin-departments'],
        queryFn: async () => {
            const rows = await dmtApi.list('department');
            return rows.slice().sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
        },
    });

    // Local drag-reorderable copy of the list — resynced whenever the server data changes
    // (a fresh fetch, or after a reorder is saved), so a mid-drag reorder is never lost
    // to a stale re-render but a completed save always reflects the real server order.
    const [order, setOrder] = useState([]);
    useEffect(() => {
        if (departments.data) setOrder(departments.data);
    }, [departments.data]);
    const [dragIndex, setDragIndex] = useState(null);

    const saveOrder = useMutation({
        mutationFn: async (list) => {
            await Promise.all(
                list.map((d, i) => (d.display_order === i ? null : dmtApi.update('department', d.id, { display_order: i })))
                    .filter(Boolean)
            );
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ['dmt', 'admin-departments'] }),
        onError: (e) => toast.error(e.message),
    });

    const handleDragStart = (index) => setDragIndex(index);
    const handleDragOver = (e, index) => {
        e.preventDefault();
        if (dragIndex === null || dragIndex === index) return;
        setOrder((prev) => {
            const next = [...prev];
            const [moved] = next.splice(dragIndex, 1);
            next.splice(index, 0, moved);
            return next;
        });
        setDragIndex(index);
    };
    const handleDragEnd = () => {
        setDragIndex(null);
        saveOrder.mutate(order);
    };

    const setActive = useMutation({
        mutationFn: ({ id, value }) => dmtApi.update('department', id, { is_active: value }),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['dmt', 'admin-departments'] }); toast.success('Updated'); },
        onError: (e) => toast.error(e.message),
    });
    const del = useMutation({
        mutationFn: (id) => dmtApi.remove('department', id),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['dmt', 'admin-departments'] }); toast.success('Department deleted'); setDeleteDept(null); },
        onError: (e) => toast.error(e.message),
    });
    const startDelete = async (dept) => {
        try {
            const [u, k, t] = await Promise.all([
                dmtApi.list('user-departments', { department_id: dept.id }),
                dmtApi.list('kpi-master', { department_id: dept.id }),
                dmtApi.list('tasks', { department_id: dept.id }),
            ]);
            setDeleteDept({ dept, deps: { users: u.length, kpis: k.length, tasks: t.length } });
        } catch (e) {
            toast.error(e.message);
        }
    };

    return (
        <div className="mx-auto max-w-4xl space-y-5">
            <h1 className="text-xl font-bold text-slate-900">Departments</h1>

            <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-700">Departments</h2>
                {isAdmin && <Button size="sm" className="gap-1.5" onClick={() => setAdd(true)}><Plus className="h-4 w-4" /> Add</Button>}
            </div>

            {departments.isLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
            ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                    {isAdmin && (
                        <p className="px-4 pt-3 text-xs text-slate-500">Drag a row by its handle to reorder.</p>
                    )}
                    <Table>
                        <TableHeader>
                            <TableRow>
                                {isAdmin && <TableHead className="w-8" />}
                                <TableHead>Name</TableHead>
                                <TableHead>Active</TableHead>
                                {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {order.map((d, index) => (
                                <TableRow
                                    key={d.id}
                                    className={cn(!d.is_active && 'opacity-60', dragIndex === index && 'bg-blue-50')}
                                    onDragOver={isAdmin ? (e) => handleDragOver(e, index) : undefined}
                                >
                                    {isAdmin && (
                                        <TableCell className="w-8">
                                            <span
                                                draggable
                                                onDragStart={() => handleDragStart(index)}
                                                onDragEnd={handleDragEnd}
                                                className="cursor-grab text-slate-400 hover:text-slate-600"
                                                title="Drag to reorder"
                                            >
                                                <GripVertical className="h-4 w-4" />
                                            </span>
                                        </TableCell>
                                    )}
                                    <TableCell className="font-medium">{d.name}</TableCell>
                                    <TableCell><Badge variant={d.is_active ? 'default' : 'outline'}>{d.is_active ? 'Yes' : 'No'}</Badge></TableCell>
                                    {isAdmin && (
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-1">
                                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditDept(d)}><Pencil className="h-3.5 w-3.5" /></Button>
                                                {d.is_active ? (
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-amber-500" onClick={() => setActive.mutate({ id: d.id, value: false })}><Pause className="h-3.5 w-3.5" /></Button>
                                                ) : (
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-500" onClick={() => setActive.mutate({ id: d.id, value: true })}><Play className="h-3.5 w-3.5" /></Button>
                                                )}
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-600" onClick={() => startDelete(d)}><Trash2 className="h-3.5 w-3.5" /></Button>
                                            </div>
                                        </TableCell>
                                    )}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}

            {(add || editDept) && (
                <DeptDialog
                    key={editDept?.id || 'new'}
                    open
                    onOpenChange={(v) => { if (!v) { setAdd(false); setEditDept(null); } }}
                    dept={editDept}
                    nextOrder={order.length}
                />
            )}

            <Dialog open={!!deleteDept} onOpenChange={(v) => !v && setDeleteDept(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader><DialogTitle>Delete {deleteDept?.dept.name}?</DialogTitle></DialogHeader>
                    {deleteDept && (deleteDept.deps.users || deleteDept.deps.kpis || deleteDept.deps.tasks) ? (
                        <>
                            <p className="text-sm text-slate-600">
                                This department is still used by {deleteDept.deps.users} user link(s), {deleteDept.deps.kpis} KPI(s), {deleteDept.deps.tasks} task(s).
                                Deactivate it instead of deleting.
                            </p>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setDeleteDept(null)}>Cancel</Button>
                                <Button className="bg-amber-500 text-white hover:bg-amber-600" onClick={() => { setActive.mutate({ id: deleteDept.dept.id, value: false }); setDeleteDept(null); }}>Deactivate</Button>
                            </DialogFooter>
                        </>
                    ) : (
                        <>
                            <p className="text-sm text-slate-600">This cannot be undone.</p>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setDeleteDept(null)}>Cancel</Button>
                                <Button variant="destructive" onClick={() => del.mutate(deleteDept.dept.id)}>Delete</Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
