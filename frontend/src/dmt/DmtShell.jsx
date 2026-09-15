import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
    LayoutDashboard, ListChecks, CalendarDays, Gauge, LineChart, Wrench,
    FlaskConical, NotebookPen, ArrowLeft, Building2,
    ClipboardCheck, ClipboardList, ScrollText,
} from 'lucide-react';
import { useDmtMe } from './lib/useDmt';

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
    { to: '/dmt/admin/charts', icon: LineChart, label: 'KPI Charts', min: 'leadership' },
    { to: '/dmt/admin/audit', icon: ScrollText, label: 'Audit Log', min: 'be_lead' },
];

export function DmtShell() {
    const navigate = useNavigate();
    const { user, tierAtLeast } = useDmtMe();
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
                    <span className="text-sm font-bold tracking-tight text-white">Fulcrum · DMT</span>
                    {user?.name && <p className="mt-0.5 truncate text-xs text-stone-400">{user.name}</p>}
                </div>

                <nav className="flex-1 space-y-0.5 overflow-y-auto py-3">
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

                <div className="shrink-0 border-t border-white/10 px-3 py-3">
                    {user?.factory_name && (
                        <div className="mb-2 flex items-center gap-2 px-2.5 py-1 text-xs text-stone-400">
                            <Building2 size={13} strokeWidth={1.8} />
                            <span className="truncate">{user.factory_name}</span>
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={() => navigate('/select-module')}
                        className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs font-medium text-stone-300 transition-colors hover:bg-white/5 hover:text-white"
                    >
                        <ArrowLeft size={14} strokeWidth={1.8} />
                        Back to modules
                    </button>
                </div>
            </aside>

            <div className="flex min-h-dvh flex-1 flex-col md:ml-[220px]">
                {/* Mobile top bar */}
                <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
                    <span className="text-sm font-bold text-slate-900">Fulcrum · DMT</span>
                    <button
                        type="button"
                        onClick={() => navigate('/select-module')}
                        className="text-xs font-medium text-slate-500"
                    >
                        Modules
                    </button>
                </div>
                <main className="flex-1 overflow-y-auto p-4 sm:p-6">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
