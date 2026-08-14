// csv — minimal RFC-4180 parser for Step 8 bulk import (CSV path).
// Dependency-free so it runs identically in Deno (Edge) and Vitest.
// Handles quoted fields, escaped quotes (""), CR/LF/CRLF, and a UTF-8 BOM.
export function parseCsv(text) {
    const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    let i = 0;
    const endField = () => {
        row.push(field);
        field = '';
    };
    const endRow = () => {
        endField();
        rows.push(row);
        row = [];
    };
    while (i < src.length) {
        const ch = src[i];
        if (inQuotes) {
            if (ch === '"') {
                if (src[i + 1] === '"') {
                    field += '"';
                    i += 2;
                }
                else {
                    inQuotes = false;
                    i++;
                }
            }
            else {
                field += ch;
                i++;
            }
        }
        else if (ch === '"' && field === '') {
            inQuotes = true;
            i++;
        }
        else if (ch === ',') {
            endField();
            i++;
        }
        else if (ch === '\r') {
            endRow();
            i += src[i + 1] === '\n' ? 2 : 1;
        }
        else if (ch === '\n') {
            endRow();
            i++;
        }
        else {
            field += ch;
            i++;
        }
    }
    if (field !== '' || row.length > 0)
        endRow();
    return rows;
}
/** Serialize rows back to CSV (error-file download, client side). */
export function toCsv(rows) {
    return rows
        .map((r) => r
        .map((cell) => {
        const s = String(cell ?? '');
        return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    })
        .join(','))
        .join('\r\n');
}
