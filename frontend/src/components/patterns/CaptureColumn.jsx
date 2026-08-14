import { cn } from '@/lib/utils';
export function CaptureColumn({ children, className, variant = 'reading', }) {
    const width = variant === 'wide' ? 'md:w-4/5' : 'max-w-3xl';
    return <div className={cn('mx-auto w-full px-gutter md:px-gutter-lg', width, className)}>{children}</div>;
}
