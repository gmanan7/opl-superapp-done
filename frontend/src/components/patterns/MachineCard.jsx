import { cn } from '@/lib/utils';
export function MachineCard({ header, children, footer, stickyFooter = true, className }) {
    return (<section className={cn('rounded-lg border border-line bg-surface-raised shadow-sm', className)}>
      <div className="border-b border-line-subtle px-4 py-4 md:px-5">{header}</div>
      <div className="px-4 md:px-5">{children}</div>
      {footer && (<div className={cn('rounded-b-lg border-t border-line-subtle bg-surface-raised px-4 py-3 md:px-5', stickyFooter && 'md:sticky md:bottom-0')}>
          {footer}
        </div>)}
    </section>);
}
