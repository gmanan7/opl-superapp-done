import { cn } from '@/lib/utils';
export function CaptureColumn({ children, className, variant = 'reading', }) {
    const width = variant === 'wide' ? 'md:w-4/5' : 'max-w-3xl';
    // min-w-0 so this column can shrink inside the flex shell instead of being
    // held open by a wide descendant (see the guardrail note in src/index.css).
    return <div className={cn('mx-auto w-full min-w-0 px-gutter md:px-gutter-lg', width, className)}>{children}</div>;
}
