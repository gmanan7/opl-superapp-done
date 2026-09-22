import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import i18n from '../i18n';
import { useAuth } from '../hooks/useAuth';
import { logout } from '../lib/auth';
import { getSessionContext } from '../hooks/useAbnormalities';
import { api } from '../lib/api';
import { safeStorage } from '../lib/safeStorage';
function getGreeting() {
    const h = new Date().getHours();
    if (h < 12)
        return 'Good morning';
    if (h < 17)
        return 'Good afternoon';
    if (h < 21)
        return 'Good evening';
    return 'Good night';
}
export function Home() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { name } = useAuth();
    const ctx = getSessionContext();
    const { data: jhGroupName } = useQuery({
        queryKey: ['jh-group-name', ctx?.jh_group_id],
        enabled: !!ctx?.jh_group_id,
        staleTime: Infinity,
        queryFn: async () => {
            const groups = await api.getJhGroups();
            const g = groups.find((item) => item.id === ctx.jh_group_id);
            return g?.name ?? null;
        },
    });
    const { data: factoryName } = useQuery({
        queryKey: ['factory-name', ctx?.factory_id],
        enabled: !!ctx?.factory_id,
        staleTime: Infinity,
        queryFn: async () => {
            const factories = await api.getFactories();
            const f = factories.find((item) => item.id === ctx.factory_id);
            return f?.name ?? null;
        },
    });
    async function handleLogout() {
        i18n.changeLanguage(safeStorage.getItem('tpm_ui_lang') ?? 'en');
        await logout();
        navigate('/login', { replace: true });
    }
    return (<div className="min-h-full bg-stone-50">
      <div className="bg-white border-b border-stone-200 px-5 py-5">
        <div className="flex items-start justify-between gap-4 max-w-5xl">
          <div className="min-w-0">
            <p className="text-sm text-stone-400">{getGreeting()},</p>
            <h1 className="text-2xl font-semibold text-stone-900 mt-0.5 leading-tight break-words">{name}</h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              
              {jhGroupName && (<span className="text-xs text-stone-500 font-medium">{jhGroupName}</span>)}
              {factoryName && (<span className="text-xs text-stone-400">· {factoryName}</span>)}
            </div>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800 px-3 py-1.5 rounded-lg hover:bg-stone-100 transition-colors shrink-0 mt-1">
            <LogOut size={15}/>
            <span className="hidden sm:inline">{t('common.logout')}</span>
          </button>
        </div>
      </div>

      <div className="px-5 py-6 space-y-7 max-w-5xl">
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-3">
            Functions available
          </h2>
          <p className="text-sm text-stone-600">
            OPL, Kaizen, Abnormalities and Audits — open any of them from the menu below.
          </p>
        </section>
      </div>
    </div>);
}
