// PD Cycle pure logic (ported from dmt/src/lib/pdCycle.ts).

export const PD_STAGE_LABEL = {
    upcoming: 'Upcoming',
    in_process: 'In Process',
    processing_finished: 'Processing Finished',
    feedback_approved: 'Approved',
    feedback_rejected: 'Rejected',
    abandoned: 'Abandoned',
};

export const PD_STAGE_PILL = {
    upcoming: 'bg-blue-100 text-blue-700',
    in_process: 'bg-amber-100 text-amber-700',
    processing_finished: 'bg-purple-100 text-purple-700',
    feedback_approved: 'bg-emerald-100 text-emerald-700',
    feedback_rejected: 'bg-rose-100 text-rose-700',
    abandoned: 'bg-slate-100 text-slate-500',
};

export const KANBAN_COLUMNS = [
    { key: 'upcoming', label: 'Upcoming', stages: ['upcoming'] },
    { key: 'in_process', label: 'In Process', stages: ['in_process'] },
    { key: 'processing_finished', label: 'Processing Finished', stages: ['processing_finished'] },
    { key: 'closed', label: 'Customer Feedback & Closed', stages: ['feedback_approved', 'feedback_rejected', 'abandoned'] },
];

const TERMINAL = ['feedback_approved', 'feedback_rejected', 'abandoned'];
export const isTerminalStage = (s) => TERMINAL.includes(s);

export function nextStageOptions(current) {
    switch (current) {
        case 'upcoming': return ['in_process', 'abandoned'];
        case 'in_process': return ['processing_finished', 'abandoned'];
        case 'processing_finished': return ['feedback_approved', 'feedback_rejected', 'abandoned'];
        default: return [];
    }
}

export function validateStageChange({ current, next, feedbackNote }) {
    if (!nextStageOptions(current).includes(next)) {
        return { ok: false, error: `Cannot move from ${PD_STAGE_LABEL[current]} to ${PD_STAGE_LABEL[next]}` };
    }
    if ((next === 'feedback_rejected' || next === 'abandoned') && !(feedbackNote && feedbackNote.trim())) {
        return { ok: false, error: 'A feedback note is required when marking a job rejected or abandoned.' };
    }
    return { ok: true };
}

export function ageInDays(fromIso, now = new Date()) {
    if (!fromIso) return 0;
    const t = new Date(fromIso).getTime();
    if (Number.isNaN(t)) return 0;
    return Math.max(0, Math.floor((now.getTime() - t) / 86400000));
}

export function pdJobMatchesQuery(job, query) {
    if (!query || !query.trim()) return true;
    const q = query.trim().toLowerCase();
    const num = q.match(/^(?:pd[-#\s]*)?#?(\d+)$/);
    if (num && job.job_number === parseInt(num[1], 10)) return true;
    return [job.title, job.customer, job.product].some((f) => typeof f === 'string' && f.toLowerCase().includes(q));
}

export function columnForStage(stage) {
    return KANBAN_COLUMNS.find((c) => c.stages.includes(stage))?.key ?? 'upcoming';
}
