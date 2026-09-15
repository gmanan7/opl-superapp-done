import { useState, useMemo, useRef } from 'react';
import { Lock, Plus, CalendarCheck, Loader2 } from 'lucide-react';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';
import { useDmtPlanner } from '../lib/useDmtPlanner';
import { PlannerItemCard } from '../components/PlannerItemCard';
import { todayStr, addDaysStr, diffDays, parseLocal, fmtDow } from '../lib/dmtDates';

const VIEWS = [
    { key: 'today', label: 'Today' },
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'all', label: 'All' },
    { key: 'completed', label: 'Completed' },
];

export function DmtPlanner() {
    const { items, isLoading, addItem, updateItem, deleteItem, completeItem, uncompleteItem, deleteCompleted } = useDmtPlanner();
    const [view, setView] = useState('today');
    const [quickText, setQuickText] = useState('');
    const [undoItem, setUndoItem] = useState(null);
    const [clearing, setClearing] = useState(false);
    const undoTimer = useRef(null);
    const today = todayStr();

    const handleQuickAdd = () => {
        const text = quickText.trim();
        if (!text) return;
        addItem.mutate({ title: text, due_date: view === 'today' ? today : undefined });
        setQuickText('');
    };

    const handleComplete = (item) => {
        setUndoItem(item);
        completeItem.mutate(item);
        if (undoTimer.current) clearTimeout(undoTimer.current);
        undoTimer.current = setTimeout(() => setUndoItem(null), 5000);
    };

    const handleUndo = () => {
        if (!undoItem) return;
        uncompleteItem.mutate(undoItem.id);
        setUndoItem(null);
        if (undoTimer.current) clearTimeout(undoTimer.current);
    };

    const { overdueItems, todayItems, upcomingGroups, somedayItems, allItems, completedItems } = useMemo(() => {
        const incomplete = items.filter((i) => !i.is_completed);
        const completed = items.filter((i) => i.is_completed);

        const overdue = incomplete.filter((i) => i.due_date && parseLocal(i.due_date) < parseLocal(today));
        const dueToday = incomplete.filter((i) => (i.due_date || '').slice(0, 10) === today);

        const upcoming = {};
        for (let d = 1; d <= 7; d++) {
            const ds = addDaysStr(today, d);
            const m = incomplete.filter((i) => (i.due_date || '').slice(0, 10) === ds);
            if (m.length) upcoming[ds] = m;
        }
        const someday = incomplete.filter((i) => !i.due_date);

        const all = [...incomplete].sort((a, b) => {
            if (!a.due_date && !b.due_date) return 0;
            if (!a.due_date) return 1;
            if (!b.due_date) return -1;
            return a.due_date.localeCompare(b.due_date);
        });

        const cutoff = addDaysStr(today, -14);
        const recentCompleted = completed
            .filter((i) => i.completed_at && i.completed_at.slice(0, 10) >= cutoff)
            .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''));

        return {
            overdueItems: overdue, todayItems: dueToday, upcomingGroups: upcoming,
            somedayItems: someday, allItems: all, completedItems: recentCompleted,
        };
    }, [items, today]);

    const empty = (msg, sub) => (
        <div className="flex flex-col items-center justify-center py-16 text-center">
            <CalendarCheck className="mb-3 h-10 w-10 text-slate-300" />
            <p className="text-sm font-medium text-slate-500">{msg}</p>
            {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
        </div>
    );

    const list = (arr, completed = false) => (
        <div className="space-y-3">
            {arr.map((item) => (
                <PlannerItemCard
                    key={item.id}
                    item={item}
                    onComplete={handleComplete}
                    onUpdate={(u) => updateItem.mutate(u)}
                    onDelete={(id) => deleteItem.mutate(id)}
                    isCompleted={completed}
                />
            ))}
        </div>
    );

    const sectionLabel = (text, cls) => (
        <p className={cn('mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wider first:mt-0', cls || 'text-slate-500')}>{text}</p>
    );

    return (
        <div className="mx-auto max-w-2xl pb-32">
            <div className="mb-5">
                <h1 className="text-xl font-bold text-slate-900">My Planner</h1>
                <p className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                    <Lock className="h-3 w-3" /> Private · Only visible to you
                </p>
            </div>

            <div className="scrollbar-hide -mx-1 flex gap-1 overflow-x-auto px-1 pb-3">
                {VIEWS.map((v) => (
                    <button
                        key={v.key}
                        type="button"
                        onClick={() => setView(v.key)}
                        className={cn(
                            'whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                            view === v.key ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100',
                        )}
                    >
                        {v.label}
                        {v.key === 'today' && overdueItems.length + todayItems.length > 0 && (
                            <span className="ml-1.5 text-xs opacity-80">({overdueItems.length + todayItems.length})</span>
                        )}
                    </button>
                ))}
            </div>

            <div className="mb-5 flex gap-2">
                <Input
                    value={quickText}
                    onChange={(e) => setQuickText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleQuickAdd()}
                    placeholder="What needs to get done? Press Enter to add"
                    className="flex-1"
                />
                <Button onClick={handleQuickAdd} size="icon" disabled={!quickText.trim()} className="shrink-0 bg-blue-600 text-white hover:bg-blue-700">
                    <Plus className="h-4 w-4" />
                </Button>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                </div>
            ) : (
                <>
                    {view === 'today' &&
                        (overdueItems.length === 0 && todayItems.length === 0
                            ? empty("You're all clear for today", 'Add something above or check Upcoming')
                            : (
                                <>
                                    {overdueItems.length > 0 && (<>{sectionLabel('Overdue', 'text-rose-600')}{list(overdueItems)}</>)}
                                    {todayItems.length > 0 && (<>{sectionLabel('Today')}{list(todayItems)}</>)}
                                </>
                            ))}

                    {view === 'upcoming' &&
                        (Object.keys(upcomingGroups).length === 0 && somedayItems.length === 0
                            ? empty('Nothing upcoming', 'Your next 7 days are clear')
                            : (
                                <>
                                    {Object.entries(upcomingGroups).map(([ds, groupItems]) => {
                                        const d = diffDays(ds, today);
                                        return (
                                            <div key={ds}>
                                                {sectionLabel(d === 1 ? `Tomorrow — ${fmtDow(ds)}` : fmtDow(ds))}
                                                {list(groupItems)}
                                            </div>
                                        );
                                    })}
                                    {somedayItems.length > 0 && (<>{sectionLabel('Someday')}{list(somedayItems)}</>)}
                                </>
                            ))}

                    {view === 'all' && (allItems.length === 0 ? empty('No items yet', 'Add your first item above') : list(allItems))}

                    {view === 'completed' && (
                        <>
                            {completedItems.length > 0 && (
                                <div className="mb-3 flex justify-end">
                                    {!clearing ? (
                                        <button type="button" onClick={() => setClearing(true)} className="text-xs font-medium text-rose-600">Clear all</button>
                                    ) : (
                                        <div className="flex items-center gap-2 text-xs">
                                            <span className="text-slate-600">Delete all completed items?</span>
                                            <button type="button" onClick={() => { setClearing(false); deleteCompleted.mutate(); }} className="font-medium text-rose-600">Yes</button>
                                            <button type="button" onClick={() => setClearing(false)} className="text-slate-400">Cancel</button>
                                        </div>
                                    )}
                                </div>
                            )}
                            {completedItems.length === 0
                                ? empty('No completed items', 'Items completed in the last 14 days show here')
                                : list(completedItems, true)}
                        </>
                    )}
                </>
            )}

            {undoItem && (
                <div className="fixed bottom-20 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg">
                    <span className="text-sm text-slate-900">Marked as done</span>
                    <button type="button" onClick={handleUndo} className="text-sm font-semibold text-blue-600">Undo</button>
                </div>
            )}
        </div>
    );
}
