import { Home, AlertTriangle, BarChart2, BookOpen, Lightbulb, Users, Network, Wrench, } from 'lucide-react';
import { roleAtLeast } from '../../lib/auth';
// Single source of truth for navigation. Capture surfaces (Home, Abnormalities,
// Audits, OPL, Kaizen) are always shown; MDM (People / Org Structure / Machines) is
// role-gated and lives in its own section. `minRole` is aligned to each route's
// RequireRole guard in App.jsx so the nav never advertises a denied surface.
export const NAV_CONFIG = [
    { to: '/home', labelKey: 'nav.home', icon: Home, minRole: null, surface: 'capture' },
    { to: '/abnormalities', labelKey: 'nav.abnormalities', icon: AlertTriangle, minRole: null, surface: 'capture' },
    { to: '/audits', labelKey: 'nav.audits', icon: BarChart2, minRole: null, surface: 'capture' },
    { to: '/opl', labelKey: 'nav.opl', icon: BookOpen, minRole: null, surface: 'capture' },
    { to: '/kaizen', labelKey: 'nav.kaizen', icon: Lightbulb, minRole: null, surface: 'capture' },
    { to: '/admin/mdm/people', labelKey: 'nav.people', icon: Users, minRole: 'it_lead', surface: 'admin' },
    { to: '/admin/mdm/org', labelKey: 'mdm.org.title', icon: Network, minRole: 'be_lead', surface: 'admin' },
    { to: '/admin/mdm/machines', labelKey: 'mdm.machines.title', icon: Wrench, minRole: 'be_lead', surface: 'admin' },
];
// Role-permitted AND on the requested surface.
export function visibleNav(entries, role, surface) {
    return entries.filter((e) => (e.minRole === null || roleAtLeast(role, e.minRole)) &&
        (surface === undefined || e.surface === surface));
}
