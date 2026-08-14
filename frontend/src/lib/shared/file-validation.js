// file-validation — SECURITY_VAPT §E1–E4 server-side checks for Step 8
// bulk-import uploads (csv/xlsx only; the upload is transient, never stored).
// Pure over bytes so the probe battery runs in Vitest as well as live.
export const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2MB raw
export const MAX_DATA_ROWS = 500;
// Known extensions for the double-extension probe (E2): a filename like
// report.exe.csv or KILLNOTES.EXE.xlsx is rejected even though it ends in an
// allowed extension. Dotted dates ("import_2026.06.11.csv") stay legal —
// numeric segments are not extensions.
const KNOWN_EXTENSIONS = new Set([
    'exe', 'dll', 'msi', 'scr', 'com', 'cmd', 'bat', 'sh', 'ps1', 'js', 'mjs',
    'jar', 'apk', 'html', 'htm', 'php', 'py', 'rb', 'pl', 'vbs', 'zip', 'rar',
    '7z', 'tar', 'gz', 'pdf', 'doc', 'docx', 'xls', 'ppt', 'pptx', 'jpg',
    'jpeg', 'png', 'gif', 'webp', 'svg', 'csv', 'xlsx', 'xlsm', 'txt',
]);
export function validateUploadName(filename, format) {
    const segments = filename.trim().toLowerCase().split('.');
    if (segments.length < 2)
        return { ok: false, code: 'invalid_file_type' };
    const ext = segments[segments.length - 1];
    // E1 allow-list + declared format must match the actual extension
    if ((ext !== 'csv' && ext !== 'xlsx') || ext !== format) {
        return { ok: false, code: 'invalid_file_type' };
    }
    // E2 double extension
    const inner = segments[segments.length - 2];
    if (segments.length > 2 && KNOWN_EXTENSIONS.has(inner)) {
        return { ok: false, code: 'invalid_file_type' };
    }
    return { ok: true };
}
const XLSX_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // PK\x03\x04
export function validateUploadBytes(bytes, format) {
    if (bytes.byteLength === 0)
        return { ok: false, code: 'invalid_file_content' };
    if (bytes.byteLength > MAX_FILE_BYTES)
        return { ok: false, code: 'file_too_large' };
    if (format === 'xlsx') {
        // E3 magic bytes: a renamed executable does not start with the zip header
        if (XLSX_MAGIC.some((b, i) => bytes[i] !== b)) {
            return { ok: false, code: 'invalid_file_content' };
        }
        return { ok: true };
    }
    // csv: must decode as UTF-8 (fatal) and carry no NUL bytes (binary content)
    try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        if (text.includes('\u0000'))
            return { ok: false, code: 'invalid_file_content' };
    }
    catch {
        return { ok: false, code: 'invalid_file_content' };
    }
    return { ok: true };
}
export const MAX_IMAGE_BYTES = 256 * 1024; // 256KB ceiling (compressed target is 150KB)
const IMAGE_EXT_TO_FORMAT = {
    jpg: 'jpeg', jpeg: 'jpeg', png: 'png', webp: 'webp',
};
export function validateImageName(filename) {
    const segments = filename.trim().toLowerCase().split('.');
    if (segments.length < 2)
        return { ok: false, code: 'invalid_file_type' };
    const ext = segments[segments.length - 1];
    if (!(ext in IMAGE_EXT_TO_FORMAT))
        return { ok: false, code: 'invalid_file_type' }; // E1 allow-list
    const inner = segments[segments.length - 2];
    if (segments.length > 2 && KNOWN_EXTENSIONS.has(inner)) {
        return { ok: false, code: 'invalid_file_type' }; // E2 double extension (e.g. photo.exe.jpg)
    }
    return { ok: true, ext };
}
export function detectImageMagic(bytes) {
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
        return 'jpeg';
    if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
        return 'png';
    if (bytes.length >= 12 &&
        bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && // RIFF
        bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50 // WEBP
    )
        return 'webp';
    return null;
}
export function validateImageBytes(bytes) {
    if (bytes.byteLength === 0)
        return { ok: false, code: 'invalid_file_content' };
    if (bytes.byteLength > MAX_IMAGE_BYTES)
        return { ok: false, code: 'file_too_large' };
    const format = detectImageMagic(bytes); // E3 magic-byte
    if (!format)
        return { ok: false, code: 'invalid_file_content' };
    return { ok: true, format };
}
export function decodeBase64(b64) {
    try {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++)
            bytes[i] = bin.charCodeAt(i);
        return bytes;
    }
    catch {
        return null;
    }
}
