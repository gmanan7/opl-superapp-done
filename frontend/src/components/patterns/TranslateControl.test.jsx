import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '../../i18n';
import i18n from '../../i18n';
import { TranslateControl } from './TranslateControl';
const ORIGINAL = 'મીટિંગમાં problem હતો';
beforeEach(async () => { await i18n.changeLanguage('en'); });
describe('<TranslateControl> — PATTERNS §2 (original never destroyed)', () => {
    it('renders the original verbatim by default with its lang attribute', () => {
        render(<TranslateControl originalText={ORIGINAL} originalLang="gu" onTranslate={vi.fn()}/>);
        const p = screen.getByText(ORIGINAL);
        expect(p).toBeInTheDocument();
        expect(p).toHaveAttribute('lang', 'gu');
    });
    it('round-trip: translate → show translation → toggle back → original byte-identical', async () => {
        const onTranslate = vi.fn().mockResolvedValue({ translatedText: 'meeting had a problem', sourceLang: 'gu' });
        render(<TranslateControl originalText={ORIGINAL} originalLang="gu" defaultTarget="en" onTranslate={onTranslate}/>);
        fireEvent.click(screen.getByRole('button', { name: /Translate/i }));
        await waitFor(() => expect(screen.getByText('meeting had a problem')).toBeVisible());
        expect(onTranslate).toHaveBeenCalledWith({ target: 'en', source: 'gu', sourceAsserted: true });
        // Original still in the DOM (never destroyed), just hidden
        expect(screen.getByText(ORIGINAL)).toBeInTheDocument();
        // Toggle back
        fireEvent.click(screen.getByRole('button', { name: /Show original/i }));
        const orig = screen.getByText(ORIGINAL);
        expect(orig).toBeVisible();
        expect(orig.textContent).toBe(ORIGINAL); // byte-identical
    });
    it('surfaces the disabled policy code as a graceful inline error (original intact)', async () => {
        const onTranslate = vi.fn().mockResolvedValue({ translatedText: '', sourceLang: 'gu', code: 'translation_disabled' });
        render(<TranslateControl originalText={ORIGINAL} originalLang="gu" onTranslate={onTranslate}/>);
        fireEvent.click(screen.getByRole('button', { name: /Translate/i }));
        await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
        expect(screen.getByText(ORIGINAL)).toBeVisible();
    });
    it('surfaces a thrown failure without losing the original', async () => {
        const onTranslate = vi.fn().mockRejectedValue(new Error('network'));
        render(<TranslateControl originalText={ORIGINAL} originalLang="gu" onTranslate={onTranslate}/>);
        fireEvent.click(screen.getByRole('button', { name: /Translate/i }));
        await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
        expect(screen.getByText(ORIGINAL)).toBeVisible();
    });
});
