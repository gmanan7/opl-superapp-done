import { Home, AlertTriangle, BarChart2, BookOpen, Lightbulb, Users, Network, Wrench, } from 'lucide-react';
import { roleAtLeast } from '../../lib/auth';
// Single source of truth for navigation (ARCHITECTURE §7.3, Vision §5.6). A future
// pillar module is ONE new row here — never a shell edit.
//
// - Capture modules carry a `moduleKey`: they appear ONLY when that module is
//   enabled for the active factory (factory_module). Home is always-on.
// - MDM is platform infrastructure (module-zero, D-012), NOT a factory_module key,
//   so it is role-gated only — never module-gated — and lives on the desktop admin
//   surface (MDM is desktop-first admin work, MDM_SPEC §5).
// - `minRole` is aligned to each route's RequireRole guard in App.tsx, so the nav
//   never advertises a surface the route would deny (fixes the prototype's
//   org-nav-at-dmt_leader vs org-route-at-admin mismatch).
export const NAV_CONFIG = [
    { to: '/home', labelKey: 'nav.home', icon: Home, moduleKey: null, minRole: null, surface: 'capture' },
    { to: '/abnormalities', labelKey: 'nav.abnormalities', icon: AlertTriangle, moduleKey: 'abnormality', minRole: null, surface: 'capture' },
    { to: '/kpis', labelKey: 'nav.kpis', icon: BarChart2, moduleKey: 'jh_kpi', minRole: null, surface: 'capture' },
    { to: '/opl', labelKey: 'nav.opl', icon: BookOpen, moduleKey: 'opl', minRole: null, surface: 'capture' },
    { to: '/kaizen', labelKey: 'nav.kaizen', icon: Lightbulb, moduleKey: 'kaizen', minRole: null, surface: 'capture' },
    // MDM — platform infra: role-gated only (never module-gated), desktop admin surface.
    { to: '/admin/mdm/people', labelKey: 'nav.people', icon: Users, moduleKey: null, minRole: 'it_lead', surface: 'admin' },
    { to: '/admin/mdm/org', labelKey: 'mdm.org.title', icon: Network, moduleKey: null, minRole: 'admin', surface: 'admin' },
    { to: '/admin/mdm/machines', labelKey: 'mdm.machines.title', icon: Wrench, moduleKey: null, minRole: 'dmt_leader', surface: 'admin' },
];
// The visibility predicate: enabled-or-always-on AND role-permitted AND (optionally)
// on the requested surface. This is the whole authorization+modularity contract for nav.
export function visibleNav(entries, role, enabled, surface) {
    return entries.filter((e) => (e.moduleKey === null || enabled.has(e.moduleKey)) &&
        (e.minRole === null || roleAtLeast(role, e.minRole)) &&
        (surface === undefined || e.surface === surface));
}
