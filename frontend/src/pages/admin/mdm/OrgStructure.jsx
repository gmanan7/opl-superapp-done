import { useState, useMemo, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Layers, Search, X, Users, UserCheck, Filter, GitBranch, ShieldCheck, FileText, Sparkles, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { useOrgStructure, useCreateModuleGroup, useDeleteModuleGroup, useCreateJhGroup, useDeleteJhGroup, useAddJhGroupMember, useRemoveJhGroupMember, useAddDmtMember, useRemoveDmtMember, useSaveApprovalRouting } from '@/hooks/mdm';
import { loadSession, roleAtLeast } from '@/lib/auth';
import { MdmErrorNote } from './mdmUi';

const NONE = '__none__';

export function OrgStructure() {
    const { t } = useTranslation();
    const { data, isLoading } = useOrgStructure();
    const createModuleGroup = useCreateModuleGroup();
    const deleteModuleGroup = useDeleteModuleGroup();
    const createJhGroup = useCreateJhGroup();
    const deleteJhGroup = useDeleteJhGroup();
    const addJhGroupMember = useAddJhGroupMember();
    const removeJhGroupMember = useRemoveJhGroupMember();
    const addDmtMember = useAddDmtMember();
    const removeDmtMember = useRemoveDmtMember();
    const saveApprovalRouting = useSaveApprovalRouting();

    const session = loadSession();
    const loggedInEmpId = session?.emp_id || session?.userId || session?.worker_id || session?.worker?.id;
    const userRole = session?.role || session?.worker?.tpm_role || '';
    const isBeLead = roleAtLeast(userRole, 'be_lead') || userRole === 'be_lead' || userRole === 'admin' || userRole === 'it_lead' || userRole === 'leadership';

    // Approval Routing Dialog state
    const [isApprovalRoutingOpen, setIsApprovalRoutingOpen] = useState(false);
    const [selectedRoutingJhGroupId, setSelectedRoutingJhGroupId] = useState(NONE);
    const [routingConfig, setRoutingConfig] = useState({
        opl: { approver_role: 'jh_leader', approver_emp_ids: [] },
        kaizen: { approver_role: 'jh_leader', approver_emp_ids: [] },
        abnormality: { approver_role: 'jh_leader', approver_emp_ids: [] }
    });
    const [routingError, setRoutingError] = useState(null);
    const [routingSuccess, setRoutingSuccess] = useState(null);

    // Module/DMT Dialog state
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [selectedModule, setSelectedModule] = useState('');
    const [selectedFactoryId, setSelectedFactoryId] = useState(NONE);
    const [selectedLeadEmpId, setSelectedLeadEmpId] = useState(NONE);
    const [leadSearch, setLeadSearch] = useState('');
    const [formError, setFormError] = useState(null);

    // JH Group Dialog state
    const [isJhDialogOpen, setIsJhDialogOpen] = useState(false);
    const [targetModuleGroup, setTargetModuleGroup] = useState(null);
    const [jhGroupName, setJhGroupName] = useState('');
    const [jhLeaderEmpId, setJhLeaderEmpId] = useState(NONE);
    const [jhLeaderSearch, setJhLeaderSearch] = useState('');
    const [jhSelectedFactoryId, setJhSelectedFactoryId] = useState(NONE);
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

    useEffect(() => {
        if (selectedRoutingJhGroupId !== NONE && approvalRoutings.length > 0) {
            const jhRoutings = approvalRoutings.filter(ar => ar.jh_group_id === selectedRoutingJhGroupId);
            const oplRule = jhRoutings.find(r => r.entity_type === 'opl');
            const kaizenRule = jhRoutings.find(r => r.entity_type === 'kaizen');
            const abnormalityRule = jhRoutings.find(r => r.entity_type === 'abnormality');

            const parseEmpIds = (rule) => {
                if (!rule?.approver_emp_id || rule.approver_emp_id === NONE) return [];
                return String(rule.approver_emp_id).split(',').map(s => s.trim()).filter(Boolean);
            };

            setRoutingConfig({
                opl: {
                    approver_role: oplRule?.approver_role || 'jh_leader',
                    approver_emp_ids: parseEmpIds(oplRule)
                },
                kaizen: {
                    approver_role: kaizenRule?.approver_role || 'jh_leader',
                    approver_emp_ids: parseEmpIds(kaizenRule)
                },
                abnormality: {
                    approver_role: abnormalityRule?.approver_role || 'jh_leader',
                    approver_emp_ids: parseEmpIds(abnormalityRule)
                }
            });
        } else {
            setRoutingConfig({
                opl: { approver_role: 'jh_leader', approver_emp_ids: [] },
                kaizen: { approver_role: 'jh_leader', approver_emp_ids: [] },
                abnormality: { approver_role: 'jh_leader', approver_emp_ids: [] }
            });
        }
    }, [selectedRoutingJhGroupId, approvalRoutings]);

    const selectedRoutingJhGroup = useMemo(() => {
        if (selectedRoutingJhGroupId === NONE) return null;
        return jhGroups.find(jh => jh.id === selectedRoutingJhGroupId);
    }, [jhGroups, selectedRoutingJhGroupId]);

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

    // Filter user's specific plant access
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
        setSelectedFactoryId(NONE);
        setSelectedLeadEmpId(NONE);
        setLeadSearch('');
        setIsDialogOpen(true);
    }

    function handleSubmit() {
        if (!selectedModule) return;
        setFormError(null);

        const leadWorker = workers.find(w => w.emp_id === selectedLeadEmpId || w.id === selectedLeadEmpId);
        const leadName = leadWorker ? leadWorker.name : '';

        createModuleGroup.mutate({
            module: selectedModule,
            factory_id: selectedFactoryId === NONE ? null : selectedFactoryId,
            module_lead_emp_id: selectedLeadEmpId === NONE ? null : selectedLeadEmpId,
            module_lead_name: leadName || null
        }, {
            onSuccess: () => setIsDialogOpen(false),
            onError: (err) => setFormError(err)
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
                onSuccess: () => setDeleteConfirmItem(null),
                onError: (err) => setDeleteError(err)
            });
        } else if (deleteConfirmItem.type === 'jhGroup') {
            deleteJhGroup.mutate(deleteConfirmItem.id, {
                onSuccess: () => setDeleteConfirmItem(null),
                onError: (err) => setDeleteError(err)
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
            leader_name: leaderName || null
        }, {
            onSuccess: () => setIsJhDialogOpen(false),
            onError: (err) => setJhFormError(err)
        });
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

        const routingsToSave = [
            {
                entity_type: 'opl',
                approver_role: routingConfig.opl.approver_role,
                approver_emp_id: formatEmpIds(routingConfig.opl),
                approver_name: routingConfig.opl.approver_role === 'specific' ? getWorkerNames(routingConfig.opl.approver_emp_ids) : null
            },
            {
                entity_type: 'kaizen',
                approver_role: routingConfig.kaizen.approver_role,
                approver_emp_id: formatEmpIds(routingConfig.kaizen),
                approver_name: routingConfig.kaizen.approver_role === 'specific' ? getWorkerNames(routingConfig.kaizen.approver_emp_ids) : null
            },
            {
                entity_type: 'abnormality',
                approver_role: routingConfig.abnormality.approver_role,
                approver_emp_id: formatEmpIds(routingConfig.abnormality),
                approver_name: routingConfig.abnormality.approver_role === 'specific' ? getWorkerNames(routingConfig.abnormality.approver_emp_ids) : null
            }
        ];

        saveApprovalRouting.mutate({
            factory_id: factoryId,
            jh_group_id: selectedRoutingJhGroupId,
            routings: routingsToSave
        }, {
            onSuccess: () => {
                setRoutingSuccess(`Approval routing rules saved successfully for ${targetJh?.name || 'JH Group'}!`);
            },
            onError: (err) => setRoutingError(err)
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
                    {isBeLead && (
                        <Button
                            onClick={() => {
                                setIsApprovalRoutingOpen(true);
                                setRoutingError(null);
                                setRoutingSuccess(null);
                            }}
                            variant="outline"
                            className="gap-2 bg-surface hover:bg-surface-hover w-full sm:w-auto text-xs sm:text-sm border-brand/40 text-brand font-medium hover:border-brand"
                        >
                            <GitBranch size={16} aria-hidden />
                            Approval Routing
                        </Button>
                    )}
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
                                    <div className="flex items-center justify-between border-b border-line-subtle pb-2">
                                        <span className="rounded bg-brand/10 px-2.5 py-1 text-xs font-semibold text-brand">
                                            {g.module}
                                        </span>
                                        <span className="text-xs font-mono text-ink-subtle">
                                            Plant: {g.factory_code || g.factory_name || 'All Plants'}
                                        </span>
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-semibold text-ink-strong flex items-center gap-1.5">
                                            <UserCheck size={15} className="text-brand" />
                                            Module Lead: {g.module_lead_name || 'Unassigned'}
                                        </h3>
                                        {g.module_lead_emp_id && (
                                            <p className="text-xs text-ink-subtle pl-5">ID: {g.module_lead_emp_id}</p>
                                        )}

                                        <div className="mt-2.5 flex items-center justify-between rounded bg-surface p-2 border border-line-subtle">
                                            <span className="text-xs font-medium text-ink flex items-center gap-1.5">
                                                <Users size={13} className="text-brand" />
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
                                                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded border border-line/60 bg-surface-raised p-2.5 text-xs hover:border-brand/40 transition-colors min-w-0"
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
                                                                <span className="font-semibold text-ink-strong hover:text-brand transition-colors break-words">
                                                                    {jh.name}
                                                                </span>
                                                                {jh.leader_name && (
                                                                    <span className="text-2xs text-ink-subtle break-words">
                                                                        (Leader: {jh.leader_name})
                                                                    </span>
                                                                )}
                                                                <span className="inline-flex items-center gap-1 rounded bg-brand/10 px-2 py-0.5 text-2xs font-medium text-brand shrink-0">
                                                                    <Users size={11} />
                                                                    {membersCount} {membersCount === 1 ? 'Member' : 'Members'}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center gap-1.5 shrink-0 justify-end pt-1 sm:pt-0 border-t sm:border-t-0 border-line-subtle">
                                                                {isBeLead && (
                                                                    <Button
                                                                        variant="outline"
                                                                        size="sm"
                                                                        className="h-6 px-1.5 text-2xs gap-1 border-brand/30 text-brand hover:bg-brand/10 font-medium"
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
                                            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand">
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
                                                        <UserCheck size={12} className="text-brand" />
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
                                    </div>
                                </div>
                                <div className="mt-4 flex items-center gap-2 border-t border-line-subtle pt-3">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 w-full text-xs font-medium"
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
                            Plant / Factory
                            <Select value={selectedFactoryId} onValueChange={setSelectedFactoryId}>
                                <SelectTrigger className="mt-1 w-full">
                                    <SelectValue placeholder="Select Factory" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={NONE}>All Plants</SelectItem>
                                    {availableFactoriesForCreation.map((f) => (
                                        <SelectItem key={f.id} value={f.id}>
                                            {f.name} ({f.code || f.id})
                                        </SelectItem>
                                    ))}
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
                        <Button onClick={handleSubmit} disabled={createModuleGroup.isPending || !selectedModule}>
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
                            <Users size={18} className="text-brand" />
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
                                        <div className="flex items-center justify-between rounded border border-brand/30 bg-brand/5 px-3 py-2 text-xs mb-1.5">
                                            <div className="flex items-center gap-2">
                                                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand/20 text-brand font-semibold text-2xs">
                                                    {(membersJhGroup.leader_name || 'L').charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="font-medium text-ink-strong flex items-center gap-1.5">
                                                        <span>{membersJhGroup.leader_name}</span>
                                                        <span className="rounded bg-brand/10 px-1.5 py-0.5 text-2xs font-medium text-brand">JH Leader</span>
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
                                                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand/10 text-brand font-semibold text-2xs">
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
                                                            onError: (err) => setMemberError(err?.message || 'Failed to remove member')
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
                                <Plus size={14} className="text-brand" />
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
                                                    },
                                                    onError: (err) => setMemberError(err?.message || 'Failed to add member')
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
                            <Users size={18} className="text-brand" />
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
                                        <div className="flex items-center justify-between rounded border border-brand/30 bg-brand/5 px-3 py-2 text-xs mb-1.5">
                                            <div className="flex items-center gap-2">
                                                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand/20 text-brand font-semibold text-2xs">
                                                    {(membersDmtGroup.module_lead_name || 'L').charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="font-medium text-ink-strong flex items-center gap-1.5">
                                                        <span>{membersDmtGroup.module_lead_name}</span>
                                                        <span className="rounded bg-brand/10 px-1.5 py-0.5 text-2xs font-medium text-brand">Module Lead</span>
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
                                                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand/10 text-brand font-semibold text-2xs">
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
                                                            onError: (err) => setDmtMemberError(err?.message || 'Failed to remove member')
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
                                <Plus size={14} className="text-brand" />
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
                                                    },
                                                    onError: (err) => setDmtMemberError(err?.message || 'Failed to add member')
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
                }
            }}>
                <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-ink-strong">
                            <GitBranch className="text-brand" size={20} />
                            Approval Routing Configuration
                        </DialogTitle>
                        <p className="text-xs text-ink-muted">
                            As BE Lead, configure which person or role in each JH Group approves OPLs, Kaizens, and Abnormalities.
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

                        {/* Select JH Group */}
                        <div className="rounded-lg border border-line bg-surface-raised p-3 space-y-2">
                            <label className="text-xs font-semibold text-ink-strong block">
                                Select JH Group to Configure
                            </label>
                            <Select
                                value={selectedRoutingJhGroupId}
                                onValueChange={(val) => {
                                    setSelectedRoutingJhGroupId(val);
                                    setRoutingError(null);
                                    setRoutingSuccess(null);
                                }}
                            >
                                <SelectTrigger className="h-9 text-xs">
                                    <SelectValue placeholder="-- Choose a JH Group --" />
                                </SelectTrigger>
                                <SelectContent className="max-h-56">
                                    <SelectItem value={NONE}>-- Select JH Group --</SelectItem>
                                    {jhGroups.map((jh) => (
                                        <SelectItem key={jh.id} value={jh.id}>
                                            {jh.name} {jh.leader_name ? `(Leader: ${jh.leader_name})` : ''}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {selectedRoutingJhGroupId !== NONE && (
                            <div className="space-y-3 pt-1">
                                {/* OPL Section */}
                                <div className="rounded-lg border border-line bg-surface p-3.5 space-y-3 shadow-2xs">
                                    <div className="flex items-center justify-between border-b border-line-subtle pb-2">
                                        <span className="text-xs font-semibold text-ink-strong flex items-center gap-2">
                                            <FileText size={15} className="text-brand" />
                                            <span>OPL (One Point Lesson) Approval</span>
                                        </span>
                                        <span className="text-2xs rounded bg-brand/10 text-brand px-2 py-0.5 font-medium">
                                            {routingConfig.opl.approver_role === 'specific' ? 'Custom Assigned' : routingConfig.opl.approver_role === 'dmt_leader' ? 'DMT Leader' : 'JH Group Leader'}
                                        </span>
                                    </div>

                                    <div className="space-y-3">
                                        <div>
                                            <label className="text-2xs text-ink-subtle block mb-1 font-medium">Approver Level / Role</label>
                                            <Select
                                                value={routingConfig.opl.approver_role}
                                                onValueChange={(val) => setRoutingConfig(prev => ({
                                                    ...prev,
                                                    opl: { ...prev.opl, approver_role: val, approver_emp_ids: val === 'specific' ? prev.opl.approver_emp_ids : [] }
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

                                        {routingConfig.opl.approver_role === 'specific' && (
                                            <div>
                                                <label className="text-2xs text-ink-subtle block mb-1 font-medium">Select Approver Person(s)</label>
                                                <div className="rounded border border-line bg-surface-raised p-2 max-h-36 overflow-y-auto space-y-1.5">
                                                    {routingJhGroupMembers.map((m) => {
                                                        const empId = m.emp_id || m.id;
                                                        const name = m.worker_name || m.name || empId;
                                                        const isSelected = routingConfig.opl.approver_emp_ids.includes(empId);
                                                        return (
                                                            <label key={empId} className="flex items-center gap-2 text-xs text-ink cursor-pointer hover:bg-surface-hover p-1 rounded">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isSelected}
                                                                    onChange={(e) => {
                                                                        const checked = e.target.checked;
                                                                        setRoutingConfig(prev => {
                                                                            const current = prev.opl.approver_emp_ids || [];
                                                                            const updated = checked ? [...current, empId] : current.filter(id => id !== empId);
                                                                            return { ...prev, opl: { ...prev.opl, approver_emp_ids: updated } };
                                                                        });
                                                                    }}
                                                                    className="rounded text-brand focus:ring-brand h-3.5 w-3.5"
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

                                {/* Kaizen Section */}
                                <div className="rounded-lg border border-line bg-surface p-3.5 space-y-3 shadow-2xs">
                                    <div className="flex items-center justify-between border-b border-line-subtle pb-2">
                                        <span className="text-xs font-semibold text-ink-strong flex items-center gap-2">
                                            <Sparkles size={15} className="text-amber-500" />
                                            <span>Kaizen Approval</span>
                                        </span>
                                        <span className="text-2xs rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 font-medium">
                                            {routingConfig.kaizen.approver_role === 'specific' ? 'Custom Assigned' : routingConfig.kaizen.approver_role === 'dmt_leader' ? 'DMT Leader' : 'JH Group Leader'}
                                        </span>
                                    </div>

                                    <div className="space-y-3">
                                        <div>
                                            <label className="text-2xs text-ink-subtle block mb-1 font-medium">Approver Level / Role</label>
                                            <Select
                                                value={routingConfig.kaizen.approver_role}
                                                onValueChange={(val) => setRoutingConfig(prev => ({
                                                    ...prev,
                                                    kaizen: { ...prev.kaizen, approver_role: val, approver_emp_ids: val === 'specific' ? prev.kaizen.approver_emp_ids : [] }
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

                                        {routingConfig.kaizen.approver_role === 'specific' && (
                                            <div>
                                                <label className="text-2xs text-ink-subtle block mb-1 font-medium">Select Approver Person(s)</label>
                                                <div className="rounded border border-line bg-surface-raised p-2 max-h-36 overflow-y-auto space-y-1.5">
                                                    {routingJhGroupMembers.map((m) => {
                                                        const empId = m.emp_id || m.id;
                                                        const name = m.worker_name || m.name || empId;
                                                        const isSelected = routingConfig.kaizen.approver_emp_ids.includes(empId);
                                                        return (
                                                            <label key={empId} className="flex items-center gap-2 text-xs text-ink cursor-pointer hover:bg-surface-hover p-1 rounded">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isSelected}
                                                                    onChange={(e) => {
                                                                        const checked = e.target.checked;
                                                                        setRoutingConfig(prev => {
                                                                            const current = prev.kaizen.approver_emp_ids || [];
                                                                            const updated = checked ? [...current, empId] : current.filter(id => id !== empId);
                                                                            return { ...prev, kaizen: { ...prev.kaizen, approver_emp_ids: updated } };
                                                                        });
                                                                    }}
                                                                    className="rounded text-brand focus:ring-brand h-3.5 w-3.5"
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

                                {/* Abnormalities Section */}
                                <div className="rounded-lg border border-line bg-surface p-3.5 space-y-3 shadow-2xs">
                                    <div className="flex items-center justify-between border-b border-line-subtle pb-2">
                                        <span className="text-xs font-semibold text-ink-strong flex items-center gap-2">
                                            <AlertTriangle size={15} className="text-rose-500" />
                                            <span>Abnormalities Approval / Routing</span>
                                        </span>
                                        <span className="text-2xs rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 px-2 py-0.5 font-medium">
                                            {routingConfig.abnormality.approver_role === 'specific' ? 'Custom Assigned' : routingConfig.abnormality.approver_role === 'dmt_leader' ? 'DMT Leader' : 'JH Group Leader'}
                                        </span>
                                    </div>

                                    <div className="space-y-3">
                                        <div>
                                            <label className="text-2xs text-ink-subtle block mb-1 font-medium">Approver Level / Role</label>
                                            <Select
                                                value={routingConfig.abnormality.approver_role}
                                                onValueChange={(val) => setRoutingConfig(prev => ({
                                                    ...prev,
                                                    abnormality: { ...prev.abnormality, approver_role: val, approver_emp_ids: val === 'specific' ? prev.abnormality.approver_emp_ids : [] }
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

                                        {routingConfig.abnormality.approver_role === 'specific' && (
                                            <div>
                                                <label className="text-2xs text-ink-subtle block mb-1 font-medium">Select Approver Person(s)</label>
                                                <div className="rounded border border-line bg-surface-raised p-2 max-h-36 overflow-y-auto space-y-1.5">
                                                    {routingJhGroupMembers.map((m) => {
                                                        const empId = m.emp_id || m.id;
                                                        const name = m.worker_name || m.name || empId;
                                                        const isSelected = routingConfig.abnormality.approver_emp_ids.includes(empId);
                                                        return (
                                                            <label key={empId} className="flex items-center gap-2 text-xs text-ink cursor-pointer hover:bg-surface-hover p-1 rounded">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isSelected}
                                                                    onChange={(e) => {
                                                                        const checked = e.target.checked;
                                                                        setRoutingConfig(prev => {
                                                                            const current = prev.abnormality.approver_emp_ids || [];
                                                                            const updated = checked ? [...current, empId] : current.filter(id => id !== empId);
                                                                            return { ...prev, abnormality: { ...prev.abnormality, approver_emp_ids: updated } };
                                                                        });
                                                                    }}
                                                                    className="rounded text-brand focus:ring-brand h-3.5 w-3.5"
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
                                className="text-xs h-8 gap-1.5"
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


