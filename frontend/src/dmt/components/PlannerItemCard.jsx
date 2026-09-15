import { useState, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { cn } from '../../lib/utils';
import { todayStr, diffDays, fmtShort, fmtLong } from '../lib/dmtDates';

export function PlannerItemCard({ item, onComplete, onUpdate, onDelete, isCompleted }) {
    const [expanded, setExpanded] = useState(false);
    const [checked, setChecked] = useState(item.is_completed);
    const [confirming, setConfirming] = useState(false);
    const [editTitle, setEditTitle] = useState(item.title);
    const [editNotes, setEditNotes] = useState(item.notes ?? '');
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        setEditTitle(item.title);
        setEditNotes(item.notes ?? '');
    }, [item.title, item.notes]);

    const overdueDays = item.due_date ? diffDays(todayStr(), item.due_date) : 0;
    const isDueToday = overdueDays === 0 && !!item.due_date;
    const isOverdue = overdueDays > 0 && !item.is_completed;
    const completedDaysAgo = item.completed_at
        ? diffDays(todayStr(), item.completed_at.slice(0, 10))
        : null;

    const autoSave = (field, value) => {
        onUpdate({ id: item.id, [field]: value });
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
    };

    const handleCheck = (e) => {
        e.stopPropagation();
        if (isCompleted) return;
        setChecked(true);
        onComplete(item);
    };

    const dueLabel = () => {
        if (!item.due_date) return null;
        if (isOverdue) return <span className="text-xs text-rose-600">Due {overdueDays} day{overdueDays !== 1 ? 's' : ''} ago</span>;
        if (isDueToday) return <span className="text-xs text-amber-600">Due today</span>;
        return <span className="text-xs text-slate-400">Due {fmtShort(item.due_date)}</span>;
    };

    const recurrenceLabel =
        item.recurrence_type && item.recurrence_type !== 'none'
            ? `↻ ${item.recurrence_type[0].toUpperCase()}${item.recurrence_type.slice(1)}`
            : null;

    return (
        <div
            className={cn(
                'rounded-xl border bg-white p-4 shadow-xs transition-all',
                isOverdue && !isCompleted ? 'border-l-4 border-l-rose-500 border-rose-200 bg-rose-50/40' : 'border-slate-200',
                checked && !isCompleted ? 'opacity-60' : '',
            )}
        >
            <div className="flex items-start gap-3">
                <button
                    type="button"
                    onClick={handleCheck}
                    className={cn(
                        'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-all',
                        checked || isCompleted ? 'border-transparent bg-blue-600' : 'border-slate-300 hover:border-blue-500',
                    )}
                >
                    {(checked || isCompleted) && <Check className="h-4 w-4 text-white" />}
                </button>

                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => !isCompleted && setExpanded(!expanded)}>
                    <p className={cn('text-sm font-medium text-slate-900', (checked || isCompleted) && 'line-through')}>
                        {item.title}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                        {dueLabel()}
                        {item.notes && !expanded && (
                            <span className="max-w-[200px] truncate text-xs text-slate-400">{item.notes.split('\n')[0]}</span>
                        )}
                        {recurrenceLabel && (
                            <span className="rounded bg-indigo-100 px-1.5 py-0 text-[10px] font-medium text-indigo-600">{recurrenceLabel}</span>
                        )}
                        {isCompleted && completedDaysAgo !== null && (
                            <span className="text-xs text-slate-400">
                                {completedDaysAgo === 0 ? 'Completed today' : `Completed ${completedDaysAgo} day${completedDaysAgo !== 1 ? 's' : ''} ago`}
                            </span>
                        )}
                    </div>
                </button>

                {!isCompleted && (
                    <ChevronDown className={cn('mt-2 h-4 w-4 shrink-0 text-slate-400 transition-transform', expanded && 'rotate-180')} />
                )}
            </div>

            {expanded && !isCompleted && (
                <div className="mt-4 space-y-3">
                    <Input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onBlur={() => editTitle !== item.title && editTitle.trim() && autoSave('title', editTitle.trim())}
                        className="rounded-none border-0 border-b px-0 font-medium focus-visible:ring-0"
                    />
                    <Textarea
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        onBlur={() => editNotes !== (item.notes ?? '') && autoSave('notes', editNotes || null)}
                        placeholder="Add notes…"
                        rows={2}
                        className="resize-none text-sm"
                    />
                    <div className="flex flex-wrap items-center gap-3">
                        <label className="text-xs font-medium text-blue-600">
                            {item.due_date ? `Due ${fmtLong(item.due_date)}` : 'Set due date'}
                            <input
                                type="date"
                                value={item.due_date ? item.due_date.slice(0, 10) : ''}
                                onChange={(e) => autoSave('due_date', e.target.value || null)}
                                className="ml-2 rounded border border-slate-200 px-1.5 py-0.5 text-xs text-slate-700"
                            />
                        </label>
                        {item.due_date && (
                            <button type="button" onClick={() => autoSave('due_date', null)} className="text-xs text-slate-400">
                                Clear date
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-600">Repeat:</span>
                        <select
                            value={item.recurrence_type ?? 'none'}
                            onChange={(e) => autoSave('recurrence_type', e.target.value)}
                            className="h-8 rounded border border-slate-200 px-2 text-xs"
                        >
                            <option value="none">None</option>
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                            <option value="monthly">Monthly</option>
                        </select>
                        {item.recurrence_type === 'weekly' && (
                            <select
                                value={String(item.recurrence_day_of_week ?? 1)}
                                onChange={(e) => autoSave('recurrence_day_of_week', parseInt(e.target.value, 10))}
                                className="h-8 rounded border border-slate-200 px-2 text-xs"
                            >
                                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => (
                                    <option key={d} value={String(i)}>{d}</option>
                                ))}
                            </select>
                        )}
                        {item.recurrence_type === 'monthly' && (
                            <Input
                                type="number"
                                min={1}
                                max={31}
                                value={item.recurrence_day_of_month ?? 1}
                                onChange={(e) => autoSave('recurrence_day_of_month', parseInt(e.target.value, 10) || 1)}
                                className="h-8 w-16 text-xs"
                            />
                        )}
                    </div>
                    <div className="flex items-center justify-between pt-1">
                        {!confirming ? (
                            <button type="button" onClick={() => setConfirming(true)} className="text-xs font-medium text-rose-600">
                                Delete
                            </button>
                        ) : (
                            <div className="flex items-center gap-2 text-xs">
                                <span className="text-slate-600">Delete this item?</span>
                                <button type="button" onClick={() => { onDelete(item.id); setConfirming(false); }} className="font-medium text-rose-600">
                                    Yes, delete
                                </button>
                                <button type="button" onClick={() => setConfirming(false)} className="text-slate-400">Cancel</button>
                            </div>
                        )}
                        {saved && <span className="text-xs text-slate-400">Saved</span>}
                    </div>
                </div>
            )}
        </div>
    );
}
