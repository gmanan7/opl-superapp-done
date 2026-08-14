// Step 8 — file validation (§E1–E4), CSV parsing, template header mapping
// and projection. The §E probe battery runs here in unit form; the same
// checks are probed live against the deployed bulk-import function.
import { describe, it, expect } from 'vitest';
import { validateUploadName, validateUploadBytes, decodeBase64, MAX_FILE_BYTES, } from '../lib/shared/file-validation.js';
import { parseCsv, toCsv } from '../lib/shared/csv.js';
import { WORKER_TEMPLATE, MACHINE_TEMPLATE, mapHeaders, projectObject, rowsFromAoa, } from '../lib/shared/import-templates.js';
describe('validateUploadName — §E1/E2', () => {
    it('accepts plain csv/xlsx matching the declared format', () => {
        expect(validateUploadName('workers.csv', 'csv').ok).toBe(true);
        expect(validateUploadName('Machines Final.XLSX', 'xlsx').ok).toBe(true);
    });
    it('rejects raw executables and unknown types (E1)', () => {
        expect(validateUploadName('KILLNOTES.exe', 'csv')).toEqual({ ok: false, code: 'invalid_file_type' });
        expect(validateUploadName('data.txt', 'csv').ok).toBe(false);
        expect(validateUploadName('noextension', 'csv').ok).toBe(false);
    });
    it('rejects double extensions (E2)', () => {
        expect(validateUploadName('file.exe.csv', 'csv').ok).toBe(false);
        expect(validateUploadName('KILLNOTES.EXE.xlsx', 'xlsx').ok).toBe(false);
        expect(validateUploadName('report.pdf.csv', 'csv').ok).toBe(false);
    });
    it('rejects extension/format mismatch (renaming cannot switch parsers)', () => {
        expect(validateUploadName('workers.csv', 'xlsx').ok).toBe(false);
        expect(validateUploadName('workers.xlsx', 'csv').ok).toBe(false);
    });
    it('allows dotted dates — numeric segments are not extensions', () => {
        expect(validateUploadName('import_2026.06.11.csv', 'csv').ok).toBe(true);
    });
});
describe('validateUploadBytes — §E3/E4', () => {
    const PK = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]);
    const MZ = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03]); // PE header start
    it('xlsx must start with the zip magic (renamed executable rejected, E3)', () => {
        expect(validateUploadBytes(PK, 'xlsx').ok).toBe(true);
        expect(validateUploadBytes(MZ, 'xlsx')).toEqual({ ok: false, code: 'invalid_file_content' });
    });
    it('csv must UTF-8-decode without NUL bytes (binary rejected)', () => {
        expect(validateUploadBytes(new TextEncoder().encode('name,role\nराम,on_roll'), 'csv').ok).toBe(true);
        expect(validateUploadBytes(MZ, 'csv').ok).toBe(false); // contains NUL
        expect(validateUploadBytes(new Uint8Array([0xff, 0xfe, 0x41]), 'csv').ok).toBe(false); // invalid UTF-8
    });
    it('enforces the 2MB cap (E4) and rejects empty bodies', () => {
        expect(validateUploadBytes(new Uint8Array(MAX_FILE_BYTES + 1), 'csv')).toEqual({
            ok: false,
            code: 'file_too_large',
        });
        expect(validateUploadBytes(new Uint8Array(0), 'csv').ok).toBe(false);
    });
});
describe('decodeBase64', () => {
    it('round-trips and rejects garbage', () => {
        const bytes = decodeBase64(btoa('a,b\n1,2'));
        expect(bytes && new TextDecoder().decode(bytes)).toBe('a,b\n1,2');
        expect(decodeBase64('!!!not base64!!!')).toBeNull();
    });
});
describe('parseCsv — RFC 4180', () => {
    it('parses quoted fields, escaped quotes, CRLF and BOM', () => {
        const text = '﻿name,note\r\n"Patel, Ram","said ""hello"""\nplain,row';
        expect(parseCsv(text)).toEqual([
            ['name', 'note'],
            ['Patel, Ram', 'said "hello"'],
            ['plain', 'row'],
        ]);
    });
    it('handles multiline quoted fields and trailing newline', () => {
        expect(parseCsv('a,b\n"line1\nline2",x\n')).toEqual([
            ['a', 'b'],
            ['line1\nline2', 'x'],
        ]);
    });
    it('toCsv escapes commas, quotes and newlines (error-file regeneration)', () => {
        const rows = [['a"b', 'c,d'], ['plain', 'line\nbreak']];
        expect(parseCsv(toCsv(rows))).toEqual(rows);
    });
});
describe('mapHeaders / projection — approved Step 8 semantics', () => {
    it('maps case/whitespace-insensitively', () => {
        const m = mapHeaders([' Name ', 'ROLE', 'jh group code'], WORKER_TEMPLATE);
        expect([...m.byIndex.values()]).toEqual(['name', 'role', 'jh_group_code']);
        expect(m.unusable).toBe(false);
    });
    it('collects unknown headers without failing the file', () => {
        const m = mapHeaders(['name', 'role', 'salary'], WORKER_TEMPLATE);
        expect(m.unknownHeaders).toEqual(['salary']);
        expect(m.unusable).toBe(false);
    });
    it('flags the file unusable when NO required header maps (wrong template)', () => {
        expect(mapHeaders(['foo', 'bar'], WORKER_TEMPLATE).unusable).toBe(true);
        expect(mapHeaders(['name'], MACHINE_TEMPLATE).unusable).toBe(false);
    });
    it('rowsFromAoa skips fully blank lines and keeps original row numbers', () => {
        const { rows } = rowsFromAoa([
            ['name', 'role'],
            ['Ram', 'on_roll'],
            ['', ''],
            ['Sita', 'apprentice'],
        ], WORKER_TEMPLATE);
        expect(rows.map((r) => r.row_number)).toEqual([1, 3]);
        expect(rows[1].data).toEqual({ name: 'Sita', role: 'apprentice' });
    });
    it('projectObject strips keys outside the template (commit-path hash safety)', () => {
        const out = projectObject({ name: 'Ram', role: 'on_roll', injected: 'x' }, WORKER_TEMPLATE);
        expect(out).toEqual({ name: 'Ram', role: 'on_roll' });
    });
    it('projection drops empty cells so CSV blanks hash like XLSX missing', () => {
        const out = projectObject({ name: 'Ram', role: 'on_roll', dmt_code: '  ' }, WORKER_TEMPLATE);
        expect(out.dmt_code).toBeUndefined();
    });
});
