import { useStorageUrl } from '../../hooks/useStorageUrl';
const CLASS_LABEL = {
    know_how: 'Basic Knowledge',
    problem_alert: 'Problem Alert',
    std_change: 'Standard Change',
};
function PrintImage({ url, alt }) {
    const resolvedUrl = useStorageUrl(url);
    if (!resolvedUrl) {
        return (<div style={{ height: '160px', background: '#f5f5f4', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a8a29e', fontSize: '12px' }}>
        No image
      </div>);
    }
    return (<img src={resolvedUrl} alt={alt} style={{ width: '100%', maxHeight: '200px', objectFit: 'cover', borderRadius: '4px', display: 'block' }}/>);
}
// ─── OPLPrintView ─────────────────────────────────────────────────────────────
// A4 landscape = 1122px wide at 96 dpi.
// Apply class="opl-print-view" on the outermost div.
// For OPLDetail: embed off-screen (position:absolute; left:-9999px).
// For OPLList: use inside PrintFrame portal with page-break-after between items.
export function OPLPrintView({ opl, serialNo }) {
    const sNo = serialNo ?? 1;
    return (<div className="opl-print-view" style={{
            width: '1122px',
            fontFamily: 'Arial, sans-serif',
            fontSize: '12px',
            color: '#1c1917',
            background: '#fff',
            border: '1px solid #78716c',
        }}>
      {/* ── Header row ── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', borderBottom: '2px solid #78716c' }}>
        <tbody>
          <tr>
            {/* Left: TPM / JH placeholder */}
            <td style={{ width: '180px', padding: '8px 12px', borderRight: '1px solid #d6d3d1', verticalAlign: 'middle' }}>
              <div style={{ fontSize: '11px', color: '#78716c', fontWeight: 600, lineHeight: 1.4 }}>
                <div>ITC PAPERBOARDS</div>
                <div>NPF NADIAD</div>
              </div>
            </td>

            {/* Centre: title */}
            <td style={{ padding: '8px 12px', textAlign: 'center', verticalAlign: 'middle' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '0.05em', color: '#1c1917' }}>
                  ONE POINT LESSON
                </span>
                {opl.is_star && (<span style={{ background: '#fef3c7', color: '#b45309', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', fontWeight: 700 }}>
                    ★ Star OPL
                  </span>)}
              </div>
              <div style={{ fontSize: '10px', color: '#78716c', marginTop: '2px' }}>TPM — Jishu Hozen Pillar</div>
            </td>

            {/* Right: classification badge */}
            <td style={{ width: '160px', padding: '8px 12px', borderLeft: '1px solid #d6d3d1', textAlign: 'center', verticalAlign: 'middle' }}>
              {opl.opl_type ? (<span style={{
                display: 'inline-block',
                padding: '4px 10px',
                borderRadius: '4px',
                fontWeight: 700,
                fontSize: '11px',
                background: opl.opl_type === 'know_how' ? '#dbeafe' : opl.opl_type === 'problem_alert' ? '#fee2e2' : '#ede9fe',
                color: opl.opl_type === 'know_how' ? '#1d4ed8' : opl.opl_type === 'problem_alert' ? '#dc2626' : '#7c3aed',
            }}>
                  {CLASS_LABEL[opl.opl_type] ?? opl.opl_type}
                </span>) : (<span style={{ color: '#a8a29e', fontSize: '11px' }}>—</span>)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── Metadata row ── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', borderBottom: '1px solid #d6d3d1' }}>
        <tbody>
          <tr>
            {/* Left metadata */}
            <td style={{ padding: '6px 12px', verticalAlign: 'top', borderRight: '1px solid #d6d3d1', width: '60%' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr>
                    <td style={{ padding: '2px 0', width: '130px', fontWeight: 600, color: '#57534e', fontSize: '11px' }}>Theme / Title:</td>
                    <td style={{ padding: '2px 0', fontWeight: 700, fontSize: '12px' }}>{opl.title}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '2px 0', fontWeight: 600, color: '#57534e', fontSize: '11px' }}>Classification:</td>
                    <td style={{ padding: '2px 0', fontSize: '11px' }}>{opl.opl_type ? CLASS_LABEL[opl.opl_type] : '—'}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '2px 0', fontWeight: 600, color: '#57534e', fontSize: '11px' }}>Machine:</td>
                    <td style={{ padding: '2px 0', fontSize: '11px' }}>{opl.machine_name ?? '—'}</td>
                  </tr>
                </tbody>
              </table>
            </td>

            {/* Right metadata */}
            <td style={{ padding: '6px 12px', verticalAlign: 'top' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr>
                    <td style={{ padding: '2px 0', width: '110px', fontWeight: 600, color: '#57534e', fontSize: '11px' }}>JH Group:</td>
                    <td style={{ padding: '2px 0', fontSize: '11px' }}>{opl.jh_group_name ?? '—'}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '2px 0', fontWeight: 600, color: '#57534e', fontSize: '11px' }}>S. No.:</td>
                    <td style={{ padding: '2px 0', fontSize: '11px' }}>{String(sNo).padStart(3, '0')}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '2px 0', fontWeight: 600, color: '#57534e', fontSize: '11px' }}>Prepared by:</td>
                    <td style={{ padding: '2px 0', fontSize: '11px' }}>{opl.creator_name ?? '—'}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '2px 0', fontWeight: 600, color: '#57534e', fontSize: '11px' }}>Date:</td>
                    <td style={{ padding: '2px 0', fontSize: '11px' }}>{new Date(opl.created_at).toLocaleDateString()}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '2px 0', fontWeight: 600, color: '#57534e', fontSize: '11px' }}>Approved by:</td>
                    <td style={{ padding: '2px 0', fontSize: '11px' }}>{opl.approver_name ?? '—'}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '2px 0', fontWeight: 600, color: '#57534e', fontSize: '11px' }}>Approved date:</td>
                    <td style={{ padding: '2px 0', fontSize: '11px' }}>{opl.approved_at ? new Date(opl.approved_at).toLocaleDateString() : '—'}</td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── Lesson Description ── */}
      {(opl.content || opl.content_text || opl.description) && (
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #d6d3d1', background: '#fafaf9' }}>
          <div style={{ fontWeight: 600, fontSize: '11px', color: '#57534e', marginBottom: '3px' }}>Lesson Description</div>
          <div style={{ fontSize: '12px', color: '#1c1917', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
            {opl.content || opl.content_text || opl.description}
          </div>
        </div>
      )}

      {/* ── Before / After images ── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', borderBottom: '1px solid #d6d3d1' }}>
        <tbody>
          <tr>
            {/* Before */}
            <td style={{ width: '50%', padding: '10px 12px', borderRight: '1px solid #d6d3d1', verticalAlign: 'top' }}>
              <div style={{ fontWeight: 700, fontSize: '13px', color: '#dc2626', marginBottom: '8px' }}>✗ Before</div>
              <PrintImage url={opl.before_image_url} alt="Before"/>
            </td>

            {/* After */}
            <td style={{ width: '50%', padding: '10px 12px', verticalAlign: 'top' }}>
              <div style={{ fontWeight: 700, fontSize: '13px', color: '#0d9488', marginBottom: '8px' }}>✓ After</div>
              <PrintImage url={opl.after_image_url} alt="After"/>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── Remarks row ── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', borderBottom: '1px solid #d6d3d1' }}>
        <tbody>
          <tr>
            {/* Before remarks */}
            <td style={{ width: '50%', padding: '8px 12px', borderRight: '1px solid #d6d3d1', verticalAlign: 'top' }}>
              <div style={{ fontWeight: 600, fontSize: '11px', color: '#57534e', marginBottom: '4px' }}>Before Remarks</div>
              <div style={{ fontSize: '12px', minHeight: '36px' }}>{opl.before_remarks ?? ''}</div>
            </td>

            {/* After remarks */}
            <td style={{ width: '50%', padding: '8px 12px', verticalAlign: 'top' }}>
              <div style={{ fontWeight: 600, fontSize: '11px', color: '#57534e', marginBottom: '4px' }}>After Remarks</div>
              <div style={{ fontSize: '12px', minHeight: '36px' }}>{opl.after_remarks ?? ''}</div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── Footer — fill-in rows for training ── */}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td style={{ width: '33.33%', padding: '6px 12px', borderRight: '1px solid #d6d3d1', verticalAlign: 'top' }}>
              <div style={{ fontWeight: 600, fontSize: '11px', color: '#57534e', marginBottom: '4px' }}>Training Date</div>
              <div style={{ height: '20px', borderBottom: '1px solid #d6d3d1' }}/>
            </td>
            <td style={{ width: '33.33%', padding: '6px 12px', borderRight: '1px solid #d6d3d1', verticalAlign: 'top' }}>
              <div style={{ fontWeight: 600, fontSize: '11px', color: '#57534e', marginBottom: '4px' }}>Trainer</div>
              <div style={{ height: '20px', borderBottom: '1px solid #d6d3d1' }}/>
            </td>
            <td style={{ width: '33.33%', padding: '6px 12px', verticalAlign: 'top' }}>
              <div style={{ fontWeight: 600, fontSize: '11px', color: '#57534e', marginBottom: '4px' }}>Participants (sign below)</div>
              <div style={{ height: '20px', borderBottom: '1px solid #d6d3d1' }}/>
              <div style={{ height: '20px', borderBottom: '1px solid #d6d3d1', marginTop: '6px' }}/>
              <div style={{ height: '20px', borderBottom: '1px solid #d6d3d1', marginTop: '6px' }}/>
            </td>
          </tr>
        </tbody>
      </table>
    </div>);
}
