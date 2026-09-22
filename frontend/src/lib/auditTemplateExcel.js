import * as XLSX from 'xlsx';

// Excel round-trip for building an audit: download a blank sheet, fill it in, upload it, preview
// every row, then load it into the New Audit form. Columns: Category | Question | Photo required.
// A blank Category on every row = a plain questions-only audit; any Category = categories + questions.
export const HEADERS = ['Category', 'Question', 'Photo required (Yes/No)'];
const MAX_ITEMS = 500;

export function downloadAuditTemplateSheet() {
  const rows = [
    { [HEADERS[0]]: 'Set In Order', [HEADERS[1]]: 'Floor markings and walkways are visible', [HEADERS[2]]: 'No' },
    { [HEADERS[0]]: 'Set In Order', [HEADERS[1]]: 'Tools have a marked place', [HEADERS[2]]: 'Yes' },
    { [HEADERS[0]]: 'Shine', [HEADERS[1]]: 'Machines are clean and free from leaks', [HEADERS[2]]: 'No' },
  ];
  const sheet = XLSX.utils.json_to_sheet(rows, { header: HEADERS });
  sheet['!cols'] = [{ wch: 24 }, { wch: 70 }, { wch: 24 }];
  const notes = XLSX.utils.aoa_to_sheet([
    ['How to fill this sheet'],
    ['1. Replace the three example rows on the "Questions" sheet with your own.'],
    ['2. Category: leave EMPTY on every row for a simple list of questions; fill it to group questions under categories.'],
    ['3. Question: required on every row.'],
    ['4. Photo required: Yes or No (empty = No).'],
    ['5. Save, then use "Import from Excel" in New Audit. You can review everything before it is saved.'],
  ]);
  notes['!cols'] = [{ wch: 110 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Questions');
  XLSX.utils.book_append_sheet(wb, notes, 'Instructions');
  XLSX.writeFile(wb, 'audit_template.xlsx');
}

const norm = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

// Pure: rows from sheet_to_json (header:1 arrays) -> { items, errors, structure, categories }.
export function parseAuditRows(matrix) {
  const errors = [];
  if (!Array.isArray(matrix) || matrix.length === 0) return { items: [], errors: ['The sheet is empty.'], structure: null, categories: [] };
  const head = (matrix[0] || []).map((h) => norm(h).toLowerCase());
  const iCat = head.findIndex((h) => h.startsWith('category'));
  const iQ = head.findIndex((h) => h.startsWith('question'));
  const iPhoto = head.findIndex((h) => h.startsWith('photo'));
  if (iQ < 0) return { items: [], errors: ['Could not find a "Question" column. Please use the downloaded template.'], structure: null, categories: [] };

  const items = [];
  const seen = new Set();
  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r] || [];
    const category = iCat >= 0 ? norm(row[iCat]) : '';
    const question = norm(row[iQ]);
    const photoRaw = iPhoto >= 0 ? norm(row[iPhoto]).toLowerCase() : '';
    if (!category && !question && !photoRaw) continue; // fully blank row
    const line = r + 1;
    const rowErrors = [];
    if (!question) rowErrors.push('Question is missing');
    let photo = false;
    if (photoRaw) {
      if (['yes', 'y', 'true', '1'].includes(photoRaw)) photo = true;
      else if (['no', 'n', 'false', '0'].includes(photoRaw)) photo = false;
      else rowErrors.push('Photo required must be Yes or No');
    }
    const key = `${category.toLowerCase()}|${question.toLowerCase()}`;
    if (question && seen.has(key)) rowErrors.push('Duplicate of an earlier row');
    seen.add(key);
    items.push({ line, category, question, photo, errors: rowErrors });
  }
  if (items.length === 0) errors.push('No questions found in the sheet.');
  if (items.length > MAX_ITEMS) errors.push(`Too many rows (${items.length}). The limit is ${MAX_ITEMS}.`);
  const withCat = items.filter((i) => i.category).length;
  const structure = withCat === 0 ? 'questions' : 'categories_questions';
  if (withCat > 0 && withCat < items.length) {
    items.filter((i) => !i.category).forEach((i) => i.errors.push('Category is empty (fill it on every row, or leave it empty on all rows)'));
  }
  const categories = [];
  for (const i of items) if (i.category && !categories.includes(i.category)) categories.push(i.category);
  return { items, errors, structure, categories };
}

export async function parseAuditFile(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const name = wb.SheetNames.find((n) => n.toLowerCase() === 'questions') || wb.SheetNames[0];
  const matrix = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', blankrows: false });
  return parseAuditRows(matrix);
}

export const hasBlockingErrors = (parsed) => !!parsed && (parsed.errors.length > 0 || parsed.items.some((i) => i.errors.length > 0));

// Shape the parsed rows into the New Audit form's state.
export function toFormState(parsed) {
  if (parsed.structure === 'questions') {
    return { structure: 'questions', flatQuestions: parsed.items.map((i) => ({ question_text: i.question, photo_required: i.photo })) };
  }
  return {
    structure: 'categories_questions',
    cats: parsed.categories.map((c) => ({
      name: c, photo_required: false,
      questions: parsed.items.filter((i) => i.category === c).map((i) => ({ question_text: i.question, photo_required: i.photo })),
    })),
  };
}
