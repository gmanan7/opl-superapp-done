import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '../../i18n';
import { PinRevealModal } from './PinRevealModal';
const USER = { id: 'w1', displayName: 'Anu Rao', roleLabel: 'Apprentice', primaryAssignment: 'C&C · Delta' };
describe('PinRevealModal (PATTERNS §5 UX, D-021 honest copy)', () => {
    it('PIN is fetched ONLY after reason capture; never in DOM before', async () => {
        const onReveal = vi.fn().mockResolvedValue({ pin: '4819' });
        render(<PinRevealModal open onOpenChange={() => { }} user={USER} onReveal={onReveal}/>);
        expect(screen.getByText('Generate new PIN for Anu Rao')).toBeInTheDocument(); // honest title
        const cta = screen.getByRole('button', { name: 'Generate new PIN' });
        expect(cta).toBeDisabled(); // no reason yet
        fireEvent.click(cta);
        expect(onReveal).not.toHaveBeenCalled();
        expect(document.body.textContent).not.toContain('4819');
        fireEvent.click(screen.getByLabelText('Audit verification'));
        expect(cta).toBeEnabled();
        fireEvent.click(cta);
        await waitFor(() => expect(onReveal).toHaveBeenCalledWith('audit', undefined));
        await waitFor(() => {
            // digits render in separate cells
            expect(screen.getByText('4')).toBeInTheDocument();
            expect(screen.getByText('9')).toBeInTheDocument();
        });
    });
    it('reason "other" requires text before the CTA enables', () => {
        const onReveal = vi.fn();
        render(<PinRevealModal open onOpenChange={() => { }} user={USER} onReveal={onReveal}/>);
        fireEvent.click(screen.getByLabelText('Other (specify)'));
        expect(screen.getByRole('button', { name: 'Generate new PIN' })).toBeDisabled();
        fireEvent.change(screen.getByPlaceholderText('Reason…'), { target: { value: 'shift handover' } });
        expect(screen.getByRole('button', { name: 'Generate new PIN' })).toBeEnabled();
    });
    it('B1: the countdown DECREMENTS every second (was static before)', async () => {
        vi.useFakeTimers();
        const onReveal = vi.fn().mockResolvedValue({ pin: '4819' });
        render(<PinRevealModal open onOpenChange={() => { }} user={USER} onReveal={onReveal} autoHideMs={12_000}/>);
        fireEvent.click(screen.getByLabelText('Audit verification'));
        fireEvent.click(screen.getByRole('button', { name: 'Generate new PIN' }));
        await vi.waitFor(() => expect(screen.getByTestId('pin-countdown')).toBeInTheDocument());
        expect(screen.getByTestId('pin-countdown')).toHaveTextContent('Hides automatically in 12 seconds');
        await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
        expect(screen.getByTestId('pin-countdown')).toHaveTextContent('Hides automatically in 11 seconds');
        await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
        expect(screen.getByTestId('pin-countdown')).toHaveTextContent('Hides automatically in 8 seconds');
        vi.useRealTimers();
    });
    it('presetPin (invite flow) starts revealed with a ticking countdown', async () => {
        vi.useFakeTimers();
        render(<PinRevealModal open onOpenChange={() => { }} user={USER} onReveal={async () => ({ pin: '' })} presetPin="7305" autoHideMs={12_000}/>);
        expect(screen.getByText('7')).toBeInTheDocument(); // revealed immediately, no reason step
        await vi.advanceTimersByTimeAsync(2000);
        expect(screen.getByTestId('pin-countdown')).toHaveTextContent('10 seconds');
        vi.useRealTimers();
    });
    it('auto-hides after the timeout (non-skippable)', async () => {
        vi.useFakeTimers();
        const onOpenChange = vi.fn();
        const onReveal = vi.fn().mockResolvedValue({ pin: '0042' });
        render(<PinRevealModal open onOpenChange={onOpenChange} user={USER} onReveal={onReveal} autoHideMs={1000}/>);
        fireEvent.click(screen.getByLabelText('Worker forgot PIN'));
        fireEvent.click(screen.getByRole('button', { name: 'Generate new PIN' }));
        await vi.waitFor(() => expect(onReveal).toHaveBeenCalled());
        await vi.advanceTimersByTimeAsync(1100);
        expect(onOpenChange).toHaveBeenCalledWith(false);
        vi.useRealTimers();
    });
});
