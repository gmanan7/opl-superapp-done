import * as XLSX from 'xlsx';

// Excel round-trip for onboarding people: download the template, fill it in, upload it, preview
// (validated by the server), then submit. Columns mirror what the database actually needs.
export const PEOPLE_HEADERS = ['Employee ID', 'Name', 'Email', 'Role', 'Plant', 'Department', 'Module', 'JH Group'];
const FIELD_BY_HEADER = {
  'employee id': 'emp_id', 'emp id': 'emp_id', 'name': 'name', 'email': 'email', 'role': 'role',
  'plant': 'plant', 'department': 'department', 'module': 'module', 'jh group': 'jh_group',
};
const norm = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

export function downloadPeopleTemplate(meta) {
  const plant = meta?.plants?.[0]?.code || 'TVT';
  const rows = [
    ['1001', 'Example Operator', 'operator.example@itc.in', meta?.roles?.find((r) => r.code === 'operator')?.name || 'Operator', plant, meta?.departments?.[0]?.name || '', meta?.modules?.[0]?.name || '', meta?.jhGroups?.[0]?.name || ''],
    ['1002', 'Example Leader', 'leader.example@itc.in', meta?.roles?.find((r) => r.code === 'jh_lead')?.name || 'JH Lead', plant, meta?.departments?.[0]?.name || '', meta?.modules?.[0]?.name || '', meta?.jhGroups?.[0]?.name || ''],
  ];
  const sheet = XLSX.utils.aoa_to_sheet([PEOPLE_HEADERS, ...rows]);
  sheet['!cols'] = [14, 26, 30, 18, 10, 20, 12, 22].map((wch) => ({ wch }));
  const lists = [
    ['Roles', 'Plants', 'Departments', 'Modules', 'JH Groups'],
  ];
  const cols = [
    (meta?.roles || []).map((r) => r.name),
    (meta?.plants || []).map((p) => p.code),
    [...new Set((meta?.departments || []).map((d) => d.name))],
    (meta?.modules || []).map((m) => m.name),
    (meta?.jhGroups || []).map((g) => g.name),
  ];
  const n = Math.max(...cols.map((c) => c.length), 0);
  for (let i = 0; i < n; i++) lists.push(cols.map((c) => c[i] ?? ''));
  const listSheet = XLSX.utils.aoa_to_sheet(lists);
  listSheet['!cols'] = [20, 10, 22, 14, 26].map((wch) => ({ wch }));
  const notes = XLSX.utils.aoa_to_sheet([
    ['How to fill this sheet'],
    ['1. Replace the two example rows on the "People" sheet with your own (delete any you do not need).'],
    ['2. Every column is required on every row: Employee ID, Name, Email, Role, Plant, Department, Module, JH Group.'],
    ['3. Role, Plant, Department, Module and JH Group must match the "Lists" sheet exactly (case does not matter).'],
    ['4. Employee ID and Email must be new — existing people are never changed by an import.'],
    ['5. Passwords are not entered here. A temporary password is generated for each person after you confirm.'],
    ['6. Save, then use "Import from Excel" on the People page. You review everything before anyone is created.'],
  ]);
  notes['!cols'] = [{ wch: 110 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'People');
  XLSX.utils.book_append_sheet(wb, listSheet, 'Lists');
  XLSX.utils.book_append_sheet(wb, notes, 'Instructions');
  XLSX.writeFile(wb, 'people_onboarding_template.xlsx');
}

// Pure: matrix (header row + data rows) -> { rows, errors }. Each row keeps its sheet line number.
export function parsePeopleMatrix(matrix) {
  if (!Array.isArray(matrix) || matrix.length === 0) return { rows: [], errors: ['The sheet is empty.'] };
  const head = (matrix[0] || []).map((h) => FIELD_BY_HEADER[norm(h).toLowerCase()] || null);
  const need = ['emp_id', 'name', 'email', 'role', 'plant', 'department', 'module', 'jh_group'];
  const missing = need.filter((f) => !head.includes(f));
  if (missing.length) return { rows: [], errors: [`Missing column(s): ${missing.join(', ')}. Please use the downloaded template.`] };
  const rows = [];
  for (let r = 1; r < matrix.length; r++) {
    const cells = matrix[r] || [];
    const row = { line: r + 1 };
    head.forEach((f, i) => { if (f) row[f] = norm(cells[i]); });
    if (!Object.entries(row).some(([k, v]) => k !== 'line' && v)) continue; // blank row
    rows.push(row);
  }
  const errors = [];
  // Every column is mandatory: a file with any empty cell is rejected outright (nothing is previewed or sent).
  const LABEL = { emp_id: 'Employee ID', name: 'Name', email: 'Email', role: 'Role', plant: 'Plant', department: 'Department', module: 'Module', jh_group: 'JH Group' };
  for (const r of rows) {
    const empty = need.filter((f) => !r[f]);
    if (empty.length) errors.push('Row ' + r.line + ': ' + empty.map((f) => LABEL[f]).join(', ') + ' is empty');
  }
  if (errors.length) errors.unshift('File not accepted — every column must be filled on every row. Fix the rows below and upload again.');
  if (rows.length === 0) errors.push('No people found in the sheet.');
  if (rows.length > 500) errors.push(`Too many rows (${rows.length}). The limit is 500 per import.`);
  return { rows, errors };
}

export async function parsePeopleFile(file) {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const name = wb.SheetNames.find((n) => n.toLowerCase() === 'people') || wb.SheetNames[0];
  return parsePeopleMatrix(XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', blankrows: false, raw: false }));
}

// Credentials sheet after onboarding / reset (temporary passwords — shown once).
export function downloadCredentials(results) {
  const rows = results.map((r) => ({
    'Employee ID': r.resolved.emp_id, Name: r.resolved.name, Role: r.resolved.role_name || '', Plant: r.resolved.plant_code || '',
    'Temporary password': r.temp_password,
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [14, 26, 18, 10, 22].map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Credentials');
  XLSX.writeFile(wb, 'new_user_credentials.xlsx');
}
