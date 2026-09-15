import React, { useState, useEffect, useRef } from 'react';
import { X, Check, Printer, Smartphone, FileText, Calendar, User, Building2, Users, CheckCircle2 } from 'lucide-react';

export function OnePointLessonSheet({
  lesson,
  onClose,
  isCompleted = false,
  canComplete = true,
  onMarkCompleted = () => {},
  onLessonOpened = () => {}
}) {
  const [viewMode, setViewMode] = useState('summary'); // 'summary' or 'sheet'
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const bodyRef = useRef(null);

  // Gate: the reader must both stay on the lesson for at least 4 seconds AND scroll
  // to the bottom. Lessons too short to scroll auto-satisfy the scroll part so a
  // phone user is never left with no visible button.
  const hasReadToEnd = minTimeElapsed && scrolledToEnd;

  useEffect(() => {
    if (lesson?.opl_id) {
      onLessonOpened(lesson.opl_id);
    }
  }, [lesson?.opl_id, onLessonOpened]);

  // Both the Close and Complete buttons only appear once the reader has spent at
  // least 5 seconds on the lesson AND scrolled to the bottom of its body. A body
  // that isn't tall enough to scroll counts as "scrolled to the end" immediately.
  useEffect(() => {
    setMinTimeElapsed(false);
    setScrolledToEnd(false);
    const el = bodyRef.current;
    // ~48px tolerance: mobile browsers report fractional scroll positions and the
    // address bar sliding in/out shifts the measured height.
    const checkScroll = () => {
      if (!el) return;
      const notScrollable = el.scrollHeight - el.clientHeight <= 48;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 48;
      if (notScrollable || atBottom) setScrolledToEnd(true);
    };
    // Measure after the browser has laid the body out.
    const raf = requestAnimationFrame(checkScroll);
    el?.addEventListener('scroll', checkScroll, { passive: true });
    const timer = setTimeout(() => setMinTimeElapsed(true), 4000);
    return () => {
      cancelAnimationFrame(raf);
      el?.removeEventListener('scroll', checkScroll);
      clearTimeout(timer);
    };
  }, [lesson?.opl_id, viewMode]);

  if (!lesson) return null;

  const handlePrint = () => {
    window.print();
  };

  const formattedDate = lesson.timestamp
    ? new Date(lesson.timestamp).toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-1.5 sm:p-4 backdrop-blur-xs overflow-hidden">
      {/* Modal Container */}
      <div className="relative w-full max-w-5xl h-[80vh] sm:h-[86vh] max-h-[800px] rounded-2xl bg-white text-slate-900 shadow-2xl overflow-hidden flex flex-col border border-slate-300">
        
        {/* Modal Top Action Bar (Non-printable) */}
        <div className="print:hidden flex items-center justify-between gap-1.5 bg-slate-900 px-3 py-2 text-white border-b border-slate-800 shrink-0 z-20">
          <div className="flex items-center gap-1.5 min-w-0 shrink-0 pr-1">
            <span className="text-2xs font-bold bg-brand-strong px-1.5 py-0.5 rounded text-white tracking-wider shrink-0">
              OPL
            </span>
            {lesson.opl_id != null && (
              <span className="text-2xs text-slate-400 font-mono shrink-0">#{lesson.opl_id}</span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* View Mode Toggle */}
            <div className="flex items-center bg-slate-800/90 p-0.5 rounded-md border border-slate-700/80">
              <button
                type="button"
                onClick={() => setViewMode('summary')}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-2xs sm:text-2xs font-medium transition-all ${
                  viewMode === 'summary'
                    ? 'bg-brand-strong text-white shadow-2xs font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
                title="Summary View"
              >
                <Smartphone size={11} />
                <span>Summary</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('sheet')}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-2xs sm:text-2xs font-medium transition-all ${
                  viewMode === 'sheet'
                    ? 'bg-brand-strong text-white shadow-2xs font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
                title="Official Sheet Template"
              >
                <FileText size={11} />
                <span>Sheet</span>
              </button>
            </div>

            {viewMode === 'sheet' && (
              <button
                type="button"
                onClick={handlePrint}
                className="hidden sm:inline-flex items-center gap-1 rounded-md bg-blue-600 hover:bg-blue-700 px-2 py-0.5 text-2xs sm:text-2xs font-medium text-white transition-colors"
                title="Print OPL Sheet"
              >
                <Printer size={12} />
                <span>Print</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              disabled={!hasReadToEnd}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              aria-label="Close modal"
              title={hasReadToEnd ? 'Close Modal' : 'Read to the end of the lesson to close'}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div ref={bodyRef} className="p-3 sm:p-6 overflow-y-auto overscroll-contain flex-1 min-h-0 bg-slate-50 font-sans text-xs sm:text-sm leading-relaxed">
          
          {/* ========================================================= */}
          {/* SUMMARY VIEW (Default view mode) */}
          {/* ========================================================= */}
          {viewMode === 'summary' && (
            <div className="space-y-4 max-w-2xl mx-auto print:hidden">
              
              {/* Header Info Box */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
                    {lesson.classification || 'Basic Condition'}
                  </span>
                  {isCompleted ? (
                    <span className="text-2xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md flex items-center gap-1">
                      <CheckCircle2 size={13} /> Training Completed
                    </span>
                  ) : null}
                </div>

                <h2 className="text-base font-bold text-slate-900 leading-snug">
                  {lesson.title}
                </h2>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-2xs text-slate-600 pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-1.5">
                    <Building2 size={13} className="text-slate-400" />
                    <span>Plant: <strong className="text-slate-800">{lesson.plant_name || lesson.plant_code || '—'}</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Users size={13} className="text-slate-400" />
                    <span>Group: <strong className="text-slate-800">{lesson.jh_group_name || 'Alpha Team'}</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <User size={13} className="text-slate-400" />
                    <span>Prepared by: <strong className="text-slate-800">{lesson.submitted_by || 'Operator'}</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Calendar size={13} className="text-slate-400" />
                    <span>Date: <strong className="text-slate-800">{formattedDate}</strong></span>
                  </div>
                </div>
              </div>

              {/* LESSON DESCRIPTION / KEY POINTS */}
              {(lesson.content || lesson.content_text || lesson.description) && (
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-1.5">
                  <span className="text-2xs font-bold uppercase tracking-wider text-slate-500">
                    Lesson Description
                  </span>
                  <p className="text-sm text-slate-800 font-medium leading-relaxed whitespace-pre-wrap">
                    {lesson.content || lesson.content_text || lesson.description}
                  </p>
                </div>
              )}

              {/* BEFORE & AFTER SIDE BY SIDE / STACKED SUMMARY CARDS */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* BEFORE SECTION CARD */}
                <div className="rounded-xl border-2 border-red-200 bg-red-50/40 p-4 space-y-3 shadow-2xs flex flex-col">
                  <div className="flex items-center justify-between border-b border-red-200 pb-2">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-red-600 text-white font-bold">
                        <X size={18} strokeWidth={3} />
                      </div>
                      <span className="text-base font-black text-red-700 tracking-wide uppercase">
                        Before Condition
                      </span>
                    </div>
                    <span className="text-2xs font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded uppercase">
                      Problem
                    </span>
                  </div>

                  {/* Before Image */}
                  <div className="relative rounded-lg overflow-hidden border border-red-200 bg-white flex items-center justify-center min-h-[160px] p-2 flex-1">
                    {lesson.before_image ? (
                      <img
                        src={lesson.before_image}
                        alt="Before condition"
                        className="max-h-56 w-auto object-contain rounded"
                      />
                    ) : (
                      <div className="text-slate-400 italic text-center p-6 text-xs">
                        [ No Before Image Attached ]
                      </div>
                    )}
                  </div>

                  {/* Before Remarks */}
                  <div className="bg-white p-3 rounded-lg border border-red-200 space-y-1 shrink-0">
                    <div className="text-2xs font-bold text-red-700 uppercase tracking-wide">
                      Before Remarks
                    </div>
                    <p className="text-xs text-slate-800 font-medium leading-relaxed">
                      {lesson.before_description || lesson.before_remarks || '—'}
                    </p>
                  </div>
                </div>

                {/* AFTER SECTION CARD */}
                <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/40 p-4 space-y-3 shadow-2xs flex flex-col">
                  <div className="flex items-center justify-between border-b border-emerald-200 pb-2">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-white font-bold">
                        <Check size={18} strokeWidth={3} />
                      </div>
                      <span className="text-base font-black text-emerald-700 tracking-wide uppercase">
                        After Condition
                      </span>
                    </div>
                    <span className="text-2xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded uppercase">
                      Standard
                    </span>
                  </div>

                  {/* After Image */}
                  <div className="relative rounded-lg overflow-hidden border border-emerald-200 bg-white flex items-center justify-center min-h-[160px] p-2 flex-1">
                    {lesson.after_image ? (
                      <img
                        src={lesson.after_image}
                        alt="After condition"
                        className="max-h-56 w-auto object-contain rounded"
                      />
                    ) : (
                      <div className="text-slate-400 italic text-center p-6 text-xs">
                        [ No After Image Attached ]
                      </div>
                    )}
                  </div>

                  {/* After Remarks */}
                  <div className="bg-white p-3 rounded-lg border border-emerald-200 space-y-1 shrink-0">
                    <div className="text-2xs font-bold text-emerald-700 uppercase tracking-wide">
                      After Remarks
                    </div>
                    <p className="text-xs text-slate-800 font-medium leading-relaxed">
                      {lesson.after_description || lesson.after_remarks || '—'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* OFFICIAL A4 SHEET TEMPLATE (Scrollable & Printable) */}
          {/* ========================================================= */}
          {viewMode === 'sheet' && (
            <div className="w-full overflow-x-auto space-y-4">
            <div className="min-w-[700px] max-w-4xl mx-auto border-2 border-black bg-white shadow-sm font-sans text-xs text-slate-900 leading-tight">
              
              {/* Header Banner */}
              <div className="bg-[#DCE6F2] border-b-2 border-black p-3 flex items-center justify-between">
                {/* Left Logo */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 font-black text-xs sm:text-sm tracking-tighter text-slate-800 border border-slate-400 p-1 bg-white rounded">
                    <span className="text-red-600">I</span>
                    <span className="text-amber-500">T</span>
                    <span className="text-blue-600">C</span>
                  </div>
                </div>

                {/* Title */}
                <h1 className="text-base sm:text-2xl font-black tracking-wide text-black text-center uppercase">
                  ONE POINT LESSON
                </h1>

                {/* Right Logo */}
                <div className="flex items-center">
                  <div className="bg-slate-900 text-white font-bold text-2xs sm:text-2xs p-1.5 rounded flex items-center gap-1">
                    <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[10px] border-b-blue-400" />
                    <span>Enduring Value</span>
                  </div>
                </div>
              </div>

              {/* Metadata Table Grid */}
              <table className="w-full border-collapse text-left text-xs text-black border-b-2 border-black">
                <tbody>
                  {/* Row 1 */}
                  <tr className="border-b border-black">
                    <td className="w-1/6 font-bold p-2 bg-slate-50 border-r border-black border-b border-black">
                      Theme/Title
                    </td>
                    <td className="w-3/6 p-2 font-semibold border-r border-black border-b border-black" colSpan={3}>
                      {lesson.title || 'Coating impression cylinder clean'}
                    </td>
                    <td className="w-1/12 font-bold p-2 text-center bg-slate-50 border-r border-black border-b border-black">
                      JH
                    </td>
                    <td className="w-2/6 p-2 text-center border-b border-black">
                      {lesson.jh_group_name || 'Printing'}
                    </td>
                  </tr>

                  {/* Row 2 */}
                  <tr className="border-b border-black">
                    <td className="font-bold p-2 bg-slate-50 border-r border-black border-b border-black">
                      Classification
                    </td>
                    <td className="p-2 font-semibold border-r border-black border-b border-black" colSpan={3}>
                      {lesson.classification || 'Basic Condition'}
                    </td>
                    <td className="font-bold p-2 bg-slate-50 border-r border-black border-b border-black text-center">
                      Plant
                    </td>
                    <td className="p-2 text-center font-semibold border-b border-black">
                      {lesson.plant_name || lesson.plant_code || '—'}
                    </td>
                  </tr>

                  {/* Row 3 */}
                  <tr className="border-b border-black">
                    <td className="font-bold p-2 bg-slate-50 border-r border-black">
                      Prepared by
                    </td>
                    <td className="p-2 font-semibold border-r border-black" colSpan={3}>
                      {lesson.submitted_by || 'Ramashankar Yadav'}
                    </td>
                    <td className="font-bold p-2 bg-slate-50 border-r border-black text-center">
                      Prepared Date
                    </td>
                    <td className="p-2 text-center font-semibold">
                      {formattedDate}
                    </td>
                  </tr>

                  {/* Row 4 */}
                  <tr className="border-b border-black">
                    <td className="font-bold p-2 bg-slate-50 border-r border-black">
                      Approved by
                    </td>
                    <td className="p-2 font-semibold border-r border-black" colSpan={3}>
                      {lesson.approved_by || 'Plant Lead'}
                    </td>
                    <td className="font-bold p-2 bg-slate-50 border-r border-black text-center">
                      Approved Date
                    </td>
                    <td className="p-2 text-center font-semibold">
                      {formattedDate}
                    </td>
                  </tr>

                  {/* Row 5: Lesson Description */}
                  {(lesson.content || lesson.content_text || lesson.description) && (
                    <tr>
                      <td className="font-bold p-2 bg-slate-50 border-r border-black">
                        Lesson Description
                      </td>
                      <td className="p-2 font-semibold border-r border-black text-slate-900" colSpan={5}>
                        <div className="whitespace-pre-wrap leading-snug">
                          {lesson.content || lesson.content_text || lesson.description}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Before & After Visual Comparison Grid */}
              <div className="grid grid-cols-2 divide-x-2 divide-black border-b-2 border-black min-h-[220px]">
                
                {/* Before Column */}
                <div className="p-3 flex flex-col justify-between space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-red-600 font-extrabold text-lg sm:text-xl tracking-wider">
                      Before
                    </span>
                  </div>

                  {/* Image Container */}
                  <div className="relative flex-1 flex items-center justify-center bg-slate-100 rounded border border-slate-300 overflow-hidden min-h-[140px] p-1">
                    {lesson.before_image ? (
                      <img
                        src={lesson.before_image}
                        alt="Before condition"
                        className="max-h-48 w-auto object-contain rounded"
                      />
                    ) : (
                      <div className="text-slate-400 italic text-center p-4">
                        [ Before Image Preview ]
                      </div>
                    )}

                    {/* Red Cross Indicator */}
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 text-red-600 font-black text-3xl sm:text-5xl drop-shadow-md">
                      <X size={48} strokeWidth={3} className="text-red-600" />
                    </div>
                  </div>
                </div>

                {/* After Column */}
                <div className="p-3 flex flex-col justify-between space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-teal-600 font-extrabold text-lg sm:text-xl tracking-wider">
                      After
                    </span>
                  </div>

                  {/* Image Container */}
                  <div className="relative flex-1 flex items-center justify-center bg-slate-100 rounded border border-slate-300 overflow-hidden min-h-[140px] p-1">
                    {lesson.after_image ? (
                      <img
                        src={lesson.after_image}
                        alt="After condition"
                        className="max-h-48 w-auto object-contain rounded"
                      />
                    ) : (
                      <div className="text-slate-400 italic text-center p-4">
                        [ After Image Preview ]
                      </div>
                    )}

                    {/* Green Checkmark Indicator */}
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 text-emerald-500 font-black text-3xl sm:text-5xl drop-shadow-md">
                      <Check size={52} strokeWidth={4.5} className="text-emerald-500" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Remarks Row Table */}
              <table className="w-full border-collapse text-left text-xs border-b-2 border-black">
                <tbody>
                  <tr>
                    <td className="w-1/2 p-2 border-r-2 border-black vertical-top space-y-1 bg-slate-50/50">
                      <div className="font-bold text-black text-xs">Before Remarks</div>
                      <div className="text-slate-800 text-xs leading-snug min-h-[48px]">
                        {lesson.before_description || lesson.before_remarks || '—'}
                      </div>
                    </td>

                    <td className="w-1/2 p-2 vertical-top space-y-1 bg-slate-50/50">
                      <div className="font-bold text-black text-xs">After Remarks</div>
                      <div className="text-slate-800 text-xs leading-snug min-h-[48px]">
                        {lesson.after_description || lesson.after_remarks || '—'}
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Bottom Training Sheet Grid */}
              <table className="w-full border-collapse text-left text-xs">
                <tbody>
                  <tr className="border-b border-black">
                    <td className="w-24 font-bold p-2 bg-slate-50 border-r border-black">
                      Date
                    </td>
                    <td className="p-2 border-r border-black"></td>
                    <td className="p-2 border-r border-black"></td>
                    <td className="p-2 border-r border-black"></td>
                    <td className="p-2"></td>
                  </tr>

                  <tr className="border-b border-black">
                    <td className="font-bold p-2 bg-slate-50 border-r border-black">
                      Trainer
                    </td>
                    <td className="p-2 border-r border-black"></td>
                    <td className="p-2 border-r border-black"></td>
                    <td className="p-2 border-r border-black"></td>
                    <td className="p-2"></td>
                  </tr>

                  <tr>
                    <td className="font-bold p-2 bg-slate-50 border-r border-black">
                      Participants
                    </td>
                    <td className="p-2 border-r border-black h-12"></td>
                    <td className="p-2 border-r border-black"></td>
                    <td className="p-2 border-r border-black"></td>
                    <td className="p-2"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          )}

        </div>

        {/* Modal Footer Bar with Close Button at the Last / End */}
        <div className="print:hidden flex flex-wrap items-center justify-between gap-3 bg-slate-900 px-4 py-3 text-white border-t border-slate-800 shrink-0 z-20">
          <div className="text-2xs sm:text-xs text-slate-300">
            {isCompleted ? (
              <span className="text-emerald-400 font-bold flex items-center gap-1 bg-emerald-950/80 border border-emerald-800 px-2.5 py-1 rounded-md">
                <CheckCircle2 size={14} /> Training Completed
              </span>
            ) : !canComplete ? (
              <span className="text-slate-300 font-medium">
                This lesson has not been assigned to you as training.
              </span>
            ) : !hasReadToEnd ? (
              <span className="text-amber-400 font-medium">
                {!minTimeElapsed
                  ? 'Please read the lesson — the buttons unlock shortly'
                  : 'Scroll to the end of the lesson to unlock'}
              </span>
            ) : (
              <span className="text-slate-300 font-medium">
                Active Lesson: <strong className="text-white">{lesson.title}</strong>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!isCompleted && canComplete && hasReadToEnd && (
              <button
                type="button"
                onClick={() => {
                  onMarkCompleted(lesson.opl_id);
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-colors"
              >
                <CheckCircle2 size={15} />
                <span>Complete My Training & Close</span>
              </button>
            )}

            {hasReadToEnd && (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 hover:text-white font-bold text-xs border border-slate-600 transition-colors"
              >
                <X size={16} />
                <span>Close Lesson</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


