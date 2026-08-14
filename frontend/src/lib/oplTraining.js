// Pure OPL-training logic (Phase 3 M2b). No I/O — unit-tested. The server (the
// SECURITY DEFINER RPCs + opl_training_due_v) is AUTHORITATIVE; these mirror its
// rules for the client (queue ordering, the "no-drowning" cap, due labels) and
// give the cycle/due math fast unit coverage. Never gate a write on these alone.
const DAY_MS = 86_400_000;
/** next_due = trained_at + freq days. null when never trained (always due). */
export function nextDueAt(trainedAt, freqDays) {
    if (!trainedAt)
        return null;
    return new Date(new Date(trainedAt).getTime() + freqDays * DAY_MS);
}
/** Never trained → due. Else due once now >= trained_at + freq. */
export function isDue(trainedAt, freqDays, now = new Date()) {
    const due = nextDueAt(trainedAt, freqDays);
    return due === null || now.getTime() >= due.getTime();
}
/** The retrain_cycle a fresh self-ack / trainer-mark would write, or null when the
 *  worker is still within the current cycle (the server blocks that via UNIQUE). */
export function nextCycle(lastCycle, trainedAt, freqDays, now = new Date()) {
    if (lastCycle == null)
        return 1;
    return isDue(trainedAt, freqDays, now) ? lastCycle + 1 : null;
}
/** Whole days past due (>=0); 0 when not yet due. */
export function daysOverdue(nextDue, now = new Date()) {
    if (!nextDue)
        return 0;
    return Math.max(0, Math.floor((now.getTime() - nextDue.getTime()) / DAY_MS));
}
/** Due-queue order: starred first, then most-overdue (never-trained ranks as the
 *  most overdue). Stable, non-mutating. */
export function orderDueQueue(rows) {
    const urgency = (r) => (r.never_trained ? Number.MAX_SAFE_INTEGER : r.days_overdue ?? 0);
    return [...rows].sort((a, b) => {
        if (a.is_star !== b.is_star)
            return a.is_star ? -1 : 1;
        return urgency(b) - urgency(a);
    });
}
/** Bounded visible queue — the "no-drowning" cap (D-028). */
export function capQueue(rows, cap = 5) {
    return { visible: rows.slice(0, cap), moreCount: Math.max(0, rows.length - cap) };
}
/** effective audience = active primary members ∪ included − excluded. The server's
 *  opl_effective_audience() is authoritative; this mirror is for client roster
 *  reasoning + tests. */
export function computeEffectiveAudience(primaryMemberIds, includedIds = [], excludedIds = []) {
    const excluded = new Set(excludedIds);
    const out = new Set();
    for (const id of primaryMemberIds)
        if (!excluded.has(id))
            out.add(id);
    for (const id of includedIds)
        out.add(id);
    return [...out];
}
