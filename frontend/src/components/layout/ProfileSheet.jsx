import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { logout } from '../../lib/auth';
import { useAuth } from '../../hooks/useAuth';
import { useFactoryModules, buildEnabledSet } from '../../hooks/mdm';
import { NAV_CONFIG, visibleNav } from './navConfig';
export function ProfileSheet({ open, onOpenChange }) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { name, role } = useAuth();
    const enabled = buildEnabledSet(useFactoryModules().data);
    const adminNav = visibleNav(NAV_CONFIG, role, enabled, 'admin');
    async function handleLogout() {
        await logout();
        onOpenChange(false);
        navigate('/login', { replace: true });
    }
    function go(to) {
        onOpenChange(false);
        navigate(to);
    }
    return (<Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="bg-surface-raised">
        <SheetHeader>
          <SheetTitle className="text-ink-strong">{name || t('nav.profile')}</SheetTitle>
          {role && <SheetDescription className="text-ink-muted">{t(`roles.${role}`)}</SheetDescription>}
        </SheetHeader>
        <div className="space-y-4 py-4">
          {/* Master Data — mobile entry point for entitled roles (desktop has the sidebar) */}
          {adminNav.length > 0 && (<div>
              <p className="mb-2 text-2xs uppercase tracking-wider text-ink-muted">{t('mdm.nav')}</p>
              <div className="flex flex-col gap-1">
                {adminNav.map(({ to, icon: Icon, labelKey }) => (<button key={to} type="button" onClick={() => go(to)} className="flex min-h-touch items-center gap-3 rounded-lg px-3 text-left text-sm text-ink transition-colors hover:bg-surface-hover">
                    <Icon size={18} strokeWidth={1.8}/>
                    {t(labelKey)}
                  </button>))}
              </div>
            </div>)}

          <Button variant="outline" className="min-h-touch w-full justify-center gap-2" onClick={handleLogout}>
            <LogOut size={16}/> {t('common.logout')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>);
}
