import { describe, it, expect } from 'vitest';
import { shouldExpire, shouldWarn } from '../lib/sessionTimeout';
const T0 = 1_700_000_000_000;
const IDLE = 30_000;
const ABS = 100_000;
const WARN = 5_000;
describe('shouldExpire (B5 policy core)', () => {
    it('continues when fresh', () => {
        expect(shouldExpire({ lastActivity: T0, loginAt: T0, now: T0 + 1_000 }, IDLE, ABS)).toBeNull();
    });
    it('expires "idle" once inactivity reaches the idle threshold', () => {
        expect(shouldExpire({ lastActivity: T0, loginAt: T0, now: T0 + IDLE }, IDLE, ABS)).toBe('idle');
    });
    it('does not expire just below the idle threshold', () => {
        expect(shouldExpire({ lastActivity: T0, loginAt: T0, now: T0 + IDLE - 1 }, IDLE, ABS)).toBeNull();
    });
    it('expires "absolute" at the cap even with recent activity', () => {
        expect(shouldExpire({ lastActivity: T0 + ABS - 1, loginAt: T0, now: T0 + ABS }, IDLE, ABS)).toBe('absolute');
    });
    it('absolute takes precedence over idle', () => {
        expect(shouldExpire({ lastActivity: T0, loginAt: T0, now: T0 + ABS }, IDLE, ABS)).toBe('absolute');
    });
});
describe('shouldWarn (pre-logout window)', () => {
    it('false outside the warning window', () => {
        expect(shouldWarn({ lastActivity: T0, now: T0 + (IDLE - WARN - 1) }, IDLE, WARN)).toBe(false);
    });
    it('true within the warning window before the idle deadline', () => {
        expect(shouldWarn({ lastActivity: T0, now: T0 + (IDLE - WARN + 1) }, IDLE, WARN)).toBe(true);
    });
    it('false once already at/over the idle deadline (no warning, it just expires)', () => {
        expect(shouldWarn({ lastActivity: T0, now: T0 + IDLE }, IDLE, WARN)).toBe(false);
    });
});
