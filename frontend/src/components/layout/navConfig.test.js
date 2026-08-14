import { describe, it, expect } from 'vitest';
import { NAV_CONFIG, visibleNav } from './navConfig';
const ALL = new Set(['abnormality', 'jh_kpi', 'opl', 'kaizen', 'clti', 'meetings', 'jh_audit', 'dashboards']);
const NONE = new Set();
const tos = (entries) => entries.map((e) => e.to);
describe('visibleNav — module-driven (ARCHITECTURE §7.3)', () => {
    it('hides a capture entry when its module is disabled', () => {
        const enabled = new Set(['abnormality', 'jh_kpi', 'opl']); // kaizen OFF
        const v = visibleNav(NAV_CONFIG, 'admin', enabled, 'capture');
        expect(tos(v)).toContain('/opl');
        expect(tos(v)).not.toContain('/kaizen');
    });
    it('shows a capture entry when its module is enabled', () => {
        const v = visibleNav(NAV_CONFIG, 'admin', ALL, 'capture');
        expect(tos(v)).toEqual(expect.arrayContaining(['/abnormalities', '/kpis', '/opl', '/kaizen']));
    });
    it('Home is always-on (no moduleKey) even with every module disabled', () => {
        const v = visibleNav(NAV_CONFIG, 'on_roll', NONE, 'capture');
        expect(tos(v)).toEqual(['/home']);
    });
    it('MDM is platform infra — never module-gated (present even with NONE enabled)', () => {
        const v = visibleNav(NAV_CONFIG, 'admin', NONE, 'admin');
        expect(tos(v)).toContain('/admin/mdm/people');
        expect(tos(v)).toContain('/admin/mdm/org');
    });
});
describe('visibleNav — role-aware (authorization thesis)', () => {
    it('a shop-floor PIN role (on_roll) sees zero admin surfaces', () => {
        expect(visibleNav(NAV_CONFIG, 'on_roll', ALL, 'admin')).toHaveLength(0);
    });
    it('jh_leader sees People but not Org/Modules (admin-only)', () => {
        const v = tos(visibleNav(NAV_CONFIG, 'jh_leader', ALL, 'admin'));
        expect(v).toEqual(['/admin/mdm/people']);
    });
    it('dmt_leader sees People + Machines but NOT Org (nav aligns to the admin route guard)', () => {
        const v = tos(visibleNav(NAV_CONFIG, 'dmt_leader', ALL, 'admin'));
        expect(v).toContain('/admin/mdm/people');
        expect(v).toContain('/admin/mdm/machines');
        expect(v).not.toContain('/admin/mdm/org');
    });
    it('admin sees every admin surface', () => {
        const v = tos(visibleNav(NAV_CONFIG, 'admin', ALL, 'admin'));
        expect(v).toEqual(expect.arrayContaining([
            '/admin/mdm/people', '/admin/mdm/org', '/admin/mdm/machines',
        ]));
    });
    it('no role/null sees nothing role-gated; null role still gets always-on Home', () => {
        expect(visibleNav(NAV_CONFIG, null, ALL, 'admin')).toHaveLength(0);
        expect(tos(visibleNav(NAV_CONFIG, null, ALL, 'capture'))).toContain('/home');
    });
});
describe('visibleNav — surface separation', () => {
    it('capture surface excludes admin entries and vice-versa', () => {
        const cap = visibleNav(NAV_CONFIG, 'admin', ALL, 'capture');
        const adm = visibleNav(NAV_CONFIG, 'admin', ALL, 'admin');
        expect(cap.every((e) => e.surface === 'capture')).toBe(true);
        expect(adm.every((e) => e.surface === 'admin')).toBe(true);
    });
});
