import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Check } from 'lucide-react';
export function JhGroupMultiSelect({ groups, selectedIds, onChange }) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
        function onMouseDown(e) {
            if (ref.current && !ref.current.contains(e.target))
                setOpen(false);
        }
        document.addEventListener('mousedown', onMouseDown);
        return () => document.removeEventListener('mousedown', onMouseDown);
    }, []);
    const allSelected = groups.length > 0 && selectedIds.length === groups.length;
    const toggle = (id) => {
        if (selectedIds.includes(id)) {
            onChange(selectedIds.filter((x) => x !== id));
        }
        else {
            onChange([...selectedIds, id]);
        }
    };
    const label = selectedIds.length === 0
        ? t('common.selectJhGroup')
        : allSelected
            ? t('opl.allJhGroups')
            : t('opl.jhGroupsSelected', { count: selectedIds.length });
    return (<div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full h-9 px-3 rounded-lg border border-stone-300 bg-white text-sm text-stone-800 flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-amber-500">
        <span className={selectedIds.length === 0 ? 'text-stone-400' : ''}>{label}</span>
        <ChevronDown size={14} className={`text-stone-400 transition-transform ${open ? 'rotate-180' : ''}`}/>
      </button>

      {open && (<div className="absolute top-full mt-1 left-0 right-0 z-30 bg-white border border-stone-200 rounded-xl shadow-lg overflow-hidden max-h-64 overflow-y-auto">
          <button type="button" onClick={() => onChange(allSelected ? [] : groups.map((g) => g.id))} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-stone-50 text-left border-b border-stone-100">
            <div className={[
                'w-4 h-4 rounded border-2 flex items-center justify-center shrink-0',
                allSelected ? 'border-amber-500 bg-amber-500' : 'border-stone-300',
            ].join(' ')}>
              {allSelected && <Check size={10} className="text-white"/>}
            </div>
            <span className="text-xs font-semibold text-stone-600">{t('opl.selectAllGroups')}</span>
          </button>

          {groups.map((g) => {
                const checked = selectedIds.includes(g.id);
                return (<button key={g.id} type="button" onClick={() => toggle(g.id)} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-stone-50 text-left">
                <div className={[
                        'w-4 h-4 rounded border-2 flex items-center justify-center shrink-0',
                        checked ? 'border-amber-500 bg-amber-500' : 'border-stone-300',
                    ].join(' ')}>
                  {checked && <Check size={10} className="text-white"/>}
                </div>
                <span className="text-sm text-stone-800">{g.name}</span>
              </button>);
            })}
        </div>)}
    </div>);
}
