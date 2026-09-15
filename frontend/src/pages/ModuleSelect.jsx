import { useNavigate } from 'react-router-dom';
import { Factory, Layers, CheckCircle2, LogOut, User, ArrowRight, Sparkles, Building2 } from 'lucide-react';
import { loadSession, clearSession } from '../lib/auth';
export function ModuleSelect() {
    const navigate = useNavigate();
    const session = loadSession();
    const userName = session?.name || session?.email?.split('@')[0] || 'User';
    const userRole = session?.role || 'operator';
    const handleLogout = () => {
        clearSession();
        navigate('/login', { replace: true });
    };
    const handleDmtClick = () => {
        navigate('/dmt');
    };
    const handleTpmClick = () => {
        navigate('/home');
    };
    return (<div className="min-h-dvh flex flex-col bg-slate-50 text-slate-800 font-sans selection:bg-amber-500/20">
      {/* Top Bar / Header */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur-md px-4 py-3 sm:px-8 shadow-xs">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-600 to-amber-500 text-white shadow-sm">
              <Building2 size={22} className="stroke-[2.2]"/>
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-slate-900 sm:text-lg">
                TPM Fulcrum
              </h1>
              <p className="text-xs text-slate-500 font-medium">Operational Portal</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 border-r border-slate-200 pr-4 text-right">
              <div>
                <p className="text-xs font-semibold text-slate-800">{userName}</p>
                <p className="text-2xs uppercase tracking-wider text-amber-600 font-bold">
                  {userRole.replace('_', ' ')}
                </p>
              </div>
            </div>

            <button type="button" onClick={handleLogout} className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100/80 px-3 text-xs font-medium text-slate-700 transition-all hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 active:scale-95" title="Sign Out">
              <LogOut size={14}/>
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 mx-auto w-full max-w-5xl px-3 py-3 sm:px-8 sm:py-8 flex flex-col justify-between sm:justify-center overflow-x-hidden">
        {/* Welcome Greeting */}
        <div className="mb-3 sm:mb-8 text-center space-y-1 sm:space-y-2.5 shrink-0">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-0.5 sm:px-4 sm:py-1 text-[11px] sm:text-xs font-semibold text-amber-700 shadow-2xs">
            <Sparkles size={13} className="text-amber-500 shrink-0"/>
            <span>Welcome back, {userName}</span>
          </div>
          <h2 className="text-xl sm:text-4xl font-extrabold tracking-tight text-slate-900 leading-tight">
            Select Operational Module
          </h2>
          <p className="text-xs sm:text-base text-slate-600 max-w-lg mx-auto leading-normal">
            Choose a workspace to manage factory operations, equipment maintenance, and shop-floor workflows.
          </p>
        </div>

        {/* 2 Major Option Cards Grid - Side-by-side on mobile without vertical scrolling */}
        <div className="grid grid-cols-2 gap-2.5 sm:gap-8 max-w-4xl mx-auto w-full my-auto">
          {/* OPTION 1: TPM (Active) */}
          <button type="button" onClick={handleTpmClick} className="group relative flex flex-col justify-between overflow-hidden rounded-xl sm:rounded-2xl border-2 border-amber-500/80 bg-white p-3.5 sm:p-8 text-left shadow-md transition-all duration-200 hover:-translate-y-1 sm:hover:-translate-y-1.5 hover:border-amber-600 hover:shadow-xl active:translate-y-0 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-amber-500">
            {/* Soft Ambient Background Accent */}
            <div className="absolute -top-16 -right-16 h-32 w-32 sm:h-40 sm:w-40 rounded-full bg-amber-100/60 blur-2xl group-hover:bg-amber-200/60 transition-all"/>

            <div>
              {/* Header Badge */}
              <div className="flex flex-wrap items-center justify-between gap-1.5 mb-3 sm:mb-6">
                <div className="flex h-10 w-10 sm:h-14 sm:w-14 items-center justify-center rounded-xl sm:rounded-2xl bg-amber-500 text-white shadow-md shadow-amber-500/20 group-hover:scale-105 transition-transform shrink-0">
                  <Factory size={22} className="stroke-[2.2] hidden sm:block"/>
                  <Factory size={18} className="stroke-[2.2] sm:hidden"/>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 sm:px-3 sm:py-1 text-2xs sm:text-xs font-bold text-emerald-700 shrink-0">
                  <CheckCircle2 size={12} className="text-emerald-600 shrink-0"/>
                  <span>Active</span>
                </span>
              </div>

              {/* Title & Description */}
              <div className="space-y-0.5 sm:space-y-1">
                <span className="text-2xs sm:text-xs font-bold tracking-wider text-amber-600 uppercase">
                  Module 01
                </span>
                <h3 className="text-lg sm:text-2xl font-bold text-slate-900 group-hover:text-amber-600 transition-colors leading-tight">
                  Lumos
                </h3>
                <p className="text-2xs sm:text-xs font-semibold text-slate-500 leading-tight">
                  Total Productive Maintenance
                </p>
              </div>

              <p className="mt-2 sm:mt-4 text-[11px] sm:text-sm text-slate-600 leading-snug line-clamp-2 sm:line-clamp-none">
                Comprehensive maintenance including Abnormalities, OPL, Kaizen, and Audits.
              </p>

              {/* Feature Tags */}
              <div className="mt-3 sm:mt-6 flex flex-wrap gap-1 sm:gap-1.5">
                {['Abnormalities', 'OPL', 'Kaizen', 'Audits & MDM'].map((tag) => (<span key={tag} className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 sm:px-2.5 sm:py-1 text-2xs sm:text-[11px] font-semibold text-slate-700">
                    {tag}
                  </span>))}
              </div>
            </div>

            {/* Bottom Button Action */}
            <div className="mt-3 sm:mt-8 flex items-center justify-between border-t border-slate-100 pt-2.5 sm:pt-4">
              <span className="text-[11px] sm:text-xs font-bold text-amber-600 group-hover:translate-x-1 transition-transform truncate pr-1">
                <span className="hidden sm:inline">Open Lumos Workspace</span>
                <span className="sm:hidden">Open Workspace</span>
              </span>
              <div className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg bg-amber-500 text-white group-hover:bg-amber-600 transition-colors shadow-xs shrink-0">
                <ArrowRight size={14} className="sm:hidden"/>
                <ArrowRight size={16} className="hidden sm:block"/>
              </div>
            </div>
          </button>

          {/* OPTION 2: DMT (Active) */}
          <button type="button" onClick={handleDmtClick} className="group relative flex flex-col justify-between overflow-hidden rounded-xl sm:rounded-2xl border-2 border-blue-500/80 bg-white p-3.5 sm:p-8 text-left shadow-md transition-all duration-200 hover:-translate-y-1 sm:hover:-translate-y-1.5 hover:border-blue-600 hover:shadow-xl active:translate-y-0 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-blue-500">
            {/* Soft Ambient Background Accent */}
            <div className="absolute -top-16 -right-16 h-32 w-32 sm:h-40 sm:w-40 rounded-full bg-blue-100/60 blur-2xl group-hover:bg-blue-200/60 transition-all"/>

            <div>
              {/* Header Badge */}
              <div className="flex flex-wrap items-center justify-between gap-1.5 mb-3 sm:mb-6">
                <div className="flex h-10 w-10 sm:h-14 sm:w-14 items-center justify-center rounded-xl sm:rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-600/20 group-hover:scale-105 transition-transform shrink-0">
                  <Layers size={22} className="stroke-[2.2] hidden sm:block"/>
                  <Layers size={18} className="stroke-[2.2] sm:hidden"/>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 sm:px-3 sm:py-1 text-2xs sm:text-xs font-bold text-emerald-700 shrink-0">
                  <CheckCircle2 size={12} className="text-emerald-600 shrink-0"/>
                  <span>Active</span>
                </span>
              </div>

              {/* Title & Description */}
              <div className="space-y-0.5 sm:space-y-1">
                <span className="text-2xs sm:text-xs font-bold tracking-wider text-blue-600 uppercase">
                  Module 02
                </span>
                <h3 className="text-lg sm:text-2xl font-bold text-slate-900 group-hover:text-blue-600 transition-colors leading-tight">
                  CloseLoop
                </h3>
                <p className="text-2xs sm:text-xs font-semibold text-slate-500 leading-tight">
                  Daily Management Tool
                </p>
              </div>

              <p className="mt-2 sm:mt-4 text-[11px] sm:text-sm text-slate-600 leading-snug line-clamp-2 sm:line-clamp-none">
                Tiered operational meetings, shift handovers, and shop-floor productivity tracking.
              </p>

              {/* Feature Tags */}
              <div className="mt-3 sm:mt-6 flex flex-wrap gap-1 sm:gap-1.5">
                {['Tier Meetings', 'Shift Handover', 'Daily Checklists'].map((tag) => (<span key={tag} className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 sm:px-2.5 sm:py-1 text-2xs sm:text-[11px] font-semibold text-slate-700">
                    {tag}
                  </span>))}
              </div>
            </div>

            {/* Bottom Button Action */}
            <div className="mt-3 sm:mt-8 flex items-center justify-between border-t border-slate-100 pt-2.5 sm:pt-4">
              <span className="text-[11px] sm:text-xs font-bold text-blue-600 group-hover:translate-x-1 transition-transform truncate pr-1">
                <span className="hidden sm:inline">Open CloseLoop Workspace</span>
                <span className="sm:hidden">Open Workspace</span>
              </span>
              <div className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg bg-blue-600 text-white group-hover:bg-blue-700 transition-colors shadow-xs shrink-0">
                <ArrowRight size={14} className="sm:hidden"/>
                <ArrowRight size={16} className="hidden sm:block"/>
              </div>
            </div>
          </button>
        </div>

        {/* Footnote */}
        <div className="mt-3 sm:mt-12 text-center text-[11px] sm:text-xs text-slate-500 flex items-center justify-center gap-1.5 shrink-0">
          <User size={13} className="text-slate-400 shrink-0"/>
          <span className="truncate">Signed in as <strong className="text-slate-700">{userName}</strong> ({userRole})</span>
        </div>
      </main>
    </div>);
}
