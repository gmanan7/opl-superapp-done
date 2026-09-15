import { useState } from 'react';
import { api } from '../../lib/api';
import { Input } from '@/components/ui/input';

// Shared worker search — matches name OR employee ID (consistent with the rest of the
// app), and can mark specific results non-selectable with a reason (e.g. "Home zone").
// Originally built for Audits (audit admins/auditors); reused wherever the app needs a
// "search for a person, pick one" control (e.g. Kaizen implementation team members).
export function WorkerPicker({ onSelect, placeholder = 'Search by name or employee ID', excludeIds = [], isDisabled, className = '' }) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);

  async function handleSearch(q) {
    setSearch(q);
    if (!q.trim()) { setResults([]); return; }
    const names = await api.getWorkerNames();
    const query = q.trim().toLowerCase();
    setResults(
      names
        .filter((n) => !excludeIds.includes(n.id))
        .filter((n) => n.name.toLowerCase().includes(query) || String(n.employee_id || n.id).toLowerCase().includes(query))
        .slice(0, 8)
    );
  }

  return (
    <div className={`relative ${className}`}>
      <Input value={search} onChange={(e) => handleSearch(e.target.value)} placeholder={placeholder} />
      {results.length > 0 && (
        <div className="absolute z-20 w-full bg-white border border-slate-200 rounded-md shadow-lg mt-1 max-h-56 overflow-y-auto">
          {results.map((r) => {
            const disabledReason = isDisabled?.(r);
            return (
              <button
                key={r.id}
                type="button"
                disabled={!!disabledReason}
                onClick={() => { if (disabledReason) return; onSelect(r); setSearch(''); setResults([]); }}
                className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 ${disabledReason ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-50'}`}
              >
                <span className="truncate">{r.name} <span className="text-slate-400">#{r.employee_id || r.id}</span></span>
                {disabledReason && <span className="shrink-0 text-2xs uppercase tracking-wide text-amber-600">{disabledReason}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
