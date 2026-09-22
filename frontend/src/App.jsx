import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Suspense } from 'react';
import './i18n';
import { loadSession, getSessionContext, roleAtLeast } from './lib/auth';
import { AppShell } from './components/layout/AppShell';
import { SessionGuard } from './components/layout/SessionGuard';
import { Toaster } from './components/ui/sonner';
import { Login } from './pages/Login';
import { ModuleSelect } from './pages/ModuleSelect';
import { Home } from './pages/Home';
import { AbnormalityList } from './pages/abnormalities/AbnormalityList';
import { MachineSubsectionManager } from './pages/admin/MachineSubsectionManager';
import { OrgStructure } from './pages/admin/mdm/OrgStructure';
import { Machines } from './pages/admin/mdm/Machines';
import { People } from './pages/admin/mdm/People';
import { BulkImport } from './pages/admin/mdm/BulkImport';
import { OPLList } from './pages/opl/OPLList';
import { KaizenList } from './pages/kaizen/KaizenList';
import { AuditsHome } from './pages/audits/AuditsHome';
import { AuditCapture } from './pages/audits/AuditCapture';
import { AuditReport } from './pages/audits/AuditReport';
import { DmtShell } from './dmt/DmtShell';
import { DmtDashboard } from './dmt/pages/DmtDashboard';
import { DmtPlanner } from './dmt/pages/DmtPlanner';
import { DmtKpiEntry } from './dmt/pages/DmtKpiEntry';
import { DmtTaskBoard } from './dmt/pages/DmtTaskBoard';
import { DmtMeetings } from './dmt/pages/DmtMeetings';
import { DmtMeetingWorkspace } from './dmt/pages/DmtMeetingWorkspace';
import { DmtPmSchedule } from './dmt/pages/DmtPmSchedule';
import { DmtPdCycle } from './dmt/pages/DmtPdCycle';
import { DmtKpiTrends } from './dmt/pages/DmtKpiTrends';
import { DmtCompliance } from './dmt/pages/DmtCompliance';
import { DmtDecisionLog } from './dmt/pages/DmtDecisionLog';
import { DmtOrganisation } from './dmt/pages/DmtOrganisation';
import { DmtAdminTaskOverview } from './dmt/pages/DmtAdminTaskOverview';
import { queryClient } from './lib/queryClient';
function RequireAuth({ children }) {
    const session = loadSession();
    if (!session)
        return <Navigate to="/login" replace/>;
    return <>{children}</>;
}
function RedirectIfAuthed({ children }) {
    const session = loadSession();
    if (session)
        return <Navigate to="/select-module" replace/>;
    return <>{children}</>;
}
function RequireRole({ children, minimum, }) {
    const ctx = getSessionContext();
    if (!ctx || !roleAtLeast(ctx.role, minimum)) {
        return <Navigate to="/home" replace/>;
    }
    return <>{children}</>;
}
function ComingSoon({ label }) {
    return (<div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-2 pt-8">
      <span className="text-4xl">🚧</span>
      <p className="text-sm font-medium">{label} — coming soon</p>
    </div>);
}
export default function App() {
    return (<QueryClientProvider client={queryClient}>
      {/* Single app-wide toast host — non-blocking confirmations (PATTERNS rule 900). */}
      <Toaster />
      <BrowserRouter>
        <Suspense fallback={null}>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<RedirectIfAuthed>
                  <Login />
                </RedirectIfAuthed>}/>

            {/* Portal / Module Selection */}
            <Route path="/select-module" element={<RequireAuth>
                  <ModuleSelect />
                </RequireAuth>}/>

            {/* Audit report — full-page printable document, deliberately OUTSIDE AppShell so
                the sidebar / bottom nav don't print. Auth still enforced. */}
            <Route path="/audits/report/:id" element={<RequireAuth>
                  <AuditReport />
                </RequireAuth>}/>

            {/* Protected shell */}
            <Route path="/" element={<RequireAuth>
                  <SessionGuard>
                    <AppShell />
                  </SessionGuard>
                </RequireAuth>}>
              <Route index element={<Navigate to="/select-module" replace/>}/>
              <Route path="home" element={<Home />}/>

              {/* Abnormalities — single page: report + list, no extra navigation */}
              <Route path="abnormalities" element={<AbnormalityList />}/>
              <Route path="abnormalities/new" element={<Navigate to="/abnormalities" replace/>}/>

              {/* Admin — legacy /admin/users removed (Phase 2 Step 3a): MDM People
            (/admin/mdm/people) is the governed roster. Email password-reset
            migrated there; participation-stats deferred to Phase 5 analytics. */}
              <Route path="admin/subsections" element={<RequireRole minimum="module_lead">
                    <MachineSubsectionManager />
                  </RequireRole>}/>

              {/* MDM (module zero) — route guards are UX/D4 hygiene; RLS is the control */}
              <Route path="admin/mdm/org" element={<RequireRole minimum="be_lead">
                    <OrgStructure />
                  </RequireRole>}/>
              <Route path="admin/mdm/machines" element={<RequireRole minimum="be_lead">
                    <Machines />
                  </RequireRole>}/>
              <Route path="admin/mdm/people" element={<RequireRole minimum="be_lead">
                    <People />
                  </RequireRole>}/>
              {/* People import now lives inside the People page (Onboard people -> Import from Excel) */}
              <Route path="admin/mdm/people/import" element={<Navigate to="/admin/mdm/people" replace/>}/>
              <Route path="admin/mdm/machines/import" element={<RequireRole minimum="be_lead">
                    <BulkImport entity="machines"/>
                  </RequireRole>}/>

              {/* Audits ('audits/report/:id' is a top-level route above — printable page) */}
              <Route path="audits" element={<AuditsHome />}/>
              <Route path="audits/:id" element={<AuditCapture />}/>

              {/* OPL */}
              <Route path="opl" element={<OPLList />}/>
              {/* Kaizen */}
              <Route path="kaizen" element={<KaizenList />}/>
              <Route path="more" element={<ComingSoon label="More"/>}/>
            </Route>

            {/* DMT module — its own shell, own sidebar, /dmt/* route tree */}
            <Route path="/dmt" element={<RequireAuth>
                  <SessionGuard>
                    <DmtShell />
                  </SessionGuard>
                </RequireAuth>}>
              <Route index element={<DmtDashboard />}/>
              {/* My View folded into the Dashboard — keep old links working */}
              <Route path="my-view" element={<Navigate to="/dmt" replace />}/>
              <Route path="tasks" element={<DmtTaskBoard />}/>
              <Route path="meetings" element={<DmtMeetings />}/>
              {/* Departments/KPI Master/Meeting Templates/Analytics folded into one Organisation page */}
              <Route path="meetings/templates" element={<Navigate to="/dmt/organisation" replace />}/>
              <Route path="meetings/decisions" element={<DmtDecisionLog />}/>
              <Route path="meetings/:id" element={<DmtMeetingWorkspace />}/>
              <Route path="compliance" element={<DmtCompliance />}/>
              <Route path="kpi/entry" element={<DmtKpiEntry />}/>
              <Route path="kpi/master" element={<Navigate to="/dmt/organisation" replace />}/>
              <Route path="kpi/trends" element={<DmtKpiTrends />}/>
              <Route path="pm-schedule" element={<DmtPmSchedule />}/>
              <Route path="pd-cycle" element={<DmtPdCycle />}/>
              <Route path="planner" element={<DmtPlanner />}/>
              <Route path="tiers" element={<Navigate to="/dmt/organisation" replace />}/>
              <Route path="admin/departments" element={<Navigate to="/dmt/organisation" replace />}/>
              <Route path="admin/analytics" element={<Navigate to="/dmt/organisation" replace />}/>
              <Route path="organisation" element={<DmtOrganisation />}/>
              <Route path="admin/tasks" element={<DmtAdminTaskOverview />}/>
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace/>}/>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>);
}
