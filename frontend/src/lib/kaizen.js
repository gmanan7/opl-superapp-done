// Pure Kaizen scoring logic (Phase 3 M3). No I/O — unit-tested. The server
// (approve_kaizen RPC) is AUTHORITATIVE and recomputes the total; this mirrors the
// D-020 / KAIZEN_DETAIL §8 model for the client (live total as the approver scores).
export const SCORE_OPTIONS = [1, 3, 9];
export const SCORE_MAX = 36; // four dimensions × max 9 (straight sum — D-020, NOT weighted)
export function isScoreValue(v) {
    return v === 1 || v === 3 || v === 9;
}
/** Straight SUM of the four 1/3/9 dimensions → 0..36, or null until all four are set.
 *  Matches the server's approve_kaizen total (p_pq + p_ehs + p_quant + p_easy). */
export function kaizenTotalScore(pq, ehs, quant, easy) {
    if (!isScoreValue(pq) || !isScoreValue(ehs) || !isScoreValue(quant) || !isScoreValue(easy))
        return null;
    return pq + ehs + quant + easy;
}
/** All four dimensions scored → approval is allowed (the Approve gate). */
export function scoreComplete(pq, ehs, quant, easy) {
    return kaizenTotalScore(pq, ehs, quant, easy) !== null;
}
