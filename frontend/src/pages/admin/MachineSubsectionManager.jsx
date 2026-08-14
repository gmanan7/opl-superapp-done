import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronDown, ChevronRight, Plus, Loader2, Power } from 'lucide-react';
import { api } from '../../lib/api';
import { getSessionContext } from '../../hooks/useAbnormalities';
function useMachinesWithSubsections() {
    const ctx = getSessionContext();
    return useQuery({
        queryKey: ['admin-machines-subsections', ctx?.factory_id],
        enabled: !!ctx?.factory_id,
        queryFn: async () => {
            const [machines, groups] = await Promise.all([
                api.getMachines(),
                api.getJhGroups(),
            ]);
            const machinesByGroup = {};
            for (const m of machines) {
                const gid = m.jh_group_id ?? '__ungrouped__';
                if (!machinesByGroup[gid])
                    machinesByGroup[gid] = [];
                machinesByGroup[gid].push({
                    id: m.id,
                    name: m.name,
                    jh_group_id: m.jh_group_id,
                    asset_code: m.code || null,
                    subsections: [],
                });
            }
            return groups.map((g) => ({
                id: g.id,
                name: g.name,
                machines: machinesByGroup[g.id] ?? [],
            })).filter((g) => g.machines.length > 0);
        },
    });
}
function useAddSubsection() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ machineId, jhGroupId, name, }) => {
            return { id: 'new-sub', machineId, jhGroupId, name };
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-machines-subsections'] }),
    });
}
function useToggleSubsection() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, is_active }) => {
            return { id, is_active };
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-machines-subsections'] }),
    });
}
function MachineRow({ machine, jhGroupId, }) {
    const { t } = useTranslation();
    const [expanded, setExpanded] = useState(false);
    const [newName, setNewName] = useState('');
    const addMutation = useAddSubsection();
    const toggleMutation = useToggleSubsection();
    const handleAdd = async () => {
        if (!newName.trim())
            return;
        await addMutation.mutateAsync({
            machineId: machine.id,
            jhGroupId,
            name: newName.trim(),
        });
        setNewName('');
    };
    return (<div className="border border-gray-200 rounded-xl overflow-hidden">
      <button onClick={() => setExpanded((v) => !v)} className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 text-left hover:bg-gray-100 transition-colors">
        <div>
          <p className="text-sm font-semibold text-gray-800">{machine.name}</p>
          {machine.asset_code && (<p className="text-xs text-gray-400 mt-0.5">{machine.asset_code}</p>)}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{machine.subsections.length} {t('abn.subsections')}</span>
          {expanded ? <ChevronDown size={16} className="text-gray-400"/> : <ChevronRight size={16} className="text-gray-400"/>}
        </div>
      </button>

      {expanded && (<div className="px-4 py-3 space-y-2 bg-white">
          {machine.subsections.length === 0 && (<p className="text-xs text-gray-400 italic">{t('abn.noSubsections')}</p>)}

          {machine.subsections.map((sub) => (<div key={sub.id} className={[
                    'flex items-center justify-between px-3 py-2.5 rounded-lg border',
                    sub.is_active ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100 opacity-60',
                ].join(' ')}>
              <span className={`text-sm ${sub.is_active ? 'text-gray-800' : 'text-gray-500 line-through'}`}>
                {sub.name}
              </span>
              <button onClick={() => toggleMutation.mutate({ id: sub.id, is_active: !sub.is_active })} disabled={toggleMutation.isPending} title={sub.is_active ? t('abn.deactivate') : t('abn.activate')} className={[
                    'p-1.5 rounded-lg transition-colors',
                    sub.is_active
                        ? 'text-green-600 hover:bg-green-50'
                        : 'text-gray-400 hover:bg-gray-100',
                ].join(' ')}>
                <Power size={14}/>
              </button>
            </div>))}

          <div className="flex gap-2 mt-2">
            <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAdd()} placeholder={t('abn.newSubsectionPlaceholder')} className="flex-1 h-10 px-3 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
            <button onClick={handleAdd} disabled={!newName.trim() || addMutation.isPending} className="h-10 w-10 bg-blue-600 disabled:bg-gray-200 text-white rounded-xl flex items-center justify-center shrink-0">
              {addMutation.isPending ? (<Loader2 size={14} className="animate-spin"/>) : (<Plus size={16}/>)}
            </button>
          </div>
        </div>)}
    </div>);
}
export function MachineSubsectionManager() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const ctx = getSessionContext();
    const { data: groups = [], isLoading, error } = useMachinesWithSubsections();
    if (!ctx || !['be_team', 'pillar_champion', 'admin'].includes(ctx.role)) {
        return (<div className="p-4">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          {t('abn.noPermission')}
        </div>
      </div>);
    }
    return (<div className="min-h-full bg-gray-50">
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 flex items-center gap-3 px-4 py-3">
        <button onClick={() => navigate(-1)} className="p-1.5 -ml-1.5 rounded-lg text-gray-500 hover:bg-gray-100">
          <ChevronLeft size={22}/>
        </button>
        <h1 className="text-base font-semibold text-gray-900">{t('abn.subsectionManagerTitle')}</h1>
      </div>

      <div className="px-4 py-4 space-y-6">
        {isLoading && (<div className="flex justify-center py-12">
            <Loader2 size={24} className="animate-spin text-blue-600"/>
          </div>)}

        {error && (<div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
            {t('common.error')}: {error.message}
          </div>)}

        {!isLoading && groups.length === 0 && (<div className="text-center py-12 text-gray-400 text-sm">
            {t('abn.noMachinesFound')}
          </div>)}

        {groups.map((group) => (<div key={group.id}>
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 px-1">
              {group.name}
            </h2>
            <div className="space-y-2">
              {group.machines.map((machine) => (<MachineRow key={machine.id} machine={machine} jhGroupId={group.id}/>))}
            </div>
          </div>))}
      </div>
    </div>);
}
