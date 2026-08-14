import { describe, it, expect } from 'vitest';
import { validateImageName, validateImageBytes, detectImageMagic, MAX_IMAGE_BYTES, } from '../lib/shared/file-validation.js';
// §F E1–E4 image gate (validate-opl-image Edge reuses these pure functions).
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
const TEXT = new TextEncoder().encode('this is not an image at all');
describe('validateImageName — E1 allow-list + E2 double-extension', () => {
    it('allows jpg/jpeg/png/webp', () => {
        for (const f of ['a.jpg', 'a.jpeg', 'a.PNG', 'a.webp'])
            expect(validateImageName(f).ok).toBe(true);
    });
    it('rejects non-image extensions (E1)', () => {
        for (const f of ['a.txt', 'a.exe', 'a.svg', 'a.pdf', 'noext'])
            expect(validateImageName(f).ok).toBe(false);
    });
    it('rejects double extensions where the inner is a known type (E2)', () => {
        expect(validateImageName('photo.exe.jpg').ok).toBe(false);
        expect(validateImageName('x.php.png').ok).toBe(false);
    });
    it('allows dotted non-extension segments (dates)', () => {
        expect(validateImageName('img.2026.06.16.jpg').ok).toBe(true); // 06/16 are not known extensions
    });
});
describe('detectImageMagic — E3 magic-byte', () => {
    it('detects jpeg/png/webp from signatures', () => {
        expect(detectImageMagic(JPEG)).toBe('jpeg');
        expect(detectImageMagic(PNG)).toBe('png');
        expect(detectImageMagic(WEBP)).toBe('webp');
    });
    it('returns null for non-image bytes (a renamed file)', () => {
        expect(detectImageMagic(TEXT)).toBeNull();
    });
});
describe('validateImageBytes — E3 magic + E4 size', () => {
    it('accepts a real image signature', () => {
        expect(validateImageBytes(JPEG)).toEqual({ ok: true, format: 'jpeg' });
        expect(validateImageBytes(PNG).ok).toBe(true);
        expect(validateImageBytes(WEBP).ok).toBe(true);
    });
    it('rejects empty + non-image content', () => {
        expect(validateImageBytes(new Uint8Array(0)).code).toBe('invalid_file_content');
        expect(validateImageBytes(TEXT).code).toBe('invalid_file_content');
    });
    it('rejects oversize even with a valid signature (E4)', () => {
        const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
        big.set(JPEG, 0);
        expect(validateImageBytes(big)).toEqual({ ok: false, code: 'file_too_large' });
    });
});
