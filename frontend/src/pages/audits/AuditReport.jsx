import { useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { useAuditReport } from '../../hooks/useAudits';

// Legacy 5S pillar slugs get a pretty label; any other (free-form) category shows as-is.
const PILLAR_LABEL = { sort: 'Sort', set_in_order: 'Set In Order', shine: 'Shine', standardize: 'Standardize', sustain: 'Sustain' };
const catLabel = (n) => PILLAR_LABEL[n] || n || 'Uncategorised';
const fmt2 = (n) => (n == null || Number.isNaN(Number(n)) ? '—' : Number(n).toFixed(2));
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

// Same three bands as the printed scoring legend: top mark = Good, bottom half = Poor.
const isYesNo = (min, max) => Number(min) === 0 && Number(max) === 1;
function scoreBand(score, min, max) {
  if (score == null || Number.isNaN(Number(score))) return 'none';
  if (isYesNo(min, max)) return Number(score) >= 1 ? 'good' : Number(score) >= 0.5 ? 'marginal' : 'poor';
  const mid = Math.floor((Number(min) + Number(max)) / 2);
  const s = Math.round(Number(score));
  if (s >= Number(max)) return 'good';
  if (s >= mid) return 'marginal';
  return 'poor';
}
const BAND_CLS = {
  good: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  marginal: 'bg-amber-100 text-amber-800 ring-amber-200',
  poor: 'bg-rose-100 text-rose-800 ring-rose-200',
  none: 'bg-slate-100 text-slate-400 ring-slate-200',
};
function ScoreChip({ value, min, max, big }) {
  const has = value != null && !Number.isNaN(Number(value));
  const yn = isYesNo(min, max);
  const label = !has ? '—' : yn
    ? (Number(value) === 1 ? 'Yes' : Number(value) === 0 ? 'No' : `${Math.round(Number(value) * 100)}%`)
    : (Number.isInteger(Number(value)) ? String(Number(value)) : Number(value).toFixed(2));
  const band = has ? scoreBand(value, min, max) : 'none';
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded font-bold ring-1 ${BAND_CLS[band]} ${
      big ? 'h-9 min-w-[2.75rem] px-1.5 text-lg' : 'h-5 min-w-[1.6rem] px-1 text-[11px]'
    }`}>{label}</span>
  );
}

// Print styling lives with the component — the app has no global print sheet, and this is the
// only page meant to be printed to PDF. A4, generous margins, no page-break through an item.
const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 14mm 13mm; }
  .no-print { display: none !important; }
  body { background: #fff !important; }
  .audit-report { box-shadow: none !important; margin: 0 !important; max-width: none !important; }
  .avoid-break { break-inside: avoid; }
  .report-photo { max-height: 46mm; }
}
`;

export function AuditReport() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const auditorParam = params.get('auditor') || '';
  const { data, isLoading, isError, error } = useAuditReport(id);

  const questionCombined = useMemo(() => {
    if (!data) return {};
    const acc = {};
    (data.scorecards || []).forEach((s) => (s.responses || []).forEach((r) => {
      if (r.question_id == null || r.score == null) return;
      (acc[r.question_id] ||= []).push(r.score);
    }));
    const out = {};
    Object.entries(acc).forEach(([q, arr]) => { out[q] = arr.reduce((a, b) => a + b, 0) / arr.length; });
    return out;
  }, [data]);

  if (isLoading) return <Centered>Loading report…</Centered>;
  if (isError) return <Centered>{error?.message || 'Could not load this report.'}</Centered>;
  if (!data) return <Centered>No report data.</Centered>;

  const { occurrence: occ, template, zone_name, plant_name, closed_by_name, legend, questions = [], scorecards = [], combined_categories = [], categories = [] } = data;
  const hasCategories = template.structure === 'categories' || template.structure === 'categories_questions';
  const hasQuestions = template.structure === 'questions' || template.structure === 'categories_questions';
  const scored = template.scoring_mode !== 'off';
  const individual = auditorParam ? scorecards.find((s) => String(s.auditor_emp_id) === String(auditorParam)) : null;
  const mode = individual ? 'individual' : 'combined';
  const scoreMax = occ.combined_max || template.score_max;
  const shortId = 'AUD-' + String(occ.id).replace(/-/g, '').slice(0, 12).toUpperCase();

  const setAuditor = (v) => { const p = new URLSearchParams(params); if (v) p.set('auditor', v); else p.delete('auditor'); setParams(p, { replace: true }); };

  return (
    <div className="min-h-dvh bg-slate-100 text-slate-900">
      <style>{PRINT_CSS}</style>

      {/* Toolbar — never printed */}
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 sm:px-6">
        <button type="button" onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
          <ArrowLeft size={15} /> Back
        </button>
        <label className="ml-1 flex items-center gap-2 text-sm text-slate-600">
          <span className="hidden sm:inline">Report:</span>
          <select value={auditorParam} onChange={(e) => setAuditor(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm">
            <option value="">Combined (whole round)</option>
            {scorecards.map((s) => <option key={s.auditor_emp_id} value={s.auditor_emp_id}>{s.auditor_name}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => window.print()} className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700">
          <Printer size={15} /> Print / Save PDF
        </button>
      </div>

      {/* The document */}
      <div className="audit-report mx-auto my-4 max-w-[820px] bg-white p-6 shadow-sm sm:my-8 sm:p-10 print:my-0 print:p-0">
        <header className="border-b-2 border-slate-900 pb-3">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{plant_name ? `${plant_name} · ` : ''}FOCUS</p>
          <h1 className="mt-1 text-2xl font-bold">{template.name} — {mode === 'individual' ? 'Auditor Report' : 'Audit Report'}</h1>
        </header>

        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <Field label="Audit ID" value={shortId} />
          <Field label="Zone" value={zone_name} />
          <Field label="Plant" value={plant_name || '—'} />
          <Field label="Audit Date" value={fmtDate(occ.due_date)} />
          <Field label="Closed" value={`${fmtDate(occ.closed_at)}${closed_by_name ? ` · ${closed_by_name}` : ''}`} />
          <Field label={mode === 'individual' ? 'Auditor' : 'Auditors'} value={mode === 'individual' ? individual.auditor_name : `${scorecards.length} (${occ.submitted_count}/${occ.expected_count} submitted)`} />
        </dl>

        {legend && (
          <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <span className="font-semibold">Scoring:</span> {legend}
          </p>
        )}

        {/* ---- Score summary ---- */}
        <section className="avoid-break mt-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">Score Summary</h2>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-4xl font-bold">
              {mode === 'individual' ? fmt2(individual.total_score) : fmt2(occ.combined_score)}
            </span>
            <span className="text-lg text-slate-500">/ {fmt2(scoreMax)}</span>
            <span className="ml-2 text-sm text-slate-500">
              {mode === 'individual' ? "This auditor's overall score" : 'Combined average across all submitted scorecards'}
            </span>
          </div>

          {hasCategories && (
            <table className="mt-3 w-full border border-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                <tr><th className="p-2">Category</th><th className="p-2 text-right">Average Score</th></tr>
              </thead>
              <tbody>
                {(mode === 'individual' ? individual.category_scores : combined_categories).map((c) => (
                  <tr key={c.category} className="border-t border-slate-100">
                    <td className="p-2">{catLabel(c.category)}</td>
                    <td className="p-2 text-right font-semibold">{fmt2(c.avg_score)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold">
                  <td className="p-2">Final Average Score</td>
                  <td className="p-2 text-right">{mode === 'individual' ? fmt2(individual.total_score) : fmt2(occ.combined_score)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </section>

        {/* ---- Auditor scores (combined only) ---- */}
        {mode === 'combined' && scorecards.length > 1 && (
          <section className="avoid-break mt-6">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">Auditor Scores</h2>
            <table className="mt-2 w-full border border-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                <tr><th className="p-2">Auditor</th><th className="p-2">Submitted</th><th className="p-2 text-right">Score</th></tr>
              </thead>
              <tbody>
                {scorecards.map((s) => (
                  <tr key={s.submission_id} className="border-t border-slate-100">
                    <td className="p-2">{s.auditor_name}</td>
                    <td className="p-2 text-slate-500">{fmtDate(s.submitted_at)}</td>
                    <td className="p-2 text-right font-semibold">{fmt2(s.total_score)} / {fmt2(s.max_score || scoreMax)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* ---- Item detail ---- */}
        <section className="mt-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
            {hasQuestions ? 'Audit Question Details' : 'Category Detail'}
          </h2>

          {hasQuestions && questions.map((q) => {
            const perAuditor = scorecards
              .map((s) => ({ name: s.auditor_name, r: (s.responses || []).find((r) => r.question_id === q.id) }))
              .filter((x) => x.r);
            const shown = mode === 'individual' ? perAuditor.filter((x) => x.name === individual.auditor_name) : perAuditor;
            const headline = mode === 'individual' ? shown[0]?.r?.score : questionCombined[q.id];
            return (
              <ItemBlock
                key={q.id} title={`${q.number}. ${q.text}`} category={q.category_name}
                headline={headline} avgOf={mode === 'combined' ? shown.length : null}
                rows={shown} scored={scored} scoreMin={template.score_min} scoreMax={template.score_max}
                mode={mode}
                photos={shown.flatMap((x) => x.r.photos || [])}
              />
            );
          })}

          {!hasQuestions && categories.map((c) => {
            const perAuditor = scorecards
              .map((s) => ({ name: s.auditor_name, r: (s.responses || []).find((r) => r.category_id === c.id) }))
              .filter((x) => x.r);
            const shown = mode === 'individual' ? perAuditor.filter((x) => x.name === individual.auditor_name) : perAuditor;
            const headline = mode === 'individual'
              ? shown[0]?.r?.score
              : (shown.length ? shown.reduce((a, x) => a + (x.r.score || 0), 0) / shown.length : null);
            return (
              <ItemBlock
                key={c.id} title={catLabel(c.name)} category={null}
                headline={headline} avgOf={mode === 'combined' ? shown.length : null}
                rows={shown} scored={scored} scoreMin={template.score_min} scoreMax={template.score_max}
                mode={mode}
                photos={shown.flatMap((x) => x.r.photos || [])}
              />
            );
          })}
        </section>

        <footer className="no-print mt-8 border-t border-slate-200 pt-3 text-center text-xs text-slate-400">
          Generated from FOCUS · {fmtDate(new Date())}
        </footer>
      </div>
    </div>
  );
}

// One question (or category) in the detail section. Header = title + category pill + a big
// colour-coded score chip; then a bordered list of auditor rows (name in bold, their own
// chip, their observation); photos grouped once at the bottom under their own label.
function ItemBlock({ title, category, headline, avgOf, rows, scored, scoreMin, scoreMax, mode, photos }) {
  return (
    <div className="avoid-break mt-4 border-t border-slate-200 pt-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          {category && (
            <span className="mt-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">
              {catLabel(category)}
            </span>
          )}
        </div>
        {scored && (
          <div className="shrink-0 text-right">
            <ScoreChip value={headline} min={scoreMin} max={scoreMax} big />
            {mode === 'combined' && avgOf != null && (
              <p className="mt-0.5 text-[10px] uppercase tracking-wider text-slate-400">avg of {avgOf}</p>
            )}
          </div>
        )}
      </div>

      {mode === 'combined' ? (
        <div className="mt-2 divide-y divide-slate-100 rounded border border-slate-200">
          {rows.map((x, i) => (
            <div key={i} className="flex items-start gap-2.5 px-2.5 py-1.5 text-xs">
              {scored && <ScoreChip value={x.r.score} min={scoreMin} max={scoreMax} />}
              <div className="min-w-0 flex-1 leading-relaxed">
                <span className="font-semibold text-slate-800">{x.name}</span>
                {x.r.remarks
                  ? <span className="text-slate-600"> — {x.r.remarks}</span>
                  : <span className="text-slate-300"> — no observation</span>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        rows[0]?.r?.remarks
          ? <p className="mt-2 text-xs leading-relaxed text-slate-600">{rows[0].r.remarks}</p>
          : <p className="mt-2 text-xs italic text-slate-300">No observation recorded.</p>
      )}

      {photos.length > 0 && (
        <div className="mt-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Photos ({photos.length})</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {photos.map((p, j) => (
              <figure key={j} className="avoid-break">
                <img src={p.photo_url} alt={p.caption || ''} className="report-photo h-28 w-auto rounded border border-slate-200 object-contain" />
                {p.caption && <figcaption className="mt-0.5 max-w-[7rem] text-[10px] text-slate-400">{p.caption}</figcaption>}
              </figure>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="text-slate-800">{value || '—'}</dd>
    </div>
  );
}
function Centered({ children }) {
  return <div className="flex min-h-dvh items-center justify-center p-6 text-sm text-slate-500">{children}</div>;
}
