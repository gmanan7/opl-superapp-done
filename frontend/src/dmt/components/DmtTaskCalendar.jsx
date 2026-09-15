import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';
import { toIsoDate } from '../lib/pmSchedule';

const PRIORITY_DOT = { critical: 'bg-rose-600', high: 'bg-amber-500', medium: 'bg-blue-500', low: 'bg-slate-400' };

export function DmtTaskCalendar({ tasks, onTaskClick }) {
    const [ref, setRef] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
    const today = toIsoDate(new Date());

    const grid = useMemo(() => {
        const y = ref.getFullYear(), m = ref.getMonth();
        const first = new Date(y, m, 1);
        const startPad = (first.getDay() + 6) % 7; // Mon=0
        const daysInMonth = new Date(y, m + 1, 0).getDate();
        const cells = [];
        for (let i = 0; i < startPad; i++) cells.push(null);
        for (let d = 1; d <= daysInMonth; d++) cells.push(toIsoDate(new Date(y, m, d)));
        while (cells.length % 7) cells.push(null);
        return cells;
    }, [ref]);

    const byDate = useMemo(() => {
        const m = {};
        for (const t of tasks) {
            if (!t.due_date) continue;
            const d = t.due_date.slice(0, 10);
            (m[d] = m[d] || []).push(t);
        }
        return m;
    }, [tasks]);

    const label = ref.toLocaleString('en-US', { month: 'long', year: 'numeric' });

    return (
        <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setRef(new Date(ref.getFullYear(), ref.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button>
                <span className="text-sm font-semibold">{label}</span>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setRef(new Date(ref.getFullYear(), ref.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4" /></Button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-slate-400">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d}>{d}</div>)}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
                {grid.map((iso, i) => (
                    <div key={i} className={cn('min-h-[70px] rounded border p-1', iso ? 'border-slate-100 bg-white' : 'border-transparent', iso === today && 'border-blue-400 bg-blue-50')}>
                        {iso && <div className="text-[10px] text-slate-400">{parseInt(iso.slice(8), 10)}</div>}
                        <div className="space-y-0.5">
                            {(byDate[iso] || []).slice(0, 4).map((t) => (
                                <button key={t.id} type="button" onClick={() => onTaskClick(t)}
                                    className="flex w-full items-center gap-1 truncate rounded bg-slate-50 px-1 py-0.5 text-left text-[10px] hover:bg-slate-100">
                                    <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', PRIORITY_DOT[t.priority])} />
                                    <span className="truncate">{t.title}</span>
                                </button>
                            ))}
                            {(byDate[iso] || []).length > 4 && <p className="text-[9px] text-slate-400">+{byDate[iso].length - 4} more</p>}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
