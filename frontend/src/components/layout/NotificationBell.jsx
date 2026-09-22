import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, BookOpen, Lightbulb, AlertTriangle, ClipboardCheck, ListChecks, CheckCircle2, XCircle, Clock, Info } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useNotifications, useMarkNotificationRead, useDismissNotification } from '../../hooks/useNotifications';

function timeAgo(iso) {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d ago`;
    return new Date(iso).toLocaleDateString();
}

const TABS = [
    { key: 'opl', label: 'OPL', route: '/opl', Icon: BookOpen },
    { key: 'kaizen', label: 'Kaizen', route: '/kaizen', Icon: Lightbulb },
    { key: 'abnormality', label: 'Abnormalities', route: '/abnormalities', Icon: AlertTriangle },
    { key: 'audit', label: 'Audits', route: '/audits', Icon: ClipboardCheck },
    { key: 'dmt', label: 'Tasks', route: '/dmt/tasks', Icon: ListChecks },
];

const moduleOf = (n) => n.module || 'opl';
// Kinds ending in `_pending` are action items. Clicking one only NAVIGATES — it is NOT
// marked read or removed. It stays active (and counted in the badge) until you actually
// complete the action, at which point the server deletes it. Everything else is
// informational: clicking marks it read and dismisses it.
const isActionable = (n) => typeof n.kind === 'string' && n.kind.endsWith('_pending');
// Visual accent by outcome.
const toneOf = (n) => {
    const k = n.kind || '';
    if (k.endsWith('_pending') || k === 'training_reminder' || k === 'dmt_task_escalated') return 'amber';
    if (k.includes('approved') || k.includes('closed')) return 'emerald';
    if (k.includes('rejected') || k.includes('deletion')) return 'rose';
    return 'blue';
};
const TONE = {
    amber: { bar: 'bg-amber-400', chip: 'text-amber-600', Icon: Clock },
    emerald: { bar: 'bg-emerald-400', chip: 'text-emerald-600', Icon: CheckCircle2 },
    rose: { bar: 'bg-rose-400', chip: 'text-rose-600', Icon: XCircle },
    blue: { bar: 'bg-blue-400', chip: 'text-blue-600', Icon: Info },
};

export function NotificationBell({ variant = 'sidebar' }) {
    const [open, setOpen] = useState(false);
    const [tab, setTab] = useState('opl');
    const navigate = useNavigate();
    const { data } = useNotifications();
    const markRead = useMarkNotificationRead();
    const dismiss = useDismissNotification();

    const notifications = data?.notifications || [];
    const unread = data?.unread_count || 0;

    const byTab = useMemo(() => {
        const map = { opl: [], kaizen: [], abnormality: [], audit: [], dmt: [] };
        notifications.forEach((n) => (map[moduleOf(n)] || map.opl).push(n));
        return map;
    }, [notifications]);

    const unreadByTab = useMemo(() => {
        const map = { opl: 0, kaizen: 0, abnormality: 0, audit: 0, dmt: 0 };
        notifications.forEach((n) => { if (!n.is_read) map[moduleOf(n)] = (map[moduleOf(n)] || 0) + 1; });
        return map;
    }, [notifications]);

    // When opened, land on the tab that actually needs attention.
    useEffect(() => {
        if (!open) return;
        const best = TABS.map((t) => t.key).sort((a, b) => (unreadByTab[b] || 0) - (unreadByTab[a] || 0))[0];
        if (unreadByTab[best] > 0) setTab(best);
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    const openItem = (n) => {
        // Actionable ("*_pending"): navigate only — leave it fully active; the server
        // removes it once the action is completed. Informational: mark read + dismiss.
        if (!isActionable(n)) {
            if (!n.is_read) markRead.mutate(n.id);
            dismiss.mutate(n.id);
        }
        const t = TABS.find((x) => x.key === moduleOf(n));
        setOpen(false);
        navigate(t ? t.route : '/opl');
    };

    const rows = byTab[tab] || [];
    const activeTab = TABS.find((x) => x.key === tab);

    const trigger = variant === 'mobile' ? (
        <button
            type="button"
            onClick={() => setOpen(true)}
            className="relative flex min-h-touch flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium text-stone-400 transition-colors hover:text-stone-600"
        >
            <Bell size={20} strokeWidth={1.8} />
            <span className="leading-none">Alerts</span>
            {unread > 0 && (
                <span className="absolute right-[22%] top-1 min-w-[16px] rounded-full bg-red-600 px-1 text-[10px] font-bold leading-4 text-white text-center">
                    {unread > 9 ? '9+' : unread}
                </span>
            )}
        </button>
    ) : (
        <button
            type="button"
            onClick={() => setOpen(true)}
            className="relative flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs font-medium text-stone-300 outline-none transition-colors hover:bg-white/5 hover:text-white"
        >
            <Bell size={14} strokeWidth={1.8} />
            Notifications
            {unread > 0 && (
                <span className="ml-auto min-w-[18px] rounded-full bg-red-600 px-1 text-[10px] font-bold leading-4 text-white text-center">
                    {unread > 9 ? '9+' : unread}
                </span>
            )}
        </button>
    );

    return (
        <>
            {trigger}
            <Sheet open={open} onOpenChange={setOpen}>
                <SheetContent side="bottom" className="bg-surface-raised max-h-[85vh] overflow-y-auto px-3 sm:px-6">
                    <SheetHeader className="pb-1">
                        <SheetTitle className="text-ink-strong flex items-center gap-2 text-base">
                            <Bell size={16} /> Notifications
                        </SheetTitle>
                        <SheetDescription className="text-ink-muted text-xs">
                            {unread > 0 ? `${unread} need${unread === 1 ? 's' : ''} your attention` : 'You’re all caught up'}
                        </SheetDescription>
                    </SheetHeader>

                    {/* module tabs */}
                    <div className="mt-2 grid grid-cols-5 gap-1 rounded-xl bg-surface-sunken p-1">
                        {TABS.map(({ key, label, Icon }) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setTab(key)}
                                className={`flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-2xs font-semibold transition-colors ${
                                    tab === key ? 'bg-surface-raised text-ink-strong shadow-xs' : 'text-ink-muted hover:text-ink-strong'
                                }`}
                            >
                                <span className="relative">
                                    <Icon size={16} />
                                    {unreadByTab[key] > 0 && (
                                        <span className="absolute -right-2 -top-1.5 min-w-[15px] rounded-full bg-red-600 px-1 text-[9px] font-bold leading-[15px] text-white text-center">
                                            {unreadByTab[key] > 9 ? '9+' : unreadByTab[key]}
                                        </span>
                                    )}
                                </span>
                                <span className="truncate max-w-full">{label}</span>
                            </button>
                        ))}
                    </div>

                    {/* list */}
                    <div className="space-y-2 py-3">
                        {rows.length === 0 ? (
                            <div className="flex flex-col items-center gap-2 py-10 text-center">
                                {activeTab && <activeTab.Icon size={24} className="text-ink-subtle/50" />}
                                <p className="text-xs text-ink-muted">No {activeTab?.label} notifications.</p>
                            </div>
                        ) : rows.map((n) => {
                            const tone = TONE[toneOf(n)];
                            return (
                                <button
                                    key={n.id}
                                    type="button"
                                    onClick={() => openItem(n)}
                                    className={`relative w-full overflow-hidden text-left rounded-xl border p-3 pl-4 transition-colors ${
                                        n.is_read ? 'border-line bg-surface-base hover:bg-surface-hover/40' : 'border-blue-300/50 bg-blue-50/40 hover:bg-blue-50/70'
                                    }`}
                                >
                                    <span className={`absolute left-0 top-0 h-full w-1 ${tone.bar}`} />
                                    <div className="flex items-start justify-between gap-2">
                                        <p className="text-xs font-semibold text-ink-strong flex items-start gap-1.5 min-w-0">
                                            <tone.Icon size={13} className={`${tone.chip} shrink-0 mt-px`} />
                                            <span className="break-words min-w-0">{n.title}</span>
                                            {!n.is_read && <span className="h-1.5 w-1.5 rounded-full bg-blue-600 shrink-0 mt-1" />}
                                        </p>
                                        <span className="text-2xs text-ink-subtle shrink-0 whitespace-nowrap">{timeAgo(n.created_at)}</span>
                                    </div>
                                    {n.body && <p className="mt-1 text-2xs text-ink-muted break-words">{n.body}</p>}
                                    <div className="mt-1 flex items-center justify-between gap-2">
                                        {n.created_by_name
                                            ? <span className="text-2xs text-ink-subtle">from {n.created_by_name}</span>
                                            : <span />}
                                        {isActionable(n) && (
                                            <span className="text-2xs font-semibold text-blue-700 shrink-0">Open to review →</span>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </SheetContent>
            </Sheet>
        </>
    );
}
