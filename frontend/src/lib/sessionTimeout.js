// Bounded-session policy (SECURITY_VAPT B5). Pure, dependency-free core so the
// expiry decision is unit-testable without timers, DOM, or storage. <SessionGuard>
// is the thin wiring around these.
export const IDLE_MS = 30 * 60 * 1000; // inactivity timeout — 30 min
export const ABSOLUTE_MS = 8 * 60 * 60 * 1000; // absolute cap — 8 h, regardless of activity
export const WARN_MS = 5 * 60 * 1000; // pre-logout warning window — 5 min
export const ACTIVITY_THROTTLE_MS = 10 * 1000; // min gap between activity writes (cross-tab thrash guard)
export const POLL_MS = 15 * 1000; // how often the guard evaluates expiry
// Returns the reason the session must end, or null if it may continue.
// Absolute is checked first: an 8 h-old session ends even amid activity.
export function shouldExpire(input, idleMs = IDLE_MS, absoluteMs = ABSOLUTE_MS) {
    const { lastActivity, loginAt, now } = input;
    if (now - loginAt >= absoluteMs)
        return 'absolute';
    if (now - lastActivity >= idleMs)
        return 'idle';
    return null;
}
// True when within the pre-logout warning window of the IDLE deadline (and not yet
// expired). Absolute expiry has no warning — it is a hard cap.
export function shouldWarn(input, idleMs = IDLE_MS, warnMs = WARN_MS) {
    const remaining = idleMs - (input.now - input.lastActivity);
    return remaining > 0 && remaining <= warnMs;
}
