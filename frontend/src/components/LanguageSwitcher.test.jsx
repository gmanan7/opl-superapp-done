import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
const rpc = vi.fn();
vi.mock('../lib/supabase', () => ({ supabase: { rpc: (...args) => rpc(...args) } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));
import i18n from '../i18n';
import { LanguageSwitcher } from './LanguageSwitcher';
beforeEach(async () => {
    localStorage.clear();
    rpc.mockReset().mockResolvedValue({ error: null });
    await i18n.changeLanguage('en');
});
describe('<LanguageSwitcher variant="links" />', () => {
    it('renders all four languages by native name', () => {
        render(<LanguageSwitcher variant="links"/>);
        expect(screen.getByText('English')).toBeInTheDocument();
        expect(screen.getByText('हिन्दी')).toBeInTheDocument();
        expect(screen.getByText('ગુજરાતી')).toBeInTheDocument();
        expect(screen.getByText('தமிழ்')).toBeInTheDocument();
    });
    it('renders Tamil as selectable (Step 5 — D-008 gate open)', () => {
        render(<LanguageSwitcher variant="links"/>);
        expect(screen.getByText('தமிழ்').closest('button')).toBeEnabled();
        expect(screen.getByText('हिन्दी').closest('button')).toBeEnabled();
    });
    it('tags each native label with lang= so glyphs shape per script (PATTERNS rule 919)', () => {
        render(<LanguageSwitcher variant="links"/>);
        expect(screen.getByText('ગુજરાતી').closest('button')).toHaveAttribute('lang', 'gu');
        expect(screen.getByText('தமிழ்').closest('button')).toHaveAttribute('lang', 'ta');
    });
    it('clicking a selectable language switches i18n (pre-auth: no session)', async () => {
        render(<LanguageSwitcher variant="links"/>);
        await act(async () => { fireEvent.click(screen.getByText('हिन्दी')); });
        expect(i18n.language).toBe('hi');
        expect(localStorage.getItem('tpm_ui_lang')).toBe('hi');
    });
});
describe('<LanguageSwitcher variant="dropdown" />', () => {
    it('shows the current language native name in the trigger', () => {
        render(<LanguageSwitcher variant="dropdown"/>);
        expect(screen.getByText('English')).toBeInTheDocument();
    });
});
