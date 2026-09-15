import { useState, useMemo, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Layers, Search, X, Users, UserCheck, Filter, GitBranch, ShieldCheck, FileText, Sparkles, AlertTriangle, CheckCircle2, GripVertical, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { useOrgStructure, useCreateModuleGroup, useUpdateModuleGroup, useDeleteModuleGroup, useCreateJhGroup, useUpdateJhGroup, useDeleteJhGroup, useAddJhGroupMember, useRemoveJhGroupMember, useAddDmtMember, useRemoveDmtMember, useSaveApprovalRouting, useOplWorkflowStages, useSaveOplWorkflowStages, useWorkflowStages, useSaveWorkflowStages } from '@/hooks/mdm';
import { useOplRepositorySetting, useUpdateOplRepositorySetting } from '@/hooks/useOPL';
import { useKaizenRepositorySetting, useUpdateKaizenRepositorySetting } from '@/hooks/useKaizen';
import { useAbnormalityRepositorySetting, useUpdateAbnormalityRepositorySetting } from '@/hooks/useAbnormalities';
import { loadSession, roleAtLeast } from '@/lib/auth';
import { MdmErrorNote } from './mdmUi';
import { toast } from 'sonner';

const NONE = '__none__';

// Compact inline Level (1/2/3) selector used on DMT cards and JH-group rows.
function LevelSelect({ value, onChange, saving, className = '' }) {
    return (
        <select
            value={String(value || 1)}
            onChange={(e) => onChange(Number(e.target.value))}
            onClick={(e) => e.stopPropagation()}
            disabled={saving}
            title="Level"
            className={`rounded-md border border-line bg-surface-base px-1.5 py-0.5 text-2xs font-semibold text-ink-strong focus:outline-none focus:ring-1 focus:ring-blue-600 disabled:opacity-50 shrink-0 ${className}`}
        >
            <option value="1">Level 1</option>
            <option value="2">Level 2</option>
            <option value="3">Level 3</option>
        </select>
    );
}

export function OrgStructure() {
    const { t } = useTranslation();
    const { data, isLoading } = useOrgStructure();
    const createModuleGroup = useCreateModuleGroup();
    const updateModuleGroup = useUpdateModuleGroup();
    const deleteModuleGroup = useDeleteModuleGroup();
    const createJhGroup = useCreateJhGroup();
    const updateJhGroup = useUpdateJhGroup();
    const deleteJhGroup = useDeleteJhGroup();
    const addJhGroupMember = useAddJhGroupMember();
    const removeJhGroupMember = useRemoveJhGroupMember();
    const addDmtMember = useAddDmtMember();
    const removeDmtMember = useRemoveDmtMember();
    const saveApprovalRouting = useSaveApprovalRouting();
    const saveOplWorkflowStages = useSaveOplWorkflowStages();

    const session = loadSession();
    const loggedInEmpId = session?.emp_id || session?.userId || session?.worker_id || session?.worker?.id;
    const userRole = session?.role || session?.worker?.tpm_role || '';
    const isBeLead = roleAtLeast(userRole, 'be_lead') || userRole === 'be_lead' || userRole === 'admin' || userRole === 'it_lead' || userRole === 'leadership';

    // Per-plant repository scope, one control per module (OPL / Kaizen / Abnormality): own
    // plant is always shown; a BE lead can additionally opt into specific other plants. Gated
    // on the session role too, so a stale query cache from a prior higher-privilege login
    // can't expose it.
    const oplRepo = useOplRepositorySetting();
    const kaizenRepo = useKaizenRepositorySetting();
    const abnRepo = useAbnormalityRepositorySetting();
    const updateOplRepo = useUpdateOplRepositorySetting();
    const updateKaizenRepo = useUpdateKaizenRepositorySetting();
    const updateAbnRepo = useUpdateAbnormalityRepositorySetting();
    const repoScopes = [
        { key: 'opl', label: 'OPL Repository', query: oplRepo, mutation: updateOplRepo },
        { key: 'kaizen', label: 'Kaizen Repository', query: kaizenRepo, mutation: updateKaizenRepo },
        { key: 'abnormality', label: 'Abnormalities Repository', query: abnRepo, mutation: updateAbnRepo },
    ];
    // Show the panel whenever the session role is BE-lead-tier — one row per module, always all
    // three. A row that's still loading (or whose fetch failed) shows a placeholder rather than
    // vanishing, so a single slow request can't hide the others.
    const anyRepoCanEdit = isBeLead;

    // Approval Routing Dialog state
    const [isApprovalRoutingOpen, setIsApprovalRoutingOpen] = useState(false);
    const [selectedRoutingJhGroupId, setSelectedRoutingJhGroupId] = useState(NONE);
    const [routingConfig, setRoutingConfig] = useState({
        // oplStages is keyed by entity_type ('opl' = stage 1, 'opl_stage_2', 'opl_stage_3', ...)
        // so it can hold one approver config per configured OPL workflow stage.
        oplStages: { opl: { approver_role: 'jh_leader', approver_emp_ids: [] } },
        // kaizenStages mirrors oplStages — keyed by entity_type ('kaizen' = phase-1 stage 1,
        // 'kaizen_p1_stage_2', ...) so it can hold one approver config per configured Kaizen
        // phase-1 (pre-implementation) review stage.
        kaizenStages: { kaizen: { approver_role: 'jh_leader', approver_emp_ids: [] } },
        // kaizenDmtStages mirrors kaizenStages, for phase 2 (post-implementation). Floor is a
        // single implementation-review stage ('kaizen_dmt'), JH leader by default — the old
        // mandatory second "DMT confirm" stage was removed. Admins can add more stages.
        kaizenDmtStages: {
            kaizen_dmt: { approver_role: 'jh_leader', approver_emp_ids: [] },
        },
        // abnormalityStages/abnormalityDmtStages mirror kaizenStages — keyed by entity_type,
        // one config per configured phase-1/phase-2 stage.
        abnormalityStages: { abnormality: { approver_role: 'jh_leader', approver_emp_ids: [] } },
        abnormalityDmtStages: { abnormality_dmt: { approver_role: 'dmt_leader', approver_emp_ids: [] } },
    });
    const [routingError, setRoutingError] = useState(null);
    const [routingSuccess, setRoutingSuccess] = useState(null);
    const [routingModuleTab, setRoutingModuleTab] = useState('opl');

    // OPL Workflow Stage builder state (drag-and-drop ordered list, factory-wide)
    const [oplStageDrafts, setOplStageDrafts] = useState([]);
    const [oplStageDragIndex, setOplStageDragIndex] = useState(null);
    const [oplStageError, setOplStageError] = useState(null);
    const [oplStageSuccess, setOplStageSuccess] = useState(null);
    // Shared search box for the "who reviews this stage" picker — flat search across every
    // active worker, not just this JH group's members.
    const [approverPickerSearch, setApproverPickerSearch] = useState('');

    // Module/DMT Dialog state
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [selectedModule, setSelectedModule] = useState('');
    const [selectedFactoryId, setSelectedFactoryId] = useState(NONE);
    const [selectedLeadEmpId, setSelectedLeadEmpId] = useState(NONE);
    const [leadSearch, setLeadSearch] = useState('');
    const [selectedLevel, setSelectedLevel] = useState('1');
    const [formError, setFormError] = useState(null);

    // JH Group Dialog state
    const [isJhDialogOpen, setIsJhDialogOpen] = useState(false);
    const [targetModuleGroup, setTargetModuleGroup] = useState(null);
    const [jhGroupName, setJhGroupName] = useState('');
    const [jhLeaderEmpId, setJhLeaderEmpId] = useState(NONE);
    const [jhLeaderSearch, setJhLeaderSearch] = useState('');
    const [jhSelectedFactoryId, setJhSelectedFactoryId] = useState(NONE);
    const [jhLevel, setJhLevel] = useState('1');
    const [jhFormError, setJhFormError] = useState(null);

    // JH Group Members Dialog State
    const [membersJhGroup, setMembersJhGroup] = useState(null);
    const [selectedMemberEmpId, setSelectedMemberEmpId] = useState(NONE);
    const [selectedMemberRole, setSelectedMemberRole] = useState('member');
    const [memberSearch, setMemberSearch] = useState('');
    const [memberError, setMemberError] = useState(null);

    // DMT Members Dialog State
    const [membersDmtGroup, setMembersDmtGroup] = useState(null);
    const [selectedDmtMemberEmpId, setSelectedDmtMemberEmpId] = useState(NONE);
    const [selectedDmtMemberRole, setSelectedDmtMemberRole] = useState('member');
    const [dmtMemberSearch, setDmtMemberSearch] = useState('');
    const [dmtMemberError, setDmtMemberError] = useState(null);

    // Delete Confirmation Dialog state
    const [deleteConfirmItem, setDeleteConfirmItem] = useState(null); // { id, name, type: 'module' | 'jhGroup' }
    const [deleteError, setDeleteError] = useState(null);

    const groups = data?.groups ?? [];
    const factories = data?.factories ?? [];
    const moduleNames = data?.moduleNames ?? [];
    const workers = data?.workers ?? [];
    const jhGroups = data?.jhGroups ?? [];
    const plantAccessList = data?.plantAccess ?? [];
    const jhGroupsList = data?.jhGroupsList ?? [];
    const dmtMembersList = data?.dmtMembersList ?? [];
    const approvalRoutings = data?.approvalRoutings ?? [];

    const unassignedJhGroups = data?.unassignedJhGroups ?? [];

    const userPlantAccesses = useMemo(() => {
        if (!plantAccessList || !loggedInEmpId) return [];
        return plantAccessList.filter(upa => upa.emp_id === loggedInEmpId && upa.is_active !== false);
    }, [plantAccessList, loggedInEmpId]);

    const allowedFactoryIds = useMemo(() => {
        if (!userPlantAccesses || userPlantAccesses.length === 0) {
            if (session?.factory_id) return [session.factory_id];
            return [];
        }
        return userPlantAccesses.map(upa => upa.factory_id);
    }, [userPlantAccesses, session?.factory_id]);

    // OPL workflow stages are configured per-plant, not per-JH-group — a be_admin only
    // ever configures the single plant they have access to (per-plant scoping is enforced
    // server-side too; see authorizeWorkflowConfigWrite in backend/server.js).
    const oplWorkflowFactoryId = allowedFactoryIds[0] || null;
    const { data: oplWorkflowStagesData } = useOplWorkflowStages(oplWorkflowFactoryId);
    // Kaizen phase 1 (pre-implementation JH review) — same one-fixed-floor-stage pattern as
    // OPL, reusing the generic /api/org/workflow-stages endpoint (module='kaizen', phase=1).
    const { data: kzP1StagesData } = useWorkflowStages(oplWorkflowFactoryId, 'kaizen', 1);
    const [kzP1StageDrafts, setKzP1StageDrafts] = useState([]);
    const [kzP1StageDragIndex, setKzP1StageDragIndex] = useState(null);
    const [kzP1StageError, setKzP1StageError] = useState(null);
    const [kzP1StageSuccess, setKzP1StageSuccess] = useState(null);
    // Kaizen phase 2 (post-implementation: JH forwards, then DMT confirms) — same pattern,
    // but the floor is 2 fixed stages (not 1), so removal is blocked below that minimum.
    const { data: kzP2StagesData } = useWorkflowStages(oplWorkflowFactoryId, 'kaizen', 2);
    const [kzP2StageDrafts, setKzP2StageDrafts] = useState([]);
    const [kzP2StageDragIndex, setKzP2StageDragIndex] = useState(null);
    const [kzP2StageError, setKzP2StageError] = useState(null);
    const [kzP2StageSuccess, setKzP2StageSuccess] = useState(null);
    // Abnormality phase 1 (JH review) and phase 2 (DMT review) — both single-fixed-floor-stage,
    // same simple pattern as OPL/Kaizen phase 1.
    const { data: abnP1StagesData } = useWorkflowStages(oplWorkflowFactoryId, 'abnormality', 1);
    const [abnP1StageDrafts, setAbnP1StageDrafts] = useState([]);
    const [abnP1StageDragIndex, setAbnP1StageDragIndex] = useState(null);
    const [abnP1StageError, setAbnP1StageError] = useState(null);
    const [abnP1StageSuccess, setAbnP1StageSuccess] = useState(null);
    const { data: abnP2StagesData } = useWorkflowStages(oplWorkflowFactoryId, 'abnormality', 2);
    const [abnP2StageDrafts, setAbnP2StageDrafts] = useState([]);
    const [abnP2StageDragIndex, setAbnP2StageDragIndex] = useState(null);
    const [abnP2StageError, setAbnP2StageError] = useState(null);
    const [abnP2StageSuccess, setAbnP2StageSuccess] = useState(null);
    const saveWorkflowStages = useSaveWorkflowStages();

    useEffect(() => {
        // Stage labels are always "Reviewer N" by position — normalize on load so any
        // stage saved under the old free-text naming (or via direct API testing) self-heals
        // the next time this factory's workflow is saved, instead of showing stale text.
        if (Array.isArray(oplWorkflowStagesData) && oplWorkflowStagesData.length > 0) {
            setOplStageDrafts(oplWorkflowStagesData.map((s, i) => ({ stage_name: `Reviewer ${i + 1}`, entity_type: s.entity_type })));
        } else {
            setOplStageDrafts([{ stage_name: 'Reviewer 1', entity_type: 'opl' }]);
        }
    }, [oplWorkflowStagesData]);

    useEffect(() => {
        if (Array.isArray(kzP1StagesData) && kzP1StagesData.length > 0) {
            setKzP1StageDrafts(kzP1StagesData.map((s, i) => ({ stage_name: `Reviewer ${i + 1}`, entity_type: s.entity_type })));
        } else {
            setKzP1StageDrafts([{ stage_name: 'Reviewer 1', entity_type: 'kaizen' }]);
        }
    }, [kzP1StagesData]);

    useEffect(() => {
        if (Array.isArray(kzP2StagesData) && kzP2StagesData.length > 0) {
            setKzP2StageDrafts(kzP2StagesData.map((s, i) => ({ stage_name: `Reviewer ${i + 1}`, entity_type: s.entity_type })));
        } else {
            setKzP2StageDrafts([{ stage_name: 'Reviewer 1', entity_type: 'kaizen_dmt' }]);
        }
    }, [kzP2StagesData]);

    useEffect(() => {
        if (Array.isArray(abnP1StagesData) && abnP1StagesData.length > 0) {
            setAbnP1StageDrafts(abnP1StagesData.map((s, i) => ({ stage_name: `Reviewer ${i + 1}`, entity_type: s.entity_type })));
        } else {
            setAbnP1StageDrafts([{ stage_name: 'Reviewer 1', entity_type: 'abnormality' }]);
        }
    }, [abnP1StagesData]);

    useEffect(() => {
        if (Array.isArray(abnP2StagesData) && abnP2StagesData.length > 0) {
            setAbnP2StageDrafts(abnP2StagesData.map((s, i) => ({ stage_name: `Reviewer ${i + 1}`, entity_type: s.entity_type })));
        } else {
            setAbnP2StageDrafts([{ stage_name: 'Reviewer 1', entity_type: 'abnormality_dmt' }]);
        }
    }, [abnP2StagesData]);

    // Every stage-drafts sync effect above only re-fires when the SAVED data actually changes
    // — if the admin edits a draft (drags/adds/removes stages) and closes the dialog WITHOUT
    // saving, the query data never changes, so those effects never re-fire, and the unsaved
    // draft silently survives in memory for next time the dialog reopens. Force a hard reset
    // from whatever's currently saved every time the dialog opens, discarding any unsaved edits.
    useEffect(() => {
        if (!isApprovalRoutingOpen) return;
        setOplStageDrafts(Array.isArray(oplWorkflowStagesData) && oplWorkflowStagesData.length > 0
            ? oplWorkflowStagesData.map((s, i) => ({ stage_name: `Reviewer ${i + 1}`, entity_type: s.entity_type }))
            : [{ stage_name: 'Reviewer 1', entity_type: 'opl' }]);
        setKzP1StageDrafts(Array.isArray(kzP1StagesData) && kzP1StagesData.length > 0
            ? kzP1StagesData.map((s, i) => ({ stage_name: `Reviewer ${i + 1}`, entity_type: s.entity_type }))
            : [{ stage_name: 'Reviewer 1', entity_type: 'kaizen' }]);
        setKzP2StageDrafts(Array.isArray(kzP2StagesData) && kzP2StagesData.length > 0
            ? kzP2StagesData.map((s, i) => ({ stage_name: `Reviewer ${i + 1}`, entity_type: s.entity_type }))
            : [{ stage_name: 'Reviewer 1', entity_type: 'kaizen_dmt' }]);
        setAbnP1StageDrafts(Array.isArray(abnP1StagesData) && abnP1StagesData.length > 0
            ? abnP1StagesData.map((s, i) => ({ stage_name: `Reviewer ${i + 1}`, entity_type: s.entity_type }))
            : [{ stage_name: 'Reviewer 1', entity_type: 'abnormality' }]);
        setAbnP2StageDrafts(Array.isArray(abnP2StagesData) && abnP2StagesData.length > 0
            ? abnP2StagesData.map((s, i) => ({ stage_name: `Reviewer ${i + 1}`, entity_type: s.entity_type }))
            : [{ stage_name: 'Reviewer 1', entity_type: 'abnormality_dmt' }]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isApprovalRoutingOpen]);

    useEffect(() => {
        const parseEmpIds = (rule) => {
            if (!rule?.approver_emp_id || rule.approver_emp_id === NONE) return [];
            return String(rule.approver_emp_id).split(',').map(s => s.trim()).filter(Boolean);
        };

        // Who approves each stage is configured against the SAVED stage structure, not the
        // in-progress draft — a newly added, not-yet-saved stage has no entity_type to hang
        // an approval_routing row off yet.
        const stageEntityTypes = Array.isArray(oplWorkflowStagesData) && oplWorkflowStagesData.length > 0
            ? oplWorkflowStagesData.map((s) => s.entity_type)
            : ['opl'];
        const kzP1EntityTypes = Array.isArray(kzP1StagesData) && kzP1StagesData.length > 0
            ? kzP1StagesData.map((s) => s.entity_type)
            : ['kaizen'];
        const kzP2EntityTypes = Array.isArray(kzP2StagesData) && kzP2StagesData.length > 0
            ? kzP2StagesData.map((s) => s.entity_type)
            : ['kaizen_dmt'];
        const abnP1EntityTypes = Array.isArray(abnP1StagesData) && abnP1StagesData.length > 0
            ? abnP1StagesData.map((s) => s.entity_type)
            : ['abnormality'];
        const abnP2EntityTypes = Array.isArray(abnP2StagesData) && abnP2StagesData.length > 0
            ? abnP2StagesData.map((s) => s.entity_type)
            : ['abnormality_dmt'];

        if (selectedRoutingJhGroupId !== NONE && approvalRoutings.length > 0) {
            const jhRoutings = approvalRoutings.filter(ar => ar.jh_group_id === selectedRoutingJhGroupId);

            const oplStages = {};
            for (const entityType of stageEntityTypes) {
                const rule = jhRoutings.find(r => r.entity_type === entityType);
                oplStages[entityType] = {
                    approver_role: rule?.approver_role || 'jh_leader',
                    approver_emp_ids: parseEmpIds(rule)
                };
            }
            const kaizenStages = {};
            for (const entityType of kzP1EntityTypes) {
                const rule = jhRoutings.find(r => r.entity_type === entityType);
                kaizenStages[entityType] = {
                    approver_role: rule?.approver_role || 'jh_leader',
                    approver_emp_ids: parseEmpIds(rule)
                };
            }
            const kaizenDmtStages = {};
            for (const [i, entityType] of kzP2EntityTypes.entries()) {
                const rule = jhRoutings.find(r => r.entity_type === entityType);
                kaizenDmtStages[entityType] = {
                    approver_role: rule?.approver_role || (i === 0 ? 'jh_leader' : 'dmt_leader'),
                    approver_emp_ids: parseEmpIds(rule)
                };
            }

            const abnormalityStages = {};
            for (const entityType of abnP1EntityTypes) {
                const rule = jhRoutings.find(r => r.entity_type === entityType);
                abnormalityStages[entityType] = {
                    approver_role: rule?.approver_role || 'jh_leader',
                    approver_emp_ids: parseEmpIds(rule)
                };
            }
            const abnormalityDmtStages = {};
            for (const entityType of abnP2EntityTypes) {
                const rule = jhRoutings.find(r => r.entity_type === entityType);
                abnormalityDmtStages[entityType] = {
                    approver_role: rule?.approver_role || 'dmt_leader',
                    approver_emp_ids: parseEmpIds(rule)
                };
            }

            setRoutingConfig({
                oplStages,
                kaizenStages,
                kaizenDmtStages,
                abnormalityStages,
                abnormalityDmtStages,
            });
        } else {
            const oplStages = {};
            for (const entityType of stageEntityTypes) {
                oplStages[entityType] = { approver_role: 'jh_leader', approver_emp_ids: [] };
            }
            const kaizenStages = {};
            for (const entityType of kzP1EntityTypes) {
                kaizenStages[entityType] = { approver_role: 'jh_leader', approver_emp_ids: [] };
            }
            const kaizenDmtStages = {};
            for (const [i, entityType] of kzP2EntityTypes.entries()) {
                kaizenDmtStages[entityType] = { approver_role: i === 0 ? 'jh_leader' : 'dmt_leader', approver_emp_ids: [] };
            }
            const abnormalityStages = {};
            for (const entityType of abnP1EntityTypes) {
                abnormalityStages[entityType] = { approver_role: 'jh_leader', approver_emp_ids: [] };
            }
            const abnormalityDmtStages = {};
            for (const entityType of abnP2EntityTypes) {
                abnormalityDmtStages[entityType] = { approver_role: 'dmt_leader', approver_emp_ids: [] };
            }
            setRoutingConfig({
                oplStages,
                kaizenStages,
                kaizenDmtStages,
                abnormalityStages,
                abnormalityDmtStages,
            });
        }
    }, [selectedRoutingJhGroupId, approvalRoutings, oplWorkflowStagesData, kzP1StagesData, kzP2StagesData, abnP1StagesData, abnP2StagesData]);

    const selectedRoutingJhGroup = useMemo(() => {
        if (selectedRoutingJhGroupId === NONE) return null;
        return jhGroups.find(jh => jh.id === selectedRoutingJhGroupId);
    }, [jhGroups, selectedRoutingJhGroupId]);

    // The DMT/module group this JH Group sits under — used to show the actual DMT lead's
    // name in the "DMT / Module Lead" routing option, instead of just the role name.
    const selectedRoutingParentGroup = useMemo(() => {
        if (!selectedRoutingJhGroup) return null;
        return groups.find(g => g.id === selectedRoutingJhGroup.module_group_id) || null;
    }, [groups, selectedRoutingJhGroup]);

    const jhLeaderOptionLabel = `JH Leader — ${selectedRoutingJhGroup?.leader_name || 'Unassigned'}`;
    const dmtLeaderOptionLabel = `DMT Leader — ${selectedRoutingParentGroup?.module_lead_name || 'Unassigned'}`;

    // Who a stage's approver picker can choose from — every active worker in the factory,
    // not just this JH group's members, filtered by the shared search box.
    const approverPickerResults = useMemo(() => {
        const q = approverPickerSearch.trim().toLowerCase();
        const pool = (workers || []).filter(w => w.is_active !== false);
        if (!q) return pool;
        return pool.filter(w => {
            const name = (w.name || w.worker_name || '').toLowerCase();
            const empId = (w.emp_id || w.id || '').toLowerCase();
            return name.includes(q) || empId.includes(q);
        });
    }, [workers, approverPickerSearch]);

    const routingJhGroupMembers = useMemo(() => {
        if (!selectedRoutingJhGroup) return workers;
        const listMembers = jhGroupsList.filter(m => m.jh_group_id === selectedRoutingJhGroup.id);
        const result = [...listMembers];
        if (selectedRoutingJhGroup.leader_emp_id && !result.some(m => m.emp_id === selectedRoutingJhGroup.leader_emp_id)) {
            result.unshift({
                emp_id: selectedRoutingJhGroup.leader_emp_id,
                worker_name: selectedRoutingJhGroup.leader_name || selectedRoutingJhGroup.leader_emp_id,
                role: 'leader'
            });
        }
        return result.length > 0 ? result : workers;
    }, [selectedRoutingJhGroup, jhGroupsList, workers]);

    // Active members for the currently selected DMT Group in the modal
    const dmtGroupMembers = useMemo(() => {
        if (!membersDmtGroup) return [];
        return dmtMembersList.filter(m => m.module_group_id === membersDmtGroup.id || m.dmt_id === membersDmtGroup.id);
    }, [dmtMembersList, membersDmtGroup]);

    // Calculate total member count for a DMT Group including Module Lead
    const getDmtGroupMemberCount = useCallback((g) => {
        if (!g) return 0;
        const rawMembers = dmtMembersList.filter(m => m.module_group_id === g.id || m.dmt_id === g.id);
        const hasLead = !!(g.module_lead_emp_id || g.module_lead_name);
        const leadInList = hasLead && rawMembers.some(m => (g.module_lead_emp_id && m.emp_id === g.module_lead_emp_id) || (g.module_lead_name && m.worker_name === g.module_lead_name));
        return rawMembers.length + (hasLead && !leadInList ? 1 : 0);
    }, [dmtMembersList]);

    // Filter workers available to add (not already members or lead of this DMT Group)
    const availableWorkersForDmtGroup = useMemo(() => {
        if (!membersDmtGroup || !workers) return [];
        const memberEmpIds = dmtGroupMembers.map(m => m.emp_id);
        if (membersDmtGroup.module_lead_emp_id) {
            memberEmpIds.push(membersDmtGroup.module_lead_emp_id);
        }
        let list = workers.filter(w => !memberEmpIds.includes(w.emp_id) && !memberEmpIds.includes(w.id));
        if (dmtMemberSearch.trim()) {
            const q = dmtMemberSearch.toLowerCase().trim();
            list = list.filter(w =>
                (w.name && w.name.toLowerCase().includes(q)) ||
                (w.emp_id && w.emp_id.toLowerCase().includes(q)) ||
                (w.email && w.email.toLowerCase().includes(q))
            );
        }
        return list;
    }, [workers, dmtGroupMembers, membersDmtGroup, dmtMemberSearch]);

    // Active members for the currently selected JH Group in the modal
    const groupMembers = useMemo(() => {
        if (!membersJhGroup) return [];
        return jhGroupsList.filter(m => m.jh_group_id === membersJhGroup.id);
    }, [jhGroupsList, membersJhGroup]);

    // Calculate total member count for a JH Group including the group leader
    const getJhGroupMemberCount = useCallback((jh) => {
        if (!jh) return 0;
        const rawMembers = jhGroupsList.filter(m => m.jh_group_id === jh.id);
        const hasLeader = !!(jh.leader_emp_id || jh.leader_name);
        const leaderInList = hasLeader && rawMembers.some(m => (jh.leader_emp_id && m.emp_id === jh.leader_emp_id) || (jh.leader_name && m.worker_name === jh.leader_name));
        return rawMembers.length + (hasLeader && !leaderInList ? 1 : 0);
    }, [jhGroupsList]);

    // Filter workers available to add (not already members or leader of this JH Group)
    const availableWorkersForJhGroup = useMemo(() => {
        if (!membersJhGroup || !workers) return [];
        const memberEmpIds = groupMembers.map(m => m.emp_id);
        if (membersJhGroup.leader_emp_id) {
            memberEmpIds.push(membersJhGroup.leader_emp_id);
        }
        let list = workers.filter(w => !memberEmpIds.includes(w.emp_id) && !memberEmpIds.includes(w.id));
        if (memberSearch.trim()) {
            const q = memberSearch.toLowerCase().trim();
            list = list.filter(w =>
                (w.name && w.name.toLowerCase().includes(q)) ||
                (w.emp_id && w.emp_id.toLowerCase().includes(q)) ||
                (w.email && w.email.toLowerCase().includes(q))
            );
        }
        return list;
    }, [workers, groupMembers, membersJhGroup, memberSearch]);

    // Filter Module Groups (DMTs) based on user's authorized plant access
    const visibleGroups = useMemo(() => {
        if (!groups) return [];
        if (allowedFactoryIds.length === 0) return groups;
        return groups.filter(g => {
            if (!g.factory_id || g.factory_id === '' || g.factory_id === '00000000-0000-0000-0000-000000000001') {
                return true;
            }
            return allowedFactoryIds.includes(g.factory_id);
        });
    }, [groups, allowedFactoryIds]);

    const availableFactoriesForCreation = useMemo(() => {
        if (allowedFactoryIds.length === 0) return factories;
        return factories.filter(f => allowedFactoryIds.includes(f.id));
    }, [factories, allowedFactoryIds]);

    const filteredWorkers = useMemo(() => {
        if (!leadSearch.trim()) return workers;
        const q = leadSearch.toLowerCase().trim();
        return workers.filter((w) => {
            const isSelected = (w.emp_id && w.emp_id === selectedLeadEmpId) || (w.id && w.id === selectedLeadEmpId);
            if (isSelected) return true;
            return (
                (w.name && w.name.toLowerCase().includes(q)) ||
                (w.emp_id && w.emp_id.toLowerCase().includes(q)) ||
                (w.email && w.email.toLowerCase().includes(q))
            );
        });
    }, [workers, leadSearch, selectedLeadEmpId]);

    const filteredJhLeaders = useMemo(() => {
        if (!jhLeaderSearch.trim()) return workers;
        const q = jhLeaderSearch.toLowerCase().trim();
        return workers.filter((w) => {
            const isSelected = (w.emp_id && w.emp_id === jhLeaderEmpId) || (w.id && w.id === jhLeaderEmpId);
            if (isSelected) return true;
            return (
                (w.name && w.name.toLowerCase().includes(q)) ||
                (w.emp_id && w.emp_id.toLowerCase().includes(q)) ||
                (w.email && w.email.toLowerCase().includes(q))
            );
        });
    }, [workers, jhLeaderSearch, jhLeaderEmpId]);

    function openDialog() {
        setFormError(null);
        setSelectedModule(moduleNames[0]?.name || '');
        // A DMT must belong to exactly one plant — default to the first the admin can use.
        setSelectedFactoryId(availableFactoriesForCreation[0]?.id || NONE);
        setSelectedLeadEmpId(NONE);
        setLeadSearch('');
        setSelectedLevel('1');
        setIsDialogOpen(true);
    }

    function handleSubmit() {
        if (!selectedModule) return;
        if (!selectedFactoryId || selectedFactoryId === NONE) {
            setFormError({ message: 'Select a plant for this DMT' });
            return;
        }
        setFormError(null);

        const leadWorker = workers.find(w => w.emp_id === selectedLeadEmpId || w.id === selectedLeadEmpId);
        const leadName = leadWorker ? leadWorker.name : '';

        createModuleGroup.mutate({
            module: selectedModule,
            factory_id: selectedFactoryId,
            module_lead_emp_id: selectedLeadEmpId === NONE ? null : selectedLeadEmpId,
            module_lead_name: leadName || null,
            level: Number(selectedLevel) || 1
        }, {
            onSuccess: () => {
                setIsDialogOpen(false);
                toast.success('Module group saved!');
            },
            onError: (err) => {
                setFormError(err);
                toast.error(err?.message || 'Failed to save module group');
            }
        });
    }

    function requestDeleteModule(id, name) {
        setDeleteError(null);
        setDeleteConfirmItem({ id, name, type: 'module' });
    }

    function requestDeleteJhGroup(id, name) {
        setDeleteError(null);
        setDeleteConfirmItem({ id, name, type: 'jhGroup' });
    }

    function handleConfirmDelete() {
        if (!deleteConfirmItem) return;
        setDeleteError(null);

        if (deleteConfirmItem.type === 'module') {
            deleteModuleGroup.mutate(deleteConfirmItem.id, {
                onSuccess: () => {
                    setDeleteConfirmItem(null);
                    toast.success('Module group deleted');
                },
                onError: (err) => {
                    setDeleteError(err);
                    toast.error(err?.message || 'Failed to delete module group');
                }
            });
        } else if (deleteConfirmItem.type === 'jhGroup') {
            deleteJhGroup.mutate(deleteConfirmItem.id, {
                onSuccess: () => {
                    setDeleteConfirmItem(null);
                    toast.success('JH group deleted');
                },
                onError: (err) => {
                    setDeleteError(err);
                    toast.error(err?.message || 'Failed to delete JH group');
                }
            });
        }
    }

    function openJhDialog(moduleGroup) {
        setJhFormError(null);
        setTargetModuleGroup(moduleGroup);
        setJhGroupName('');
        setJhLeaderEmpId(NONE);
        setJhLeaderSearch('');
        setJhSelectedFactoryId(moduleGroup?.factory_id || NONE);
        setJhLevel(String(moduleGroup?.level || '1'));
        setIsJhDialogOpen(true);
    }

    function handleJhSubmit() {
        if (!jhGroupName.trim()) return;
        
        const factoryIdToUse = targetModuleGroup ? (targetModuleGroup.factory_id || null) : (jhSelectedFactoryId === NONE ? null : jhSelectedFactoryId);
        
        if (!factoryIdToUse && !targetModuleGroup) {
            setJhFormError({ message: 'Factory is required for independent JH Groups' });
            return;
        }

        setJhFormError(null);

        const leaderWorker = workers.find(w => w.emp_id === jhLeaderEmpId || w.id === jhLeaderEmpId);
        const leaderName = leaderWorker ? leaderWorker.name : '';

        createJhGroup.mutate({
            name: jhGroupName.trim(),
            module_group_id: targetModuleGroup?.id || null,
            factory_id: factoryIdToUse,
            leader_emp_id: jhLeaderEmpId === NONE ? null : jhLeaderEmpId,
            leader_name: leaderName || null,
            level: Number(jhLevel) || 1
        }, {
            onSuccess: () => {
                setIsJhDialogOpen(false);
                toast.success('JH group saved!');
            },
            onError: (err) => {
                setJhFormError(err);
                toast.error(err?.message || 'Failed to save JH group');
            }
        });
    }

    // Plain-language label for who a stage's config currently resolves to — used to draw the
    // From → To flow on each stage card.
    function describeStageApprover(cfg) {
        if (!cfg || cfg.approver_role === 'jh_leader') return selectedRoutingJhGroup?.leader_name || 'JH Leader (Unassigned)';
        if (cfg.approver_role === 'dmt_leader') return selectedRoutingParentGroup?.module_lead_name || 'DMT Leader (Unassigned)';
        if (!Array.isArray(cfg.approver_emp_ids) || cfg.approver_emp_ids.length === 0) return 'Not yet selected';
        return cfg.approver_emp_ids
            .map((empId) => {
                const w = workers.find((x) => (x.emp_id || x.id) === empId);
                return w ? w.name : empId;
            })
            .join(', ');
    }

    function handleSaveRouting() {
        if (selectedRoutingJhGroupId === NONE) {
            setRoutingError({ message: 'Please select a JH Group to configure approval routing.' });
            return;
        }
        setRoutingError(null);
        setRoutingSuccess(null);

        const targetJh = jhGroups.find(j => j.id === selectedRoutingJhGroupId);
        const factoryId = targetJh?.factory_id || allowedFactoryIds[0] || null;

        const getWorkerNames = (empIdsArr) => {
            if (!Array.isArray(empIdsArr) || empIdsArr.length === 0) return null;
            return empIdsArr.map(empId => {
                const w = workers.find(work => (work.emp_id || work.id) === empId);
                return w ? w.name : empId;
            }).join(', ');
        };

        const formatEmpIds = (cfg) => {
            if (cfg.approver_role !== 'specific') return null;
            if (!Array.isArray(cfg.approver_emp_ids) || cfg.approver_emp_ids.length === 0) return null;
            return cfg.approver_emp_ids.join(',');
        };

        const oplStageRoutings = Object.entries(routingConfig.oplStages).map(([entityType, cfg]) => ({
            entity_type: entityType,
            approver_role: cfg.approver_role,
            approver_emp_id: formatEmpIds(cfg),
            approver_name: cfg.approver_role === 'specific' ? getWorkerNames(cfg.approver_emp_ids) : null
        }));

        const kaizenStageRoutings = Object.entries(routingConfig.kaizenStages).map(([entityType, cfg]) => ({
            entity_type: entityType,
            approver_role: cfg.approver_role,
            approver_emp_id: formatEmpIds(cfg),
            approver_name: cfg.approver_role === 'specific' ? getWorkerNames(cfg.approver_emp_ids) : null
        }));

        const kaizenDmtStageRoutings = Object.entries(routingConfig.kaizenDmtStages).map(([entityType, cfg]) => ({
            entity_type: entityType,
            approver_role: cfg.approver_role,
            approver_emp_id: formatEmpIds(cfg),
            approver_name: cfg.approver_role === 'specific' ? getWorkerNames(cfg.approver_emp_ids) : null
        }));

        const abnormalityStageRoutings = Object.entries(routingConfig.abnormalityStages).map(([entityType, cfg]) => ({
            entity_type: entityType,
            approver_role: cfg.approver_role,
            approver_emp_id: formatEmpIds(cfg),
            approver_name: cfg.approver_role === 'specific' ? getWorkerNames(cfg.approver_emp_ids) : null
        }));
        const abnormalityDmtStageRoutings = Object.entries(routingConfig.abnormalityDmtStages).map(([entityType, cfg]) => ({
            entity_type: entityType,
            approver_role: cfg.approver_role,
            approver_emp_id: formatEmpIds(cfg),
            approver_name: cfg.approver_role === 'specific' ? getWorkerNames(cfg.approver_emp_ids) : null
        }));

        const routingsToSave = [
            ...oplStageRoutings,
            ...kaizenStageRoutings,
            ...kaizenDmtStageRoutings,
            ...abnormalityStageRoutings,
            ...abnormalityDmtStageRoutings,
        ];

        saveApprovalRouting.mutate({
            factory_id: factoryId,
            jh_group_id: selectedRoutingJhGroupId,
            routings: routingsToSave
        }, {
            onSuccess: () => {
                setRoutingSuccess(`Approval routing rules saved successfully for ${targetJh?.name || 'JH Group'}!`);
                toast.success(`Routing saved for ${targetJh?.name || 'JH Group'}!`);
                setIsApprovalRoutingOpen(false);
            },
            onError: (err) => {
                setRoutingError(err);
                toast.error(err?.message || 'Failed to save approval routing');
            }
        });
    }

    // --- OPL Workflow Stage builder (drag-and-drop, factory-wide) ---

    // Stage labels are system-generated ("Review 1", "Review 2", ...), not admin-typed free
    // text — this keeps the flow reading the same way everywhere, whether a module has one
    // review step or several, so nobody has to learn a plant's custom naming.
    function addOplStage() {
        setOplStageDrafts(prev => [...prev, { stage_name: `Reviewer ${prev.length + 1}`, entity_type: null }]);
    }

    function removeOplStage(index) {
        setOplStageDrafts(prev => {
            if (prev.length <= 1) return prev; // minimum 1 stage
            return prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, stage_name: `Reviewer ${i + 1}` }));
        });
    }

    function handleOplStageDragStart(index) {
        setOplStageDragIndex(index);
    }

    function handleOplStageDragOver(e, index) {
        e.preventDefault();
        if (oplStageDragIndex === null || oplStageDragIndex === index) return;
        setOplStageDrafts(prev => {
            const next = [...prev];
            const [moved] = next.splice(oplStageDragIndex, 1);
            next.splice(index, 0, moved);
            return next.map((s, i) => ({ ...s, stage_name: `Reviewer ${i + 1}` }));
        });
        setOplStageDragIndex(index);
    }

    function handleOplStageDragEnd() {
        setOplStageDragIndex(null);
    }

    function handleSaveOplStages() {
        setOplStageError(null);
        setOplStageSuccess(null);
        if (!oplWorkflowFactoryId) {
            setOplStageError({ message: 'No plant is associated with your account — cannot save the OPL workflow.' });
            return;
        }
        if (oplStageDrafts.some(s => !s.stage_name || !s.stage_name.trim())) {
            setOplStageError({ message: 'Every stage needs a name.' });
            return;
        }
        saveOplWorkflowStages.mutate({
            factory_id: oplWorkflowFactoryId,
            stages: oplStageDrafts.map(s => ({ stage_name: s.stage_name.trim() }))
        }, {
            onSuccess: () => {
                setOplStageSuccess('OPL approval workflow saved.');
                toast.success('OPL workflow saved!');
            },
            onError: (err) => {
                setOplStageError(err);
                toast.error(err?.message || 'Failed to save OPL workflow');
            }
        });
    }

    // Kaizen phase 1 (pre-implementation JH review) stage builder — mirrors the OPL handlers
    // above exactly, just targeting the generic /api/org/workflow-stages endpoint.
    function addKzP1Stage() {
        setKzP1StageDrafts(prev => [...prev, { stage_name: `Reviewer ${prev.length + 1}`, entity_type: null }]);
    }

    function removeKzP1Stage(index) {
        setKzP1StageDrafts(prev => {
            if (prev.length <= 1) return prev;
            return prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, stage_name: `Reviewer ${i + 1}` }));
        });
    }

    function handleKzP1StageDragStart(index) {
        setKzP1StageDragIndex(index);
    }

    function handleKzP1StageDragOver(e, index) {
        e.preventDefault();
        if (kzP1StageDragIndex === null || kzP1StageDragIndex === index) return;
        setKzP1StageDrafts(prev => {
            const next = [...prev];
            const [moved] = next.splice(kzP1StageDragIndex, 1);
            next.splice(index, 0, moved);
            return next.map((s, i) => ({ ...s, stage_name: `Reviewer ${i + 1}` }));
        });
        setKzP1StageDragIndex(index);
    }

    function handleKzP1StageDragEnd() {
        setKzP1StageDragIndex(null);
    }

    function handleSaveKzP1Stages() {
        setKzP1StageError(null);
        setKzP1StageSuccess(null);
        if (!oplWorkflowFactoryId) {
            setKzP1StageError({ message: 'No plant is associated with your account — cannot save the Kaizen workflow.' });
            return;
        }
        if (kzP1StageDrafts.some(s => !s.stage_name || !s.stage_name.trim())) {
            setKzP1StageError({ message: 'Every stage needs a name.' });
            return;
        }
        saveWorkflowStages.mutate({
            factory_id: oplWorkflowFactoryId,
            module: 'kaizen',
            phase: 1,
            stages: kzP1StageDrafts.map(s => ({ stage_name: s.stage_name.trim() }))
        }, {
            onSuccess: () => {
                setKzP1StageSuccess('Kaizen phase-1 approval workflow saved.');
                toast.success('Kaizen phase-1 workflow saved!');
            },
            onError: (err) => {
                setKzP1StageError(err);
                toast.error(err?.message || 'Failed to save Kaizen phase-1 workflow');
            }
        });
    }

    return (
        <div className="mx-auto max-w-4xl px-gutter py-6 lg:px-gutter-lg overflow-x-hidden">
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line pb-4">
                <div>
                    <h1 className="text-xl sm:text-2xl font-semibold text-ink-strong">{t('mdm.org.title', 'Org Structure')}</h1>
                    <p className="text-xs text-ink-muted">Manage Module Groups, Module Leaders, and JH Groups</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                    {/* Approval Routing is configured per JH Group — each group's own
                        "Routing" button (below) opens this dialog already scoped to it. */}
                    <Button onClick={() => openJhDialog(null)} variant="outline" className="gap-2 bg-surface hover:bg-surface-hover w-full sm:w-auto text-xs sm:text-sm">
                        <Users size={16} aria-hidden />
                        New Independent JH Group
                    </Button>
                    <Button onClick={openDialog} className="gap-2 w-full sm:w-auto text-xs sm:text-sm">
                        <Plus size={16} aria-hidden />
                        New Module/DMT
                    </Button>
                </div>
            </div>

            {anyRepoCanEdit && (
                <div className="mb-6 flex flex-col gap-4 rounded-lg border border-line bg-surface-raised p-4 shadow-xs">
                    <div className="flex items-start gap-2.5">
                        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-blue-700" />
                        <div>
                            <p className="text-sm font-semibold text-ink-strong">Repository Plant Scope</p>
                            <p className="text-xs text-ink-muted">
                                Each module's repository always shows your own plant. Tap another plant to also show its records there.
                            </p>
                        </div>
                    </div>
                    {repoScopes.map((s) => {
                        const setting = s.query?.data;
                        const canEdit = setting?.can_edit === true;
                        const myPlantId = setting?.factory_id ?? null;
                        const allPlants = setting?.all_plants ?? [];
                        const extra = (setting?.extra_factory_ids ?? []).map(String);
                        const otherPlants = allPlants.filter((p) => String(p.id) !== String(myPlantId));
                        const toggle = (plantId) => {
                            const id = String(plantId);
                            const next = extra.includes(id) ? extra.filter((x) => x !== id) : [...extra, id];
                            s.mutation.mutate(next, {
                                onSuccess: () => toast.success('Repository plant list updated'),
                                onError: () => toast.error('Failed to update repository plant list'),
                            });
                        };
                        return (
                            <div key={s.key} className="flex flex-col gap-2 border-t border-line pt-3 first:border-t-0 first:pt-0">
                                <p className="text-xs font-semibold text-ink-strong">{s.label}</p>
                                {!setting ? (
                                    <span className="text-xs text-ink-subtle italic">
                                        {s.query?.isError ? 'Could not load — check the server is running.' : 'Loading…'}
                                    </span>
                                ) : !canEdit ? (
                                    <span className="text-xs text-ink-subtle italic">Not available for your account.</span>
                                ) : (
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="inline-flex items-center gap-1 rounded-md bg-blue-600 text-white px-2.5 py-1 text-xs font-semibold">
                                        {allPlants.find((p) => String(p.id) === String(myPlantId))?.code || 'My Plant'} (always)
                                    </span>
                                    {otherPlants.map((p) => {
                                        const on = extra.includes(String(p.id));
                                        return (
                                            <button
                                                key={p.id}
                                                type="button"
                                                disabled={s.mutation.isPending}
                                                onClick={() => toggle(p.id)}
                                                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold border transition-colors ${
                                                    on
                                                        ? 'bg-blue-600 text-white border-blue-600'
                                                        : 'bg-surface text-ink-muted border-line hover:border-blue-400 hover:text-ink-strong'
                                                }`}
                                            >
                                                {on ? <CheckCircle2 size={13} /> : <Plus size={13} />}
                                                {p.code || p.name}
                                            </button>
                                        );
                                    })}
                                    {otherPlants.length === 0 && (
                                        <span className="text-xs text-ink-subtle italic">No other plants exist</span>
                                    )}
                                    {s.mutation.isPending && <span className="text-xs text-ink-muted">Saving…</span>}
                                </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {formError && !isDialogOpen && (
                <div className="mb-4">
                    <MdmErrorNote error={formError} />
                </div>
            )}

            {isLoading ? (
                <p className="text-sm text-ink-muted">{t('common.loading', 'Loading...')}</p>
            ) : visibleGroups.length === 0 ? (
                <div className="rounded-lg border border-dashed border-line p-8 text-center bg-surface-raised">
                    <Layers size={32} className="mx-auto mb-2 text-ink-subtle" />
                    <p className="text-sm font-medium text-ink-muted">No Module/DMT groups found for your authorized plants</p>
                    <p className="mt-1 text-xs text-ink-subtle">You currently only have access to view DMTs belonging to your authorized plant(s). Click "New Module/DMT" to create one.</p>
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                    {visibleGroups.map((g) => {
                        const moduleJhList = jhGroups.filter(
                            (jh) => jh.module_group_id === g.id || jh.dmt_id === g.id
                        );

                        return (
                            <div key={g.id} className="flex flex-col justify-between rounded-lg border border-line bg-surface-raised p-4 shadow-xs">
                                <div className="space-y-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-subtle pb-2">
                                        <span className="rounded bg-blue-600/10 px-2.5 py-1 text-xs font-semibold text-blue-700">
                                            {g.module}
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <LevelSelect
                                                value={g.level}
                                                saving={updateModuleGroup.isPending}
                                                onChange={(lvl) => updateModuleGroup.mutate({ id: g.id, level: lvl }, {
                                                    onSuccess: () => toast.success(`${g.module} set to Level ${lvl}`),
                                                    onError: (e) => toast.error(e?.message || 'Failed to update level'),
                                                })}
                                            />
                                            <span className="text-xs font-mono text-ink-subtle">
                                                {g.factory_code || g.factory_name || 'All Plants'}
                                            </span>
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-semibold text-ink-strong flex items-center gap-1.5">
                                            <UserCheck size={15} className="text-blue-700" />
                                            Module Lead: {g.module_lead_name || 'Unassigned'}
                                        </h3>
                                        {g.module_lead_emp_id && (
                                            <p className="text-xs text-ink-subtle pl-5">ID: {g.module_lead_emp_id}</p>
                                        )}

                                        <div className="mt-2.5 flex items-center justify-between rounded bg-surface p-2 border border-line-subtle">
                                            <span className="text-xs font-medium text-ink flex items-center gap-1.5">
                                                <Users size={13} className="text-blue-700" />
                                                <span>DMT Members ({getDmtGroupMemberCount(g)})</span>
                                            </span>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-6 text-2xs px-2 gap-1 font-medium"
                                                onClick={() => {
                                                    setMembersDmtGroup(g);
                                                    setDmtMemberError(null);
                                                    setSelectedDmtMemberEmpId(NONE);
                                                    setDmtMemberSearch('');
                                                }}
                                            >
                                                <Users size={11} />
                                                Manage Members
                                            </Button>
                                        </div>
                                    </div>

                                    {/* JH Groups Section */}
                                    <div className="mt-3 rounded-md border border-line-subtle bg-surface p-2.5 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-1.5 text-xs font-medium text-ink-strong">
                                                <Users size={14} className="text-ink-subtle" />
                                                <span>JH Groups ({moduleJhList.length})</span>
                                            </div>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-7 text-xs px-2 gap-1"
                                                onClick={() => openJhDialog(g)}
                                            >
                                                <Plus size={12} />
                                                Add JH Group
                                            </Button>
                                        </div>

                                        {moduleJhList.length === 0 ? (
                                            <p className="text-xs text-ink-subtle italic py-1">No JH groups under this module yet.</p>
                                        ) : (
                                            <div className="space-y-1.5 pt-1">
                                                {moduleJhList.map((jh) => {
                                                    const membersCount = getJhGroupMemberCount(jh);

                                                    return (
                                                        <div
                                                            key={jh.id}
                                                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded border border-line/60 bg-surface-raised p-2.5 text-xs hover:border-blue-600/40 transition-colors min-w-0"
                                                        >
                                                            <div
                                                                className="flex items-center gap-1.5 flex-wrap flex-1 cursor-pointer min-w-0 pr-1"
                                                                onClick={() => {
                                                                    setMembersJhGroup(jh);
                                                                    setMemberError(null);
                                                                    setSelectedMemberEmpId(NONE);
                                                                    setMemberSearch('');
                                                                }}
                                                            >
                                                                <span className="font-semibold text-ink-strong hover:text-blue-700 transition-colors break-words">
                                                                    {jh.name}
                                                                </span>
                                                                {jh.leader_name && (
                                                                    <span className="text-2xs text-ink-subtle break-words">
                                                                        (Leader: {jh.leader_name})
                                                                    </span>
                                                                )}
                                                                <span className="inline-flex items-center gap-1 rounded bg-blue-600/10 px-2 py-0.5 text-2xs font-medium text-blue-700 shrink-0">
                                                                    <Users size={11} />
                                                                    {membersCount} {membersCount === 1 ? 'Member' : 'Members'}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center gap-1.5 shrink-0 justify-end pt-1 sm:pt-0 border-t sm:border-t-0 border-line-subtle flex-wrap">
                                                                {isBeLead && (
                                                                    <LevelSelect
                                                                        value={jh.level}
                                                                        saving={updateJhGroup.isPending}
                                                                        onChange={(lvl) => updateJhGroup.mutate({ id: jh.id, level: lvl }, {
                                                                            onSuccess: () => toast.success(`${jh.name} set to Level ${lvl}`),
                                                                            onError: (e) => toast.error(e?.message || 'Failed to update level'),
                                                                        })}
                                                                    />
                                                                )}
                                                                {isBeLead && (
                                                                    <Button
                                                                        variant="outline"
                                                                        size="sm"
                                                                        className="h-6 px-1.5 text-2xs gap-1 border-blue-600/30 text-blue-700 hover:bg-blue-700/10 font-medium"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setSelectedRoutingJhGroupId(jh.id);
                                                                            setIsApprovalRoutingOpen(true);
                                                                            setRoutingError(null);
                                                                            setRoutingSuccess(null);
                                                                        }}
                                                                        title="Configure Approval Routing"
                                                                    >
                                                                        <GitBranch size={11} />
                                                                        Routing
                                                                    </Button>
                                                                )}
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    className="h-6 px-2 text-2xs gap-1"
                                                                    onClick={() => {
                                                                        setMembersJhGroup(jh);
                                                                        setMemberError(null);
                                                                        setSelectedMemberEmpId(NONE);
                                                                        setMemberSearch('');
                                                                    }}
                                                                >
                                                                    <UserCheck size={11} />
                                                                    Members
                                                                </Button>
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        requestDeleteJhGroup(jh.id, jh.name);
                                                                    }}
                                                                    className="text-ink-subtle hover:text-danger-fg p-1 rounded hover:bg-danger-bg/20"
                                                                    title="Delete JH Group"
                                                                >
                                                                    <Trash2 size={13} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="mt-4 flex items-center justify-end border-t border-line-subtle pt-2">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-danger-fg hover:text-danger-fg gap-1 h-8 px-2"
                                        onClick={() => requestDeleteModule(g.id, g.module)}
                                    >
                                        <Trash2 size={14} />
                                        Delete Module
                                    </Button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Unassigned JH Groups Section */}
            {unassignedJhGroups.length > 0 && (
                <div className="mt-8">
                    <h2 className="text-lg font-semibold text-ink-strong mb-4">Independent JH Groups</h2>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {unassignedJhGroups.map((jh) => (
                            <div key={jh.id} className="flex flex-col justify-between rounded-lg border border-line bg-surface p-4 shadow-xs">
                                <div>
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-600/10 text-blue-700">
                                                <Users size={16} />
                                            </div>
                                            <div>
                                                <h4 className="text-sm font-semibold text-ink-strong">{jh.name}</h4>
                                                <p className="text-xs text-ink-subtle">No Parent Module</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-4 space-y-2">
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-ink-muted">JH Leader</span>
                                            <span className="font-medium text-ink-strong">
                                                {jh.leader_name ? (
                                                    <div className="flex items-center gap-1.5">
                                                        <UserCheck size={12} className="text-blue-700" />
                                                        <span>{jh.leader_name}</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-ink-subtle italic">Unassigned</span>
                                                )}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-ink-muted">Members</span>
                                            <span className="font-medium text-ink-strong">
                                                {getJhGroupMemberCount(jh)}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-ink-muted">Level</span>
                                            {isBeLead ? (
                                                <LevelSelect
                                                    value={jh.level}
                                                    saving={updateJhGroup.isPending}
                                                    onChange={(lvl) => updateJhGroup.mutate({ id: jh.id, level: lvl }, {
                                                        onSuccess: () => toast.success(`${jh.name} set to Level ${lvl}`),
                                                        onError: (e) => toast.error(e?.message || 'Failed to update level'),
                                                    })}
                                                />
                                            ) : (
                                                <span className="font-medium text-ink-strong">Level {jh.level || 1}</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-4 flex items-center gap-2 border-t border-line-subtle pt-3">
                                    {isBeLead && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-7 px-2 text-xs gap-1 border-blue-600/30 text-blue-700 hover:bg-blue-700/10 font-medium"
                                            onClick={() => {
                                                setSelectedRoutingJhGroupId(jh.id);
                                                setIsApprovalRoutingOpen(true);
                                                setRoutingError(null);
                                                setRoutingSuccess(null);
                                            }}
                                            title="Configure Approval Routing"
                                        >
                                            <GitBranch size={12} />
                                            Routing
                                        </Button>
                                    )}
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 flex-1 text-xs font-medium"
                                        onClick={() => setMembersJhGroup(jh)}
                                    >
                                        Manage Members
                                    </Button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            requestDeleteJhGroup(jh.id, jh.name);
                                        }}
                                        className="text-ink-subtle hover:text-danger-fg p-1 rounded-md border border-transparent hover:border-danger-border hover:bg-danger-bg"
                                        title="Delete JH Group"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Modal: New Module / DMT */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="bg-surface-raised max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-ink-strong">New Module/DMT</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <label className="block text-sm font-medium text-ink-muted">
                            Module Name <span className="text-danger-fg">*</span>
                            <Select value={selectedModule} onValueChange={setSelectedModule}>
                                <SelectTrigger className="mt-1 w-full">
                                    <SelectValue placeholder="Select Module" />
                                </SelectTrigger>
                                <SelectContent>
                                    {moduleNames.map((m) => (
                                        <SelectItem key={m.id || m.name} value={m.name}>
                                            {m.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </label>

                        <label className="block text-sm font-medium text-ink-muted">
                            Plant / Factory <span className="text-danger-fg">*</span>
                            <Select value={selectedFactoryId} onValueChange={setSelectedFactoryId}>
                                <SelectTrigger className="mt-1 w-full">
                                    <SelectValue placeholder="Select Factory" />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableFactoriesForCreation.map((f) => (
                                        <SelectItem key={f.id} value={f.id}>
                                            {f.name} ({f.code || f.id})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </label>

                        <label className="block text-sm font-medium text-ink-muted">
                            Level
                            <Select value={selectedLevel} onValueChange={setSelectedLevel}>
                                <SelectTrigger className="mt-1 w-full">
                                    <SelectValue placeholder="Select Level" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="1">Level 1</SelectItem>
                                    <SelectItem value="2">Level 2</SelectItem>
                                    <SelectItem value="3">Level 3</SelectItem>
                                </SelectContent>
                            </Select>
                        </label>

                        <div className="space-y-1.5">
                            <label className="block text-sm font-medium text-ink-muted">
                                Module Lead
                            </label>
                            <div className="relative">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-ink-subtle" />
                                <Input
                                    type="text"
                                    placeholder="Search lead by name, ID, or email..."
                                    value={leadSearch}
                                    onChange={(e) => setLeadSearch(e.target.value)}
                                    className="pl-8 pr-8 text-sm"
                                />
                                {leadSearch && (
                                    <button
                                        type="button"
                                        onClick={() => setLeadSearch('')}
                                        className="absolute right-2.5 top-2.5 text-ink-subtle hover:text-ink"
                                        aria-label="Clear search"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                )}
                            </div>
                            <Select value={selectedLeadEmpId} onValueChange={setSelectedLeadEmpId}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select Module Lead" />
                                </SelectTrigger>
                                <SelectContent className="max-h-60 overflow-y-auto">
                                    <SelectItem value={NONE}>Unassigned</SelectItem>
                                    {filteredWorkers.map((w) => (
                                        <SelectItem key={w.id || w.emp_id} value={w.emp_id || w.id}>
                                            {w.name} ({w.emp_id || w.email || 'No ID'})
                                        </SelectItem>
                                    ))}
                                    {filteredWorkers.length === 0 && (
                                        <div className="p-2 text-center text-xs text-ink-subtle">
                                            No matching workers found
                                        </div>
                                    )}
                                </SelectContent>
                            </Select>
                        </div>

                        <MdmErrorNote error={formError} />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                            {t('common.cancel', 'Cancel')}
                        </Button>
                        <Button onClick={handleSubmit} disabled={createModuleGroup.isPending || !selectedModule || !selectedFactoryId || selectedFactoryId === NONE}>
                            {t('common.save', 'Save')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Modal: New JH Group under Module / DMT */}
            <Dialog open={isJhDialogOpen} onOpenChange={setIsJhDialogOpen}>
                <DialogContent className="bg-surface-raised max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-ink-strong">
                            {targetModuleGroup ? `New JH Group under ${targetModuleGroup.module} (${targetModuleGroup.factory_code || targetModuleGroup.factory_name || 'All Plants'})` : 'New Independent JH Group'}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <label className="block text-sm font-medium text-ink-muted">
                            JH Group Name <span className="text-danger-fg">*</span>
                            <Input
                                type="text"
                                placeholder="e.g. Alpha Team, Packing Line 1 Group"
                                value={jhGroupName}
                                onChange={(e) => setJhGroupName(e.target.value)}
                                className="mt-1 text-sm"
                            />
                        </label>

                        {!targetModuleGroup && (
                            <label className="block text-sm font-medium text-ink-muted">
                                Plant / Factory <span className="text-danger-fg">*</span>
                                <Select value={jhSelectedFactoryId} onValueChange={setJhSelectedFactoryId}>
                                    <SelectTrigger className="mt-1 w-full text-sm">
                                        <SelectValue placeholder="Select Factory" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={NONE}>Select a Factory...</SelectItem>
                                        {availableFactoriesForCreation.map((f) => (
                                            <SelectItem key={f.id} value={f.id}>
                                                {f.name} ({f.code || f.id})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </label>
                        )}

                        <label className="block text-sm font-medium text-ink-muted">
                            Level
                            <Select value={jhLevel} onValueChange={setJhLevel}>
                                <SelectTrigger className="mt-1 w-full text-sm">
                                    <SelectValue placeholder="Select Level" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="1">Level 1</SelectItem>
                                    <SelectItem value="2">Level 2</SelectItem>
                                    <SelectItem value="3">Level 3</SelectItem>
                                </SelectContent>
                            </Select>
                        </label>

                        <div className="space-y-1.5">
                            <label className="block text-sm font-medium text-ink-muted">
                                JH Leader
                            </label>
                            <div className="relative">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-ink-subtle" />
                                <Input
                                    type="text"
                                    placeholder="Search JH leader by name, ID, or email..."
                                    value={jhLeaderSearch}
                                    onChange={(e) => setJhLeaderSearch(e.target.value)}
                                    className="pl-8 pr-8 text-sm"
                                />
                                {jhLeaderSearch && (
                                    <button
                                        type="button"
                                        onClick={() => setJhLeaderSearch('')}
                                        className="absolute right-2.5 top-2.5 text-ink-subtle hover:text-ink"
                                        aria-label="Clear search"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                )}
                            </div>
                            <Select value={jhLeaderEmpId} onValueChange={setJhLeaderEmpId}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select JH Leader" />
                                </SelectTrigger>
                                <SelectContent className="max-h-60 overflow-y-auto">
                                    <SelectItem value={NONE}>Unassigned</SelectItem>
                                    {filteredJhLeaders.map((w) => (
                                        <SelectItem key={w.id || w.emp_id} value={w.emp_id || w.id}>
                                            {w.name} ({w.emp_id || w.email || 'No ID'})
                                        </SelectItem>
                                    ))}
                                    {filteredJhLeaders.length === 0 && (
                                        <div className="p-2 text-center text-xs text-ink-subtle">
                                            No matching workers found
                                        </div>
                                    )}
                                </SelectContent>
                            </Select>
                        </div>

                        <MdmErrorNote error={jhFormError} />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsJhDialogOpen(false)}>
                            {t('common.cancel', 'Cancel')}
                        </Button>
                        <Button onClick={handleJhSubmit} disabled={createJhGroup.isPending || !jhGroupName.trim()}>
                            {t('common.save', 'Save JH Group')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Modal: Confirmation Popup for Deleting Module or JH Group */}
            <Dialog open={Boolean(deleteConfirmItem)} onOpenChange={(open) => { if (!open) setDeleteConfirmItem(null); }}>
                <DialogContent className="bg-surface-raised max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="text-ink-strong">
                            {deleteConfirmItem?.type === 'module' ? 'Delete Module / DMT' : 'Delete JH Group'}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="py-2 space-y-2 text-sm text-ink-muted">
                        <p>
                            Are you sure you want to delete {deleteConfirmItem?.type === 'module' ? 'module group' : 'JH group'}{' '}
                            <strong className="text-ink-strong">"{deleteConfirmItem?.name}"</strong>?
                        </p>
                        {deleteConfirmItem?.type === 'module' && (
                            <p className="text-xs text-ink-subtle">
                                This will permanently remove this module assignment and unassign associated groups.
                            </p>
                        )}
                        <MdmErrorNote error={deleteError} />
                    </div>
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button variant="outline" onClick={() => setDeleteConfirmItem(null)}>
                            {t('common.cancel', 'Cancel')}
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleConfirmDelete}
                            disabled={deleteModuleGroup.isPending || deleteJhGroup.isPending}
                        >
                            {deleteModuleGroup.isPending || deleteJhGroup.isPending
                                ? 'Deleting...'
                                : 'Yes, Delete'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Modal: JH Group Members Management */}
            <Dialog open={Boolean(membersJhGroup)} onOpenChange={(open) => { if (!open) setMembersJhGroup(null); }}>
                <DialogContent className="bg-surface-raised max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="text-ink-strong flex items-center gap-2">
                            <Users size={18} className="text-blue-700" />
                            <span>JH Group Members: {membersJhGroup?.name}</span>
                        </DialogTitle>
                        <p className="text-xs text-ink-muted">
                            Add or remove team members assigned to this JH group. Any number of members can be added.
                        </p>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        {/* Current Members List */}
                        <div>
                            <h4 className="text-xs font-semibold text-ink-strong mb-2 flex items-center justify-between">
                                <span>Total Members ({getJhGroupMemberCount(membersJhGroup)})</span>
                            </h4>

                            {groupMembers.length === 0 && !membersJhGroup?.leader_name && !membersJhGroup?.leader_emp_id ? (
                                <div className="rounded border border-dashed border-line p-4 text-center text-xs text-ink-subtle italic">
                                    No members added to this JH group yet. Use the form below to add members.
                                </div>
                            ) : (
                                <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                                    {membersJhGroup?.leader_name && !groupMembers.some(m => (membersJhGroup.leader_emp_id && m.emp_id === membersJhGroup.leader_emp_id) || (membersJhGroup.leader_name && m.worker_name === membersJhGroup.leader_name)) && (
                                        <div className="flex items-center justify-between rounded border border-blue-600/30 bg-blue-600/5 px-3 py-2 text-xs mb-1.5">
                                            <div className="flex items-center gap-2">
                                                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600/20 text-blue-700 font-semibold text-2xs">
                                                    {(membersJhGroup.leader_name || 'L').charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="font-medium text-ink-strong flex items-center gap-1.5">
                                                        <span>{membersJhGroup.leader_name}</span>
                                                        <span className="rounded bg-blue-600/10 px-1.5 py-0.5 text-2xs font-medium text-blue-700">JH Leader</span>
                                                    </p>
                                                    {membersJhGroup.leader_emp_id && (
                                                        <p className="text-2xs text-ink-subtle font-mono">ID: {membersJhGroup.leader_emp_id}</p>
                                                    )}
                                                </div>
                                            </div>
                                            <span className="text-2xs text-ink-subtle italic">Group Leader</span>
                                        </div>
                                    )}
                                    {groupMembers.map((m) => (
                                        <div
                                            key={m.id}
                                            className="flex items-center justify-between rounded border border-line bg-surface px-3 py-2 text-xs"
                                        >
                                            <div className="flex items-center gap-2">
                                                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600/10 text-blue-700 font-semibold text-2xs">
                                                    {(m.worker_name || m.emp_id || 'U').charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="font-medium text-ink-strong">{m.worker_name || m.emp_id}</p>
                                                    <p className="text-2xs text-ink-subtle font-mono">ID: {m.emp_id}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="rounded bg-surface-raised border border-line px-2 py-0.5 text-2xs text-ink-subtle font-medium capitalize">
                                                    {m.role || 'member'}
                                                </span>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 w-7 p-0 text-ink-subtle hover:text-danger-fg"
                                                    disabled={removeJhGroupMember.isPending}
                                                    onClick={() => {
                                                        removeJhGroupMember.mutate(m.id, {
                                                            onSuccess: () => toast.success('Member removed'),
                                                            onError: (err) => {
                                                                setMemberError(err?.message || 'Failed to remove member');
                                                                toast.error(err?.message || 'Failed to remove member');
                                                            }
                                                        });
                                                    }}
                                                    title="Remove Member"
                                                >
                                                    <X size={14} />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Add New Member Section */}
                        <div className="rounded-lg border border-line bg-surface p-3 space-y-3">
                            <h4 className="text-xs font-semibold text-ink-strong flex items-center gap-1">
                                <Plus size={14} className="text-blue-700" />
                                <span>Add Member to Group</span>
                            </h4>

                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <div className="relative flex-1">
                                        <Search size={14} className="absolute left-2.5 top-2.5 text-ink-subtle" />
                                        <Input
                                            placeholder="Search worker name or ID..."
                                            value={memberSearch}
                                            onChange={(e) => setMemberSearch(e.target.value)}
                                            className="pl-8 h-8 text-xs"
                                        />
                                    </div>
                                </div>

                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                    <Select value={selectedMemberEmpId} onValueChange={setSelectedMemberEmpId}>
                                        <SelectTrigger className="h-8 text-xs w-full sm:flex-1 min-w-0">
                                            <SelectValue placeholder="Select worker to add..." />
                                        </SelectTrigger>
                                        <SelectContent className="max-h-48">
                                            {availableWorkersForJhGroup.length === 0 ? (
                                                <div className="p-2 text-2xs text-ink-subtle text-center">No available workers found</div>
                                            ) : (
                                                availableWorkersForJhGroup.map((w) => {
                                                    const empId = w.emp_id || w.id;
                                                    return (
                                                        <SelectItem key={empId} value={empId}>
                                                            {w.name} ({empId})
                                                        </SelectItem>
                                                    );
                                                })
                                            )}
                                        </SelectContent>
                                    </Select>

                                    <div className="flex items-center gap-2 w-full sm:w-auto">
                                        <Select value={selectedMemberRole} onValueChange={setSelectedMemberRole}>
                                            <SelectTrigger className="h-8 text-xs flex-1 sm:w-28">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="member">Member</SelectItem>
                                                <SelectItem value="leader">Leader</SelectItem>
                                            </SelectContent>
                                        </Select>

                                        <Button
                                            size="sm"
                                            className="h-8 text-xs gap-1 flex-1 sm:w-auto"
                                            disabled={selectedMemberEmpId === NONE || addJhGroupMember.isPending}
                                            onClick={() => {
                                                if (selectedMemberEmpId === NONE || !membersJhGroup) return;
                                                setMemberError(null);
                                                const workerObj = workers.find(w => (w.emp_id || w.id) === selectedMemberEmpId);
                                                addJhGroupMember.mutate({
                                                    jh_group_id: membersJhGroup.id,
                                                    emp_id: selectedMemberEmpId,
                                                    worker_name: workerObj?.name || selectedMemberEmpId,
                                                    role: selectedMemberRole
                                                }, {
                                                    onSuccess: () => {
                                                        setSelectedMemberEmpId(NONE);
                                                        setMemberSearch('');
                                                        toast.success('Member added!');
                                                    },
                                                    onError: (err) => {
                                                        setMemberError(err?.message || 'Failed to add member');
                                                        toast.error(err?.message || 'Failed to add member');
                                                    }
                                                });
                                            }}
                                        >
                                            <Plus size={13} />
                                            Add
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            <MdmErrorNote error={memberError} />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setMembersJhGroup(null)}>
                            Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Modal: DMT Members Management */}
            <Dialog open={Boolean(membersDmtGroup)} onOpenChange={(open) => { if (!open) setMembersDmtGroup(null); }}>
                <DialogContent className="bg-surface-raised max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="text-ink-strong flex items-center gap-2">
                            <Users size={18} className="text-blue-700" />
                            <span>DMT Members: {membersDmtGroup?.module}</span>
                        </DialogTitle>
                        <p className="text-xs text-ink-muted">
                            Manage team members directly assigned to this DMT / Module group (without requiring JH group membership).
                        </p>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        {/* Current Members List */}
                        <div>
                            <h4 className="text-xs font-semibold text-ink-strong mb-2 flex items-center justify-between">
                                <span>Total DMT Members ({getDmtGroupMemberCount(membersDmtGroup)})</span>
                            </h4>

                            {dmtGroupMembers.length === 0 && !membersDmtGroup?.module_lead_name && !membersDmtGroup?.module_lead_emp_id ? (
                                <div className="rounded border border-dashed border-line p-4 text-center text-xs text-ink-subtle italic">
                                    No direct members added to this DMT yet. Use the form below to add members.
                                </div>
                            ) : (
                                <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                                    {membersDmtGroup?.module_lead_name && !dmtGroupMembers.some(m => (membersDmtGroup.module_lead_emp_id && m.emp_id === membersDmtGroup.module_lead_emp_id) || (membersDmtGroup.module_lead_name && m.worker_name === membersDmtGroup.module_lead_name)) && (
                                        <div className="flex items-center justify-between rounded border border-blue-600/30 bg-blue-600/5 px-3 py-2 text-xs mb-1.5">
                                            <div className="flex items-center gap-2">
                                                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600/20 text-blue-700 font-semibold text-2xs">
                                                    {(membersDmtGroup.module_lead_name || 'L').charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="font-medium text-ink-strong flex items-center gap-1.5">
                                                        <span>{membersDmtGroup.module_lead_name}</span>
                                                        <span className="rounded bg-blue-600/10 px-1.5 py-0.5 text-2xs font-medium text-blue-700">Module Lead</span>
                                                    </p>
                                                    {membersDmtGroup.module_lead_emp_id && (
                                                        <p className="text-2xs text-ink-subtle font-mono">ID: {membersDmtGroup.module_lead_emp_id}</p>
                                                    )}
                                                </div>
                                            </div>
                                            <span className="text-2xs text-ink-subtle italic">Group Lead</span>
                                        </div>
                                    )}
                                    {dmtGroupMembers.map((m) => (
                                        <div
                                            key={m.id}
                                            className="flex items-center justify-between rounded border border-line bg-surface px-3 py-2 text-xs"
                                        >
                                            <div className="flex items-center gap-2">
                                                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600/10 text-blue-700 font-semibold text-2xs">
                                                    {(m.worker_name || m.emp_id || 'U').charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="font-medium text-ink-strong">{m.worker_name || m.emp_id}</p>
                                                    <p className="text-2xs text-ink-subtle font-mono">ID: {m.emp_id}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="rounded bg-surface-raised border border-line px-2 py-0.5 text-2xs text-ink-subtle font-medium capitalize">
                                                    {m.role || 'member'}
                                                </span>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 w-7 p-0 text-ink-subtle hover:text-danger-fg"
                                                    disabled={removeDmtMember.isPending}
                                                    onClick={() => {
                                                        removeDmtMember.mutate(m.id, {
                                                            onSuccess: () => toast.success('Member removed'),
                                                            onError: (err) => {
                                                                setDmtMemberError(err?.message || 'Failed to remove member');
                                                                toast.error(err?.message || 'Failed to remove member');
                                                            }
                                                        });
                                                    }}
                                                    title="Remove Member"
                                                >
                                                    <X size={14} />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Add New DMT Member Section */}
                        <div className="rounded-lg border border-line bg-surface p-3 space-y-3">
                            <h4 className="text-xs font-semibold text-ink-strong flex items-center gap-1">
                                <Plus size={14} className="text-blue-700" />
                                <span>Add Member to DMT</span>
                            </h4>

                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <div className="relative flex-1">
                                        <Search size={14} className="absolute left-2.5 top-2.5 text-ink-subtle" />
                                        <Input
                                            placeholder="Search worker name or ID..."
                                            value={dmtMemberSearch}
                                            onChange={(e) => setDmtMemberSearch(e.target.value)}
                                            className="pl-8 h-8 text-xs"
                                        />
                                    </div>
                                </div>

                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                    <Select value={selectedDmtMemberEmpId} onValueChange={setSelectedDmtMemberEmpId}>
                                        <SelectTrigger className="h-8 text-xs w-full sm:flex-1 min-w-0">
                                            <SelectValue placeholder="Select worker to add..." />
                                        </SelectTrigger>
                                        <SelectContent className="max-h-48">
                                            {availableWorkersForDmtGroup.length === 0 ? (
                                                <div className="p-2 text-2xs text-ink-subtle text-center">No available workers found</div>
                                            ) : (
                                                availableWorkersForDmtGroup.map((w) => {
                                                    const empId = w.emp_id || w.id;
                                                    return (
                                                        <SelectItem key={empId} value={empId}>
                                                            {w.name} ({empId})
                                                        </SelectItem>
                                                    );
                                                })
                                            )}
                                        </SelectContent>
                                    </Select>

                                    <div className="flex items-center gap-2 w-full sm:w-auto">
                                        <Select value={selectedDmtMemberRole} onValueChange={setSelectedDmtMemberRole}>
                                            <SelectTrigger className="h-8 text-xs flex-1 sm:w-28">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="member">Member</SelectItem>
                                                <SelectItem value="leader">Leader</SelectItem>
                                            </SelectContent>
                                        </Select>

                                        <Button
                                            size="sm"
                                            className="h-8 text-xs gap-1 flex-1 sm:w-auto"
                                            disabled={selectedDmtMemberEmpId === NONE || addDmtMember.isPending}
                                            onClick={() => {
                                                if (selectedDmtMemberEmpId === NONE || !membersDmtGroup) return;
                                                setDmtMemberError(null);
                                                const workerObj = workers.find(w => (w.emp_id || w.id) === selectedDmtMemberEmpId);
                                                addDmtMember.mutate({
                                                    module_group_id: membersDmtGroup.id,
                                                    emp_id: selectedDmtMemberEmpId,
                                                    worker_name: workerObj?.name || selectedDmtMemberEmpId,
                                                    role: selectedDmtMemberRole
                                                }, {
                                                    onSuccess: () => {
                                                        setSelectedDmtMemberEmpId(NONE);
                                                        setDmtMemberSearch('');
                                                        toast.success('Member added!');
                                                    },
                                                    onError: (err) => {
                                                        setDmtMemberError(err?.message || 'Failed to add member');
                                                        toast.error(err?.message || 'Failed to add member');
                                                    }
                                                });
                                            }}
                                        >
                                            <Plus size={13} />
                                            Add
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            <MdmErrorNote error={dmtMemberError} />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setMembersDmtGroup(null)}>
                            Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Approval Routing Configuration Modal */}
            <Dialog open={isApprovalRoutingOpen} onOpenChange={(open) => {
                setIsApprovalRoutingOpen(open);
                if (!open) {
                    setRoutingError(null);
                    setRoutingSuccess(null);
                    setSelectedRoutingJhGroupId(NONE);
                    setRoutingModuleTab('opl');
                }
            }}>
                <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-ink-strong">
                            <GitBranch className="text-blue-700" size={20} />
                            Approval Routing — {selectedRoutingJhGroup?.name || 'JH Group'}
                        </DialogTitle>
                        <p className="text-xs text-ink-muted">
                            As BE Lead, configure who approves OPLs, Kaizens, and Abnormalities submitted by this JH Group.
                        </p>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        {routingError && <MdmErrorNote error={routingError} />}

                        {routingSuccess && (
                            <div className="flex items-center gap-2 rounded-md bg-success-bg/20 border border-success-border p-3 text-xs text-success-fg font-medium">
                                <CheckCircle2 size={16} className="shrink-0" />
                                <span>{routingSuccess}</span>
                            </div>
                        )}

                        {/* Module tabs — OPL / Kaizen / Abnormalities each get their own view instead of
                            one long stacked scroll. */}
                        <div className="flex gap-1 rounded-lg bg-surface-sunken p-1">
                            {[
                                { key: 'opl', label: 'OPL', Icon: FileText },
                                { key: 'kaizen', label: 'Kaizen', Icon: Sparkles },
                                { key: 'abnormality', label: 'Abnormalities', Icon: AlertTriangle },
                            ].map(({ key, label, Icon }) => (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => setRoutingModuleTab(key)}
                                    className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                                        routingModuleTab === key
                                            ? 'bg-surface-raised text-ink-strong shadow-xs'
                                            : 'text-ink-subtle hover:text-ink-strong'
                                    }`}
                                >
                                    <Icon size={13} />
                                    {label}
                                </button>
                            ))}
                        </div>

                        {/* OPL Approval Workflow — the actual status flow (draft → submitted for review →
                            reviewer stage(s) → approved), with the reviewer stages drag-reorderable. */}
                        {routingModuleTab === 'opl' && (
                        <div className="rounded-lg border border-line bg-surface p-3.5 space-y-3 shadow-2xs">
                            <div className="flex items-center justify-between border-b border-line-subtle pb-2">
                                <span className="text-xs font-semibold text-ink-strong flex items-center gap-2">
                                    <FileText size={15} className="text-blue-700" />
                                    <span>OPL Status Flow</span>
                                </span>
                                <span className="text-2xs text-ink-subtle">{oplStageDrafts.length} reviewer stage{oplStageDrafts.length === 1 ? '' : 's'}</span>
                            </div>
                            <p className="text-2xs text-ink-subtle">
                                Drag a reviewer stage to reorder it, or add another. Who each stage routes to is configured below.
                            </p>

                            {oplStageError && <MdmErrorNote error={oplStageError} />}
                            {oplStageSuccess && (
                                <div className="flex items-center gap-2 rounded-md bg-success-bg/20 border border-success-border p-2 text-2xs text-success-fg font-medium">
                                    <CheckCircle2 size={14} className="shrink-0" />
                                    <span>{oplStageSuccess}</span>
                                </div>
                            )}

                            <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-surface-sunken p-2.5">
                                <span className="text-2xs font-medium text-ink-subtle bg-surface-raised border border-line rounded-full px-2.5 py-1">Draft</span>
                                <ArrowRight size={12} className="text-ink-subtle shrink-0" />
                                <span className="text-2xs font-medium text-ink-subtle bg-surface-raised border border-line rounded-full px-2.5 py-1">Submitted for Review</span>
                                <ArrowRight size={12} className="text-ink-subtle shrink-0" />

                                {oplStageDrafts.map((stage, index) => (
                                    <span key={index} className="flex items-center gap-1.5">
                                        <span
                                            draggable
                                            onDragStart={() => handleOplStageDragStart(index)}
                                            onDragOver={(e) => handleOplStageDragOver(e, index)}
                                            onDragEnd={handleOplStageDragEnd}
                                            className="flex items-center gap-1 rounded-full border border-blue-600/40 bg-blue-600/10 pl-1.5 pr-1 py-1 cursor-grab"
                                        >
                                            <GripVertical size={12} className="text-blue-700 shrink-0" />
                                            <span className="text-2xs font-semibold text-blue-700">{stage.stage_name}</span>
                                            <button
                                                type="button"
                                                onClick={() => removeOplStage(index)}
                                                disabled={oplStageDrafts.length <= 1}
                                                className="shrink-0 text-blue-700/60 hover:text-danger disabled:opacity-30 disabled:cursor-not-allowed p-0.5"
                                                title="Remove stage"
                                            >
                                                <X size={11} />
                                            </button>
                                        </span>
                                        <ArrowRight size={12} className="text-ink-subtle shrink-0" />
                                    </span>
                                ))}

                                <span className="text-2xs font-medium text-success-fg bg-success-bg/20 border border-success-border rounded-full px-2.5 py-1">Approved</span>
                                <button type="button" onClick={addOplStage} className="text-2xs font-medium text-blue-700 hover:underline flex items-center gap-1 px-1">
                                    <Plus size={12} /> Add Stage
                                </button>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5 text-2xs text-ink-subtle">
                                <span className="italic">If rejected at any stage, with comments</span>
                                <ArrowRight size={11} className="shrink-0" />
                                <span className="font-medium text-ink-strong">Submitter &amp; BE Admin</span>
                            </div>

                            <div className="flex items-center justify-end pt-1">
                                <Button type="button" size="sm" onClick={handleSaveOplStages} disabled={saveOplWorkflowStages.isPending} className="text-xs bg-blue-600 hover:bg-blue-700 text-white">
                                    {saveOplWorkflowStages.isPending ? 'Saving...' : 'Save Workflow'}
                                </Button>
                            </div>
                        </div>
                        )}

                        {routingModuleTab === 'opl' && selectedRoutingJhGroupId !== NONE && (
                            <div className="space-y-3 pt-1">
                                {/* OPL Section — one approver block per configured stage */}
                                {(Array.isArray(oplWorkflowStagesData) && oplWorkflowStagesData.length > 0
                                    ? oplWorkflowStagesData
                                    : [{ entity_type: 'opl', stage_name: 'Reviewer 1', stage_order: 1 }]
                                ).map((stage, idx, stages) => {
                                    const cfg = routingConfig.oplStages[stage.entity_type] || { approver_role: 'jh_leader', approver_emp_ids: [] };
                                    const stageLabel = `Reviewer ${idx + 1}`;
                                    const fromLabel = idx === 0
                                        ? 'Submitter'
                                        : describeStageApprover(routingConfig.oplStages[stages[idx - 1].entity_type]);
                                    const toLabel = describeStageApprover(cfg);
                                    return (
                                        <div key={stage.entity_type} className="rounded-lg border border-line bg-surface p-3.5 space-y-3 shadow-2xs">
                                            <div className="flex items-center justify-between border-b border-line-subtle pb-2">
                                                <span className="text-xs font-semibold text-ink-strong flex items-center gap-2">
                                                    <FileText size={15} className="text-blue-700" />
                                                    <span>{stageLabel}</span>
                                                </span>
                                                <span className="text-2xs rounded bg-blue-600/10 text-blue-700 px-2 py-0.5 font-medium">
                                                    {cfg.approver_role === 'specific' ? 'Custom Assigned' : cfg.approver_role === 'dmt_leader' ? 'DMT Leader' : 'Reviewer'}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-2 rounded bg-surface-sunken px-2.5 py-1.5 text-2xs">
                                                <span className="font-medium text-ink-strong truncate">{fromLabel}</span>
                                                <ArrowRight size={12} className="text-ink-subtle shrink-0" />
                                                <span className="font-medium text-ink-strong truncate">{toLabel}</span>
                                            </div>

                                            <div className="space-y-3">
                                                <div>
                                                    <label className="text-2xs text-ink-subtle block mb-1 font-medium">Approver Level / Role</label>
                                                    <Select
                                                        value={cfg.approver_role}
                                                        onValueChange={(val) => setRoutingConfig(prev => ({
                                                            ...prev,
                                                            oplStages: {
                                                                ...prev.oplStages,
                                                                [stage.entity_type]: { ...cfg, approver_role: val, approver_emp_ids: val === 'specific' ? cfg.approver_emp_ids : [] }
                                                            }
                                                        }))}
                                                    >
                                                        <SelectTrigger className="h-8 text-xs w-full">
                                                            <SelectValue className="truncate" />
                                                        </SelectTrigger>
                                                        <SelectContent className="min-w-[var(--radix-select-trigger-width)] max-w-[90vw]">
                                                            <SelectItem value="jh_leader" className="whitespace-normal">{jhLeaderOptionLabel} (Default)</SelectItem>
                                                            <SelectItem value="dmt_leader" className="whitespace-normal">{dmtLeaderOptionLabel}</SelectItem>
                                                            <SelectItem value="specific" className="whitespace-normal">Specific Person(s) / Multi-Approvers</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>

                                                {cfg.approver_role === 'specific' && (
                                                    <div>
                                                        <label className="text-2xs text-ink-subtle block mb-1 font-medium">Select Approver Person(s) — search the whole plant</label>
                                                        <div className="relative mb-1.5">
                                                            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-subtle" />
                                                            <Input
                                                                value={approverPickerSearch}
                                                                onChange={(e) => setApproverPickerSearch(e.target.value)}
                                                                placeholder="Search by name or employee ID..."
                                                                className="h-7 text-2xs pl-7"
                                                            />
                                                        </div>
                                                        <div className="rounded border border-line bg-surface-raised p-2 max-h-36 overflow-y-auto space-y-1.5">
                                                            {approverPickerResults.length === 0 && (
                                                                <p className="text-2xs text-ink-subtle p-1">No matching workers.</p>
                                                            )}
                                                            {approverPickerResults.map((m) => {
                                                                const empId = m.emp_id || m.id;
                                                                const name = m.worker_name || m.name || empId;
                                                                const isSelected = cfg.approver_emp_ids.includes(empId);
                                                                return (
                                                                    <label key={empId} className="flex items-center gap-2 text-xs text-ink cursor-pointer hover:bg-surface-hover p-1 rounded">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={isSelected}
                                                                            onChange={(e) => {
                                                                                const checked = e.target.checked;
                                                                                setRoutingConfig(prev => {
                                                                                    const current = prev.oplStages[stage.entity_type]?.approver_emp_ids || [];
                                                                                    const updated = checked ? [...current, empId] : current.filter(id => id !== empId);
                                                                                    return {
                                                                                        ...prev,
                                                                                        oplStages: {
                                                                                            ...prev.oplStages,
                                                                                            [stage.entity_type]: { ...prev.oplStages[stage.entity_type], approver_emp_ids: updated }
                                                                                        }
                                                                                    };
                                                                                });
                                                                            }}
                                                                            className="rounded text-blue-700 focus:ring-blue-700 h-3.5 w-3.5"
                                                                        />
                                                                        <span className="font-medium">{name}</span>
                                                                        <span className="text-2xs text-ink-subtle">({empId})</span>
                                                                    </label>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Kaizen Status Flow — mirrors the Abnormality flow banner below. The JH
                            lead reviews the proposal; once the submitter reports implementation,
                            the JH lead reviews that report too before forwarding to whoever is
                            configured in the DMT card for final confirmation. */}
                        {/* Kaizen Phase 1 (pre-implementation JH review) — drag-reorderable stage
                            ladder, same builder pattern as OPL's. Phase 2 (post-implementation)
                            is its own single-stage-floor ladder below. */}
                        {routingModuleTab === 'kaizen' && (
                        <div className="rounded-lg border border-line bg-surface p-3.5 space-y-3 shadow-2xs">
                            <div className="flex items-center justify-between border-b border-line-subtle pb-2">
                                <span className="text-xs font-semibold text-ink-strong flex items-center gap-2">
                                    <Sparkles size={15} className="text-blue-700" />
                                    <span>Kaizen Phase 1 — Proposal Review</span>
                                </span>
                                <span className="text-2xs text-ink-subtle">{kzP1StageDrafts.length} reviewer stage{kzP1StageDrafts.length === 1 ? '' : 's'}</span>
                            </div>
                            <p className="text-2xs text-ink-subtle">
                                Drag a reviewer stage to reorder it, or add another. Who each stage routes to is configured below.
                            </p>

                            {kzP1StageError && <MdmErrorNote error={kzP1StageError} />}
                            {kzP1StageSuccess && (
                                <div className="flex items-center gap-2 rounded-md bg-success-bg/20 border border-success-border p-2 text-2xs text-success-fg font-medium">
                                    <CheckCircle2 size={14} className="shrink-0" />
                                    <span>{kzP1StageSuccess}</span>
                                </div>
                            )}

                            <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-surface-sunken p-2.5">
                                <span className="text-2xs font-medium text-ink-subtle bg-surface-raised border border-line rounded-full px-2.5 py-1">Proposed</span>
                                <ArrowRight size={12} className="text-ink-subtle shrink-0" />

                                {kzP1StageDrafts.map((stage, index) => (
                                    <span key={index} className="flex items-center gap-1.5">
                                        <span
                                            draggable
                                            onDragStart={() => handleKzP1StageDragStart(index)}
                                            onDragOver={(e) => handleKzP1StageDragOver(e, index)}
                                            onDragEnd={handleKzP1StageDragEnd}
                                            className="flex items-center gap-1 rounded-full border border-blue-400/40 bg-blue-500/10 pl-1.5 pr-1 py-1 cursor-grab"
                                        >
                                            <GripVertical size={12} className="text-blue-700 shrink-0" />
                                            <span className="text-2xs font-semibold text-blue-700">{stage.stage_name}</span>
                                            <button
                                                type="button"
                                                onClick={() => removeKzP1Stage(index)}
                                                disabled={kzP1StageDrafts.length <= 1}
                                                className="shrink-0 text-blue-700/60 hover:text-danger disabled:opacity-30 disabled:cursor-not-allowed p-0.5"
                                                title="Remove stage"
                                            >
                                                <X size={11} />
                                            </button>
                                        </span>
                                        <ArrowRight size={12} className="text-ink-subtle shrink-0" />
                                    </span>
                                ))}

                                <span className="text-2xs font-medium text-success-fg bg-success-bg/20 border border-success-border rounded-full px-2.5 py-1">Approved for Implementation</span>
                                <button type="button" onClick={addKzP1Stage} className="text-2xs font-medium text-blue-700 hover:underline flex items-center gap-1 px-1">
                                    <Plus size={12} /> Add Stage
                                </button>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5 text-2xs text-ink-subtle">
                                <span className="italic">If rejected at any stage, with comments</span>
                                <ArrowRight size={11} className="shrink-0" />
                                <span className="font-medium text-ink-strong">Submitter &amp; BE Lead</span>
                            </div>

                            <div className="flex items-center justify-end pt-1">
                                <Button type="button" size="sm" onClick={handleSaveKzP1Stages} disabled={saveWorkflowStages.isPending} className="text-xs bg-blue-600 hover:bg-blue-700 text-white">
                                    {saveWorkflowStages.isPending ? 'Saving...' : 'Save Workflow'}
                                </Button>
                            </div>
                        </div>
                        )}

                        {/* Kaizen Phase 2 (post-implementation review) — same drag-reorder
                            builder as Phase 1. Floor is a single implementation-review stage
                            (JH leader by default); admins can add more stages. */}
                        {routingModuleTab === 'kaizen' && (
                        <div className="rounded-lg border border-line bg-surface p-3.5 space-y-3 shadow-2xs">
                            <div className="flex items-center justify-between border-b border-line-subtle pb-2">
                                <span className="text-xs font-semibold text-ink-strong flex items-center gap-2">
                                    <Sparkles size={15} className="text-blue-700" />
                                    <span>Kaizen Phase 2 — Post-Implementation Review</span>
                                </span>
                                <span className="text-2xs text-ink-subtle">{kzP2StageDrafts.length} reviewer stage{kzP2StageDrafts.length === 1 ? '' : 's'}</span>
                            </div>
                            <p className="text-2xs text-ink-subtle">
                                Drag a reviewer stage to reorder it, or add another. The default is a single JH-leader review. Who each stage routes to is configured below.
                            </p>

                            {kzP2StageError && <MdmErrorNote error={kzP2StageError} />}
                            {kzP2StageSuccess && (
                                <div className="flex items-center gap-2 rounded-md bg-success-bg/20 border border-success-border p-2 text-2xs text-success-fg font-medium">
                                    <CheckCircle2 size={14} className="shrink-0" />
                                    <span>{kzP2StageSuccess}</span>
                                </div>
                            )}

                            <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-surface-sunken p-2.5">
                                <span className="text-2xs font-medium text-ink-subtle bg-surface-raised border border-line rounded-full px-2.5 py-1">Implementation Reported</span>
                                <ArrowRight size={12} className="text-ink-subtle shrink-0" />

                                {kzP2StageDrafts.map((stage, index) => (
                                    <span key={index} className="flex items-center gap-1.5">
                                        <span
                                            draggable
                                            onDragStart={() => setKzP2StageDragIndex(index)}
                                            onDragOver={(e) => {
                                                e.preventDefault();
                                                if (kzP2StageDragIndex === null || kzP2StageDragIndex === index) return;
                                                setKzP2StageDrafts(prev => {
                                                    const next = [...prev];
                                                    const [moved] = next.splice(kzP2StageDragIndex, 1);
                                                    next.splice(index, 0, moved);
                                                    return next.map((s, i) => ({ ...s, stage_name: `Reviewer ${i + 1}` }));
                                                });
                                                setKzP2StageDragIndex(index);
                                            }}
                                            onDragEnd={() => setKzP2StageDragIndex(null)}
                                            className="flex items-center gap-1 rounded-full border border-blue-400/40 bg-blue-500/10 pl-1.5 pr-1 py-1 cursor-grab"
                                        >
                                            <GripVertical size={12} className="text-blue-700 shrink-0" />
                                            <span className="text-2xs font-semibold text-blue-700">{stage.stage_name}</span>
                                            <button
                                                type="button"
                                                onClick={() => setKzP2StageDrafts(prev => {
                                                    if (prev.length <= 1) return prev; // minimum 1 stage
                                                    return prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, stage_name: `Reviewer ${i + 1}` }));
                                                })}
                                                disabled={kzP2StageDrafts.length <= 1}
                                                className="shrink-0 text-blue-700/60 hover:text-danger disabled:opacity-30 disabled:cursor-not-allowed p-0.5"
                                                title="Remove stage"
                                            >
                                                <X size={11} />
                                            </button>
                                        </span>
                                        <ArrowRight size={12} className="text-ink-subtle shrink-0" />
                                    </span>
                                ))}

                                <span className="text-2xs font-medium text-success-fg bg-success-bg/20 border border-success-border rounded-full px-2.5 py-1">Confirmed Closed</span>
                                <button
                                    type="button"
                                    onClick={() => setKzP2StageDrafts(prev => [...prev, { stage_name: `Reviewer ${prev.length + 1}`, entity_type: null }])}
                                    className="text-2xs font-medium text-blue-700 hover:underline flex items-center gap-1 px-1"
                                >
                                    <Plus size={12} /> Add Stage
                                </button>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5 text-2xs text-ink-subtle">
                                <span className="italic">If rejected at the final stage, with comments</span>
                                <ArrowRight size={11} className="shrink-0" />
                                <span className="font-medium text-ink-strong">Submitter, BE Lead &amp; JH Lead</span>
                            </div>

                            <div className="flex items-center justify-end pt-1">
                                <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => {
                                        setKzP2StageError(null);
                                        setKzP2StageSuccess(null);
                                        if (!oplWorkflowFactoryId) {
                                            setKzP2StageError({ message: 'No plant is associated with your account — cannot save the Kaizen workflow.' });
                                            return;
                                        }
                                        if (kzP2StageDrafts.some(s => !s.stage_name || !s.stage_name.trim())) {
                                            setKzP2StageError({ message: 'Every stage needs a name.' });
                                            return;
                                        }
                                        saveWorkflowStages.mutate({
                                            factory_id: oplWorkflowFactoryId,
                                            module: 'kaizen',
                                            phase: 2,
                                            stages: kzP2StageDrafts.map(s => ({ stage_name: s.stage_name.trim() }))
                                        }, {
                                            onSuccess: () => {
                                                setKzP2StageSuccess('Kaizen phase-2 approval workflow saved.');
                                                toast.success('Kaizen phase-2 workflow saved!');
                                            },
                                            onError: (err) => {
                                                setKzP2StageError(err);
                                                toast.error(err?.message || 'Failed to save Kaizen phase-2 workflow');
                                            }
                                        });
                                    }}
                                    disabled={saveWorkflowStages.isPending}
                                    className="text-xs bg-blue-600 hover:bg-blue-700 text-white"
                                >
                                    {saveWorkflowStages.isPending ? 'Saving...' : 'Save Workflow'}
                                </Button>
                            </div>
                        </div>
                        )}

                        {routingModuleTab === 'kaizen' && selectedRoutingJhGroupId !== NONE && (
                            <div className="space-y-3 pt-1">
                                {/* Kaizen Phase 1 — one approver block per configured proposal-review
                                    stage, same pattern as OPL's. */}
                                {(Array.isArray(kzP1StagesData) && kzP1StagesData.length > 0
                                    ? kzP1StagesData
                                    : [{ entity_type: 'kaizen', stage_name: 'Reviewer 1', stage_order: 1 }]
                                ).map((stage, idx, stages) => {
                                    const cfg = routingConfig.kaizenStages[stage.entity_type] || { approver_role: 'jh_leader', approver_emp_ids: [] };
                                    const stageLabel = `Phase 1 — Reviewer ${idx + 1}`;
                                    const fromLabel = idx === 0
                                        ? 'Submitter'
                                        : describeStageApprover(routingConfig.kaizenStages[stages[idx - 1].entity_type]);
                                    const toLabel = describeStageApprover(cfg);
                                    return (
                                        <div key={stage.entity_type} className="rounded-lg border border-line bg-surface p-3.5 space-y-3 shadow-2xs">
                                            <div className="flex items-center justify-between border-b border-line-subtle pb-2">
                                                <span className="text-xs font-semibold text-ink-strong flex items-center gap-2">
                                                    <Sparkles size={15} className="text-blue-700" />
                                                    <span>{stageLabel}</span>
                                                </span>
                                                <span className="text-2xs rounded bg-blue-600/10 text-blue-700 dark:text-blue-400 px-2 py-0.5 font-medium">
                                                    {cfg.approver_role === 'specific' ? 'Custom Assigned' : cfg.approver_role === 'dmt_leader' ? 'DMT Leader' : 'JH Group Leader'}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-2 rounded bg-surface-sunken px-2.5 py-1.5 text-2xs">
                                                <span className="font-medium text-ink-strong truncate">{fromLabel}</span>
                                                <ArrowRight size={12} className="text-ink-subtle shrink-0" />
                                                <span className="font-medium text-ink-strong truncate">{toLabel}</span>
                                            </div>

                                            <div className="space-y-3">
                                                <div>
                                                    <label className="text-2xs text-ink-subtle block mb-1 font-medium">Approver Level / Role</label>
                                                    <Select
                                                        value={cfg.approver_role}
                                                        onValueChange={(val) => setRoutingConfig(prev => ({
                                                            ...prev,
                                                            kaizenStages: {
                                                                ...prev.kaizenStages,
                                                                [stage.entity_type]: { ...cfg, approver_role: val, approver_emp_ids: val === 'specific' ? cfg.approver_emp_ids : [] }
                                                            }
                                                        }))}
                                                    >
                                                        <SelectTrigger className="h-8 text-xs">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="jh_leader">JH Group Leader (Default)</SelectItem>
                                                            <SelectItem value="dmt_leader">DMT / Module Lead</SelectItem>
                                                            <SelectItem value="specific">Specific Person(s) / Multi-Approvers</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>

                                                {cfg.approver_role === 'specific' && (
                                                    <div>
                                                        <label className="text-2xs text-ink-subtle block mb-1 font-medium">Select Approver Person(s)</label>
                                                        <div className="rounded border border-line bg-surface-raised p-2 max-h-36 overflow-y-auto space-y-1.5">
                                                            {routingJhGroupMembers.map((m) => {
                                                                const empId = m.emp_id || m.id;
                                                                const name = m.worker_name || m.name || empId;
                                                                const isSelected = cfg.approver_emp_ids.includes(empId);
                                                                return (
                                                                    <label key={empId} className="flex items-center gap-2 text-xs text-ink cursor-pointer hover:bg-surface-hover p-1 rounded">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={isSelected}
                                                                            onChange={(e) => {
                                                                                const checked = e.target.checked;
                                                                                setRoutingConfig(prev => {
                                                                                    const current = prev.kaizenStages[stage.entity_type]?.approver_emp_ids || [];
                                                                                    const updated = checked ? [...current, empId] : current.filter(id => id !== empId);
                                                                                    return {
                                                                                        ...prev,
                                                                                        kaizenStages: {
                                                                                            ...prev.kaizenStages,
                                                                                            [stage.entity_type]: { ...prev.kaizenStages[stage.entity_type], approver_emp_ids: updated }
                                                                                        }
                                                                                    };
                                                                                });
                                                                            }}
                                                                            className="rounded text-blue-700 focus:ring-blue-700 h-3.5 w-3.5"
                                                                        />
                                                                        <span className="font-medium">{name}</span>
                                                                        <span className="text-2xs text-ink-subtle">({empId})</span>
                                                                    </label>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}

                                {/* Kaizen Phase 2 — one approver block per configured
                                    post-implementation review stage. Floor is a single stage
                                    ('kaizen_dmt'), independent of Phase 1, JH leader by default. */}
                                {(Array.isArray(kzP2StagesData) && kzP2StagesData.length > 0
                                    ? kzP2StagesData
                                    : [{ entity_type: 'kaizen_dmt', stage_name: 'Reviewer 1', stage_order: 1 }]
                                ).map((stage, idx, stages) => {
                                    const cfg = routingConfig.kaizenDmtStages[stage.entity_type] || { approver_role: 'jh_leader', approver_emp_ids: [] };
                                    const stageLabel = `Phase 2 — Reviewer ${idx + 1}`;
                                    const fromLabel = idx === 0
                                        ? 'Submitter reports implementation'
                                        : describeStageApprover(routingConfig.kaizenDmtStages[stages[idx - 1].entity_type]);
                                    const toLabel = describeStageApprover(cfg);

                                    return (
                                        <div key={stage.entity_type} className="rounded-lg border border-line bg-surface p-3.5 space-y-3 shadow-2xs">
                                            <div className="flex items-center justify-between border-b border-line-subtle pb-2">
                                                <span className="text-xs font-semibold text-ink-strong flex items-center gap-2">
                                                    <ShieldCheck size={15} className="text-blue-700" />
                                                    <span>{stageLabel}</span>
                                                </span>
                                                <span className="text-2xs rounded bg-blue-600/10 text-blue-700 dark:text-blue-400 px-2 py-0.5 font-medium">
                                                    {cfg.approver_role === 'specific' ? 'Custom Assigned' : cfg.approver_role === 'jh_leader' ? 'JH Group Leader' : 'Module Lead'}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-2 rounded bg-surface-sunken px-2.5 py-1.5 text-2xs">
                                                <span className="font-medium text-ink-strong truncate">{fromLabel}</span>
                                                <ArrowRight size={12} className="text-ink-subtle shrink-0" />
                                                <span className="font-medium text-ink-strong truncate">{toLabel}</span>
                                            </div>

                                            <div className="space-y-3">
                                                <div>
                                                    <label className="text-2xs text-ink-subtle block mb-1 font-medium">Approver Level / Role</label>
                                                    <Select
                                                        value={cfg.approver_role}
                                                        onValueChange={(val) => setRoutingConfig(prev => ({
                                                            ...prev,
                                                            kaizenDmtStages: {
                                                                ...prev.kaizenDmtStages,
                                                                [stage.entity_type]: { ...cfg, approver_role: val, approver_emp_ids: val === 'specific' ? cfg.approver_emp_ids : [] }
                                                            }
                                                        }))}
                                                    >
                                                        <SelectTrigger className="h-8 text-xs">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="jh_leader">JH Group Leader (Default)</SelectItem>
                                                            <SelectItem value="dmt_leader">DMT / Module Lead</SelectItem>
                                                            <SelectItem value="specific">Specific Person(s) / Multi-Approvers</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>

                                                {cfg.approver_role === 'specific' && (
                                                    <div>
                                                        <label className="text-2xs text-ink-subtle block mb-1 font-medium">Select Approver Person(s)</label>
                                                        <div className="rounded border border-line bg-surface-raised p-2 max-h-36 overflow-y-auto space-y-1.5">
                                                            {routingJhGroupMembers.map((m) => {
                                                                const empId = m.emp_id || m.id;
                                                                const name = m.worker_name || m.name || empId;
                                                                const isSelected = cfg.approver_emp_ids.includes(empId);
                                                                return (
                                                                    <label key={empId} className="flex items-center gap-2 text-xs text-ink cursor-pointer hover:bg-surface-hover p-1 rounded">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={isSelected}
                                                                            onChange={(e) => {
                                                                                const checked = e.target.checked;
                                                                                setRoutingConfig(prev => {
                                                                                    const current = prev.kaizenDmtStages[stage.entity_type]?.approver_emp_ids || [];
                                                                                    const updated = checked ? [...current, empId] : current.filter(id => id !== empId);
                                                                                    return {
                                                                                        ...prev,
                                                                                        kaizenDmtStages: {
                                                                                            ...prev.kaizenDmtStages,
                                                                                            [stage.entity_type]: { ...prev.kaizenDmtStages[stage.entity_type], approver_emp_ids: updated }
                                                                                        }
                                                                                    };
                                                                                });
                                                                            }}
                                                                            className="rounded text-blue-700 focus:ring-blue-700 h-3.5 w-3.5"
                                                                        />
                                                                        <span className="font-medium">{name}</span>
                                                                        <span className="text-2xs text-ink-subtle">({empId})</span>
                                                                    </label>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Abnormality Phase 1 (JH review, both tag colors) — drag-reorderable
                            stage ladder, same builder pattern as OPL/Kaizen. */}
                        {routingModuleTab === 'abnormality' && (
                        <div className="rounded-lg border border-line bg-surface p-3.5 space-y-3 shadow-2xs">
                            <div className="flex items-center justify-between border-b border-line-subtle pb-2">
                                <span className="text-xs font-semibold text-ink-strong flex items-center gap-2">
                                    <AlertTriangle size={15} className="text-blue-700" />
                                    <span>Abnormality Phase 1 — Review</span>
                                </span>
                                <span className="text-2xs text-ink-subtle">{abnP1StageDrafts.length} reviewer stage{abnP1StageDrafts.length === 1 ? '' : 's'}</span>
                            </div>
                            <p className="text-2xs text-ink-subtle">
                                Drag a reviewer stage to reorder it, or add another. Only the last stage actually assigns a responsibility + person.
                            </p>

                            {abnP1StageError && <MdmErrorNote error={abnP1StageError} />}
                            {abnP1StageSuccess && (
                                <div className="flex items-center gap-2 rounded-md bg-success-bg/20 border border-success-border p-2 text-2xs text-success-fg font-medium">
                                    <CheckCircle2 size={14} className="shrink-0" />
                                    <span>{abnP1StageSuccess}</span>
                                </div>
                            )}

                            <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-surface-sunken p-2.5">
                                <span className="text-2xs font-medium text-ink-subtle bg-surface-raised border border-line rounded-full px-2.5 py-1">Reported</span>
                                <ArrowRight size={12} className="text-ink-subtle shrink-0" />

                                {abnP1StageDrafts.map((stage, index) => (
                                    <span key={index} className="flex items-center gap-1.5">
                                        <span
                                            draggable
                                            onDragStart={() => setAbnP1StageDragIndex(index)}
                                            onDragOver={(e) => {
                                                e.preventDefault();
                                                if (abnP1StageDragIndex === null || abnP1StageDragIndex === index) return;
                                                setAbnP1StageDrafts(prev => {
                                                    const next = [...prev];
                                                    const [moved] = next.splice(abnP1StageDragIndex, 1);
                                                    next.splice(index, 0, moved);
                                                    return next.map((s, i) => ({ ...s, stage_name: `Reviewer ${i + 1}` }));
                                                });
                                                setAbnP1StageDragIndex(index);
                                            }}
                                            onDragEnd={() => setAbnP1StageDragIndex(null)}
                                            className="flex items-center gap-1 rounded-full border border-blue-400/40 bg-blue-500/10 pl-1.5 pr-1 py-1 cursor-grab"
                                        >
                                            <GripVertical size={12} className="text-blue-700 shrink-0" />
                                            <span className="text-2xs font-semibold text-blue-700">{stage.stage_name}</span>
                                            <button
                                                type="button"
                                                onClick={() => setAbnP1StageDrafts(prev => {
                                                    if (prev.length <= 1) return prev;
                                                    return prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, stage_name: `Reviewer ${i + 1}` }));
                                                })}
                                                disabled={abnP1StageDrafts.length <= 1}
                                                className="shrink-0 text-blue-700/60 hover:text-danger disabled:opacity-30 disabled:cursor-not-allowed p-0.5"
                                                title="Remove stage"
                                            >
                                                <X size={11} />
                                            </button>
                                        </span>
                                        <ArrowRight size={12} className="text-ink-subtle shrink-0" />
                                    </span>
                                ))}

                                <span className="text-2xs font-medium text-success-fg bg-success-bg/20 border border-success-border rounded-full px-2.5 py-1">Assigned for Closure</span>
                                <button
                                    type="button"
                                    onClick={() => setAbnP1StageDrafts(prev => [...prev, { stage_name: `Reviewer ${prev.length + 1}`, entity_type: null }])}
                                    className="text-2xs font-medium text-blue-700 hover:underline flex items-center gap-1 px-1"
                                >
                                    <Plus size={12} /> Add Stage
                                </button>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5 text-2xs text-ink-subtle">
                                <span className="italic">If marked for deletion at any stage, with comments</span>
                                <ArrowRight size={11} className="shrink-0" />
                                <span className="font-medium text-ink-strong">Submitter &amp; BE Lead</span>
                            </div>

                            <div className="flex items-center justify-end pt-1">
                                <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => {
                                        setAbnP1StageError(null);
                                        setAbnP1StageSuccess(null);
                                        if (!oplWorkflowFactoryId) {
                                            setAbnP1StageError({ message: 'No plant is associated with your account — cannot save the Abnormality workflow.' });
                                            return;
                                        }
                                        if (abnP1StageDrafts.some(s => !s.stage_name || !s.stage_name.trim())) {
                                            setAbnP1StageError({ message: 'Every stage needs a name.' });
                                            return;
                                        }
                                        saveWorkflowStages.mutate({
                                            factory_id: oplWorkflowFactoryId,
                                            module: 'abnormality',
                                            phase: 1,
                                            stages: abnP1StageDrafts.map(s => ({ stage_name: s.stage_name.trim() }))
                                        }, {
                                            onSuccess: () => {
                                                setAbnP1StageSuccess('Abnormality phase-1 approval workflow saved.');
                                                toast.success('Abnormality phase-1 workflow saved!');
                                            },
                                            onError: (err) => {
                                                setAbnP1StageError(err);
                                                toast.error(err?.message || 'Failed to save Abnormality phase-1 workflow');
                                            }
                                        });
                                    }}
                                    disabled={saveWorkflowStages.isPending}
                                    className="text-xs bg-blue-600 hover:bg-blue-700 text-white"
                                >
                                    {saveWorkflowStages.isPending ? 'Saving...' : 'Save Workflow'}
                                </Button>
                            </div>
                        </div>
                        )}

                        {/* Abnormality Phase 2 (DMT review, after closure evidence is submitted)
                            — same drag-reorder builder; no reject option at this phase, matching
                            today's behavior (only Confirm/Close). */}
                        {routingModuleTab === 'abnormality' && (
                        <div className="rounded-lg border border-line bg-surface p-3.5 space-y-3 shadow-2xs">
                            <div className="flex items-center justify-between border-b border-line-subtle pb-2">
                                <span className="text-xs font-semibold text-ink-strong flex items-center gap-2">
                                    <AlertTriangle size={15} className="text-blue-700" />
                                    <span>Abnormality Phase 2 — Final Closure Review</span>
                                </span>
                                <span className="text-2xs text-ink-subtle">{abnP2StageDrafts.length} reviewer stage{abnP2StageDrafts.length === 1 ? '' : 's'}</span>
                            </div>
                            <p className="text-2xs text-ink-subtle">
                                Drag a reviewer stage to reorder it, or add another. Only the last stage actually closes it.
                            </p>

                            {abnP2StageError && <MdmErrorNote error={abnP2StageError} />}
                            {abnP2StageSuccess && (
                                <div className="flex items-center gap-2 rounded-md bg-success-bg/20 border border-success-border p-2 text-2xs text-success-fg font-medium">
                                    <CheckCircle2 size={14} className="shrink-0" />
                                    <span>{abnP2StageSuccess}</span>
                                </div>
                            )}

                            <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-surface-sunken p-2.5">
                                <span className="text-2xs font-medium text-ink-subtle bg-surface-raised border border-line rounded-full px-2.5 py-1">Closure Evidence Submitted</span>
                                <ArrowRight size={12} className="text-ink-subtle shrink-0" />

                                {abnP2StageDrafts.map((stage, index) => (
                                    <span key={index} className="flex items-center gap-1.5">
                                        <span
                                            draggable
                                            onDragStart={() => setAbnP2StageDragIndex(index)}
                                            onDragOver={(e) => {
                                                e.preventDefault();
                                                if (abnP2StageDragIndex === null || abnP2StageDragIndex === index) return;
                                                setAbnP2StageDrafts(prev => {
                                                    const next = [...prev];
                                                    const [moved] = next.splice(abnP2StageDragIndex, 1);
                                                    next.splice(index, 0, moved);
                                                    return next.map((s, i) => ({ ...s, stage_name: `Reviewer ${i + 1}` }));
                                                });
                                                setAbnP2StageDragIndex(index);
                                            }}
                                            onDragEnd={() => setAbnP2StageDragIndex(null)}
                                            className="flex items-center gap-1 rounded-full border border-blue-400/40 bg-blue-500/10 pl-1.5 pr-1 py-1 cursor-grab"
                                        >
                                            <GripVertical size={12} className="text-blue-700 shrink-0" />
                                            <span className="text-2xs font-semibold text-blue-700">{stage.stage_name}</span>
                                            <button
                                                type="button"
                                                onClick={() => setAbnP2StageDrafts(prev => {
                                                    if (prev.length <= 1) return prev;
                                                    return prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, stage_name: `Reviewer ${i + 1}` }));
                                                })}
                                                disabled={abnP2StageDrafts.length <= 1}
                                                className="shrink-0 text-blue-700/60 hover:text-danger disabled:opacity-30 disabled:cursor-not-allowed p-0.5"
                                                title="Remove stage"
                                            >
                                                <X size={11} />
                                            </button>
                                        </span>
                                        <ArrowRight size={12} className="text-ink-subtle shrink-0" />
                                    </span>
                                ))}

                                <span className="text-2xs font-medium text-success-fg bg-success-bg/20 border border-success-border rounded-full px-2.5 py-1">Closed</span>
                                <button
                                    type="button"
                                    onClick={() => setAbnP2StageDrafts(prev => [...prev, { stage_name: `Reviewer ${prev.length + 1}`, entity_type: null }])}
                                    className="text-2xs font-medium text-blue-700 hover:underline flex items-center gap-1 px-1"
                                >
                                    <Plus size={12} /> Add Stage
                                </button>
                            </div>

                            <div className="flex items-center justify-end pt-1">
                                <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => {
                                        setAbnP2StageError(null);
                                        setAbnP2StageSuccess(null);
                                        if (!oplWorkflowFactoryId) {
                                            setAbnP2StageError({ message: 'No plant is associated with your account — cannot save the Abnormality workflow.' });
                                            return;
                                        }
                                        if (abnP2StageDrafts.some(s => !s.stage_name || !s.stage_name.trim())) {
                                            setAbnP2StageError({ message: 'Every stage needs a name.' });
                                            return;
                                        }
                                        saveWorkflowStages.mutate({
                                            factory_id: oplWorkflowFactoryId,
                                            module: 'abnormality',
                                            phase: 2,
                                            stages: abnP2StageDrafts.map(s => ({ stage_name: s.stage_name.trim() }))
                                        }, {
                                            onSuccess: () => {
                                                setAbnP2StageSuccess('Abnormality phase-2 approval workflow saved.');
                                                toast.success('Abnormality phase-2 workflow saved!');
                                            },
                                            onError: (err) => {
                                                setAbnP2StageError(err);
                                                toast.error(err?.message || 'Failed to save Abnormality phase-2 workflow');
                                            }
                                        });
                                    }}
                                    disabled={saveWorkflowStages.isPending}
                                    className="text-xs bg-blue-600 hover:bg-blue-700 text-white"
                                >
                                    {saveWorkflowStages.isPending ? 'Saving...' : 'Save Workflow'}
                                </Button>
                            </div>
                        </div>
                        )}

                        {routingModuleTab === 'abnormality' && selectedRoutingJhGroupId !== NONE && (
                            <div className="space-y-3 pt-1">
                                {/* Abnormality Phase 1 — one approver block per configured review stage. */}
                                {(Array.isArray(abnP1StagesData) && abnP1StagesData.length > 0
                                    ? abnP1StagesData
                                    : [{ entity_type: 'abnormality', stage_name: 'Reviewer 1', stage_order: 1 }]
                                ).map((stage, idx, stages) => {
                                    const cfg = routingConfig.abnormalityStages[stage.entity_type] || { approver_role: 'jh_leader', approver_emp_ids: [] };
                                    const stageLabel = `Phase 1 — Reviewer ${idx + 1}`;
                                    const fromLabel = idx === 0
                                        ? 'Submitter'
                                        : describeStageApprover(routingConfig.abnormalityStages[stages[idx - 1].entity_type]);
                                    const toLabel = describeStageApprover(cfg);
                                    return (
                                        <div key={stage.entity_type} className="rounded-lg border border-line bg-surface p-3.5 space-y-3 shadow-2xs">
                                            <div className="flex items-center justify-between border-b border-line-subtle pb-2">
                                                <span className="text-xs font-semibold text-ink-strong flex items-center gap-2">
                                                    <AlertTriangle size={15} className="text-blue-700" />
                                                    <span>{stageLabel}</span>
                                                </span>
                                                <span className="text-2xs rounded bg-blue-600/10 text-blue-700 dark:text-blue-400 px-2 py-0.5 font-medium">
                                                    {cfg.approver_role === 'specific' ? 'Custom Assigned' : cfg.approver_role === 'dmt_leader' ? 'DMT Leader' : 'JH Group Leader'}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-2 rounded bg-surface-sunken px-2.5 py-1.5 text-2xs">
                                                <span className="font-medium text-ink-strong truncate">{fromLabel}</span>
                                                <ArrowRight size={12} className="text-ink-subtle shrink-0" />
                                                <span className="font-medium text-ink-strong truncate">{toLabel}</span>
                                            </div>

                                            <div className="space-y-3">
                                                <div>
                                                    <label className="text-2xs text-ink-subtle block mb-1 font-medium">Approver Level / Role</label>
                                                    <Select
                                                        value={cfg.approver_role}
                                                        onValueChange={(val) => setRoutingConfig(prev => ({
                                                            ...prev,
                                                            abnormalityStages: {
                                                                ...prev.abnormalityStages,
                                                                [stage.entity_type]: { ...cfg, approver_role: val, approver_emp_ids: val === 'specific' ? cfg.approver_emp_ids : [] }
                                                            }
                                                        }))}
                                                    >
                                                        <SelectTrigger className="h-8 text-xs">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="jh_leader">JH Group Leader (Default)</SelectItem>
                                                            <SelectItem value="dmt_leader">DMT / Module Lead</SelectItem>
                                                            <SelectItem value="specific">Specific Person(s) / Multi-Approvers</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>

                                                {cfg.approver_role === 'specific' && (
                                                    <div>
                                                        <label className="text-2xs text-ink-subtle block mb-1 font-medium">Select Approver Person(s)</label>
                                                        <div className="rounded border border-line bg-surface-raised p-2 max-h-36 overflow-y-auto space-y-1.5">
                                                            {routingJhGroupMembers.map((m) => {
                                                                const empId = m.emp_id || m.id;
                                                                const name = m.worker_name || m.name || empId;
                                                                const isSelected = cfg.approver_emp_ids.includes(empId);
                                                                return (
                                                                    <label key={empId} className="flex items-center gap-2 text-xs text-ink cursor-pointer hover:bg-surface-hover p-1 rounded">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={isSelected}
                                                                            onChange={(e) => {
                                                                                const checked = e.target.checked;
                                                                                setRoutingConfig(prev => {
                                                                                    const current = prev.abnormalityStages[stage.entity_type]?.approver_emp_ids || [];
                                                                                    const updated = checked ? [...current, empId] : current.filter(id => id !== empId);
                                                                                    return {
                                                                                        ...prev,
                                                                                        abnormalityStages: {
                                                                                            ...prev.abnormalityStages,
                                                                                            [stage.entity_type]: { ...prev.abnormalityStages[stage.entity_type], approver_emp_ids: updated }
                                                                                        }
                                                                                    };
                                                                                });
                                                                            }}
                                                                            className="rounded text-blue-700 focus:ring-blue-700 h-3.5 w-3.5"
                                                                        />
                                                                        <span className="font-medium">{name}</span>
                                                                        <span className="text-2xs text-ink-subtle">({empId})</span>
                                                                    </label>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}

                                {/* Abnormality Phase 2 — one approver block per configured final
                                    closure-review stage. Defaults to the Module Lead. */}
                                {(Array.isArray(abnP2StagesData) && abnP2StagesData.length > 0
                                    ? abnP2StagesData
                                    : [{ entity_type: 'abnormality_dmt', stage_name: 'Reviewer 1', stage_order: 1 }]
                                ).map((stage, idx, stages) => {
                                    const cfg = routingConfig.abnormalityDmtStages[stage.entity_type] || { approver_role: 'dmt_leader', approver_emp_ids: [] };
                                    const stageLabel = `Phase 2 — Reviewer ${idx + 1}`;
                                    const fromLabel = idx === 0
                                        ? 'Assignee submits closure evidence'
                                        : describeStageApprover(routingConfig.abnormalityDmtStages[stages[idx - 1].entity_type]);
                                    const toLabel = describeStageApprover(cfg);
                                    return (
                                        <div key={stage.entity_type} className="rounded-lg border border-line bg-surface p-3.5 space-y-3 shadow-2xs">
                                            <div className="flex items-center justify-between border-b border-line-subtle pb-2">
                                                <span className="text-xs font-semibold text-ink-strong flex items-center gap-2">
                                                    <ShieldCheck size={15} className="text-blue-700" />
                                                    <span>{stageLabel}</span>
                                                </span>
                                                <span className="text-2xs rounded bg-blue-600/10 text-blue-700 dark:text-blue-400 px-2 py-0.5 font-medium">
                                                    {cfg.approver_role === 'specific' ? 'Custom Assigned' : cfg.approver_role === 'jh_leader' ? 'JH Group Leader' : 'Module Lead'}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-2 rounded bg-surface-sunken px-2.5 py-1.5 text-2xs">
                                                <span className="font-medium text-ink-strong truncate">{fromLabel}</span>
                                                <ArrowRight size={12} className="text-ink-subtle shrink-0" />
                                                <span className="font-medium text-ink-strong truncate">{toLabel}</span>
                                            </div>

                                            <div className="space-y-3">
                                                <div>
                                                    <label className="text-2xs text-ink-subtle block mb-1 font-medium">Approver Level / Role</label>
                                                    <Select
                                                        value={cfg.approver_role}
                                                        onValueChange={(val) => setRoutingConfig(prev => ({
                                                            ...prev,
                                                            abnormalityDmtStages: {
                                                                ...prev.abnormalityDmtStages,
                                                                [stage.entity_type]: { ...cfg, approver_role: val, approver_emp_ids: val === 'specific' ? cfg.approver_emp_ids : [] }
                                                            }
                                                        }))}
                                                    >
                                                        <SelectTrigger className="h-8 text-xs">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="jh_leader">JH Group Leader</SelectItem>
                                                            <SelectItem value="dmt_leader">DMT / Module Lead (Default)</SelectItem>
                                                            <SelectItem value="specific">Specific Person(s) / Multi-Approvers</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>

                                                {cfg.approver_role === 'specific' && (
                                                    <div>
                                                        <label className="text-2xs text-ink-subtle block mb-1 font-medium">Select Approver Person(s)</label>
                                                        <div className="rounded border border-line bg-surface-raised p-2 max-h-36 overflow-y-auto space-y-1.5">
                                                            {routingJhGroupMembers.map((m) => {
                                                                const empId = m.emp_id || m.id;
                                                                const name = m.worker_name || m.name || empId;
                                                                const isSelected = cfg.approver_emp_ids.includes(empId);
                                                                return (
                                                                    <label key={empId} className="flex items-center gap-2 text-xs text-ink cursor-pointer hover:bg-surface-hover p-1 rounded">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={isSelected}
                                                                            onChange={(e) => {
                                                                                const checked = e.target.checked;
                                                                                setRoutingConfig(prev => {
                                                                                    const current = prev.abnormalityDmtStages[stage.entity_type]?.approver_emp_ids || [];
                                                                                    const updated = checked ? [...current, empId] : current.filter(id => id !== empId);
                                                                                    return {
                                                                                        ...prev,
                                                                                        abnormalityDmtStages: {
                                                                                            ...prev.abnormalityDmtStages,
                                                                                            [stage.entity_type]: { ...prev.abnormalityDmtStages[stage.entity_type], approver_emp_ids: updated }
                                                                                        }
                                                                                    };
                                                                                });
                                                                            }}
                                                                            className="rounded text-blue-700 focus:ring-blue-700 h-3.5 w-3.5"
                                                                        />
                                                                        <span className="font-medium">{name}</span>
                                                                        <span className="text-2xs text-ink-subtle">({empId})</span>
                                                                    </label>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <DialogFooter className="gap-2 sm:gap-0 border-t border-line pt-3 mt-2">
                        <Button
                            variant="outline"
                            onClick={() => setIsApprovalRoutingOpen(false)}
                            className="text-xs h-8"
                        >
                            Close
                        </Button>
                        {selectedRoutingJhGroupId !== NONE && (
                            <Button
                                onClick={handleSaveRouting}
                                disabled={saveApprovalRouting.isPending}
                                className="text-xs h-8 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
                            >
                                <ShieldCheck size={14} />
                                {saveApprovalRouting.isPending ? 'Saving...' : 'Save Routing Rules'}
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}


