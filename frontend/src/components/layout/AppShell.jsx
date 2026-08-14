import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { User } from 'lucide-react';
import { getSessionContext } from '../../hooks/useAbnormalities';
import { useAuth } from '../../hooks/useAuth';
import { useFactoryModules, buildEnabledSet } from '../../hooks/mdm';
import { ProfileSheet } from './ProfileSheet';
import { NAV_CONFIG, visibleNav } from './navConfig';
export function AppShell() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const ctx = getSessionContext();
    const role = ctx?.role;
    const { name: userName } = useAuth(); // resolves the worker NAME for both identity types
    const [profileOpen, setProfileOpen] = useState(false);
    // Module-driven nav: a missing/disabled factory_module row hides its capture
    // entry (ARCHITECTURE §7.3). RLS fm_read lets every factory member read this,
    // so the gate works for shop-floor PIN users too.
    const modules = useFactoryModules();
    const enabled = buildEnabledSet(modules.data);
    const captureNav = visibleNav(NAV_CONFIG, role, enabled, 'capture');
    const adminNav = visibleNav(NAV_CONFIG, role, enabled, 'admin');
    const sidebarLink = (isActive) => [
        'flex items-center gap-3 py-2.5 pl-[14px] pr-4 text-sm font-medium transition-colors border-l-2',
        isActive
            ? 'bg-white/10 text-white border-amber-500'
            : 'text-stone-400 border-transparent hover:bg-white/5 hover:text-stone-200',
    ].join(' ');
    const mobileLink = (isActive) => [
        'flex flex-col items-center justify-center flex-1 gap-0.5 text-xs font-medium transition-colors min-h-touch',
        isActive ? 'text-amber-600' : 'text-stone-400 hover:text-stone-600',
    ].join(' ');
    return (<div className="flex min-h-dvh bg-surface-base">
      {/* Sidebar — desktop only */}
      <aside className="fixed left-0 top-0 bottom-0 z-40 hidden w-[220px] flex-col bg-stone-900 md:flex">
        <div className="shrink-0 border-b border-white/10 px-4 py-5">
          <span className="text-sm font-bold tracking-tight text-white">TPM Fulcrum</span>
          {userName && <p className="mt-0.5 truncate text-xs text-stone-400">{userName}</p>}
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto py-3">
          {captureNav.map(({ to, icon: Icon, labelKey }) => (<NavLink key={to} to={to} className={({ isActive }) => sidebarLink(isActive)}>
              {({ isActive }) => (<>
                  <Icon size={18} strokeWidth={isActive ? 2.2 : 1.8}/>
                  {t(labelKey)}
                </>)}
            </NavLink>))}

          {adminNav.length > 0 && (<>
              <p className="px-[14px] pb-1 pt-4 text-[10px] uppercase tracking-wider text-stone-500">
                {t('mdm.nav')}
              </p>
              {adminNav.map(({ to, icon: Icon, labelKey }) => (<NavLink key={to} to={to} className={({ isActive }) => sidebarLink(isActive)}>
                  {({ isActive }) => (<>
                      <Icon size={18} strokeWidth={isActive ? 2.2 : 1.8}/>
                      {t(labelKey)}
                    </>)}
                </NavLink>))}
            </>)}
        </nav>

        {/* Footer — account/logout */}
        <div className="shrink-0 space-y-1 border-t border-white/10 px-3 py-3">
          <button type="button" onClick={() => setProfileOpen(true)} className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs font-medium text-stone-300 outline-none transition-colors hover:bg-white/5 hover:text-white">
            <User size={14} strokeWidth={1.8}/>
            {t('nav.profile')}
          </button>
        </div>
      </aside>

      {/* Content area */}
      <div className="flex min-h-dvh flex-1 flex-col md:ml-[220px]">
        <main className="flex-1 overflow-y-auto pb-24 md:pb-0">
          <Outlet />
        </main>

        {/* Bottom nav — mobile only: capture surfaces + profile/settings */}
        <nav className="safe-area-bottom fixed bottom-0 left-0 right-0 z-50 border-t border-stone-200 bg-white md:hidden">
          <div className="mx-auto flex h-16 max-w-lg items-stretch">
            {captureNav.map(({ to, icon: Icon, labelKey }) => (<NavLink key={to} to={to} className={({ isActive }) => mobileLink(isActive)}>
                {({ isActive }) => (<>
                    <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8}/>
                    <span className="leading-none">{t(labelKey)}</span>
                  </>)}
              </NavLink>))}
            <button type="button" onClick={() => setProfileOpen(true)} className="flex min-h-touch flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium text-stone-400 transition-colors hover:text-stone-600">
              <User size={20} strokeWidth={1.8}/>
              <span className="leading-none">{t('nav.profile')}</span>
            </button>
          </div>
        </nav>
      </div>

      <ProfileSheet open={profileOpen} onOpenChange={setProfileOpen}/>
    </div>);
}
