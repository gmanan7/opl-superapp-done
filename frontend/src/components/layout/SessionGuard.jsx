import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { clearSession, LOGIN_AT_KEY } from '../../lib/auth';
import { safeStorage } from '../../lib/safeStorage';
import { shouldExpire, shouldWarn, IDLE_MS, ABSOLUTE_MS, WARN_MS, POLL_MS, ACTIVITY_THROTTLE_MS, } from '../../lib/sessionTimeout';
const LAST_ACTIVITY_KEY = 'tpm_last_activity';
const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'touchstart', 'click'];
export function SessionGuard({ children, idleMs = IDLE_MS, absoluteMs = ABSOLUTE_MS, warnMs = WARN_MS, pollMs = POLL_MS, }) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [warning, setWarning] = useState(false);
    const lastWriteRef = useRef(0);
    const bumpActivity = useCallback((force = false) => {
        const now = Date.now();
        if (!force && now - lastWriteRef.current < ACTIVITY_THROTTLE_MS)
            return;
        lastWriteRef.current = now;
        safeStorage.setItem(LAST_ACTIVITY_KEY, String(now));
        setWarning(false);
    }, []);
    useEffect(() => {
        if (!safeStorage.getItem(LOGIN_AT_KEY))
            safeStorage.setItem(LOGIN_AT_KEY, String(Date.now()));
        bumpActivity(true);
    }, [bumpActivity]);
    useEffect(() => {
        const handler = () => bumpActivity();
        ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, handler, { passive: true }));
        return () => ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, handler));
    }, [bumpActivity]);
    useEffect(() => {
        const onStorage = (e) => {
            if (e.key === LAST_ACTIVITY_KEY)
                setWarning(false);
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);
    useEffect(() => {
        function doLogout(reason) {
            clearSession();
            safeStorage.removeItem(LAST_ACTIVITY_KEY);
            navigate(`/login?reason=session_timeout&cause=${reason}`, { replace: true });
        }
        function tick() {
            const now = Date.now();
            const lastActivity = Number(safeStorage.getItem(LAST_ACTIVITY_KEY) ?? now);
            const loginAt = Number(safeStorage.getItem(LOGIN_AT_KEY) ?? now);
            const reason = shouldExpire({ lastActivity, loginAt, now }, idleMs, absoluteMs);
            if (reason) {
                doLogout(reason);
                return;
            }
            setWarning(shouldWarn({ lastActivity, now }, idleMs, warnMs));
        }
        const id = setInterval(tick, pollMs);
        return () => clearInterval(id);
    }, [navigate, idleMs, absoluteMs, warnMs, pollMs]);
    return (<>
      {warning && (<div role="alert" className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-3 border-b border-warning-border bg-warning-bg px-4 py-2 text-sm text-warning-fg">
          <span>▲ {t('common.sessionExpiring')}</span>
          <button type="button" onClick={() => bumpActivity(true)} className="min-h-touch font-semibold underline underline-offset-2">
            {t('common.staySignedIn')}
          </button>
        </div>)}
      {children}
    </>);
}
