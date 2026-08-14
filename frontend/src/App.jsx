import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
import { AbnormalityForm } from './pages/abnormalities/AbnormalityForm';
import { AbnormalityDetail } from './pages/abnormalities/AbnormalityDetail';
import { MachineSubsectionManager } from './pages/admin/MachineSubsectionManager';
import { OrgStructure } from './pages/admin/mdm/OrgStructure';
import { Machines } from './pages/admin/mdm/Machines';
import { People } from './pages/admin/mdm/People';
import { BulkImport } from './pages/admin/mdm/BulkImport';
import { KPILanding } from './pages/kpis/KPILanding';
import { OPLList } from './pages/opl/OPLList';
import { OPLForm } from './pages/opl/OPLForm';
import { OPLDetail } from './pages/opl/OPLDetail';
import { OPLTrainingDue } from './pages/opl/OPLTrainingDue';
import { KaizenList } from './pages/kaizen/KaizenList';
import { KaizenForm } from './pages/kaizen/KaizenForm';
import { KaizenDetail } from './pages/kaizen/KaizenDetail';
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: 1,
            staleTime: 1000 * 60 * 5,
        },
    },
});
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

            {/* Protected shell */}
            <Route path="/" element={<RequireAuth>
                  <SessionGuard>
                    <AppShell />
                  </SessionGuard>
                </RequireAuth>}>
              <Route index element={<Navigate to="/select-module" replace/>}/>
              <Route path="home" element={<Home />}/>

              {/* Abnormalities */}
              <Route path="abnormalities" element={<AbnormalityList />}/>
              <Route path="abnormalities/new" element={<AbnormalityForm />}/>
              <Route path="abnormalities/:id" element={<AbnormalityDetail />}/>

              {/* Admin — legacy /admin/users removed (Phase 2 Step 3a): MDM People
            (/admin/mdm/people) is the governed roster. Email password-reset
            migrated there; participation-stats deferred to Phase 5 analytics. */}
              <Route path="admin/subsections" element={<RequireRole minimum="pillar_champion">
                    <MachineSubsectionManager />
                  </RequireRole>}/>

              {/* MDM (module zero) — route guards are UX/D4 hygiene; RLS is the control */}
              <Route path="admin/mdm/org" element={<RequireRole minimum="admin">
                    <OrgStructure />
                  </RequireRole>}/>
              <Route path="admin/mdm/machines" element={<RequireRole minimum="dmt_leader">
                    <Machines />
                  </RequireRole>}/>
              <Route path="admin/mdm/people" element={<RequireRole minimum="it_lead">
                    <People />
                  </RequireRole>}/>
              {/* Step 8 — bulk import: admin-only at route, Edge and RLS */}
              <Route path="admin/mdm/people/import" element={<RequireRole minimum="admin">
                    <BulkImport entity="workers"/>
                  </RequireRole>}/>
              <Route path="admin/mdm/machines/import" element={<RequireRole minimum="admin">
                    <BulkImport entity="machines"/>
                  </RequireRole>}/>

              {/* KPIs (Phase 3 M1) — role-conditional landing: capture cards + grouped trend */}
              <Route path="kpis" element={<KPILanding />}/>

              {/* OPL */}
              <Route path="opl" element={<OPLList />}/>
              <Route path="opl/new" element={<OPLForm />}/>
              <Route path="opl/training" element={<OPLTrainingDue />}/>
              <Route path="opl/:id" element={<OPLDetail />}/>
              <Route path="opl/:id/edit" element={<OPLForm />}/>
              {/* Kaizen */}
              <Route path="kaizen" element={<KaizenList />}/>
              <Route path="kaizen/new" element={<KaizenForm />}/>
              <Route path="kaizen/:id" element={<KaizenDetail />}/>
              <Route path="kaizen/:id/edit" element={<KaizenForm />}/>
              <Route path="more" element={<ComingSoon label="More"/>}/>
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace/>}/>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>);
}
