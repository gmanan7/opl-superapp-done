import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Sheet, SheetContent, SheetTitle } from '../components/ui/sheet';
import { useTranslation } from 'react-i18next';
import {
    LayoutDashboard, ListChecks, CalendarDays, Gauge, LineChart, Wrench,
    FlaskConical, NotebookPen, Building2,
    ClipboardCheck, ClipboardList, LogOut, Menu,
} from 'lucide-react';
import { logout } from '../lib/auth';
import { useDmtMe } from './lib/useDmt';
import { NotificationBell } from '../components/layout/NotificationBell';
import { ModuleSwitch } from '../components/layout/ModuleSwitch';

const CAPTURE_NAV = [
    { to: '/dmt', end: true, icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/dmt/tasks', icon: ListChecks, label: 'Task Board' },
    { to: '/dmt/meetings', icon: CalendarDays, label: 'Meetings' },
    { to: '/dmt/meetings/decisions', icon: ClipboardList, label: 'Decision Log' },
    { to: '/dmt/compliance', icon: ClipboardCheck, label: 'Compliance' },
    { to: '/dmt/kpi/entry', icon: Gauge, label: 'KPI Entry' },
    { to: '/dmt/kpi/trends', icon: LineChart, label: 'KPI Trends' },
    { to: '/dmt/pm-schedule', icon: Wrench, label: 'PM Schedule' },
    { to: '/dmt/pd-cycle', icon: FlaskConical, label: 'PD Cycle' },
    { to: '/dmt/planner', icon: NotebookPen, label: 'Planner' },
];

// Departments/KPI Master/Meeting Templates/Analytics live under one "Organisation" hub now
// (owner request) — Task Overview and KPI Charts stay separate by choice; Audit Log stays
// separate too, pending a tighter visibility rule for it (owner: "will tackle it later").
const ADMIN_NAV = [
    { to: '/dmt/organisation', icon: Building2, label: 'Organisation', min: 'leadership' },
    { to: '/dmt/admin/tasks', icon: ListChecks, label: 'Task Overview', min: 'leadership' },
];

export function DmtShell() {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { user, tierAtLeast } = useDmtMe();
    const [menuOpen, setMenuOpen] = useState(false);
    // Same sign-out as the profile menu in Lumos: clears the session (and cached data), then back to the login page.
    const handleLogout = async () => {
        await logout();
        navigate('/login', { replace: true });
    };
    const adminNav = ADMIN_NAV.filter((n) => tierAtLeast(n.min));

    const link = (isActive) =>
        [
            'flex items-center gap-3 py-2.5 pl-[14px] pr-4 text-sm font-medium transition-colors border-l-2',
            isActive
                ? 'bg-white/10 text-white border-blue-500'
                : 'text-stone-400 border-transparent hover:bg-white/5 hover:text-stone-200',
        ].join(' ');

    return (
        <div className="flex min-h-dvh bg-slate-50">
            <aside className="fixed left-0 top-0 bottom-0 z-40 hidden w-[220px] flex-col bg-stone-900 md:flex">
                <div className="shrink-0 border-b border-white/10 px-4 py-5">
                    <span className="text-sm font-bold tracking-tight text-white">FOCUS · CloseLoop</span>
                    {user?.name && <p className="mt-0.5 truncate text-xs text-stone-400">{user.name}</p>}
                </div>

                <nav className="no-scrollbar flex-1 space-y-0.5 overflow-y-auto py-3">
                    {CAPTURE_NAV.map(({ to, end, icon: Icon, label }) => (
                        <NavLink key={to} to={to} end={end} className={({ isActive }) => link(isActive)}>
                            {({ isActive }) => (
                                <>
                                    <Icon size={18} strokeWidth={isActive ? 2.2 : 1.8} />
                                    {label}
                                </>
                            )}
                        </NavLink>
                    ))}

                    {adminNav.length > 0 && (
                        <>
                            <p className="px-[14px] pb-1 pt-4 text-[10px] uppercase tracking-wider text-stone-500">
                                Admin
                            </p>
                            {adminNav.map(({ to, icon: Icon, label }) => (
                                <NavLink key={to} to={to} className={({ isActive }) => link(isActive)}>
                                    {({ isActive }) => (
                                        <>
                                            <Icon size={18} strokeWidth={isActive ? 2.2 : 1.8} />
                                            {label}
                                        </>
                                    )}
                                </NavLink>
                            ))}
                        </>
                    )}
                </nav>

                <div className="shrink-0 space-y-1 border-t border-white/10 px-3 py-3">
                    <ModuleSwitch current="closeloop" />
                    <NotificationBell variant="sidebar" />
                    {user?.factory_name && (
                        <div className="mb-2 flex items-center gap-2 px-2.5 py-1 text-xs text-stone-400">
                            <Building2 size={13} strokeWidth={1.8} />
                            <span className="truncate">{user.factory_name}</span>
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={handleLogout}
                        className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs font-medium text-stone-300 transition-colors hover:bg-white/5 hover:text-white"
                    >
                        <LogOut size={14} strokeWidth={1.8} />
                        {t('common.logout')}
                    </button>
                </div>
            </aside>

            <div className="flex min-h-dvh min-w-0 flex-1 flex-col md:ml-[220px]">
                {/* Mobile top bar */}
                <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3 md:hidden">
                    <button type="button" onClick={() => setMenuOpen(true)} aria-label="Menu" className="text-slate-700">
                        <Menu size={22} strokeWidth={1.8} />
                    </button>
                    <span className="text-sm font-bold text-slate-900">FOCUS · CloseLoop</span>
                    <div className="w-14"><NotificationBell variant="mobile" /></div>
                    <ModuleSwitch current="closeloop" variant="mobile" />
                    <button type="button" onClick={handleLogout} aria-label={t('common.logout')} className="text-slate-500">
                        <LogOut size={18} strokeWidth={1.8} />
                    </button>
                </div>
                <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
                    <SheetContent side="left" className="w-[260px] max-w-[80vw] border-0 bg-stone-900 p-0">
                        <SheetTitle className="sr-only">Menu</SheetTitle>
                        <div className="border-b border-white/10 px-4 py-5">
                            <span className="text-sm font-bold text-white">FOCUS · CloseLoop</span>
                            {user?.name && <p className="mt-0.5 truncate text-xs text-stone-400">{user.name}</p>}
                        </div>
                        <nav className="h-[calc(100dvh-80px)] space-y-0.5 overflow-y-auto py-3">
                            {[...CAPTURE_NAV, ...adminNav].map(({ to, end, icon: Icon, label }) => (
                                <NavLink key={to} to={to} end={end} onClick={() => setMenuOpen(false)} className={({ isActive }) => link(isActive)}>
                                    <Icon size={18} strokeWidth={1.8} />
                                    {label}
                                </NavLink>
                            ))}
                        </nav>
                    </SheetContent>
                </Sheet>
                <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
