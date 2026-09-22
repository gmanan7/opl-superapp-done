import { Search, X } from 'lucide-react';

// Shared filter bar for the Organisation KPI tabs (Not Submitted / Audit Trail): a name search,
// any number of dropdowns, optional yes/no toggles, and a Clear button that appears once a
// filter is active. Plain native <select>s keep it light and phone-friendly.
export function KpiFilterBar({ search, onSearch, searchPlaceholder = 'Search KPI…', selects = [], toggles = [], onClear }) {
    const active = !!search || selects.some((s) => s.value !== 'all') || toggles.some((t) => t.checked);
    return (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="relative sm:col-span-2 lg:col-span-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                        value={search}
                        onChange={(e) => onSearch(e.target.value)}
                        placeholder={searchPlaceholder}
                        className="h-10 w-full rounded-md border border-slate-200 pl-9 pr-3 text-sm"
                    />
                </div>
                {selects.map((s) => (
                    <select
                        key={s.label}
                        value={s.value}
                        onChange={(e) => s.onChange(e.target.value)}
                        aria-label={s.label}
                        className="h-10 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700"
                    >
                        <option value="all">{s.label}: All</option>
                        {s.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                ))}
            </div>
            {(toggles.length > 0 || active) && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    {toggles.map((t) => (
                        <label key={t.label} className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
                            <input type="checkbox" checked={t.checked} onChange={(e) => t.onChange(e.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300" />
                            {t.label}
                        </label>
                    ))}
                    {active && (
                        <button type="button" onClick={onClear} className="ml-auto flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline">
                            <X className="h-3 w-3" /> Clear filters
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

// Unique, sorted {value,label} options from a list of strings (blank values skipped).
export const optionsFrom = (values) =>
    [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b)).map((v) => ({ value: v, label: v }));

// A KPI's department, prefixed by its optional module tag: "SFM Production" (else just "Production").
export const deptLabel = (module, department) => [module, department].filter(Boolean).join(' ') || null;
