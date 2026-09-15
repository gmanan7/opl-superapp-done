// Tiny date helpers — replaces date-fns for the DMT module.
// All 'YYYY-MM-DD' strings are treated as local calendar dates (no UTC shift).

export function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseLocal(dateStr) {
    if (!dateStr) return null;
    const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d);
}

export function addDaysStr(dateStr, n) {
    const d = parseLocal(dateStr) || new Date();
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function diffDays(aStr, bStr) {
    const a = parseLocal(aStr);
    const b = parseLocal(bStr);
    if (!a || !b) return 0;
    return Math.round((a - b) / 86400000);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function fmtShort(dateStr) {
    const d = parseLocal(dateStr);
    if (!d) return '';
    return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function fmtLong(dateStr) {
    const d = parseLocal(dateStr);
    if (!d) return '';
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function fmtDow(dateStr) {
    const d = parseLocal(dateStr);
    if (!d) return '';
    return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function nextRecurrence(item) {
    const base = parseLocal(item.due_date) || new Date();
    switch (item.recurrence_type) {
        case 'daily': base.setDate(base.getDate() + 1); break;
        case 'weekly': base.setDate(base.getDate() + 7); break;
        case 'monthly':
            base.setMonth(base.getMonth() + 1);
            if (item.recurrence_day_of_month) {
                const lastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
                base.setDate(Math.min(item.recurrence_day_of_month, lastDay));
            }
            break;
        default: return null;
    }
    return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`;
}
