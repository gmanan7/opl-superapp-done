import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Building2, Gauge, LayoutTemplate, ShieldCheck, Layers, Network, Eye, FileWarning, ScrollText, CalendarCheck, History, FlaskConical, ListOrdered } from 'lucide-react';
import { cn } from '../../lib/utils';
import { DmtAdminDepartments } from './DmtAdminDepartments';
import { DmtKpiMaster } from './DmtKpiMaster';
import { DmtMeetingTemplates } from './DmtMeetingTemplates';
import { DmtAdminAnalytics } from './DmtAdminAnalytics';
import { DmtTiers } from './DmtTiers';
import { DmtHierarchy } from './DmtHierarchy';
import { DmtTaskBoardOverview } from './DmtTaskBoardOverview';
import { DmtKpiMissing } from './DmtKpiMissing';
import { DmtKpiAudit } from './DmtKpiAudit';
import { DmtPmEditAccess } from './DmtPmEditAccess';
import { DmtPmAudit } from './DmtPmAudit';
import { DmtPdEditAccess } from './DmtPdEditAccess';
import { DmtPdAudit } from './DmtPdAudit';
import { DmtPdStages } from './DmtPdStages';
import { DmtMeetingAudit } from './DmtMeetingAudit';

// Departments, KPI Master, Meeting Templates and Analytics used to be separate admin
// pages/nav items — combined here per owner request into one "Organisation" hub. Each tab
// just renders the existing page component as-is (own data fetching, own internal tier
// gating for edit actions) so none of that logic had to be duplicated or rewritten.
// Task Overview and KPI Charts were deliberately left out of this merge (owner request);
// Audit Log stays separate too (its visibility needs restricting to a few people, later).
const TABS = [
    { value: 'departments', label: 'Departments', icon: Building2 },
    { value: 'kpi-master', label: 'KPI Master', icon: Gauge },
    { value: 'meeting-templates', label: 'Meeting Templates', icon: LayoutTemplate },
    { value: 'tiers', label: 'Tiers', icon: Layers },
    { value: 'hierarchy', label: 'Hierarchy', icon: Network },
    { value: 'task-board-overview', label: 'Task Board Overview', icon: Eye },
    { value: 'kpi-missing', label: 'KPI Not Submitted', icon: FileWarning },
    { value: 'kpi-audit', label: 'KPI Audit Trail', icon: ScrollText },
    { value: 'pm-access', label: 'PM Schedule Edit Access', icon: CalendarCheck },
    { value: 'pm-audit', label: 'PM Schedule Audit Trail', icon: History },
    { value: 'pd-access', label: 'PD Cycle Edit Access', icon: FlaskConical },
    { value: 'pd-stages', label: 'PD Cycle Stages', icon: ListOrdered },
    { value: 'pd-audit', label: 'PD Cycle Audit Trail', icon: History },
    { value: 'meeting-audit', label: 'Meeting Audit Trail', icon: History },
    { value: 'analytics', label: 'Analytics', icon: ShieldCheck },
];

export function DmtOrganisation() {
    // ?tab=…&meeting=… lets a link (e.g. "Audit trail" inside a meeting) open a tab directly, narrowed to one meeting.
    const [params] = useSearchParams();
    const wanted = params.get('tab');
    const [tab, setTab] = useState(TABS.some((t) => t.value === wanted) ? wanted : 'departments');
    const meetingParam = params.get('meeting');

    return (
        <div className="mx-auto max-w-6xl space-y-4">
            <h1 className="text-xl font-bold text-slate-900">Organisation</h1>

            <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
                {TABS.map((t) => (
                    <button
                        key={t.value}
                        type="button"
                        onClick={() => setTab(t.value)}
                        className={cn(
                            'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                            tab === t.value ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-500 hover:text-slate-700',
                        )}
                    >
                        <t.icon className="h-4 w-4" /> {t.label}
                    </button>
                ))}
            </div>

            {tab === 'departments' && <DmtAdminDepartments />}
            {tab === 'kpi-master' && <DmtKpiMaster />}
            {tab === 'meeting-templates' && <DmtMeetingTemplates />}
            {tab === 'tiers' && <DmtTiers />}
            {tab === 'hierarchy' && <DmtHierarchy />}
            {tab === 'task-board-overview' && <DmtTaskBoardOverview />}
            {tab === 'kpi-missing' && <DmtKpiMissing />}
            {tab === 'kpi-audit' && <DmtKpiAudit />}
            {tab === 'pm-access' && <DmtPmEditAccess />}
            {tab === 'pm-audit' && <DmtPmAudit />}
            {tab === 'pd-access' && <DmtPdEditAccess />}
            {tab === 'pd-stages' && <DmtPdStages />}
            {tab === 'pd-audit' && <DmtPdAudit />}
            {tab === 'meeting-audit' && <DmtMeetingAudit initialMeeting={meetingParam} />}
            {tab === 'analytics' && <DmtAdminAnalytics />}
        </div>
    );
}
