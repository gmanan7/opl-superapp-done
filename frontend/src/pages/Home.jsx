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
const ROLE_BADGE = {
    operator: 'bg-cyan-100 text-cyan-700',
    jh_lead: 'bg-purple-100 text-purple-700',
    module_lead: 'bg-violet-100 text-violet-700',
    admin_5s: 'bg-pink-100 text-pink-700',
    area_champion_5s: 'bg-emerald-100 text-emerald-700',
    auditor_pool: 'bg-amber-100 text-amber-700',
    be_lead: 'bg-indigo-100 text-indigo-700',
    it_lead: 'bg-sky-100 text-sky-700',
    leadership: 'bg-rose-100 text-rose-700',
    apprentice: 'bg-blue-100 text-blue-700',
    on_roll: 'bg-teal-100 text-teal-700',
    jh_leader: 'bg-purple-100 text-purple-700',
    dmt_member: 'bg-amber-50 text-amber-600',
    dmt_leader: 'bg-amber-100 text-amber-700',
    pillar_champion: 'bg-orange-100 text-orange-700',
    be_team: 'bg-indigo-100 text-indigo-700',
    admin: 'bg-red-100 text-red-700',
};
const ROLE_LABEL = {
    operator: 'Operator',
    jh_lead: 'JH Lead',
    module_lead: 'Module Lead',
    admin_5s: '5s Admin',
    area_champion_5s: '5s Area Champion',
    auditor_pool: 'Auditor Pool',
    be_lead: 'BE Lead',
    it_lead: 'IT Lead',
    leadership: 'Leadership',
    apprentice: 'Apprentice',
    on_roll: 'On Roll',
    jh_leader: 'JH Leader',
    dmt_member: 'DMT Member',
    dmt_leader: 'DMT Leader',
    pillar_champion: 'Pillar Champion',
    be_team: 'BE Team',
    admin: 'Admin',
};
function StatCard({ label, value, leftBorderColor, valueColor, }) {
    return (<div className={`bg-white rounded-xl border border-stone-200 border-l-4 ${leftBorderColor} px-4 py-4 shadow-sm`}>
      <p className={`text-2xl font-bold leading-none ${valueColor}`}>{value}</p>
      <p className="text-xs text-stone-500 mt-1.5 leading-tight">{label}</p>
    </div>);
}
export function Home() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { name, role } = useAuth();
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
    const { data: stats } = useQuery({
        queryKey: ['home-stats', ctx?.factory_id, ctx?.jh_group_id],
        staleTime: 1000 * 60 * 2,
        queryFn: async () => {
            const [abns, oplDetails, kaizenDetails] = await Promise.all([
                api.getAbnormalityDetails(),
                api.getOplDetails(),
                api.getKaizenDetails(),
            ]);
            const now = new Date();
            const isThisMonth = (ts) => {
                const t = new Date(ts);
                return t.getFullYear() === now.getFullYear() && t.getMonth() === now.getMonth();
            };
            return {
                openAbn: abns.filter((a) => isThisMonth(a.timestamp)).length,
                oplCount: oplDetails.length,
                kaizenCount: kaizenDetails.filter((k) => isThisMonth(k.timestamp)).length,
            };
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
              {role && (<span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_BADGE[role]}`}>
                  {ROLE_LABEL[role]}
                </span>)}
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
          <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-3">Overview</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatCard label="Abnormalities This Month" value={stats?.openAbn ?? '—'} leftBorderColor="border-l-red-500" valueColor="text-red-600"/>
            <StatCard label="OPLs This Month" value={stats?.oplCount ?? '—'} leftBorderColor="border-l-blue-500" valueColor="text-blue-600"/>
            <StatCard label="Kaizens This Month" value={stats?.kaizenCount ?? '—'} leftBorderColor="border-l-green-500" valueColor="text-green-600"/>
          </div>
        </section>

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
