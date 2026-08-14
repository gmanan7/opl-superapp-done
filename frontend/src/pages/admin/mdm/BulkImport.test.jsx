// Step 8 — BulkImport flow tests: preview rendering with tiers, confirm
// gating at 0 commitable rows, commit result with PIN one-shot wipe, and the
// hash-payload contract (error rows are never sent to commit).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '../../../i18n';
const { mocks } = vi.hoisted(() => {
    const mocks = {
        parseUpload: vi.fn(),
        previewFile: vi.fn(),
        commitRows: vi.fn(),
        acknowledgePins: vi.fn(),
        abandonBatch: vi.fn(),
        downloadTemplate: vi.fn(),
        downloadErrorRows: vi.fn(),
    };
    return { mocks };
});
vi.mock('../../../lib/bulkImport', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, ...mocks };
});
vi.mock('@/hooks/mdm', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        useOrgStructure: vi.fn(() => ({
            data: {
                dmts: [{ id: 'd1', factory_id: 'f1', name: 'Delta', code: 'DL', created_at: null, jhGroups: [] }],
                unassignedJhGroups: [],
            },
            isLoading: false,
            error: null,
        })),
    };
});
import { BulkImport } from './BulkImport';
const UPLOAD = {
    filename: 'workers.csv',
    format: 'csv',
    fileB64: 'xxx',
    rows: [
        { row_number: 1, data: { name: 'Ram', role: 'on_roll', jh_group_code: 'CNC' } },
        { row_number: 2, data: { name: 'Sita', role: 'apprentice', jh_group_code: 'PRINT', apprentice_type: 'NAPS' } },
        { row_number: 3, data: { name: 'Broken', role: 'boss' } },
    ],
    ignoredHeaders: [],
};
const PREVIEW = {
    batch_id: 'b1',
    totals: { total: 3, valid: 2, warning: 0, invalid: 1 },
    ignored_headers: [],
    rows: [
        { row_number: 1, tier: 'ok', codes: [] },
        { row_number: 2, tier: 'ok', codes: [] },
        { row_number: 3, tier: 'error', codes: [{ field: 'role', code: 'invalid_role' }] },
    ],
};
function renderFlow() {
    return render(<MemoryRouter>
      <BulkImport entity="workers"/>
    </MemoryRouter>);
}
async function toPreview() {
    renderFlow();
    const input = screen.getByTestId('import-file-input');
    fireEvent.change(input, { target: { files: [new File(['x'], 'workers.csv')] } });
    await waitFor(() => expect(screen.getByTestId('preview-row-1')).toBeInTheDocument());
}
beforeEach(() => {
    vi.clearAllMocks();
    mocks.parseUpload.mockResolvedValue(UPLOAD);
    mocks.previewFile.mockResolvedValue(PREVIEW);
    mocks.acknowledgePins.mockResolvedValue({ success: true });
    mocks.abandonBatch.mockResolvedValue({ success: true });
});
describe('upload step', () => {
    it('renders template downloads and the reference panel', () => {
        renderFlow();
        expect(screen.getByText('XLSX template')).toBeInTheDocument();
        expect(screen.getByText('CSV template')).toBeInTheDocument();
        expect(screen.getByText('Reference codes')).toBeInTheDocument();
        fireEvent.click(screen.getByText('CSV template'));
        expect(mocks.downloadTemplate).toHaveBeenCalledWith('workers', 'csv', expect.anything());
    });
});
describe('preview step', () => {
    it('shows per-row tiers with translated codes and the totals strip', async () => {
        await toPreview();
        expect(screen.getByText('2 OK')).toBeInTheDocument();
        expect(screen.getByText('1 errors')).toBeInTheDocument();
        expect(screen.getByTestId('preview-row-3')).toHaveTextContent('Role is not valid');
    });
    it('commit sends ONLY non-error rows in preview order', async () => {
        mocks.commitRows.mockResolvedValue({
            batch_id: 'b1', committed_count: 2, discrepancy_count: 0, stale_count: 0,
            created: [], skipped: [],
        });
        await toPreview();
        fireEvent.click(screen.getByText('Commit 2 rows'));
        // ConfirmModal primary
        fireEvent.click(screen.getByRole('button', { name: 'Commit 2 rows' }));
        await waitFor(() => expect(mocks.commitRows).toHaveBeenCalledTimes(1));
        const [, , rows] = mocks.commitRows.mock.calls[0];
        expect(rows).toEqual([UPLOAD.rows[0].data, UPLOAD.rows[1].data]);
    });
    it('discard abandons the batch and returns to upload', async () => {
        await toPreview();
        fireEvent.click(screen.getByText('Discard'));
        await waitFor(() => expect(mocks.abandonBatch).toHaveBeenCalledWith('b1'));
        expect(screen.getByText('Reference codes')).toBeInTheDocument();
    });
    it('disables commit when nothing is commitable', async () => {
        mocks.previewFile.mockResolvedValue({
            ...PREVIEW,
            totals: { total: 1, valid: 0, warning: 0, invalid: 1 },
            rows: [{ row_number: 1, tier: 'error', codes: [{ field: 'role', code: 'invalid_role' }] }],
        });
        renderFlow();
        fireEvent.change(screen.getByTestId('import-file-input'), { target: { files: [new File(['x'], 'w.csv')] } });
        await waitFor(() => expect(screen.getByTestId('preview-row-1')).toBeInTheDocument());
        expect(screen.getByRole('button', { name: 'Commit 0 rows' })).toBeDisabled();
    });
});
describe('result step — PIN one-shot contract (D-021, bulk edition)', () => {
    async function toResult() {
        mocks.commitRows.mockResolvedValue({
            batch_id: 'b1', committed_count: 2, discrepancy_count: 1, stale_count: 1,
            created: [
                { row_number: 1, entity_id: 'w-1', pin: '1234' },
                { row_number: 2, entity_id: 'w-2', pin: '5678' },
            ],
            skipped: [{ row_number: 2, reason: 'stale_at_commit', field: 'employee_id', detail: 'employee_id_duplicate_in_db' }],
        });
        await toPreview();
        fireEvent.click(screen.getByText('Commit 2 rows'));
        fireEvent.click(screen.getByRole('button', { name: 'Commit 2 rows' }));
        await waitFor(() => expect(screen.getByText('2 created')).toBeInTheDocument());
    }
    it('surfaces stale and discrepancy counts distinctly', async () => {
        await toResult();
        expect(screen.getByText('1 skipped — changed since preview')).toBeInTheDocument();
        expect(screen.getByText('1 skipped — did not match preview')).toBeInTheDocument();
    });
    it('shows PINs once, blocks Done until cleared, then wipes them', async () => {
        await toResult();
        expect(screen.getByText('1234')).toBeInTheDocument();
        expect(screen.getByText('5678')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();
        fireEvent.click(screen.getByText("I've distributed all PINs — clear from screen"));
        await waitFor(() => expect(mocks.acknowledgePins).toHaveBeenCalledWith('b1'));
        expect(screen.queryByText('1234')).not.toBeInTheDocument();
        expect(screen.queryByText('5678')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Done' })).toBeEnabled();
    });
});
