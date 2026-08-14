import { describe, it, expect, vi } from 'vitest';
// Inline the PIN-generation algorithm — tests the algorithm directly, not via import.
function generatePIN() {
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    return String(array[0] % 1000000).padStart(6, '0');
}
describe('generatePIN', () => {
    it('produces a 6-character string', () => {
        for (let i = 0; i < 50; i++) {
            expect(generatePIN()).toHaveLength(6);
        }
    });
    it('contains only digits', () => {
        for (let i = 0; i < 50; i++) {
            expect(generatePIN()).toMatch(/^\d{6}$/);
        }
    });
    it('left-pads with zeros when value < 100000', () => {
        // Verify padStart works: the lowest possible output is '000000'
        // We can force it by mocking getRandomValues
        const originalGetRandomValues = crypto.getRandomValues.bind(crypto);
        const mock = (arr) => { arr[0] = 5; return arr; };
        Object.defineProperty(crypto, 'getRandomValues', { value: mock, writable: true, configurable: true });
        expect(generatePIN()).toBe('000005');
        Object.defineProperty(crypto, 'getRandomValues', { value: originalGetRandomValues, writable: true, configurable: true });
    });
    it('does not use Math.random (uses crypto)', () => {
        // Math.random is not called — this ensures the crypto path is used
        const spy = vi.spyOn(Math, 'random');
        generatePIN();
        expect(spy).not.toHaveBeenCalled();
    });
    it('generates different PINs across calls (entropy check)', () => {
        const pins = new Set(Array.from({ length: 20 }, generatePIN));
        // 20 PINs from 1,000,000 possibilities — collision probability is negligible
        expect(pins.size).toBeGreaterThan(10);
    });
});
