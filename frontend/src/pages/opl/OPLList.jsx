import { useState, useRef, useMemo, useEffect, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    Star, FileText, Send, Clock, User, UserCheck, List, MessageSquare,
    ImagePlus, X, Loader2, History, CheckCircle2, XCircle, AlertTriangle, Tag,
    GraduationCap, ChevronRight, ChevronLeft, ChevronDown, Globe, Users, Building2, Search, Filter, BookOpen, Layers, Plus, Trash2, Play, PauseCircle, Trophy, TrendingDown, TrendingUp, Bell, Pencil
} from 'lucide-react';
import {
    useOplDetails, useCreateOplDetail, useUpdateOplDetail, useSubmitOPL,
    useJhAcceptOPL, useJhRejectOPL, useBeAcceptOPL, useBeRejectOPL,
    useSetStarOPL, usePushOplTraining,
    useOplTrainingAssignments, useCompleteOplTrainingAssignment, useOplAnalytics, useOplAnalyticsTrend,
    useOplRepositorySetting, useUpdateOplRepositorySetting,
    useOplTrainingSchedules, useCreateOplTrainingSchedule, useUpdateOplTrainingSchedule,
    useDeleteOplTrainingSchedule, useRunOplTrainingSchedule, useOplJhGroupAnalytics
} from '../../hooks/useOPL';
import { api } from '../../lib/api';
import { useQuery } from '@tanstack/react-query';
import { useOrgStructure, useDepartments } from '../../hooks/mdm';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, LineChart, Line } from 'recharts';
import * as XLSX from 'xlsx';
import { compressImageAndUpload } from '../../lib/imageUpload';
import { CaptureColumn, StatusBadge, EmptyState, SkeletonRow, ListPager } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { loadSession, getSessionContext, getName } from '../../lib/auth';
import { useRemindTraining } from '../../hooks/useNotifications';
import { OPLAuditTrailModal } from '../../components/opl/OPLAuditTrailModal';
import { OPLEditSubmitterModal } from '../../components/opl/OPLEditSubmitterModal';
import { OnePointLessonSheet } from '../../components/opl/OnePointLessonSheet';

const STATUS_KEY = {
    draft: 'neutral',
    pending_jh_review: 'warning',
    pending_approval: 'warning',
    pending_be_review: 'warning',
    published: 'success',
    approved: 'success',
    rejected: 'danger'
};

const STATUS_LABEL = {
    draft: 'Draft',
    pending_jh_review: 'Pending Review',
    pending_approval: 'Pending Review',
    pending_be_review: 'Pending Review',
    published: 'Approved',
    approved: 'Approved',
    rejected: 'Rejected'
};

const CLASSIFICATIONS = ['Basic Condition', 'Troubleshoot', 'Improvement'];

const REVIEW_FIELD_LABEL = {
    title: 'Title',
    content: 'Description',
    before_description: 'Before Description',
    after_description: 'After Description',
    before_image: 'Before Photo',
    after_image: 'After Photo',
    classification: 'Classification',
};

export function OPLList() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const session = loadSession();
    const ctx = getSessionContext();

    const [mainTab, setMainTab] = useState('details');

    // Per-plant repository scope. A plant always sees its own lessons; a BE lead can opt in
    // to specific other plants. Default: own plant only.
    const { data: repoSetting } = useOplRepositorySetting();
    const updateRepoSetting = useUpdateOplRepositorySetting();
    // Server says can_edit for BE-lead-tier; also gate on the session role so a stale query
    // cache from a previous (higher-privilege) login can't briefly expose the control.
    const _repoRole = (ctx?.role || session?.role || session?.worker?.tpm_role || '').toLowerCase();
    const _repoRoleIsLead = _repoRole.includes('be_lead') || _repoRole === 'it_lead' || _repoRole === 'leadership' || _repoRole === 'admin';
    const repoCanEdit = repoSetting?.can_edit === true && _repoRoleIsLead;
    const myPlantFactoryId = repoSetting?.factory_id ?? null;
    const repoExtraPlantIds = useMemo(() => (repoSetting?.extra_factory_ids ?? []).map(String), [repoSetting]);
    const repoAllPlants = repoSetting?.all_plants ?? [];
    const otherPlants = repoAllPlants.filter((p) => String(p.id) !== String(myPlantFactoryId));
    const showsOtherPlants = repoExtraPlantIds.length > 0;
    const visiblePlantIdSet = useMemo(
        () => new Set([myPlantFactoryId, ...repoExtraPlantIds].filter((v) => v != null).map(String)),
        [myPlantFactoryId, repoExtraPlantIds]
    );
    const toggleExtraPlant = (plantId) => {
        const id = String(plantId);
        const next = repoExtraPlantIds.includes(id)
            ? repoExtraPlantIds.filter((x) => x !== id)
            : [...repoExtraPlantIds, id];
        updateRepoSetting.mutate(next, {
            onSuccess: () => toast.success('Repository plant list updated'),
            onError: () => toast.error('Failed to update repository plant list'),
        });
    };

    // OPL Details (opl_details table) data & mutations
    const { data: oplDetails = [], isLoading: isDetailsLoading } = useOplDetails();
    // emp_id -> name, for showing WHO an OPL is currently waiting on.
    const { data: _workerNames = [] } = useQuery({
        queryKey: ['worker-names'],
        queryFn: () => api.getWorkerNames(),
        staleTime: 5 * 60 * 1000,
    });
    const nameByEmpId = useMemo(
        () => Object.fromEntries((_workerNames || []).map((w) => [String(w.id), w.name])),
        [_workerNames]
    );
    const PENDING_OPL_STATUSES = new Set(['pending_jh_review', 'pending_approval', 'pending_be_review']);
    const reviewerNamesFor = (detail) =>
        (detail?.approver_emp_ids || []).map((id) => nameByEmpId[String(id)] || id).filter(Boolean).join(', ');
    const createDetailMutation = useCreateOplDetail();
    const submitOplMutation = useSubmitOPL();
    const jhAcceptMutation = useJhAcceptOPL();
    const jhRejectMutation = useJhRejectOPL();

    // Training pushed to this specific user — drives the "My Remaining" tab and completion.
    const empIdForAssignments = session?.emp_id || session?.employee_id || ctx?.worker_id || '';
    const { data: myTrainingAssignments = [], isLoading: isMyAssignmentsLoading } = useOplTrainingAssignments(
        empIdForAssignments ? { emp_id: empIdForAssignments } : {}
    );
    const completeAssignmentMutation = useCompleteOplTrainingAssignment();
    // All training assignments across every OPL — drives the real "Completed Trainees" list
    // (per-OPL filtered client-side) instead of the old fake local seed data.
    const { data: allTrainingAssignments = [] } = useOplTrainingAssignments();
    const myAssignedOplIds = useMemo(
        () => new Set(myTrainingAssignments.filter(a => a.status === 'assigned').map(a => String(a.opl_id))),
        [myTrainingAssignments]
    );
    const myAssignmentByOplId = useMemo(() => {
        const map = new Map();
        myTrainingAssignments.forEach(a => {
            if (a.status === 'assigned') map.set(String(a.opl_id), a);
        });
        return map;
    }, [myTrainingAssignments]);
    // Single source of truth for "is this OPL assigned to me" / "did I complete it" —
    // built from the same myTrainingAssignments fetch that drives "My Remaining", so the
    // two can never disagree due to two separate queries refreshing at different times.
    const myAnyAssignmentByOplId = useMemo(() => {
        const map = new Map();
        myTrainingAssignments.forEach(a => map.set(String(a.opl_id), a));
        return map;
    }, [myTrainingAssignments]);

    const [classification, setClassification] = useState('Basic Condition');
    const [detailTitle, setDetailTitle] = useState('');
    const [detailContent, setDetailContent] = useState('');
    const [beforeImage, setBeforeImage] = useState(null);
    const [afterImage, setAfterImage] = useState(null);
    const [beforeDescription, setBeforeDescription] = useState('');
    const [afterDescription, setAfterDescription] = useState('');
    const [isCompressingBefore, setIsCompressingBefore] = useState(false);
    const [isCompressingAfter, setIsCompressingAfter] = useState(false);
    const beforeFileRef = useRef(null);
    const afterFileRef = useRef(null);

    const [searchQuery, setSearchQuery] = useState('');
    const [lightboxImage, setLightboxImage] = useState(null); // full-size photo viewer
    const [detailsFilter, setDetailsFilter] = useState('pending_jh_review');
    const [approvedSubFilter, setApprovedSubFilter] = useState('all');
    const [reviewScope, setReviewScope] = useState('to_review');
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(3);
    const [auditModalOpen, setAuditModalOpen] = useState(false);
    const [selectedAuditOpl, setSelectedAuditOpl] = useState(null);
    const [editSubmitterModalOpen, setEditSubmitterModalOpen] = useState(false);
    const [editingDetail, setEditingDetail] = useState(null);

    // Standard Lessons States
    const [stdTab, setStdTab] = useState('all'); // 'all', 'my_jh_group', or 'my_remaining'
    const [selectedDmt, setSelectedDmt] = useState('all');
    const [selectedPlant, setSelectedPlant] = useState('all');
    const [selectedJhGroup, setSelectedJhGroup] = useState('all');
    const [selectedClassification, setSelectedClassification] = useState('all');
    const [selectedCriticalFilter, setSelectedCriticalFilter] = useState('all');
    const [stdSearchQuery, setStdSearchQuery] = useState('');
    const [stdCurrentPage, setStdCurrentPage] = useState(1);
    const [stdPageSize, setStdPageSize] = useState(5);
    const [selectedLessonSheet, setSelectedLessonSheet] = useState(null);

    // Standard-Lessons filters are per sub-tab — switching tabs clears whatever was applied
    // so "Clear Filters" / an active filter never bleeds from one tab into another.
    useEffect(() => {
        setSelectedDmt('all');
        setSelectedPlant('all');
        setSelectedJhGroup('all');
        setSelectedClassification('all');
        setSelectedCriticalFilter('all');
        setStdSearchQuery('');
        setStdCurrentPage(1);
    }, [stdTab]);

    // Fetch MDM OrgStructure to dynamically populate DMT and JH Groups hierarchy
    const { data: orgData } = useOrgStructure();
    const { data: departments = [] } = useDepartments();

    // Some people don't file an OPL under their own JH group — they pick one via a cascading
    // DMT -> JH Group dropdown, and that pick is mandatory (server-enforced). Applies to
    // anyone in no JH group, anyone in the Engineering department, and the BE-admin tier.
    // The picked group drives routing; it doesn't change whose submission it counts as.
    const myWorkerId = session?.emp_id || session?.employee_id || ctx?.worker_id || '';
    const myFilingRole = (ctx?.role || session?.role || session?.worker?.tpm_role || 'operator').toLowerCase();
    const engineeringDeptId = departments.find((d) => d.name === 'Engineering')?.id;
    const myDepartmentId = (orgData?.workers || []).find((w) => String(w.id) === String(myWorkerId))?.department_id;
    const isEngineeringSubmitter = Boolean(engineeringDeptId) && myDepartmentId === engineeringDeptId;
    const oplJhList = orgData?.jhGroupsList || [];
    // Leading a JH group counts as belonging to one — a JH leader files under their own group,
    // not via the "pick a filing group" flow (mirrors backend resolveSubmitterJhGroup).
    const leadsAnyJhGroup = (orgData?.jhGroups || []).some((g) => String(g.leader_emp_id) === String(myWorkerId));
    const hasNoJhGroup = oplJhList.length > 0 && !oplJhList.some((m) => String(m.emp_id) === String(myWorkerId)) && !leadsAnyJhGroup;
    const isBeAdminRole = myFilingRole.includes('be_lead') || myFilingRole === 'it_lead' || myFilingRole === 'leadership' || myFilingRole === 'admin';
    const canFileForOtherGroup = isEngineeringSubmitter || hasNoJhGroup || isBeAdminRole;
    const [filingDmtId, setFilingDmtId] = useState('');
    const [filingJhGroupId, setFilingJhGroupId] = useState('');
    const filingJhGroupOptions = (orgData?.dmts || []).find((g) => g.id === filingDmtId)?.jhGroups || [];

    // Mapping of DMT Levels to their corresponding JH Groups — built entirely from real
    // org data, no placeholder/seed entries.
    const dmtJhMap = useMemo(() => {
        const map = {};

        if (orgData?.groups && orgData?.jhGroups) {
            orgData.groups.forEach(g => {
                const dmtName = g.module || g.code || g.name || `DMT ${g.id}`;
                if (!map[dmtName]) map[dmtName] = [];
                const children = (orgData.jhGroups || []).filter(jh => jh.module_group_id === g.id || jh.dmt_id === g.id);
                children.forEach(jh => {
                    if (jh.name && !map[dmtName].includes(jh.name)) {
                        map[dmtName].push(jh.name);
                    }
                });
            });
        }

        return map;
    }, [orgData]);

    // Available DMT Level filter options
    const dmtOptions = useMemo(() => {
        const keys = Object.keys(dmtJhMap);
        return [
            { value: 'all', label: 'All' },
            ...keys.map(k => ({ value: k, label: k }))
        ];
    }, [dmtJhMap]);

    // Cascading JH Group filter options based on selected DMT
    const availableJhGroups = useMemo(() => {
        if (selectedDmt === 'all') {
            const allGroups = new Set();
            Object.values(dmtJhMap).forEach(arr => arr.forEach(g => allGroups.add(g)));
            return [
                { value: 'all', label: 'All' },
                ...Array.from(allGroups).map(g => ({ value: g, label: g }))
            ];
        }

        const groupList = dmtJhMap[selectedDmt] || [];
        return [
            { value: 'all', label: 'All' },
            ...groupList.map(g => ({ value: g, label: g }))
        ];
    }, [selectedDmt, dmtJhMap]);

    // Handler when user changes DMT Level filter
    const handleDmtChange = (newDmt) => {
        setSelectedDmt(newDmt);
        setStdCurrentPage(1);

        // Reset JH Group if currently selected group does not belong to new DMT
        if (newDmt !== 'all' && selectedJhGroup !== 'all') {
            const validGroups = dmtJhMap[newDmt] || [];
            if (!validGroups.some(g => g.toLowerCase() === selectedJhGroup.toLowerCase())) {
                setSelectedJhGroup('all');
            }
        }
    };

    // Push Training Modal State
    const [pushModalOpen, setPushModalOpen] = useState(false);
    const [pushTargetOpl, setPushTargetOpl] = useState(null);

    // Recurring training — a schedule is created per-OPL from the card; the panel at the top
    // of Standard Lessons is a shared manage/status view of every schedule.
    const [scheduleModalOpl, setScheduleModalOpl] = useState(null);

    // Track clicked/viewed lessons & completed training status
    const [clickedLessonIds, setClickedLessonIds] = useState(() => {
        try {
            const stored = localStorage.getItem('tpm_clicked_lessons');
            return stored ? new Set(JSON.parse(stored)) : new Set();
        } catch {
            return new Set();
        }
    });

    const [viewingCompletionsOpl, setViewingCompletionsOpl] = useState(null);
    const [completionsPage, setCompletionsPage] = useState(1);
    const COMPLETIONS_PAGE_SIZE = 3;

    const handleLessonOpened = (id) => {
        if (!id) return;
        const key = String(id);
        setClickedLessonIds(prev => {
            if (prev.has(key)) return prev;
            const next = new Set(prev).add(key);
            localStorage.setItem('tpm_clicked_lessons', JSON.stringify(Array.from(next)));
            return next;
        });
    };

    const handleMarkTrainingCompleted = (lessonOrId) => {
        const lessonId = typeof lessonOrId === 'object' ? lessonOrId?.opl_id : lessonOrId;
        if (!lessonId) return;
        const key = String(lessonId);

        const assignment = myAssignmentByOplId.get(key);
        if (assignment) {
            completeAssignmentMutation.mutate(assignment.id, {
                onError: () => toast.error('Failed to record training completion on the server')
            });
        }

        toast.success('Training marked as completed successfully! 🎉');
    };

    // Accept / Approve Modal state
    // Inline Review & Approve state — the JH reviewer can edit the submitter's content before
    // approving; edited fields are snapshotted server-side into review_changes for the submitter.
    const [inlineAcceptOplId, setInlineAcceptOplId] = useState(null);
    const [acceptEdit, setAcceptEdit] = useState({
        title: '', content: '', before_description: '', after_description: '',
        before_image: null, after_image: null, classification: 'Basic Condition', is_star: false
    });
    const [isAcceptCompressingBefore, setIsAcceptCompressingBefore] = useState(false);
    const [isAcceptCompressingAfter, setIsAcceptCompressingAfter] = useState(false);

    // Inline Rejection state (no separate modal)
    const [inlineRejectOplId, setInlineRejectOplId] = useState(null);
    const [inlineRejectReason, setInlineRejectReason] = useState('');

    // Inline "edit my draft" state — the submitter fixing their own OPL before it goes for review.
    const updateDetailMutation = useUpdateOplDetail();
    const [editDraftId, setEditDraftId] = useState(null);
    const [editDraft, setEditDraft] = useState({
        title: '', content: '', before_description: '', after_description: '',
        before_image: null, after_image: null, classification: 'Basic Condition',
    });
    const [isEditCompressingBefore, setIsEditCompressingBefore] = useState(false);
    const [isEditCompressingAfter, setIsEditCompressingAfter] = useState(false);
    const openEditDraft = (d) => {
        setEditDraftId(d.opl_id);
        setEditDraft({
            title: d.title || '', content: d.content || '',
            before_description: d.before_description || d.before_remarks || '',
            after_description: d.after_description || d.after_remarks || '',
            before_image: d.before_image || null, after_image: d.after_image || null,
            classification: d.classification || 'Basic Condition',
        });
    };
    const closeEditDraft = () => { setEditDraftId(null); };
    const handleEditDraftImage = async (which, e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const setBusy = which === 'before' ? setIsEditCompressingBefore : setIsEditCompressingAfter;
        try {
            setBusy(true);
            const url = await compressImageAndUpload(file);
            setEditDraft((p) => ({ ...p, [which === 'before' ? 'before_image' : 'after_image']: url }));
        } catch {
            toast.error('Failed to attach image');
        } finally {
            setBusy(false);
        }
    };
    const handleSaveDraftEdit = async (d) => {
        if (!editDraft.title.trim()) return toast.error('Title cannot be empty');
        if (!editDraft.content.trim()) return toast.error('Content cannot be empty');
        try {
            await updateDetailMutation.mutateAsync({
                id: d.opl_id,
                title: editDraft.title.trim(),
                content: editDraft.content.trim(),
                before_description: editDraft.before_description.trim() || null,
                after_description: editDraft.after_description.trim() || null,
                before_image: editDraft.before_image,
                after_image: editDraft.after_image,
                classification: editDraft.classification,
                status: 'draft',
                comments: 'Draft edited by submitter',
            });
            toast.success('Draft updated');
            closeEditDraft();
        } catch (err) {
            toast.error(err?.message || 'Failed to update draft');
        }
    };

    const currentActorName = getName(session) || 'Plant Admin';

    const handleBeforeSelect = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            setIsCompressingBefore(true);
            const url = await compressImageAndUpload(file);
            setBeforeImage(url);
            toast.success('Before image compressed & ready');
        } catch {
            toast.error('Failed to compress before image');
        } finally {
            setIsCompressingBefore(false);
        }
    };

    const handleAfterSelect = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            setIsCompressingAfter(true);
            const url = await compressImageAndUpload(file);
            setAfterImage(url);
            toast.success('After image compressed & ready');
        } catch {
            toast.error('Failed to compress after image');
        } finally {
            setIsCompressingAfter(false);
        }
    };

    const handleCreateDetail = async (e, isDraft = false) => {
        if (e && e.preventDefault) e.preventDefault();
        if (!detailTitle.trim()) {
            toast.error('Please enter a title for the OPL Detail');
            return;
        }
        if (!detailContent.trim()) {
            toast.error('Please enter descriptive content for the OPL Detail');
            return;
        }
        if (!isDraft) {
            if (!afterImage) {
                toast.error('After Image is mandatory');
                return;
            }
            if (!afterDescription.trim()) {
                toast.error('After Description is mandatory');
                return;
            }
            if (canFileForOtherGroup && !filingJhGroupId) {
                toast.error('Select a DMT and JH group to file this OPL under');
                return;
            }
        }
        try {
            const empId = session?.emp_id || session?.employee_id || ctx?.worker_id || '';
            const autoSubmittedBy = empId ? `${currentActorName} (ID: ${empId})` : currentActorName;

            await createDetailMutation.mutateAsync({
                title: detailTitle.trim(),
                content: detailContent.trim(),
                before_image: beforeImage || null,
                after_image: afterImage || null,
                before_description: beforeDescription.trim() || null,
                before_remarks: beforeDescription.trim() || null,
                after_description: afterDescription.trim() || null,
                after_remarks: afterDescription.trim() || null,
                classification: classification,
                submitted_by: autoSubmittedBy,
                status: isDraft ? 'draft' : 'pending_jh_review',
                jh_group_id: canFileForOtherGroup && filingJhGroupId ? filingJhGroupId : undefined,
            });
            if (isDraft) {
                toast.success('OPL saved as draft!');
            } else {
                toast.success('OPL submitted for JH Group Lead review!');
            }
            setDetailTitle('');
            setDetailContent('');
            setBeforeImage(null);
            setAfterImage(null);
            setBeforeDescription('');
            setAfterDescription('');
            setClassification('Basic Condition');
            setFilingDmtId('');
            setFilingJhGroupId('');
            setMainTab('submissions');
        }
        catch {
            toast.error('Failed to save OPL Detail');
        }
    };

    const handleSubmitForReview = async (detail) => {
        try {
            await submitOplMutation.mutateAsync({
                id: detail.opl_id,
                performed_by: currentActorName
            });
            toast.success('OPL submitted for JH Group Lead review!');
        } catch {
            toast.error('Failed to submit OPL for review');
        }
    };

    const handleToggleInlineAccept = (detail) => {
        if (inlineAcceptOplId === detail.opl_id) {
            setInlineAcceptOplId(null);
            return;
        }
        setInlineRejectOplId(null);
        setAcceptEdit({
            title: detail.title || '',
            content: detail.content || '',
            before_description: detail.before_description || detail.before_remarks || '',
            after_description: detail.after_description || detail.after_remarks || '',
            before_image: detail.before_image || null,
            after_image: detail.after_image || null,
            classification: detail.classification || 'Basic Condition',
            is_star: Boolean(detail.is_star),
        });
        setInlineAcceptOplId(detail.opl_id);
    };

    const handleAcceptImageSelect = async (which, e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const setBusy = which === 'before' ? setIsAcceptCompressingBefore : setIsAcceptCompressingAfter;
        try {
            setBusy(true);
            const url = await compressImageAndUpload(file);
            setAcceptEdit((prev) => ({ ...prev, [which === 'before' ? 'before_image' : 'after_image']: url }));
        } catch {
            toast.error('Failed to compress image');
        } finally {
            setBusy(false);
            e.target.value = '';
        }
    };

    const handleConfirmInlineAccept = async (detail) => {
        if (!acceptEdit.title.trim()) {
            toast.error('Title cannot be empty');
            return;
        }
        if (!acceptEdit.content.trim()) {
            toast.error('Description cannot be empty');
            return;
        }
        try {
            await jhAcceptMutation.mutateAsync({
                id: detail.opl_id,
                classification: acceptEdit.classification,
                is_star: acceptEdit.is_star,
                edits: {
                    title: acceptEdit.title.trim(),
                    content: acceptEdit.content.trim(),
                    before_description: acceptEdit.before_description.trim() || null,
                    after_description: acceptEdit.after_description.trim() || null,
                    before_image: acceptEdit.before_image,
                    after_image: acceptEdit.after_image,
                },
                comments: `Approved by JH Group Lead ${currentActorName}${acceptEdit.is_star ? ' (Marked Critical ★)' : ''}`,
                performed_by: currentActorName
            });
            toast.success(acceptEdit.is_star ? 'OPL accepted and marked as Critical ★!' : 'OPL accepted and approved!');
            setInlineAcceptOplId(null);
        } catch {
            toast.error('Failed to accept OPL');
        }
    };

    const handleToggleInlineReject = (detail) => {
        if (inlineRejectOplId === detail.opl_id) {
            setInlineRejectOplId(null);
            setInlineRejectReason('');
        } else {
            setInlineRejectOplId(detail.opl_id);
            setInlineRejectReason('');
        }
    };

    const handleExportCompletions = (opl, records) => {
        if (!records.length) {
            toast.error('No completions to export yet');
            return;
        }
        const rows = records.map((r) => ({
            'Trainee Name': r.assigned_name || r.assigned_emp_id,
            'Employee ID': r.assigned_emp_id,
            'Department': r.department_name || '',
            'DMT': r.dmt_name || '',
            'JH Group': r.jh_group_name || 'Unassigned',
            'Plant': r.plant_code || r.plant_name || '',
            'Completed On': r.completed_at ? new Date(r.completed_at).toLocaleString() : '',
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Training Completions');
        const safeTitle = String(opl.title || `OPL-${opl.opl_id}`).replace(/[^a-z0-9]+/gi, '_').slice(0, 40);
        XLSX.writeFile(wb, `OPL_${opl.opl_id}_${safeTitle}_training_completions.xlsx`);
    };

    // Full per-OPL training status — everyone it was assigned to, done AND still pending.
    const handleExportTrainingStatus = (opl) => {
        const all = allTrainingAssignments.filter((a) => String(a.opl_id) === String(opl.opl_id));
        if (all.length === 0) {
            toast.error('No training assigned for this OPL yet');
            return;
        }
        const rows = all.map((r) => ({
            'Trainee Name': r.assigned_name || r.assigned_emp_id,
            'Employee ID': r.assigned_emp_id,
            'Department': r.department_name || '',
            'DMT': r.dmt_name || '',
            'JH Group': r.jh_group_name || 'Unassigned',
            'Plant': r.plant_code || r.plant_name || '',
            'Status': r.status === 'completed' ? 'Completed' : 'Pending',
            'Assigned On': r.assigned_at ? new Date(r.assigned_at).toLocaleDateString() : '',
            'Completed On': r.completed_at ? new Date(r.completed_at).toLocaleString() : '',
        }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Training Status');
        const safeTitle = String(opl.title || `OPL-${opl.opl_id}`).replace(/[^a-z0-9]+/gi, '_').slice(0, 40);
        XLSX.writeFile(wb, `OPL_${opl.opl_id}_${safeTitle}_training_status.xlsx`);
    };

    const handleConfirmInlineReject = async (detail) => {
        if (!inlineRejectReason.trim()) {
            toast.error('Rejection comments are mandatory');
            return;
        }

        try {
            const formattedReason = `${currentActorName}: ${inlineRejectReason.trim()}`;
            await jhRejectMutation.mutateAsync({
                id: detail.opl_id,
                reason: formattedReason,
                performed_by: currentActorName
            });
            toast.success('OPL rejected and moved to Rejected OPLs.');
            setInlineRejectOplId(null);
            setInlineRejectReason('');
        } catch {
            toast.error('Failed to reject OPL');
        }
    };

    // Classification is set on the create form and can only be changed afterward by a reviewer
    // inside the Review & Accept panel — there is no standalone classification control anymore.

    // Context for Standard Lessons & Roles
    const resolvedUserJhGroupName = (orgData?.jhGroups || []).find(g => g.id === ctx?.jh_group_id)?.name;
    const userJhGroup = resolvedUserJhGroupName || ctx?.jh_group_name || ctx?.jh_group || session?.worker?.jh_group_name || 'Unassigned';
    const userPlant = ctx?.factory_name || ctx?.factory_code || session?.worker?.default_plant || '';
    const userRole = (ctx?.role || session?.role || session?.worker?.tpm_role || 'operator').toLowerCase();

    const isBeLeadRole = userRole.includes('be_lead') || userRole === 'be_lead' || userRole === 'admin' || userRole === 'it_lead' || userRole === 'leadership';

    const isPlantBeLeadForOpl = (item) => {
        if (!isBeLeadRole) return false;
        const uPlant = (userPlant || '').toLowerCase();
        const itemPlant = (item?.plant_name || item?.plant || '').toLowerCase();
        if (!uPlant || !itemPlant) return true;
        return uPlant === itemPlant || uPlant === 'all' || userRole === 'admin' || userRole === 'it_lead' || userRole === 'leadership';
    };

    const currentEmpId = session?.emp_id || session?.employee_id || ctx?.worker_id || '';

    // Mirrors the backend authorization in PUT /api/opl-details/:id — JH-stage review is
    // strictly limited to the OPL's configured/derived approver(s), no role-based bypass.
    // BE leads additionally get read-only VISIBILITY (not review authority — the action
    // buttons below are separately status-gated, so this never grants them an action) into
    // every rejected OPL factory-wide, with its rejection comment, regardless of which stage
    // rejected it — an oversight view the backend's own authorization doesn't otherwise give them.
    const canReviewOpl = (item) => {
        if (isBeLeadRole && item?.status === 'rejected') return true;
        if (!currentEmpId) return false;
        return (item?.approver_emp_ids || []).includes(currentEmpId);
    };

    const isMySubmission = (item) => Boolean(currentEmpId) && item?.submitter_emp_id === currentEmpId;

    // The reviewer's edit diff ("Changed by the reviewer") is only for the OPL's own chain —
    // submitter, its routing incharges / stage approvers, its JH-group leader, and the owning
    // module lead. NOT everyone browsing the OPL Repository.
    const canSeeOplReviewChanges = (item) => {
        if (!item) return false;
        if (isBeLeadRole) return true;                 // BE-lead tier: factory-wide oversight
        if (isMySubmission(item)) return true;
        if (canReviewOpl(item)) return true;
        if (!currentEmpId) return false;
        const jh = (orgData?.jhGroups || []).find((g) => String(g.id) === String(item.jh_group_id));
        if (jh && String(jh.leader_emp_id) === String(currentEmpId)) return true;
        const grp = (orgData?.groups || []).find((g) => String(g.id) === String(jh?.module_group_id));
        if (grp && String(grp.module_lead_emp_id) === String(currentEmpId)) return true;
        return false;
    };

    // "Who completed the training" is reviewer-only visibility: the configured approver(s) for
    // this OPL, or BE-lead-tier for their factory-wide oversight. When routing changes and a
    // person is no longer an approver, approver_emp_ids (resolved live server-side) stops
    // including them, so this list hides itself automatically.
    const canSeeCompletions = (item) =>
        isBeLeadRole || (Boolean(currentEmpId) && (item?.approver_emp_ids || []).includes(currentEmpId));

    // Whether this worker is the configured reviewer for at least one OPL right now — with
    // per-stage routing, a be_admin can name ANYONE as a reviewer, regardless of role (an
    // "operator" can be a named reviewer for a stage). Role alone is no longer a reliable
    // signal, so this checks actual assignment via the same approver_emp_ids the backend uses.
    const hasAnyReviewAssignment = oplDetails.some((d) => canReviewOpl(d));

    // Traditional jh_lead+/be_lead+ roles always get the tab (their default routing fallback
    // makes them reviewers even before any OPL exists to prove it); anyone else only gets it
    // once they're actually assigned as a reviewer somewhere.
    const isReviewerRole = isBeLeadRole || userRole.includes('jh_lead') || userRole.includes('lead') || hasAnyReviewAssignment;
    const effectiveReviewScope = isReviewerRole ? reviewScope : 'my_submissions';

    // Recurring training schedules — fetched once here, shared by the top panel and the
    // per-card "Scheduled" indicator. The endpoint 403s for non-incharges, so gate the fetch.
    const { data: trainingSchedules = [], isError: trainingSchedulesError } = useOplTrainingSchedules(isReviewerRole);

    // "My Team" analytics — a probe (no filters) just to decide if the tab shows; the tab
    // component does its own filtered fetch. 403 (not a leader/reviewer) → tab hidden.
    const myTeamProbe = useOplJhGroupAnalytics({}, true);
    const canSeeMyTeam = !myTeamProbe.isError && (myTeamProbe.data?.authorized_groups?.length > 0);
    const activeScheduleByOplId = useMemo(() => {
        const map = new Map();
        (trainingSchedules || []).forEach((s) => {
            if (s.is_active) map.set(String(s.opl_id), s);
        });
        return map;
    }, [trainingSchedules]);

    // Count of items actually pending this user's own review action (drives the tab badge).
    const pendingMyReviewCount = oplDetails.filter(d => {
        const isPending = d.status === 'pending_jh_review' || d.status === 'pending_approval' || d.status === 'pending_be_review';
        if (!isPending) return false;
        return canReviewOpl(d);
    }).length;

    const filteredDetails = oplDetails.filter(d => {
        const q = searchQuery.trim().toLowerCase();
        if (q) {
            const matchesSearch =
                (d.title || '').toLowerCase().includes(q) ||
                (d.content || '').toLowerCase().includes(q) ||
                (d.submitted_by || '').toLowerCase().includes(q) ||
                (d.classification || '').toLowerCase().includes(q) ||
                (d.area || '').toLowerCase().includes(q) ||
                (d.line || '').toLowerCase().includes(q) ||
                (d.machine || '').toLowerCase().includes(q) ||
                (d.theme_title || '').toLowerCase().includes(q) ||
                String(d.opl_id || '').toLowerCase().includes(q);
            if (!matchesSearch) return false;
        }

        if (effectiveReviewScope === 'my_submissions') {
            if (!isMySubmission(d)) return false;
        } else if (!canReviewOpl(d)) {
            // "To Review": strictly the configured approver(s) for this OPL, no role bypass.
            return false;
        }

        if (detailsFilter === 'pending_jh_review') {
            return d.status === 'pending_jh_review' || d.status === 'pending_approval' || d.status === 'pending_be_review';
        }
        if (detailsFilter === 'approved') {
            if (d.status !== 'approved') return false;
            if (approvedSubFilter === 'critical') return Boolean(d.is_star);
            return true;
        }
        return d.status === detailsFilter;
    });

    const totalItems = filteredDetails.length;
    const totalPages = Math.ceil(totalItems / pageSize) || 1;
    const validPage = Math.min(Math.max(currentPage, 1), totalPages);
    const paginatedDetails = filteredDetails.slice((validPage - 1) * pageSize, validPage * pageSize);

    // Count of lessons actually pushed to this user and not yet completed.
    // myAssignedOplIds already excludes completed assignments (server-side, per-user).
    const totalRemainingLessonsCount = myAssignedOplIds.size;

    const canPushTraining = userRole.includes('jh_lead') || userRole.includes('lead') || userRole === 'admin' || isBeLeadRole || userRole === 'it_lead' || userRole === 'leadership';

    const approvedStandardLessons = oplDetails.filter(d => {
        const isApproved = d.status === 'approved' || d.status === 'published';
        if (!isApproved) return false;

        const itemPlant = d.plant_name || d.plant_code || '';
        const itemGroup = d.jh_group_name || 'Unassigned';
        const itemDmt = d.dmt_level || d.dmt_name || d.dmt_code || d.dmt || null;

        // The "All" tab is limited to the plants this plant is allowed to see — its own,
        // plus any others its BE lead has opted into.
        if (stdTab === 'all' && myPlantFactoryId != null) {
            if (!visiblePlantIdSet.has(String(d.factory_id))) return false;
        }

        if (stdTab === 'my_remaining') {
            // Only lessons actually pushed to this user and not yet completed (server-side,
            // per-user) — not every approved lesson in the plant, and not gated by the old
            // browser-local completion flag, which isn't scoped to a specific user.
            if (!myAssignedOplIds.has(String(d.opl_id))) return false;
            if (selectedDmt !== 'all') {
                if (itemDmt) {
                    if (itemDmt.toLowerCase() !== selectedDmt.toLowerCase()) return false;
                } else {
                    const validGroups = dmtJhMap[selectedDmt] || [];
                    if (!validGroups.some(g => g.toLowerCase() === itemGroup.toLowerCase())) return false;
                }
            }
            if (showsOtherPlants && selectedPlant !== 'all' && String(d.factory_id) !== selectedPlant) return false;
            if (selectedJhGroup !== 'all' && itemGroup.toLowerCase() !== selectedJhGroup.toLowerCase()) return false;
        } else if (stdTab === 'my_jh_group') {
            if (itemGroup.toLowerCase() !== userJhGroup.toLowerCase()) return false;
        } else {
            // 'all' tab filters
            if (selectedDmt !== 'all') {
                if (itemDmt) {
                    if (itemDmt.toLowerCase() !== selectedDmt.toLowerCase()) return false;
                } else {
                    const validGroups = dmtJhMap[selectedDmt] || [];
                    if (!validGroups.some(g => g.toLowerCase() === itemGroup.toLowerCase())) return false;
                }
            }
            if (showsOtherPlants && selectedPlant !== 'all' && String(d.factory_id) !== selectedPlant) return false;
            if (selectedJhGroup !== 'all' && itemGroup.toLowerCase() !== selectedJhGroup.toLowerCase()) return false;
        }

        if (selectedClassification !== 'all') {
            const itemClass = (d.classification || 'Basic Condition').toLowerCase();
            const selClass = selectedClassification.toLowerCase();
            if (selClass === 'troubleshoot') {
                if (!itemClass.includes('troubleshoot')) return false;
            } else if (selClass === 'basic condition') {
                if (!itemClass.includes('basic') && !itemClass.includes('condition')) return false;
            } else {
                if (itemClass !== selClass) return false;
            }
        }

        if (selectedCriticalFilter === 'critical') {
            if (!d.is_star) return false;
        } else if (selectedCriticalFilter === 'standard') {
            if (d.is_star) return false;
        }

        const q = stdSearchQuery.trim().toLowerCase();
        if (q) {
            const matches =
                (d.title || '').toLowerCase().includes(q) ||
                (d.content || '').toLowerCase().includes(q) ||
                (d.submitted_by || '').toLowerCase().includes(q) ||
                (d.classification || '').toLowerCase().includes(q) ||
                itemPlant.toLowerCase().includes(q) ||
                itemGroup.toLowerCase().includes(q) ||
                (itemDmt || '').toLowerCase().includes(q) ||
                String(d.opl_id || '').toLowerCase().includes(q);
            if (!matches) return false;
        }

        return true;
    });

    const stdTotalPages = Math.ceil(approvedStandardLessons.length / stdPageSize) || 1;
    const stdValidPage = Math.min(Math.max(stdCurrentPage, 1), stdTotalPages);
    const stdStartIndex = (stdValidPage - 1) * stdPageSize;
    const paginatedStandardLessons = approvedStandardLessons.slice(stdStartIndex, stdStartIndex + stdPageSize);

    return (<div className="min-h-full bg-surface-base pb-10 overflow-x-hidden">
      <header className="sticky top-0 z-30 border-b border-line bg-surface-raised">
        <CaptureColumn className="space-y-3 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold text-ink-strong">{t('opl.listTitle')}</h1>
              <p className="text-xs text-ink-muted">Manage One Point Lessons, Review Workflow & Audit Trails</p>
            </div>
          </div>

          {/* Main Module Tabs */}
          <div className={`grid ${({ 3: 'grid-cols-3', 4: 'grid-cols-4', 5: 'grid-cols-5' }[3 + (canSeeMyTeam ? 1 : 0) + (isBeLeadRole ? 1 : 0)] || 'grid-cols-3')} rounded-lg bg-surface-sunken p-1 gap-1`}>
            <button type="button" onClick={() => setMainTab('details')} className={`rounded-md px-1.5 sm:px-3 py-2 text-xs sm:text-sm font-medium transition-colors ${mainTab === 'details' ? 'bg-surface-raised text-ink-strong shadow-xs font-semibold' : 'text-ink-muted hover:text-ink-strong'}`}>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 text-center sm:text-left">
                <FileText size={16} className="shrink-0"/>
                <span className="leading-tight break-words">Submit OPL</span>
              </div>
            </button>

            <button type="button" onClick={() => setMainTab('submissions')} className={`rounded-md px-1.5 sm:px-3 py-2 text-xs sm:text-sm font-medium transition-colors ${mainTab === 'submissions' ? 'bg-surface-raised text-ink-strong shadow-xs font-semibold' : 'text-ink-muted hover:text-ink-strong'}`}>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 text-center sm:text-left">
                <Send size={16} className="shrink-0"/>
                <span className="leading-tight break-words">OPL Reviews</span>
                {pendingMyReviewCount > 0 && (
                  <span className="rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 text-2xs sm:text-xs font-bold shrink-0">
                    {pendingMyReviewCount}
                  </span>
                )}
              </div>
            </button>

            <button type="button" onClick={() => setMainTab('standard')} className={`rounded-md px-1.5 sm:px-3 py-2 text-xs sm:text-sm font-medium transition-colors ${mainTab === 'standard' ? 'bg-surface-raised text-ink-strong shadow-xs font-semibold' : 'text-ink-muted hover:text-ink-strong'}`}>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 text-center sm:text-left">
                <List size={16} className="shrink-0"/>
                <span className="leading-tight break-words">OPL Repository</span>
              </div>
            </button>

            {canSeeMyTeam && (
              <button type="button" onClick={() => setMainTab('myteam')} className={`rounded-md px-1.5 sm:px-3 py-2 text-xs sm:text-sm font-medium transition-colors ${mainTab === 'myteam' ? 'bg-surface-raised text-ink-strong shadow-xs font-semibold' : 'text-ink-muted hover:text-ink-strong'}`}>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 text-center sm:text-left">
                  <Users size={16} className="shrink-0"/>
                  <span className="leading-tight break-words">My Team</span>
                </div>
              </button>
            )}

            {isBeLeadRole && (
              <button type="button" onClick={() => setMainTab('analytics')} className={`rounded-md px-1.5 sm:px-3 py-2 text-xs sm:text-sm font-medium transition-colors ${mainTab === 'analytics' ? 'bg-surface-raised text-ink-strong shadow-xs font-semibold' : 'text-ink-muted hover:text-ink-strong'}`}>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 text-center sm:text-left">
                  <Layers size={16} className="shrink-0"/>
                  <span className="leading-tight break-words">Analytics</span>
                </div>
              </button>
            )}
          </div>


        </CaptureColumn>
      </header>

      <CaptureColumn>
        {mainTab === 'details' ? (<div className="space-y-6 py-4">
            {/* OPL Details Form */}
            <form onSubmit={handleCreateDetail} className="rounded-xl border border-line bg-surface-raised p-5 shadow-xs space-y-4">
              <div className="flex items-center gap-2 border-b border-line pb-3">
                <FileText className="text-blue-700" size={20}/>
                <div>
                  <h2 className="text-lg font-semibold text-ink-strong">Create New OPL</h2>
                </div>
              </div>

              <div className="space-y-4">
                {/* Classification Field */}
                <div>
                  <label className="block text-sm font-medium text-ink-strong mb-1.5">
                    Classification <span className="text-danger-fg">*</span>
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {CLASSIFICATIONS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setClassification(c)}
                        className={`min-h-touch rounded-lg border px-3 py-2 text-xs font-semibold text-center transition-all ${
                          classification === c
                            ? 'border-blue-600 bg-blue-600 text-white shadow-xs'
                            : 'border-line bg-surface-base text-ink-muted hover:bg-surface-raised hover:text-ink-strong'
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                {/* File this OPL under a specific team — required for people who submit outside
                    their own JH group (no group / Engineering / BE admin). Drives review routing;
                    doesn't change whose submission it counts as. */}
                {canFileForOtherGroup && (
                  <div className="rounded-lg border border-blue-200 bg-blue-500/5 p-3 space-y-2">
                    <p className="text-xs font-semibold text-blue-800">Which team is this OPL for? <span className="text-danger-fg">*</span></p>
                    <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-ink-strong mb-1">DMT</label>
                      <select
                        value={filingDmtId}
                        onChange={(e) => { setFilingDmtId(e.target.value); setFilingJhGroupId(''); }}
                        className="w-full h-10 rounded-lg border border-line bg-surface-base px-3 text-sm text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-700"
                      >
                        <option value="">Select DMT…</option>
                        {(orgData?.dmts || []).map((g) => (
                          <option key={g.id} value={g.id}>{g.module || g.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-ink-strong mb-1">JH Group</label>
                      <select
                        value={filingJhGroupId}
                        onChange={(e) => setFilingJhGroupId(e.target.value)}
                        disabled={!filingDmtId}
                        className="w-full h-10 rounded-lg border border-line bg-surface-base px-3 text-sm text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-700 disabled:opacity-50"
                      >
                        <option value="">Select JH group…</option>
                        {filingJhGroupOptions.map((jh) => (
                          <option key={jh.id} value={jh.id}>{jh.name}</option>
                        ))}
                      </select>
                    </div>
                    </div>
                  </div>
                )}

                <div>
                  <label htmlFor="opl-title-input" className="block text-sm font-medium text-ink-strong mb-1">
                    Title <span className="text-danger-fg">*</span>
                  </label>
                  <input id="opl-title-input" type="text" required autoComplete="off" placeholder="Enter OPL Title" value={detailTitle} onChange={(e) => setDetailTitle(e.target.value)} className="w-full rounded-lg border border-line bg-surface-base px-3 py-2 text-sm text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-700"/>
                </div>

                <div>
                  <label htmlFor="opl-content-input" className="block text-sm font-medium text-ink-strong mb-1">
                    Description <span className="text-danger-fg">*</span>
                  </label>
                  <textarea id="opl-content-input" required rows={4} autoComplete="off" placeholder="Provide key descriptive steps and instructions." value={detailContent} onChange={(e) => setDetailContent(e.target.value)} className="w-full rounded-lg border border-line bg-surface-base px-3 py-2 text-sm text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-700"/>
                </div>

                {/* Before and After Image Uploads */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Before Image */}
                  <div>
                    <label className="block text-sm font-medium text-ink-strong mb-1">
                      Before Image
                    </label>
                    <input ref={beforeFileRef} type="file" accept="image/*" className="hidden" onChange={handleBeforeSelect} />
                    {beforeImage ? (
                      <div className="relative rounded-lg border border-line overflow-hidden bg-surface-sunken p-1">
                        <img src={beforeImage} alt="Before" className="h-32 w-full object-contain rounded-md" />
                        <button type="button" onClick={() => setBeforeImage(null)} className="absolute top-2 right-2 rounded-full bg-black/60 p-1 text-white hover:bg-black/80 transition-colors">
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => beforeFileRef.current?.click()} disabled={isCompressingBefore} className="flex h-32 w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-line bg-surface-base hover:border-blue-300 hover:bg-surface-raised transition-colors text-ink-muted">
                        {isCompressingBefore ? <Loader2 size={20} className="animate-spin text-blue-700" /> : <ImagePlus size={20} className="text-blue-700" />}
                        <span className="text-xs font-medium">{isCompressingBefore ? 'Compressing Image...' : 'Upload Before Image'}</span>
                      </button>
                    )}
                    <div className="mt-2">
                      <label htmlFor="before-desc-input" className="block text-xs font-medium text-ink-muted mb-1">
                        Before Description
                      </label>
                      <input
                        id="before-desc-input"
                        type="text"
                        autoComplete="off"
                        placeholder="Describe before condition..."
                        value={beforeDescription}
                        onChange={(e) => setBeforeDescription(e.target.value)}
                        className="w-full rounded-lg border border-line bg-surface-base px-2.5 py-1.5 text-xs text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-700"
                      />
                    </div>
                  </div>

                  {/* After Image (Mandatory) */}
                  <div>
                    <label className="block text-sm font-medium text-ink-strong mb-1">
                      After Image <span className="text-danger-fg">*</span>
                    </label>
                    <input ref={afterFileRef} type="file" accept="image/*" className="hidden" onChange={handleAfterSelect} />
                    {afterImage ? (
                      <div className="relative rounded-lg border border-line overflow-hidden bg-surface-sunken p-1">
                        <img src={afterImage} alt="After" className="h-32 w-full object-contain rounded-md" />
                        <button type="button" onClick={() => setAfterImage(null)} className="absolute top-2 right-2 rounded-full bg-black/60 p-1 text-white hover:bg-black/80 transition-colors">
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => afterFileRef.current?.click()} disabled={isCompressingAfter} className="flex h-32 w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-line bg-surface-base hover:border-blue-300 hover:bg-surface-raised transition-colors text-ink-muted">
                        {isCompressingAfter ? <Loader2 size={20} className="animate-spin text-blue-700" /> : <ImagePlus size={20} className="text-blue-700" />}
                        <span className="text-xs font-medium">{isCompressingAfter ? 'Compressing Image...' : 'Upload After Image'}</span>
                      </button>
                    )}
                    <div className="mt-2">
                      <label htmlFor="after-desc-input" className="block text-xs font-medium text-ink-muted mb-1">
                        After Description <span className="text-danger-fg">*</span>
                      </label>
                      <input
                        id="after-desc-input"
                        type="text"
                        autoComplete="off"
                        placeholder="Describe after condition..."
                        value={afterDescription}
                        onChange={(e) => setAfterDescription(e.target.value)}
                        className="w-full rounded-lg border border-line bg-surface-base px-2.5 py-1.5 text-xs text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-700"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <Button type="button" variant="outline" disabled={createDetailMutation.isPending || isCompressingBefore || isCompressingAfter} onClick={(e) => handleCreateDetail(e, true)} className="gap-2">
                    Save as Draft
                  </Button>
                  <Button type="submit" disabled={createDetailMutation.isPending || isCompressingBefore || isCompressingAfter} className="gap-2">
                    <Send size={16}/>
                    {createDetailMutation.isPending ? 'Submitting...' : 'Submit for review'}
                  </Button>
                </div>
              </div>
            </form>
          </div>) : mainTab === 'submissions' ? (
            /* Submissions & Reviews Tab */
            <div className="space-y-4 py-4 max-w-full overflow-hidden">
              {isReviewerRole && (
                <div className="flex items-center gap-1 rounded-lg border border-line bg-surface-sunken p-1 text-xs w-fit">
                  {[
                    { key: 'to_review', label: 'To Review' },
                    { key: 'my_submissions', label: 'My Submissions' }
                  ].map((sc) => (
                    <button
                      key={sc.key}
                      type="button"
                      onClick={() => {
                        setReviewScope(sc.key);
                        if (sc.key === 'to_review' && detailsFilter === 'draft') {
                          setDetailsFilter('pending_jh_review');
                        }
                        setCurrentPage(1);
                      }}
                      className={`px-3 py-1.5 rounded-md transition-all text-xs font-medium text-center ${
                        effectiveReviewScope === sc.key
                          ? 'bg-surface-raised text-blue-700 font-semibold shadow-xs'
                          : 'text-ink-muted hover:text-ink-strong'
                      }`}
                    >
                      {sc.label}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 bg-surface-raised p-2.5 sm:p-3 rounded-xl border border-line shadow-xs">
                <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1 rounded-lg border border-line bg-surface-sunken p-1 text-xs">
                    {(effectiveReviewScope === 'to_review'
                      ? [
                          { key: 'pending_jh_review', label: 'Pending Review' },
                          { key: 'approved', label: 'Approved' },
                          { key: 'rejected', label: 'Rejected' }
                        ]
                      : [
                          { key: 'draft', label: 'Draft' },
                          { key: 'pending_jh_review', label: 'Pending Review' },
                          { key: 'approved', label: 'Approved' },
                          { key: 'rejected', label: 'Rejected' }
                        ]
                    ).map((st) => (
                      <button
                        key={st.key}
                        type="button"
                        onClick={() => {
                          setDetailsFilter(st.key);
                          setCurrentPage(1);
                        }}
                        className={`px-3 py-1.5 rounded-md transition-all text-xs font-medium text-center ${
                          detailsFilter === st.key
                            ? 'bg-surface-raised text-blue-700 font-semibold shadow-xs'
                            : 'text-ink-muted hover:text-ink-strong'
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>

                  {detailsFilter === 'approved' && (
                    <div className="flex items-center gap-1 bg-surface-sunken p-1 rounded-lg border border-line text-xs shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setApprovedSubFilter('all');
                          setCurrentPage(1);
                        }}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                          approvedSubFilter === 'all'
                            ? 'bg-surface-raised text-ink-strong font-semibold shadow-2xs'
                            : 'text-ink-muted hover:text-ink-strong'
                        }`}
                      >
                        All Approved
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setApprovedSubFilter('critical');
                          setCurrentPage(1);
                        }}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1 ${
                          approvedSubFilter === 'critical'
                            ? 'bg-amber-500 text-white font-semibold shadow-2xs'
                            : 'text-amber-700 dark:text-amber-300 hover:bg-amber-500/10'
                        }`}
                      >
                        <Star size={12} className={approvedSubFilter === 'critical' ? 'fill-white text-white' : 'fill-amber-400 text-amber-500'} />
                        Critical Only
                      </button>
                    </div>
                  )}
                </div>

                <input
                  type="text"
                  placeholder="Search OPLs..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="rounded-lg border border-line bg-surface-base px-3 py-1.5 text-xs text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-700 w-full md:w-48 shrink-0"
                />
              </div>

              {isDetailsLoading ? ([0, 1].map((i) => <SkeletonRow key={i} columns={3}/>)) : filteredDetails.length === 0 ? (
                <EmptyState title="No OPLs Found" description="Submit a new OPL or adjust filters to view items in the review workflow."/>
              ) : (
                <div className="space-y-4">
                  {paginatedDetails.map((detail) => (
                    <div key={detail.opl_id} className="rounded-xl border border-line bg-surface-raised p-4 transition-all hover:border-blue-200 shadow-xs max-w-full overflow-hidden space-y-3">
                      
                      {/* Card Header */}
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 border-b border-line/60 pb-2">
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          {detail.is_star && (
                            <span className="inline-flex items-center gap-1 text-2xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 px-2 py-0.5 rounded-md shrink-0" title="Critical OPL">
                              <Star size={13} className="fill-amber-400 text-amber-500" />
                              <span>Critical</span>
                            </span>
                          )}

                          <span className="inline-block rounded-md bg-stone-100 dark:bg-stone-800 px-2 py-0.5 text-2xs font-mono font-medium text-ink-muted shrink-0">
                            OPL #{detail.opl_id}
                          </span>

                          <h4 className="inline text-sm font-semibold text-ink-strong break-words min-w-0">{detail.title}</h4>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <StatusBadge
                            status={STATUS_KEY[detail.status] ?? 'neutral'}
                            label={STATUS_LABEL[detail.status] ?? detail.status}
                            size="sm"
                          />
                          {PENDING_OPL_STATUSES.has(detail.status) && reviewerNamesFor(detail) && (
                            <span
                              className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-2xs font-semibold text-amber-700"
                              title="Currently waiting on this reviewer"
                            >
                              <UserCheck size={11} /> With {reviewerNamesFor(detail)}
                            </span>
                          )}
                          {detail.total_stages > 1 && (
                            <span
                              className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-2xs font-semibold text-blue-700"
                              title="Multi-stage review"
                            >
                              <Layers size={11} />
                              {detail.status === 'rejected'
                                ? `Rejected at stage ${detail.current_stage_order} of ${detail.total_stages}`
                                : detail.status === 'approved'
                                ? `Cleared all ${detail.total_stages} stages`
                                : `Stage ${detail.current_stage_order} of ${detail.total_stages}`}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1 text-2xs text-ink-muted">
                            <Clock size={12}/>
                            {detail.timestamp ? new Date(detail.timestamp).toLocaleString() : 'Just now'}
                          </span>
                        </div>
                      </div>

                      {/* Author & Classification Bar */}
                      <div className="flex flex-wrap items-center justify-between gap-2 bg-surface-sunken px-3 py-2 rounded-lg text-2xs">
                        <div className="flex items-center gap-1.5 text-ink-muted">
                          <User size={13} className="text-blue-700" />
                          <span>Submitted by: <strong className="text-ink-strong">{detail.submitted_by || 'Plant Admin'}</strong></span>
                        </div>

                        {/* Classification is read-only here — a reviewer changes it inside the
                            Review & Accept panel; the submitter can't change it after submitting. */}
                        <div className="flex items-center gap-1.5">
                          <Tag size={13} className="text-blue-700" />
                          <span className="text-ink-muted font-medium">Classification:</span>
                          <span className="text-xs font-semibold text-blue-700">{detail.classification || 'Basic Condition'}</span>
                        </div>
                      </div>

                      {/* Content Description */}
                      <p className="whitespace-pre-wrap text-sm text-ink-muted bg-surface-sunken p-3 rounded-lg border border-line/40 break-words max-w-full">
                        {detail.content}
                      </p>

                      {/* Before / After Images & Descriptions */}
                      {(detail.before_image || detail.after_image || detail.before_description || detail.before_remarks || detail.after_description || detail.after_remarks) && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {(detail.before_image || detail.before_description || detail.before_remarks) && (
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-ink-subtle mb-1">Before Condition</p>
                              {detail.before_image && (
                                <button type="button" onClick={() => setLightboxImage(detail.before_image)} className="block w-full" title="Tap to view full size">
                                  <img src={detail.before_image} alt="Before" className="h-28 w-full object-contain rounded-lg border border-line bg-surface-sunken cursor-zoom-in hover:opacity-90 transition-opacity" />
                                </button>
                              )}
                              {(detail.before_description || detail.before_remarks) && (
                                <p className="mt-1.5 text-xs text-ink-muted bg-surface-sunken p-2 rounded-md border border-line/40 break-words">
                                  {detail.before_description || detail.before_remarks}
                                </p>
                              )}
                            </div>
                          )}
                          {(detail.after_image || detail.after_description || detail.after_remarks) && (
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-ink-subtle mb-1">After Condition</p>
                              {detail.after_image && (
                                <button type="button" onClick={() => setLightboxImage(detail.after_image)} className="block w-full" title="Tap to view full size">
                                  <img src={detail.after_image} alt="After" className="h-28 w-full object-contain rounded-lg border border-line bg-surface-sunken cursor-zoom-in hover:opacity-90 transition-opacity" />
                                </button>
                              )}
                              {(detail.after_description || detail.after_remarks) && (
                                <p className="mt-1.5 text-xs text-ink-muted bg-surface-sunken p-2 rounded-md border border-line/40 break-words">
                                  {detail.after_description || detail.after_remarks}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Rejection Comments Alert */}
                      {detail.rejection_reason && (
                        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-500/5 p-2 text-2xs text-red-900">
                          <AlertTriangle size={12} className="mt-0.5 shrink-0 text-red-600" />
                          <span><span className="font-semibold">Review / Rejection Note:</span> {detail.rejection_reason}</span>
                        </div>
                      )}

                      {/* Inline edit panel — submitter fixing their own draft */}
                      {detail.status === 'draft' && editDraftId === detail.opl_id && (
                        <div className="rounded-lg border border-blue-200 bg-blue-500/5 p-3 space-y-3">
                          <p className="text-xs font-semibold text-ink-strong flex items-center gap-1.5">
                            <Pencil size={14} className="text-blue-700" /> Edit draft
                          </p>
                          <div className="space-y-1">
                            <label className="text-2xs font-semibold text-ink-muted">Title</label>
                            <input
                              type="text"
                              value={editDraft.title}
                              onChange={(e) => setEditDraft((p) => ({ ...p, title: e.target.value }))}
                              className="w-full rounded-md border border-line bg-surface-base px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-700"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-2xs font-semibold text-ink-muted">Content</label>
                            <textarea
                              rows={3}
                              value={editDraft.content}
                              onChange={(e) => setEditDraft((p) => ({ ...p, content: e.target.value }))}
                              className="w-full rounded-md border border-line bg-surface-base px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-700"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-2xs font-semibold text-ink-muted">Classification</label>
                            <select
                              value={editDraft.classification}
                              onChange={(e) => setEditDraft((p) => ({ ...p, classification: e.target.value }))}
                              className="w-full sm:w-56 rounded-md border border-line bg-surface-base px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-700"
                            >
                              {CLASSIFICATIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {['before', 'after'].map((which) => {
                              const imgKey = which === 'before' ? 'before_image' : 'after_image';
                              const descKey = which === 'before' ? 'before_description' : 'after_description';
                              const busy = which === 'before' ? isEditCompressingBefore : isEditCompressingAfter;
                              return (
                                <div key={which} className="space-y-1">
                                  <label className="text-2xs font-semibold text-ink-muted capitalize">{which} condition</label>
                                  {editDraft[imgKey] ? (
                                    <div className="relative h-24 w-full rounded-md border border-line overflow-hidden bg-surface-sunken">
                                      <img src={editDraft[imgKey]} alt={which} className="h-full w-full object-contain" />
                                      <button type="button" onClick={() => setEditDraft((p) => ({ ...p, [imgKey]: null }))} className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80">
                                        <X size={12} />
                                      </button>
                                    </div>
                                  ) : (
                                    <label className="flex h-16 w-full cursor-pointer items-center justify-center gap-1 rounded-md border-2 border-dashed border-line hover:border-blue-300 text-2xs text-ink-subtle">
                                      {busy ? <Loader2 size={16} className="animate-spin text-blue-700" /> : <><ImagePlus size={16} /> Attach photo</>}
                                      <input type="file" accept="image/*" className="hidden" disabled={busy} onChange={(e) => handleEditDraftImage(which, e)} />
                                    </label>
                                  )}
                                  <textarea
                                    rows={2}
                                    value={editDraft[descKey]}
                                    onChange={(e) => setEditDraft((p) => ({ ...p, [descKey]: e.target.value }))}
                                    placeholder={`${which} description`}
                                    className="w-full rounded-md border border-line bg-surface-base px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-700"
                                  />
                                </div>
                              );
                            })}
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button type="button" size="sm" variant="outline" className="text-xs h-8" onClick={closeEditDraft}>Cancel</Button>
                            <Button type="button" size="sm" className="text-xs h-8" disabled={updateDetailMutation.isPending || isEditCompressingBefore || isEditCompressingAfter} onClick={() => handleSaveDraftEdit(detail)}>
                              {updateDetailMutation.isPending ? 'Saving…' : 'Save draft'}
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Review Actions Footer */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-line/40">
                        {isPlantBeLeadForOpl(detail) ? (
                          <button
                            type="button"
                            onClick={() => { setSelectedAuditOpl(detail); setAuditModalOpen(true); }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line bg-surface-sunken text-xs font-medium text-ink-strong hover:bg-surface-hover transition-colors"
                          >
                            <History size={14} className="text-blue-700" />
                            <span>Audit Trail</span>
                          </button>
                        ) : <div />}

                        <div className="flex items-center gap-2">
                          {/* Edit + Submit for Review if Draft (submitter only) */}
                          {detail.status === 'draft' && isMySubmission(detail) && editDraftId !== detail.opl_id && (
                            <Button
                              type="button"
                              onClick={() => openEditDraft(detail)}
                              size="sm"
                              variant="outline"
                              className="gap-1.5 text-xs"
                            >
                              <Pencil size={14} />
                              <span>Edit</span>
                            </Button>
                          )}
                          {detail.status === 'draft' && editDraftId !== detail.opl_id && (
                            <Button
                              type="button"
                              onClick={() => handleSubmitForReview(detail)}
                              size="sm"
                              className="gap-1.5 text-xs"
                            >
                              <Send size={14} />
                              <span>Submit for Review</span>
                            </Button>
                          )}

                          {/* JH Lead Review Actions — the resolved approver(s), incl. a JH leader / routing incharge reviewing their own submission (owner direction) */}
                          {(detail.status === 'pending_jh_review' || detail.status === 'pending_approval' || detail.status === 'pending_be_review') && canReviewOpl(detail) && (
                            <div className="flex flex-wrap items-center gap-2 bg-amber-50 dark:bg-amber-950/30 p-1.5 rounded-lg border border-amber-200 dark:border-amber-800/50">
                              <span className="text-2xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wide px-1">Review:</span>
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => handleToggleInlineAccept(detail)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1 text-xs px-2.5 py-1 h-8"
                              >
                                <CheckCircle2 size={14} />
                                <span>{inlineAcceptOplId === detail.opl_id ? 'Cancel' : 'Review & Accept'}</span>
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                onClick={() => { setInlineAcceptOplId(null); handleToggleInlineReject(detail); }}
                                className="gap-1 text-xs px-2.5 py-1 h-8"
                              >
                                <XCircle size={14} />
                                <span>{inlineRejectOplId === detail.opl_id ? 'Cancel' : 'Reject'}</span>
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Inline Rejection Comments Panel for JH Lead Review */}
                      {inlineRejectOplId === detail.opl_id && (
                        <div className="mt-3 p-3 rounded-xl border border-red-300 dark:border-red-800 bg-red-50/90 dark:bg-red-950/40 space-y-2.5 animate-in fade-in duration-150">
                          <div className="flex items-center gap-2 text-xs font-bold text-red-900 dark:text-red-200">
                            <MessageSquare size={15} className="text-red-600 shrink-0" />
                            <span>Enter Rejection Comments / Feedback for Submitter</span>
                          </div>
                          <textarea
                            value={inlineRejectReason}
                            onChange={(e) => setInlineRejectReason(e.target.value)}
                            rows={3}
                            placeholder="Enter mandatory comments explaining why this OPL is being rejected..."
                            className="w-full resize-none rounded-lg border border-red-300 dark:border-red-800 bg-surface-base p-2.5 text-xs text-ink-strong focus:outline-none focus:ring-2 focus:ring-red-500"
                            autoFocus
                          />
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="xs"
                              onClick={() => {
                                setInlineRejectOplId(null);
                                setInlineRejectReason('');
                              }}
                              className="text-xs text-ink-muted hover:text-ink-strong"
                            >
                              Cancel
                            </Button>
                            <Button
                              type="button"
                              size="xs"
                              variant="destructive"
                              disabled={!inlineRejectReason.trim() || jhRejectMutation.isPending}
                              onClick={() => handleConfirmInlineReject(detail)}
                              className="gap-1 text-xs px-3 py-1 font-semibold"
                            >
                              {jhRejectMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
                              <span>Confirm Rejection</span>
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Inline Review & Approve Panel — JH reviewer edits the submitter's
                          content before approving; changed fields are shown back to the submitter. */}
                      {inlineAcceptOplId === detail.opl_id && (
                        <div className="mt-3 p-3 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/30 space-y-3 animate-in fade-in duration-150">
                          <div className="flex items-center gap-2 text-xs font-bold text-emerald-900 dark:text-emerald-200">
                            <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                            <span>Review &amp; edit before approving — the submitter sees any changes you make</span>
                          </div>

                          <div>
                            <label className="block text-2xs font-semibold text-ink-muted mb-1">Title</label>
                            <input
                              type="text"
                              value={acceptEdit.title}
                              onChange={(e) => setAcceptEdit((p) => ({ ...p, title: e.target.value }))}
                              className="w-full rounded-lg border border-line bg-surface-base px-2.5 py-1.5 text-xs text-ink-strong focus:outline-none focus:ring-2 focus:ring-emerald-600"
                            />
                          </div>

                          <div>
                            <label className="block text-2xs font-semibold text-ink-muted mb-1">Description</label>
                            <textarea
                              rows={3}
                              value={acceptEdit.content}
                              onChange={(e) => setAcceptEdit((p) => ({ ...p, content: e.target.value }))}
                              className="w-full resize-none rounded-lg border border-line bg-surface-base px-2.5 py-1.5 text-xs text-ink-strong focus:outline-none focus:ring-2 focus:ring-emerald-600"
                            />
                          </div>

                          <div>
                            <label className="block text-2xs font-semibold text-ink-muted mb-1">Classification</label>
                            <select
                              value={acceptEdit.classification}
                              onChange={(e) => setAcceptEdit((p) => ({ ...p, classification: e.target.value }))}
                              className="w-full rounded-lg border border-line bg-surface-base px-2.5 py-1.5 text-xs font-semibold text-ink-strong focus:outline-none focus:ring-2 focus:ring-emerald-600"
                            >
                              {CLASSIFICATIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {['before', 'after'].map((which) => {
                              const imgKey = which === 'before' ? 'before_image' : 'after_image';
                              const descKey = which === 'before' ? 'before_description' : 'after_description';
                              const busy = which === 'before' ? isAcceptCompressingBefore : isAcceptCompressingAfter;
                              return (
                                <div key={which} className="min-w-0">
                                  <p className="text-2xs font-semibold text-ink-muted mb-1 capitalize">{which} Condition</p>
                                  {acceptEdit[imgKey] ? (
                                    <div className="relative rounded-lg border border-line overflow-hidden bg-surface-sunken p-1">
                                      <img src={acceptEdit[imgKey]} alt={which} className="h-24 w-full object-contain rounded-md" />
                                      <button type="button" onClick={() => setAcceptEdit((p) => ({ ...p, [imgKey]: null }))} className="absolute top-1.5 right-1.5 rounded-full bg-black/60 p-1 text-white hover:bg-black/80">
                                        <X size={12} />
                                      </button>
                                    </div>
                                  ) : (
                                    <label className="flex h-24 w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-line bg-surface-base hover:border-emerald-300 text-ink-muted">
                                      {busy ? <Loader2 size={16} className="animate-spin text-emerald-700" /> : <ImagePlus size={16} className="text-emerald-700" />}
                                      <span className="text-2xs font-medium">{busy ? 'Compressing...' : `Upload ${which} image`}</span>
                                      <input type="file" accept="image/*" className="hidden" disabled={busy} onChange={(e) => handleAcceptImageSelect(which, e)} />
                                    </label>
                                  )}
                                  <input
                                    type="text"
                                    value={acceptEdit[descKey]}
                                    onChange={(e) => setAcceptEdit((p) => ({ ...p, [descKey]: e.target.value }))}
                                    placeholder={`Describe ${which} condition...`}
                                    className="mt-1.5 w-full rounded-lg border border-line bg-surface-base px-2 py-1.5 text-2xs text-ink-strong focus:outline-none focus:ring-2 focus:ring-emerald-600"
                                  />
                                </div>
                              );
                            })}
                          </div>

                          <label className="flex items-start gap-2 p-2 rounded-lg border border-amber-200 dark:border-amber-800/60 bg-amber-50/50 dark:bg-amber-950/20 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={acceptEdit.is_star}
                              onChange={(e) => setAcceptEdit((p) => ({ ...p, is_star: e.target.checked }))}
                              className="mt-0.5 rounded text-amber-600 focus:ring-amber-500 h-4 w-4"
                            />
                            <span className="text-2xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1">
                              <Star size={13} className="fill-amber-400 text-amber-500" />
                              Mark as Critical OPL
                            </span>
                          </label>

                          <div className="flex items-center justify-end gap-2">
                            <Button type="button" variant="ghost" size="xs" onClick={() => setInlineAcceptOplId(null)} className="text-xs text-ink-muted hover:text-ink-strong">
                              Cancel
                            </Button>
                            <Button
                              type="button"
                              size="xs"
                              disabled={jhAcceptMutation.isPending || isAcceptCompressingBefore || isAcceptCompressingAfter}
                              onClick={() => handleConfirmInlineAccept(detail)}
                              className="gap-1 text-xs px-3 py-1 font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                              {jhAcceptMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                              <span>Approve OPL</span>
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* What the reviewer changed at approval — only for the OPL's chain
                          (submitter, routing incharges, JH-group leader, module lead). */}
                      {canSeeOplReviewChanges(detail) && detail.review_changes && Object.keys(detail.review_changes).length > 0 && (
                        <div className="mt-3 rounded-lg border border-blue-200 bg-blue-500/5 p-3 text-2xs text-blue-900 dark:text-blue-200 space-y-1">
                          <p className="font-bold flex items-center gap-1.5"><History size={12} /> Changed by the reviewer</p>
                          {Object.entries(detail.review_changes).map(([field, chg]) => (
                            <p key={field} className="leading-relaxed">
                              <span className="font-semibold">{REVIEW_FIELD_LABEL[field] || field}:</span>{' '}
                              {(field === 'before_image' || field === 'after_image') ? (
                                <span className="italic opacity-70">photo replaced</span>
                              ) : (
                                <>
                                  <span className="line-through opacity-60">{chg?.from || '—'}</span>
                                  {' → '}
                                  <span className="font-medium">{chg?.to || '—'}</span>
                                </>
                              )}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Pagination Controls */}
                  <ListPager
                    total={totalItems}
                    noun={totalItems === 1 ? 'OPL' : 'OPLs'}
                    page={validPage - 1}
                    pageCount={totalPages}
                    pageSize={pageSize}
                    pageSizeOptions={[3, 5, 10, 20, 50]}
                    onPage={(i) => setCurrentPage(i + 1)}
                    onPageSize={(n) => { setPageSize(n); setCurrentPage(1); }}
                  />
                </div>
              )}
            </div>
          ) : mainTab === 'standard' ? (
            /* Standard Lessons Tab */
            <div className="space-y-4 py-4 max-w-full overflow-hidden">
              {/* BE-lead-only: pick which OTHER plants' lessons this plant's repository also shows.
                  Own plant is always included. */}
              {repoCanEdit && (
                <div className="flex flex-col gap-2 bg-surface-raised p-2.5 sm:p-3 rounded-xl border border-line shadow-xs">
                  <div className="flex items-center gap-2 text-xs text-ink-muted">
                    <Building2 size={14} className="text-blue-700 shrink-0" />
                    <span>Repository — also show lessons from these plants:</span>
                    {updateRepoSetting.isPending && <Loader2 size={12} className="animate-spin text-blue-700" />}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-md bg-blue-600 text-white px-2 py-1 text-2xs font-semibold">
                      {repoAllPlants.find((p) => String(p.id) === String(myPlantFactoryId))?.code || 'My Plant'} (always)
                    </span>
                    {otherPlants.map((p) => {
                      const on = repoExtraPlantIds.includes(String(p.id));
                      return (
                        <button
                          key={p.id}
                          type="button"
                          disabled={updateRepoSetting.isPending}
                          onClick={() => toggleExtraPlant(p.id)}
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-2xs font-semibold border transition-colors ${
                            on
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-surface-base text-ink-muted border-line hover:border-blue-400 hover:text-ink-strong'
                          }`}
                        >
                          {on ? <CheckCircle2 size={12} /> : <Plus size={12} />}
                          {p.code || p.name}
                        </button>
                      );
                    })}
                    {otherPlants.length === 0 && (
                      <span className="text-2xs text-ink-subtle italic">No other plants exist</span>
                    )}
                  </div>
                </div>
              )}

              {/* Recurring training schedules — shared status/manage view for incharges.
                  Schedules are created per-OPL from each lesson card's "Schedule" button. */}
              {isReviewerRole && !trainingSchedulesError && (
                <RecurringTrainingPanel schedules={trainingSchedules} />
              )}

              {/* Top Sub-Tab Navigation Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-surface-raised p-2.5 sm:p-3 rounded-xl border border-line shadow-xs">
                <div className="flex items-center gap-1.5 rounded-lg border border-line bg-surface-sunken p-1 text-xs min-w-0 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      setStdTab('all');
                      setStdCurrentPage(1);
                    }}
                    className={`px-3 py-1.5 rounded-md transition-all text-xs font-medium flex items-center gap-1.5 ${
                      stdTab === 'all'
                        ? 'bg-surface-raised text-blue-700 font-semibold shadow-xs'
                        : 'text-ink-muted hover:text-ink-strong'
                    }`}
                  >
                    <Globe size={14} />
                    <span>All</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setStdTab('my_jh_group');
                      setStdCurrentPage(1);
                    }}
                    className={`px-3 py-1.5 rounded-md transition-all text-xs font-medium flex items-center gap-1.5 ${
                      stdTab === 'my_jh_group'
                        ? 'bg-surface-raised text-blue-700 font-semibold shadow-xs'
                        : 'text-ink-muted hover:text-ink-strong'
                    }`}
                  >
                    <Users size={14} />
                    <span>My JH Group</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setStdTab('my_remaining');
                      setStdCurrentPage(1);
                    }}
                    className={`px-3 py-1.5 rounded-md transition-all text-xs font-medium flex items-center gap-1.5 ${
                      stdTab === 'my_remaining'
                        ? 'bg-surface-raised text-amber-700 font-semibold shadow-xs border border-amber-300/40'
                        : 'text-ink-muted hover:text-ink-strong'
                    }`}
                  >
                    <Clock size={14} className={stdTab === 'my_remaining' ? 'text-amber-600' : 'text-ink-subtle'} />
                    <span>My Remaining</span>
                    <span className="px-1.5 py-0.2 rounded-full text-2xs font-bold bg-amber-500 text-white shadow-2xs">
                      {totalRemainingLessonsCount}
                    </span>
                  </button>
                </div>

                {/* Search Bar for Standard Lessons */}
                <div className="relative flex-1 sm:max-w-xs">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-subtle pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search the OPL repository..."
                    value={stdSearchQuery}
                    onChange={(e) => {
                      setStdSearchQuery(e.target.value);
                      setStdCurrentPage(1);
                    }}
                    className="w-full rounded-lg border border-line bg-surface-base pl-8 pr-3 py-1.5 text-xs text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-700"
                  />
                </div>
              </div>

              {/* Sub-Tab Specific Header / Controls */}
              {stdTab === 'all' ? (
                /* Toggle Options for DMT Level, Plants, JH Groups, Classification, Priority */
                <div className="flex flex-col gap-2.5 bg-surface-sunken p-3 rounded-xl border border-line text-xs">
                  {/* Row 1: Plant Filter — only when this plant sees more than its own lessons */}
                  {showsOtherPlants ? (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-2xs font-bold text-ink-muted uppercase tracking-wider flex items-center gap-1 shrink-0">
                        <Building2 size={12} className="text-blue-700" /> Plant:
                      </span>
                      <div className="flex items-center gap-0.5 p-0.5 rounded-lg border border-line bg-surface-base overflow-x-auto max-w-full [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {[
                          { value: 'all', label: 'All Visible' },
                          ...repoAllPlants
                            .filter((p) => visiblePlantIdSet.has(String(p.id)))
                            .map((p) => ({ value: String(p.id), label: p.code || p.name })),
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              setSelectedPlant(opt.value);
                              setStdCurrentPage(1);
                            }}
                            className={`px-2.5 py-1 rounded-md text-2xs font-semibold whitespace-nowrap shrink-0 transition-all ${
                              selectedPlant === opt.value
                                ? 'bg-blue-600 text-white shadow-2xs'
                                : 'text-ink-muted hover:text-ink-strong hover:bg-surface-raised/70'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-2xs text-ink-muted">
                      <Building2 size={12} className="text-blue-700 shrink-0" />
                      <span>Showing your plant's lessons only.{repoCanEdit ? ' Add other plants from the bar above.' : ''}</span>
                    </div>
                  )}

                  {/* Row 2: DMT Level and JH Group together */}
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                    {/* DMT Level Select */}
                    <div className="flex min-w-0 max-w-full items-center gap-1.5">
                      <span className="text-2xs font-bold text-ink-muted uppercase tracking-wider flex items-center gap-1 shrink-0">
                        <Layers size={12} className="text-blue-700" /> DMT Level:
                      </span>
                      <select
                        value={selectedDmt}
                        onChange={(e) => handleDmtChange(e.target.value)}
                        className="px-2.5 py-1 rounded-lg border border-line bg-surface-base text-2xs font-semibold text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-700 cursor-pointer shadow-2xs"
                      >
                        {dmtOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Cascading JH Group Select */}
                    <div className="flex min-w-0 max-w-full items-center gap-1.5">
                      <span className="text-2xs font-bold text-ink-muted uppercase tracking-wider flex items-center gap-1 shrink-0">
                        <Users size={12} className="text-blue-700" /> JH Group:
                      </span>
                      <select
                        value={selectedJhGroup}
                        onChange={(e) => {
                          setSelectedJhGroup(e.target.value);
                          setStdCurrentPage(1);
                        }}
                        className="px-2.5 py-1 rounded-lg border border-line bg-surface-base text-2xs font-semibold text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-700 cursor-pointer shadow-2xs"
                      >
                        {availableJhGroups.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Row 3: Type and Priority together */}
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                    {/* Classification / Type Toggle */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-2xs font-bold text-ink-muted uppercase tracking-wider flex items-center gap-1 shrink-0">
                        <Tag size={12} className="text-blue-700" /> Type:
                      </span>
                      <div className="flex items-center gap-0.5 p-0.5 rounded-lg border border-line bg-surface-base overflow-x-auto max-w-full [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {[
                          { value: 'all', label: 'All' },
                          { value: 'Basic Condition', label: 'Basic Condition' },
                          { value: 'Troubleshoot', label: 'Troubleshoot' },
                          { value: 'Improvement', label: 'Improvement' }
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              setSelectedClassification(opt.value);
                              setStdCurrentPage(1);
                            }}
                            className={`px-2.5 py-1 rounded-md text-2xs font-semibold whitespace-nowrap shrink-0 transition-all ${
                              selectedClassification === opt.value
                                ? 'bg-blue-600 text-white shadow-2xs'
                                : 'text-ink-muted hover:text-ink-strong hover:bg-surface-raised/70'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Critical / Priority Toggle */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-2xs font-bold text-ink-muted uppercase tracking-wider flex items-center gap-1 shrink-0">
                        <Star size={12} className="text-amber-500 fill-amber-500" /> Priority:
                      </span>
                      <div className="flex items-center gap-0.5 p-0.5 rounded-lg border border-line bg-surface-base overflow-x-auto max-w-full [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {[
                          { value: 'all', label: 'All' },
                          { value: 'critical', label: '★ Critical' },
                          { value: 'standard', label: 'Standard' }
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              setSelectedCriticalFilter(opt.value);
                              setStdCurrentPage(1);
                            }}
                            className={`px-2.5 py-1 rounded-md text-2xs font-semibold whitespace-nowrap shrink-0 transition-all ${
                              selectedCriticalFilter === opt.value
                                ? opt.value === 'critical'
                                  ? 'bg-amber-500 text-white shadow-2xs font-bold'
                                  : 'bg-blue-600 text-white shadow-2xs'
                                : 'text-ink-muted hover:text-ink-strong hover:bg-surface-raised/70'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Reset Filters button */}
                    {(selectedDmt !== 'all' || selectedPlant !== 'all' || selectedJhGroup !== 'all' || selectedClassification !== 'all' || selectedCriticalFilter !== 'all' || stdSearchQuery.trim()) && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDmt('all');
                          setSelectedPlant('all');
                          setSelectedJhGroup('all');
                          setSelectedClassification('all');
                          setSelectedCriticalFilter('all');
                          setStdSearchQuery('');
                          setStdCurrentPage(1);
                        }}
                        className="flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-700/80 px-2.5 py-1 bg-surface-base rounded-lg border border-line hover:border-blue-300 transition-colors"
                      >
                        <X size={12} /> Clear Filters
                      </button>
                    )}
                  </div>

                  <div className="text-2xs text-ink-muted font-medium pt-1.5 border-t border-line/60 flex items-center justify-between">
                    <span>Filter Options</span>
                    <span>Showing <span className="font-bold text-ink-strong">{approvedStandardLessons.length}</span> approved lessons</span>
                  </div>
                </div>
              ) : stdTab === 'my_jh_group' ? (
                /* Context Banner & Toggle Options for My JH Group */
                <div className="flex flex-col gap-3 bg-blue-50/20 border border-blue-600/20 p-3 rounded-xl text-xs">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
                    <div className="flex items-center gap-2 pr-3 border-r border-blue-600/20">
                      <Users size={16} className="text-blue-700" />
                      <span className="font-bold text-ink-strong">My JH Group: {userJhGroup}</span>
                    </div>

                    {/* Classification / Type Toggle */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-2xs font-bold text-ink-muted uppercase tracking-wider flex items-center gap-1 shrink-0">
                        <Tag size={12} className="text-blue-700" /> Type:
                      </span>
                      <div className="flex items-center gap-0.5 p-0.5 rounded-lg border border-line bg-surface-base overflow-x-auto max-w-full [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {[
                          { value: 'all', label: 'All' },
                          { value: 'Basic Condition', label: 'Basic Condition' },
                          { value: 'Troubleshoot', label: 'Troubleshoot' },
                          { value: 'Improvement', label: 'Improvement' }
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              setSelectedClassification(opt.value);
                              setStdCurrentPage(1);
                            }}
                            className={`px-2.5 py-1 rounded-md text-2xs font-semibold whitespace-nowrap shrink-0 transition-all ${
                              selectedClassification === opt.value
                                ? 'bg-blue-600 text-white shadow-2xs'
                                : 'text-ink-muted hover:text-ink-strong hover:bg-surface-raised/70'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Priority Toggle */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-2xs font-bold text-ink-muted uppercase tracking-wider flex items-center gap-1 shrink-0">
                        <Star size={12} className="text-amber-500 fill-amber-500" /> Priority:
                      </span>
                      <div className="flex items-center gap-0.5 p-0.5 rounded-lg border border-line bg-surface-base overflow-x-auto max-w-full [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {[
                          { value: 'all', label: 'All' },
                          { value: 'critical', label: '★ Critical' },
                          { value: 'standard', label: 'Standard' }
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              setSelectedCriticalFilter(opt.value);
                              setStdCurrentPage(1);
                            }}
                            className={`px-2.5 py-1 rounded-md text-2xs font-semibold whitespace-nowrap shrink-0 transition-all ${
                              selectedCriticalFilter === opt.value
                                ? opt.value === 'critical'
                                  ? 'bg-amber-500 text-white shadow-2xs font-bold'
                                  : 'bg-blue-600 text-white shadow-2xs'
                                : 'text-ink-muted hover:text-ink-strong hover:bg-surface-raised/70'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Reset Filters button */}
                    {(selectedClassification !== 'all' || selectedCriticalFilter !== 'all' || stdSearchQuery.trim()) && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedClassification('all');
                          setSelectedCriticalFilter('all');
                          setStdSearchQuery('');
                          setStdCurrentPage(1);
                        }}
                        className="flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-700/80 px-2.5 py-1 bg-surface-base rounded-lg border border-line hover:border-blue-300 transition-colors"
                      >
                        <X size={12} /> Clear Filters
                      </button>
                    )}
                  </div>

                  <div className="text-2xs text-ink-muted font-medium pt-1.5 border-t border-blue-600/15 flex items-center justify-between">
                    <span>JH Group Lessons</span>
                    <span>Showing <span className="font-bold text-ink-strong">{approvedStandardLessons.length}</span> lessons in {userJhGroup}</span>
                  </div>
                </div>
              ) : (
                /* Header / Controls for My Remaining Trainings with Toggle Options */
                <div className="flex flex-col gap-2.5 bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl text-xs">
                  {/* Row 1: Remaining Badge — this list is already scoped to lessons assigned
                      to you, so no plant / DMT / JH-group filters here (only Type & Priority). */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <div className="flex items-center gap-2 shrink-0">
                      <Clock size={16} className="text-amber-600" />
                      <span className="font-bold text-amber-900">Remaining Trainings ({totalRemainingLessonsCount})</span>
                    </div>
                  </div>

                  {/* Row 2: Type and Priority together */}
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                    {/* Classification / Type Toggle */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-2xs font-bold text-amber-950/70 uppercase tracking-wider flex items-center gap-1 shrink-0">
                        <Tag size={12} className="text-amber-600" /> Type:
                      </span>
                      <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg border border-amber-300/40 bg-surface-base flex-wrap">
                        {[
                          { value: 'all', label: 'All' },
                          { value: 'Basic Condition', label: 'Basic Condition' },
                          { value: 'Troubleshoot', label: 'Troubleshoot' },
                          { value: 'Improvement', label: 'Improvement' }
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              setSelectedClassification(opt.value);
                              setStdCurrentPage(1);
                            }}
                            className={`px-2.5 py-1 rounded-md text-2xs font-semibold whitespace-nowrap shrink-0 transition-all ${
                              selectedClassification === opt.value
                                ? 'bg-amber-600 text-white shadow-2xs font-bold'
                                : 'text-amber-950/80 hover:text-amber-950 hover:bg-amber-500/10'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Priority Toggle */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-2xs font-bold text-amber-950/70 uppercase tracking-wider flex items-center gap-1 shrink-0">
                        <Star size={12} className="text-amber-500 fill-amber-500" /> Priority:
                      </span>
                      <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg border border-amber-300/40 bg-surface-base flex-wrap">
                        {[
                          { value: 'all', label: 'All' },
                          { value: 'critical', label: '★ Critical' },
                          { value: 'standard', label: 'Standard' }
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              setSelectedCriticalFilter(opt.value);
                              setStdCurrentPage(1);
                            }}
                            className={`px-2.5 py-1 rounded-md text-2xs font-semibold whitespace-nowrap shrink-0 transition-all ${
                              selectedCriticalFilter === opt.value
                                ? 'bg-amber-600 text-white shadow-2xs font-bold'
                                : 'text-amber-950/80 hover:text-amber-950 hover:bg-amber-500/10'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Reset Filters button */}
                    {(selectedClassification !== 'all' || selectedCriticalFilter !== 'all' || stdSearchQuery.trim()) && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedClassification('all');
                          setSelectedCriticalFilter('all');
                          setStdSearchQuery('');
                          setStdCurrentPage(1);
                        }}
                        className="flex items-center gap-1 text-xs font-semibold text-amber-800 hover:text-amber-900 px-2.5 py-1 bg-surface-base rounded-lg border border-amber-300/60 hover:border-amber-500 transition-colors"
                      >
                        <X size={12} /> Clear Filters
                      </button>
                    )}
                  </div>

                  <div className="text-2xs text-amber-900/70 font-medium pt-1.5 border-t border-amber-500/20 flex items-center justify-between">
                    <span>Action Required</span>
                    <span>Showing <span className="font-bold text-amber-950">{approvedStandardLessons.length}</span> remaining trainings</span>
                  </div>
                </div>
              )}

              {/* Standard Lessons Cards List */}
              {isDetailsLoading ? (
                [0, 1, 2].map((i) => <SkeletonRow key={i} columns={2} />)
              ) : paginatedStandardLessons.length === 0 ? (
                <EmptyState
                  title={stdTab === 'my_remaining' ? 'No Remaining Trainings Due' : 'No Lessons in the Repository'}
                  description={
                    stdTab === 'my_remaining'
                      ? 'Great job! You have completed all your assigned OPL trainings.'
                      : stdTab === 'my_jh_group'
                      ? `No approved lessons in the repository for ${userJhGroup}.`
                      : 'Try adjusting your Plant, JH Group, Type, or search filters.'
                  }
                />
              ) : (
                <div className="space-y-3">
                  {paginatedStandardLessons.map((item) => {
                    const itemKey = String(item.opl_id);
                    // Real per-user assignment status, not the old browser-shared flag.
                    // "Assigned to me" means any assignment record exists (pending OR
                    // completed) — not just currently-pending ones, otherwise a completed
                    // assignment would wrongly look like it was never assigned at all.
                    const myAssignmentStatus = myAnyAssignmentByOplId.get(itemKey)?.status;
                    const isAssignedToMe = myAssignmentStatus !== undefined;
                    const isCompleted = myAssignmentStatus === 'completed';
                    const oplCompletions = allTrainingAssignments.filter(a => String(a.opl_id) === itemKey && a.status === 'completed');

                    return (
                      <div
                        key={item.opl_id}
                        onClick={() => {
                          handleLessonOpened(item.opl_id);
                          setSelectedLessonSheet(item);
                        }}
                        className="group rounded-xl border border-line bg-surface-raised p-4 shadow-2xs space-y-3 transition-all hover:border-blue-600/60 hover:shadow-md cursor-pointer"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line/60 pb-2.5">
                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-semibold text-ink-muted bg-surface-sunken px-2 py-0.5 rounded-md border border-line">
                                {item.classification || 'Basic Condition'}
                              </span>
                              {item.is_star && (
                                <span className="inline-flex items-center gap-1 text-2xs font-bold bg-amber-500 text-white px-2 py-0.5 rounded-md shadow-2xs">
                                  <Star size={12} className="fill-white text-white" />
                                  Critical OPL
                                </span>
                              )}
                            </div>
                            <h3 className="text-sm sm:text-base font-semibold text-ink-strong group-hover:text-blue-700 transition-colors">
                              {item.title}
                            </h3>
                          </div>

                          {/* Up to four action buttons — they must wrap among themselves on a
                              phone (measured at 375px they ran ~70px past the screen edge and
                              got clipped, making the last button unreachable). */}
                          <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto sm:shrink-0" onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="outline"
                              size="xs"
                              onClick={() => {
                                handleLessonOpened(item.opl_id);
                                setSelectedLessonSheet(item);
                              }}
                              className="text-2xs h-7 px-2.5 bg-blue-50/40 border-blue-600/30 text-blue-700 font-semibold hover:bg-blue-700 hover:text-white transition-colors"
                            >
                              <FileText size={13} className="mr-1" /> View Sheet
                            </Button>

                            {canPushTraining && (
                              <Button
                                variant="outline"
                                size="xs"
                                onClick={() => {
                                  setPushTargetOpl(item);
                                  setPushModalOpen(true);
                                }}
                                className="text-2xs h-7 px-2.5 bg-blue-50/70 border-blue-600/40 text-blue-700 font-bold hover:bg-blue-700 hover:text-white transition-all shadow-2xs"
                              >
                                <Send size={12} className="mr-1" /> Push Training
                              </Button>
                            )}

                            {isReviewerRole && (
                              <Button
                                variant="outline"
                                size="xs"
                                onClick={() => setScheduleModalOpl(item)}
                                className={`text-2xs h-7 px-2.5 font-bold transition-all shadow-2xs ${
                                  activeScheduleByOplId.has(String(item.opl_id))
                                    ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                                    : 'bg-blue-50/70 border-blue-600/40 text-blue-700 hover:bg-blue-700 hover:text-white'
                                }`}
                              >
                                <Clock size={12} className="mr-1" />
                                {activeScheduleByOplId.has(String(item.opl_id))
                                  ? `Every ${activeScheduleByOplId.get(String(item.opl_id)).interval_days}d`
                                  : 'Schedule'}
                              </Button>
                            )}

                            {isPlantBeLeadForOpl(item) && (
                              <Button
                                variant="ghost"
                                size="xs"
                                onClick={() => {
                                  setSelectedAuditOpl(item);
                                  setAuditModalOpen(true);
                                }}
                                className="text-2xs h-7 px-2 text-ink-muted hover:text-blue-700"
                              >
                                <History size={12} className="mr-1" /> Audit
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Content Excerpt & Before/After Images if present */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                          <div className="md:col-span-2 space-y-1.5">
                            <p className="text-xs text-ink-strong leading-relaxed line-clamp-3 bg-surface-sunken/50 p-2.5 rounded-lg border border-line/40">
                              {item.content}
                            </p>
                            <div className="flex flex-wrap items-center gap-3 text-2xs text-ink-muted pt-1">
                              <span className="flex items-center gap-1">
                                <Building2 size={12} className="text-ink-subtle" /> Plant: <strong className="text-ink-strong">{item.plant_name || item.plant_code || '—'}</strong>
                              </span>
                              <span className="flex items-center gap-1">
                                <Users size={12} className="text-ink-subtle" /> JH Group: <strong className="text-ink-strong">{item.jh_group_name || 'Unassigned'}</strong>
                              </span>
                              <span className="flex items-center gap-1">
                                <User size={12} className="text-ink-subtle" /> Author: <strong className="text-ink-strong">{item.submitted_by}</strong>
                              </span>
                            </div>
                          </div>

                          {(item.before_image || item.after_image) && (
                            <div className="flex gap-2 shrink-0">
                              {item.before_image && (
                                <div className="relative h-20 w-24 rounded-lg overflow-hidden border border-line bg-black/5">
                                  <img src={item.before_image} alt="Before" className="h-full w-full object-contain" />
                                  <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-2xs text-center py-0.5">Before</span>
                                </div>
                              )}
                              {item.after_image && (
                                <div className="relative h-20 w-24 rounded-lg overflow-hidden border border-line bg-black/5">
                                  <img src={item.after_image} alt="After" className="h-full w-full object-contain" />
                                  <span className="absolute bottom-0 inset-x-0 bg-blue-600/80 text-white text-2xs text-center py-0.5">After</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Trainees Completion Section & Training Completion Actions */}
                        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3 border-t border-line/60" onClick={(e) => e.stopPropagation()}>
                          {canSeeCompletions(item) ? (
                            <button
                              type="button"
                              onClick={() => { setViewingCompletionsOpl(item); setCompletionsPage(1); }}
                              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-line bg-surface-sunken hover:bg-surface-hover hover:border-blue-600/40 text-ink-strong text-2xs font-medium transition-all shadow-2xs group/comp"
                            >
                              <div className="flex items-center gap-1 text-blue-700">
                                <Users size={14} />
                                <span className="font-bold">{oplCompletions.length}</span>
                              </div>
                              <span>Completed Trainees (JH Groups)</span>
                              <span className="text-2xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-semibold group-hover/comp:bg-blue-600 group-hover/comp:text-white transition-colors">
                                View List →
                              </span>
                            </button>
                          ) : <div />}

                          <div className="flex items-center gap-2">
                            {isMyAssignmentsLoading ? (
                              <span className="text-2xs text-ink-muted italic">
                                Checking training status...
                              </span>
                            ) : !isAssignedToMe ? (
                              <span className="text-2xs text-ink-muted italic">
                                Not assigned to you as training
                              </span>
                            ) : isCompleted ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-2xs shadow-2xs">
                                <CheckCircle2 size={14} className="text-emerald-600" />
                                <span>Training Completed</span>
                              </span>
                            ) : (
                              <span className="text-2xs text-ink-muted italic">
                                Open the lesson and read to the end to complete training
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Standard Lessons Pagination Controls */}
                  <ListPager
                    total={approvedStandardLessons.length}
                    noun={approvedStandardLessons.length === 1 ? 'lesson' : 'lessons'}
                    page={stdValidPage - 1}
                    pageCount={stdTotalPages}
                    pageSize={stdPageSize}
                    pageSizeOptions={[3, 5, 10, 20]}
                    onPage={(i) => setStdCurrentPage(i + 1)}
                    onPageSize={(n) => { setStdPageSize(n); setStdCurrentPage(1); }}
                  />
                </div>
              )}
            </div>
          ) : mainTab === 'myteam' && canSeeMyTeam ? (
            <MyTeamAnalyticsTab />
          ) : mainTab === 'analytics' && isBeLeadRole ? (
            <OplAnalyticsTab />
          ) : null}
      </CaptureColumn>

      {/* Modals for Rejection Comments, Audit Trail & Submitter Edit */}
      <OPLAuditTrailModal
        isOpen={auditModalOpen}
        onClose={() => { setAuditModalOpen(false); setSelectedAuditOpl(null); }}
        oplId={selectedAuditOpl?.opl_id}
        oplTitle={selectedAuditOpl?.title}
      />

      <OPLEditSubmitterModal
        isOpen={editSubmitterModalOpen}
        onClose={() => { setEditSubmitterModalOpen(false); setEditingDetail(null); }}
        detail={editingDetail}
      />

      {selectedLessonSheet && (
        <OnePointLessonSheet
          lesson={selectedLessonSheet}
          onClose={() => setSelectedLessonSheet(null)}
          isCompleted={myAnyAssignmentByOplId.get(String(selectedLessonSheet.opl_id))?.status === 'completed'}
          canComplete={myAssignedOplIds.has(String(selectedLessonSheet.opl_id))}
          onMarkCompleted={(id) => handleMarkTrainingCompleted(id)}
          onLessonOpened={(id) => handleLessonOpened(id)}
        />
      )}

      {/* Full-size photo viewer — tap any before/after photo on an OPL card */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 cursor-zoom-out"
          onClick={() => setLightboxImage(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxImage(null)}
            className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label="Close photo"
          >
            <X size={22} />
          </button>
          <img
            src={lightboxImage}
            alt="Full size"
            className="max-h-full max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Training Completion Records Modal by JH Groups */}
      {viewingCompletionsOpl && canSeeCompletions(viewingCompletionsOpl) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-3xl rounded-2xl bg-surface-raised border border-line p-5 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-start justify-between border-b border-line pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <GraduationCap size={20} className="text-blue-700" />
                  <h3 className="text-base font-bold text-ink-strong">
                    Training Completion Records
                  </h3>
                </div>
                <p className="text-xs text-ink-muted mt-0.5 line-clamp-1">
                  Lesson: <strong className="text-ink">{viewingCompletionsOpl.title}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingCompletionsOpl(null)}
                className="rounded-lg p-1 text-ink-muted hover:bg-surface-hover hover:text-ink transition-colors"
                aria-label="Close modal"
              >
                <X size={20} />
              </button>
            </div>

            {/* Summary Stat Cards */}
            {(() => {
              const itemKey = String(viewingCompletionsOpl.opl_id);
              const records = allTrainingAssignments.filter(a => String(a.opl_id) === itemKey && a.status === 'completed');
              const uniqueJhGroups = Array.from(new Set(records.map(r => r.jh_group_name).filter(Boolean)));
              const completionsTotalPages = Math.max(1, Math.ceil(records.length / COMPLETIONS_PAGE_SIZE));
              const completionsValidPage = Math.min(Math.max(completionsPage, 1), completionsTotalPages);
              const pageRecords = records.slice((completionsValidPage - 1) * COMPLETIONS_PAGE_SIZE, completionsValidPage * COMPLETIONS_PAGE_SIZE);

              return (
                <div className="space-y-4 flex-1 overflow-y-auto pr-1">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-line bg-surface-sunken p-3">
                      <span className="text-2xs text-ink-muted font-medium">Total Trainees Completed</span>
                      <div className="text-xl font-black text-blue-700 mt-0.5">
                        {records.length}
                      </div>
                    </div>
                    <div className="rounded-xl border border-line bg-surface-sunken p-3">
                      <span className="text-2xs text-ink-muted font-medium">JH Groups Represented</span>
                      <div className="text-xl font-black text-ink-strong mt-0.5">
                        {uniqueJhGroups.length}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap justify-end gap-2">
                    {records.length > 0 && (
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => handleExportCompletions(viewingCompletionsOpl, records)}
                        className="text-2xs gap-1.5 border-blue-600/40 text-blue-700 font-semibold hover:bg-blue-700 hover:text-white"
                      >
                        <FileText size={13} /> Completed only
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => handleExportTrainingStatus(viewingCompletionsOpl)}
                      className="text-2xs gap-1.5 border-blue-600/40 text-blue-700 font-semibold hover:bg-blue-700 hover:text-white"
                    >
                      <FileText size={13} /> Full status (done + pending)
                    </Button>
                  </div>

                  {/* List / Table of trainees who completed */}
                  {records.length > 0 ? (
                    <div className="rounded-xl border border-line overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-surface-sunken border-b border-line text-ink-muted font-semibold text-2xs uppercase tracking-wider">
                            <th className="p-2.5">Trainee Name</th>
                            <th className="p-2.5">DMT</th>
                            <th className="p-2.5">JH Group</th>
                            <th className="p-2.5">Plant</th>
                            <th className="p-2.5">Date Completed</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                          {pageRecords.map((r) => (
                            <tr key={r.id} className="hover:bg-surface-hover/50 transition-colors">
                              <td className="p-2.5 font-semibold text-ink-strong">
                                {r.assigned_name || r.assigned_emp_id}
                                <span className="block text-2xs text-ink-muted font-normal">{r.assigned_emp_id}</span>
                              </td>
                              <td className="p-2.5 text-ink-subtle text-2xs">
                                {r.dmt_name || '—'}
                              </td>
                              <td className="p-2.5">
                                <span className="inline-flex items-center gap-1 text-2xs font-bold bg-blue-50/60 text-blue-700 px-2 py-0.5 rounded-md border border-blue-600/20">
                                  <Users size={11} /> {r.jh_group_name || 'Unassigned'}
                                </span>
                              </td>
                              <td className="p-2.5 text-ink-subtle text-2xs">
                                {r.plant_code || r.plant_name || '—'}
                              </td>
                              <td className="p-2.5 text-ink-subtle text-2xs">
                                {r.completed_at ? new Date(r.completed_at).toLocaleString() : 'Recent'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {completionsTotalPages > 1 && (
                        <div className="flex items-center justify-between gap-2 border-t border-line bg-surface-sunken px-3 py-2 text-2xs text-ink-muted">
                          <span>Showing <strong>{(completionsValidPage - 1) * COMPLETIONS_PAGE_SIZE + 1}</strong>–<strong>{Math.min(completionsValidPage * COMPLETIONS_PAGE_SIZE, records.length)}</strong> of <strong>{records.length}</strong></span>
                          <div className="flex items-center gap-1.5">
                            <Button variant="outline" size="xs" className="h-7 px-2 text-2xs gap-1" disabled={completionsValidPage <= 1} onClick={() => setCompletionsPage(completionsValidPage - 1)}>
                              <ChevronLeft size={12} /> Prev
                            </Button>
                            <span className="px-1 font-semibold text-ink-strong">{completionsValidPage} / {completionsTotalPages}</span>
                            <Button variant="outline" size="xs" className="h-7 px-2 text-2xs gap-1" disabled={completionsValidPage >= completionsTotalPages} onClick={() => setCompletionsPage(completionsValidPage + 1)}>
                              Next <ChevronRight size={12} />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="py-8 text-center bg-surface-sunken rounded-xl border border-dashed border-line p-6 space-y-2">
                      <GraduationCap size={32} className="mx-auto text-ink-subtle opacity-50" />
                      <p className="text-xs font-semibold text-ink-strong">No training completions recorded yet</p>
                      <p className="text-2xs text-ink-muted max-w-sm mx-auto">
                        Trainees who read this lesson and click "Complete My Training" will be automatically logged here mapped against their JH Groups.
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="pt-2 border-t border-line flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setViewingCompletionsOpl(null)}
                className="text-xs"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Push Training Modal */}
      {pushModalOpen && pushTargetOpl && (
        <PushTrainingModal
          isOpen={pushModalOpen}
          onClose={() => {
            setPushModalOpen(false);
            setPushTargetOpl(null);
          }}
          opl={pushTargetOpl}
          currentEmpId={currentEmpId}
        />
      )}

      {/* Recurring Training Schedule Modal — opened from a lesson card */}
      {scheduleModalOpl && (
        <TrainingScheduleModal
          opl={scheduleModalOpl}
          existingSchedule={activeScheduleByOplId.get(String(scheduleModalOpl.opl_id)) || null}
          onClose={() => setScheduleModalOpl(null)}
        />
      )}
    </div>);
}

function PushTrainingModal({ isOpen, onClose, opl, currentEmpId }) {
  const [selectedGroupIds, setSelectedGroupIds] = useState([]);
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [jhGroups, setJhGroups] = useState([]);
  const [groupMembers, setGroupMembers] = useState([]);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const pushMutation = usePushOplTraining();

  // Member hand-picking is only available with exactly one group selected — picking
  // multiple groups always pushes to everyone in each of them.
  const singleGroupId = selectedGroupIds.length === 1 ? selectedGroupIds[0] : null;

  useEffect(() => {
    if (!isOpen) return;
    setIsLoadingGroups(true);
    api.getJhGroups().then((rows) => setJhGroups(rows || [])).catch(() => setJhGroups([])).finally(() => setIsLoadingGroups(false));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !singleGroupId) {
      setGroupMembers([]);
      setSelectedMembers([]);
      return;
    }
    setIsLoadingMembers(true);
    setSelectedMembers([]);
    api.getJhGroupsList(singleGroupId).then((rows) => setGroupMembers(rows || [])).catch(() => setGroupMembers([])).finally(() => setIsLoadingMembers(false));
  }, [isOpen, singleGroupId]);

  if (!isOpen || !opl) return null;

  const toggleGroup = (groupId) => {
    setSelectedGroupIds(prev =>
      prev.includes(groupId) ? prev.filter(g => g !== groupId) : [...prev, groupId]
    );
  };

  const toggleMember = (empId) => {
    setSelectedMembers(prev =>
      prev.includes(empId) ? prev.filter(m => m !== empId) : [...prev, empId]
    );
  };

  const handleSelectAll = () => {
    if (selectedMembers.length === groupMembers.length) {
      setSelectedMembers([]);
    } else {
      setSelectedMembers(groupMembers.map(m => m.emp_id));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (selectedGroupIds.length === 0) {
      toast.error('Select at least one JH Group');
      return;
    }
    try {
      let totalPushed = 0;
      if (singleGroupId && selectedMembers.length > 0) {
        const res = await pushMutation.mutateAsync({
            opl_id: opl.opl_id, target_type: 'jh_group_members', jh_group_id: singleGroupId, emp_ids: selectedMembers
        });
        totalPushed += res.pushed;
      } else {
        for (const groupId of selectedGroupIds) {
          const res = await pushMutation.mutateAsync({ opl_id: opl.opl_id, target_type: 'jh_group', jh_group_id: groupId });
          totalPushed += res.pushed;
        }
      }
      toast.success(`Training for OPL #${opl.opl_id} pushed to ${totalPushed} ${totalPushed === 1 ? 'person' : 'people'} across ${selectedGroupIds.length} ${selectedGroupIds.length === 1 ? 'group' : 'groups'}.`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to push training');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-surface-raised p-5 shadow-xl border border-line space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700 font-bold">
              <Send size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-ink-strong">Push / Assign OPL Training</h3>
              <p className="text-2xs text-ink-muted">Assign lesson to JH Groups or specific team members</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-ink-muted hover:bg-surface-sunken hover:text-ink-strong">
            <X size={18} />
          </button>
        </div>

        <div className="rounded-xl border border-line bg-surface-sunken p-3 space-y-1">
          <div className="flex items-center justify-between text-2xs font-semibold text-ink-muted">
            <span>OPL ID: #{opl.opl_id}</span>
            <span className="text-blue-700 font-bold">{opl.classification || 'Basic Condition'}</span>
          </div>
          <p className="text-xs font-bold text-ink-strong">{opl.title}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Target Group Selection — multi-select */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-ink-strong flex items-center gap-1.5">
              <Users size={14} className="text-blue-700" /> Select Target JH Group(s)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto p-2 rounded-xl border border-line bg-surface-sunken">
              {isLoadingGroups ? (
                <p className="text-2xs text-ink-muted col-span-2 text-center py-2">Loading groups...</p>
              ) : jhGroups.length === 0 ? (
                <p className="text-2xs text-ink-muted col-span-2 text-center py-2">No JH Groups found.</p>
              ) : jhGroups.map((g) => {
                const isChecked = selectedGroupIds.includes(g.id);
                return (
                  <label
                    key={g.id}
                    className={`flex items-center gap-2 p-2 rounded-lg border text-2xs cursor-pointer transition-all ${
                      isChecked
                        ? 'bg-blue-50/60 border-blue-600/40 font-semibold text-ink-strong'
                        : 'bg-surface-base border-line text-ink-muted hover:border-blue-600/30'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleGroup(g.id)}
                      className="rounded border-line text-blue-700 focus:ring-blue-700 h-3.5 w-3.5"
                    />
                    <span className="truncate">{g.name}</span>
                  </label>
                );
              })}
            </div>
            {selectedGroupIds.length > 1 && (
              <p className="text-2xs text-ink-muted">Multiple groups selected — training will be pushed to every member of each group. Select a single group to hand-pick specific members.</p>
            )}
          </div>

          {/* Select Specific Members — only when exactly one group is selected */}
          {singleGroupId && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-ink-strong flex items-center gap-1.5">
                  <User size={14} className="text-blue-700" /> Assign to Specific Members (leave blank for whole group)
                </label>
                {groupMembers.length > 0 && (
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="text-2xs font-semibold text-blue-700 hover:underline"
                  >
                    {selectedMembers.length === groupMembers.length ? 'Deselect All' : 'Select All'}
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto p-2 rounded-xl border border-line bg-surface-sunken">
                {isLoadingMembers ? (
                  <p className="text-2xs text-ink-muted col-span-2 text-center py-2">Loading members...</p>
                ) : groupMembers.length === 0 ? (
                  <p className="text-2xs text-ink-muted col-span-2 text-center py-2">No members in this group.</p>
                ) : groupMembers.map((m) => {
                  const isChecked = selectedMembers.includes(m.emp_id);
                  return (
                    <label
                      key={m.emp_id}
                      className={`flex items-center gap-2 p-2 rounded-lg border text-2xs cursor-pointer transition-all ${
                        isChecked
                          ? 'bg-blue-50/60 border-blue-600/40 font-semibold text-ink-strong'
                          : 'bg-surface-base border-line text-ink-muted hover:border-blue-600/30'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleMember(m.emp_id)}
                        className="rounded border-line text-blue-700 focus:ring-blue-700 h-3.5 w-3.5"
                      />
                      <div className="truncate">
                        <p className="font-semibold truncate">{m.worker_name || m.emp_id}</p>
                        <p className="text-2xs text-ink-subtle truncate">{m.emp_id}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-line">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pushMutation.isPending} className="bg-blue-600 text-white font-semibold gap-1.5">
              <Send size={14} /> {pushMutation.isPending ? 'Pushing...' : 'Push Training'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Recurring training schedules — shared status/manage view for incharges. Schedules are
// created per-OPL from each lesson card's "Schedule" button, not from here.
function RecurringTrainingPanel({ schedules }) {
  const [open, setOpen] = useState(false);
  const updateMutation = useUpdateOplTrainingSchedule();
  const deleteMutation = useDeleteOplTrainingSchedule();
  const runMutation = useRunOplTrainingSchedule();
  const [intervalDrafts, setIntervalDrafts] = useState({});

  const commitInterval = (s) => {
    const raw = intervalDrafts[s.id];
    if (raw === undefined) return;
    const n = Math.round(Number(raw));
    setIntervalDrafts((d) => { const next = { ...d }; delete next[s.id]; return next; });
    if (!Number.isFinite(n) || n < 1 || n > 3650 || n === s.interval_days) return;
    updateMutation.mutate({ id: s.id, interval_days: n }, {
      onSuccess: () => toast.success(`Now every ${n} days`),
      onError: () => toast.error('Failed to update interval'),
    });
  };

  const list = schedules || [];
  const activeCount = list.filter((s) => s.is_active).length;

  return (
    <div className="rounded-xl border border-line bg-surface-raised shadow-xs">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 p-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-ink-strong">
          <Clock size={15} className="text-blue-700" />
          Recurring Training Schedules
          {activeCount > 0 && (
            <span className="rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 text-2xs font-bold">
              {activeCount} active
            </span>
          )}
        </span>
        {open ? <ChevronDown size={16} className="text-ink-muted" /> : <ChevronRight size={16} className="text-ink-muted" />}
      </button>

      {open && (
        <div className="border-t border-line p-3 space-y-3">
          <p className="text-2xs text-ink-muted">
            Every incharge can pause, resume, run, or stop any schedule. To add one, use the <strong>Schedule</strong> button on a lesson below.
          </p>

          {list.length === 0 ? (
            <p className="text-2xs text-ink-muted italic py-3 text-center">No recurring training schedules yet.</p>
          ) : (
            <div className="space-y-2">
              {list.map((s) => (
                <div
                  key={s.id}
                  className={`rounded-lg border p-3 text-2xs ${s.is_active ? 'border-line bg-surface-base' : 'border-line/60 bg-surface-sunken opacity-80'}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 space-y-0.5">
                      <p className="font-semibold text-ink-strong flex items-center gap-1.5 flex-wrap">
                        {s.opl_is_star && <Star size={12} className="fill-amber-400 text-amber-500 shrink-0" />}
                        <span className="truncate">OPL #{s.opl_id} — {s.opl_title || '(deleted OPL)'}</span>
                        {s.opl_status !== 'approved' && <span className="text-danger-fg font-normal">(no longer approved)</span>}
                      </p>
                      <p className="text-ink-muted flex items-center gap-1 flex-wrap">
                        <span className="flex items-center gap-1">
                          Every
                          <input
                            type="number"
                            min={1}
                            max={3650}
                            value={intervalDrafts[s.id] ?? s.interval_days}
                            onChange={(e) => setIntervalDrafts((d) => ({ ...d, [s.id]: e.target.value }))}
                            onBlur={() => commitInterval(s)}
                            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                            className="w-14 rounded border border-line bg-surface-base px-1 py-0.5 text-2xs text-ink-strong text-center focus:outline-none focus:ring-1 focus:ring-blue-700"
                          />
                          days
                        </span>
                        · {(s.target_group_names || []).join(', ') || 'no groups'}
                        {s.target_emp_ids?.length > 0 && ` · ${s.target_emp_ids.length} specific member(s)`}
                      </p>
                      <p className="text-ink-subtle">
                        {s.is_active ? `Next push: ${s.next_due}` : `Paused${s.paused_by_name ? ` by ${s.paused_by_name}` : ''}`}
                        {s.last_run && ` · Last: ${new Date(s.last_run.run_at).toLocaleDateString()} (${s.last_run.assigned_count} assigned)`}
                        {` · created by ${s.created_by_name || s.created_by_emp_id}`}
                      </p>
                      {!s.is_active && s.pause_reason && <p className="text-ink-subtle italic">“{s.pause_reason}”</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="xs"
                        variant="outline"
                        className="h-7 px-2 text-2xs gap-1"
                        disabled={runMutation.isPending}
                        onClick={() => runMutation.mutate(s.id, {
                          onSuccess: (r) => toast.success(`Training pushed to ${r.assigned} ${r.assigned === 1 ? 'person' : 'people'}`),
                          onError: () => toast.error('Run failed'),
                        })}
                      >
                        <Play size={11} /> Run now
                      </Button>
                      <Button
                        size="xs"
                        variant="outline"
                        className="h-7 px-2 text-2xs gap-1"
                        onClick={() => updateMutation.mutate({ id: s.id, is_active: !s.is_active }, {
                          onSuccess: () => toast.success(s.is_active ? 'Schedule paused' : 'Schedule resumed'),
                          onError: () => toast.error('Failed to update schedule'),
                        })}
                      >
                        <PauseCircle size={11} /> {s.is_active ? 'Pause' : 'Resume'}
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        className="h-7 px-2 text-2xs gap-1 text-danger-fg hover:text-danger-fg"
                        onClick={() => {
                          if (window.confirm('Delete this recurring schedule? Training already assigned stays untouched.')) {
                            deleteMutation.mutate(s.id, {
                              onSuccess: () => toast.success('Schedule deleted'),
                              onError: () => toast.error('Failed to delete'),
                            });
                          }
                        }}
                      >
                        <Trash2 size={11} /> Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TrainingScheduleModal({ opl, existingSchedule, onClose }) {
  const createMutation = useCreateOplTrainingSchedule();
  const updateMutation = useUpdateOplTrainingSchedule();
  const { data: orgData } = useOrgStructure();
  const isEdit = Boolean(existingSchedule);
  const [intervalDays, setIntervalDays] = useState(existingSchedule?.interval_days ?? 30);
  const [groupIds, setGroupIds] = useState(() => (existingSchedule?.target_jh_group_ids || []).map(String));
  const [memberIds, setMemberIds] = useState(() => (existingSchedule?.target_emp_ids || []).map(String));
  const [membersByGroup, setMembersByGroup] = useState({});
  const [membersOpen, setMembersOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [endDate, setEndDate] = useState(existingSchedule?.end_date || '');

  // JH groups organised under their DMT (module group), plus an "Other" bucket.
  const dmtSections = useMemo(() => {
    const groups = orgData?.groups || [];
    const jhGroups = orgData?.jhGroups || [];
    const sections = groups.map((g) => ({
      id: g.id,
      name: g.module || g.code || g.name || `DMT ${g.id}`,
      jhGroups: jhGroups.filter((jh) => String(jh.module_group_id) === String(g.id) || String(jh.dmt_id) === String(g.id)),
    })).filter((s) => s.jhGroups.length > 0);
    const claimed = new Set(sections.flatMap((s) => s.jhGroups.map((jh) => String(jh.id))));
    const orphans = jhGroups.filter((jh) => !claimed.has(String(jh.id)));
    if (orphans.length) sections.push({ id: '__other__', name: 'Other', jhGroups: orphans });
    return sections;
  }, [orgData]);

  // Members of every currently-selected group (deduped) — the "specific people" dropdown.
  useEffect(() => {
    const missing = groupIds.filter((id) => !(id in membersByGroup));
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(missing.map((id) => api.getJhGroupsList(id).then((r) => [id, r || []]).catch(() => [id, []])))
      .then((pairs) => { if (!cancelled) setMembersByGroup((prev) => ({ ...prev, ...Object.fromEntries(pairs) })); });
    return () => { cancelled = true; };
  }, [groupIds, membersByGroup]);

  const selectedGroupMembers = useMemo(() => {
    const seen = new Set();
    const out = [];
    groupIds.forEach((gid) => {
      (membersByGroup[gid] || []).forEach((m) => {
        if (!m.emp_id || seen.has(String(m.emp_id))) return;
        seen.add(String(m.emp_id));
        out.push(m);
      });
    });
    return out;
  }, [groupIds, membersByGroup]);

  const toggleGroup = (id) => setGroupIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const toggleMember = (id) => setMemberIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const submit = async (e) => {
    e.preventDefault();
    if (groupIds.length === 0) return toast.error('Pick at least one JH group');
    const n = Math.round(Number(intervalDays));
    if (!Number.isFinite(n) || n < 1 || n > 3650) return toast.error('Enter a number of days between 1 and 3650');
    // Keep only picked members that still belong to a selected group.
    const validMemberIds = memberIds.filter((id) => selectedGroupMembers.some((m) => String(m.emp_id) === id));
    const payload = {
      interval_days: n,
      target_jh_group_ids: groupIds,
      target_emp_ids: validMemberIds,
      end_date: endDate || null,
    };
    try {
      if (isEdit) {
        await updateMutation.mutateAsync({ id: existingSchedule.id, ...payload });
        toast.success('Schedule updated');
      } else {
        await createMutation.mutateAsync({ opl_id: Number(opl.opl_id), ...payload });
        toast.success('Recurring training schedule created');
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save schedule');
    }
  };

  const busy = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs" onClick={onClose}>
      <div
        className="w-full max-w-3xl rounded-2xl bg-surface-raised p-5 shadow-xl border border-line space-y-4 max-h-[92vh] overflow-y-auto text-xs"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-ink-strong flex items-center gap-2">
              <Clock size={16} className="text-blue-700" /> {isEdit ? 'Edit Recurring Training' : 'Recurring Training'}
            </h3>
            <p className="text-2xs text-ink-muted truncate mt-0.5">
              {opl.is_star ? '★ ' : ''}OPL #{opl.opl_id} — {opl.title}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-ink-muted hover:text-ink-strong shrink-0">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block font-semibold text-ink-strong mb-1">Repeat every</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={3650}
                value={intervalDays}
                onChange={(e) => setIntervalDays(e.target.value)}
                className="w-20 rounded-lg border border-line bg-surface-base px-2.5 py-1.5 text-center"
              />
              <span className="text-ink-muted">days</span>
              <div className="flex gap-1">
                {[7, 14, 30, 60, 90].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setIntervalDays(d)}
                    className={`px-2 py-1 rounded-md text-2xs font-semibold border ${Number(intervalDays) === d ? 'bg-blue-600 text-white border-blue-600' : 'bg-surface-base border-line text-ink-muted hover:text-ink-strong'}`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block font-semibold text-ink-strong flex items-center gap-1.5">
              <Users size={14} className="text-blue-700" /> Target JH Groups
              {groupIds.length > 0 && <span className="text-2xs font-normal text-ink-muted">({groupIds.length} selected)</span>}
            </label>
            <div className="max-h-52 overflow-y-auto p-2 rounded-xl border border-line bg-surface-sunken space-y-2">
              {dmtSections.length === 0 ? (
                <p className="text-2xs text-ink-muted text-center py-2">No JH groups found.</p>
              ) : dmtSections.map((sec) => (
                <div key={sec.id}>
                  <p className="text-2xs font-bold uppercase tracking-wide text-ink-subtle px-1 pb-1">{sec.name}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {sec.jhGroups.map((g) => {
                      const on = groupIds.includes(String(g.id));
                      return (
                        <label
                          key={g.id}
                          className={`flex items-center gap-2 p-2 rounded-lg border text-2xs cursor-pointer ${on ? 'bg-blue-50/60 border-blue-600/40 font-semibold text-ink-strong' : 'bg-surface-base border-line text-ink-muted'}`}
                        >
                          <input type="checkbox" checked={on} onChange={() => toggleGroup(String(g.id))} className="h-3.5 w-3.5" />
                          <span className="truncate">{g.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {groupIds.length > 0 && (
            <div className="space-y-1.5">
              <label className="block font-semibold text-ink-strong flex items-center gap-1.5">
                <User size={14} className="text-blue-700" /> Specific people
                <span className="text-2xs font-normal text-ink-muted">(leave empty = everyone in the selected groups)</span>
              </label>
              <button
                type="button"
                onClick={() => setMembersOpen((o) => !o)}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-surface-base px-3 py-2 text-2xs text-ink-strong"
              >
                <span>
                  {memberIds.filter((id) => selectedGroupMembers.some((m) => String(m.emp_id) === id)).length > 0
                    ? `${memberIds.filter((id) => selectedGroupMembers.some((m) => String(m.emp_id) === id)).length} of ${selectedGroupMembers.length} people`
                    : `Everyone (${selectedGroupMembers.length} people)`}
                </span>
                {membersOpen ? <ChevronDown size={14} className="text-ink-muted" /> : <ChevronRight size={14} className="text-ink-muted" />}
              </button>
              {membersOpen && (
                <div className="rounded-xl border border-line bg-surface-sunken p-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      placeholder="Search name or ID…"
                      className="flex-1 rounded-lg border border-line bg-surface-base px-2.5 py-1.5 text-2xs"
                    />
                    <button
                      type="button"
                      onClick={() => setMemberIds(memberIds.length === selectedGroupMembers.length ? [] : selectedGroupMembers.map((m) => String(m.emp_id)))}
                      className="text-2xs font-semibold text-blue-700 hover:underline shrink-0"
                    >
                      {memberIds.length === selectedGroupMembers.length && selectedGroupMembers.length > 0 ? 'Clear all' : 'Select all'}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-44 overflow-y-auto">
                    {selectedGroupMembers.length === 0 ? (
                      <p className="text-2xs text-ink-muted col-span-2 text-center py-2">No members in the selected groups.</p>
                    ) : selectedGroupMembers
                      .filter((m) => {
                        const q = memberSearch.trim().toLowerCase();
                        if (!q) return true;
                        return String(m.worker_name || '').toLowerCase().includes(q) || String(m.emp_id).toLowerCase().includes(q);
                      })
                      .map((m) => {
                        const on = memberIds.includes(String(m.emp_id));
                        return (
                          <label
                            key={m.emp_id}
                            className={`flex items-center gap-2 p-2 rounded-lg border text-2xs cursor-pointer ${on ? 'bg-blue-50/60 border-blue-600/40 font-semibold text-ink-strong' : 'bg-surface-base border-line text-ink-muted'}`}
                          >
                            <input type="checkbox" checked={on} onChange={() => toggleMember(String(m.emp_id))} className="h-3.5 w-3.5" />
                            <span className="truncate">{m.worker_name || m.emp_id}<span className="text-2xs text-ink-subtle ml-1">{m.emp_id}</span></span>
                          </label>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block font-semibold text-ink-strong mb-1">End date (optional)</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full sm:w-56 rounded-lg border border-line bg-surface-base px-2.5 py-1.5" />
            <p className="text-2xs text-ink-muted mt-1">First push goes out {isEdit ? 'on the schedule’s existing start date' : 'today'}; leave the end date blank to keep repeating.</p>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-line">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button type="submit" size="sm" disabled={busy} className="bg-blue-600 text-white font-semibold">
              {busy ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Schedule'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

const ANALYTICS_CHART_GRID = '#F0EFEE';
const ANALYTICS_CHART_AXIS = '#A8A29E';
// Varied per-bar colors, cycled by index — distinguishes DMTs/groups from one another
// instead of one flat color for every bar.
const ANALYTICS_CHART_PALETTE = ['#B45309', '#0E7490', '#7C3AED', '#B91C1C', '#15803D', '#C2410C', '#1D4ED8', '#A16207'];

// Pie slice labels drawn OUTSIDE the ring (recharts' default) get clipped by the container
// edge whenever a slice is near 0% or 100% — most visibly a single 100% slice, whose label
// angle degenerates and lands off-canvas. Drawing the label INSIDE the ring instead avoids
// this entirely, since it's always within outerRadius regardless of slice size.
function renderInsidePieLabel(formatValue) {
  return ({ cx, cy, midAngle, innerRadius, outerRadius, percent, value }) => {
    if (!percent) return null;
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.6;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
      <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700}>
        {formatValue({ percent, value })}
      </text>
    );
  };
}
const renderPctLabel = renderInsidePieLabel(({ percent }) => `${Math.round(percent * 100)}%`);
const renderValueLabel = renderInsidePieLabel(({ value }) => value);

// toISOString() converts to UTC, which rolls the date back a day in timezones ahead of
// UTC (e.g. IST, +5:30) — format using local date parts instead to avoid that.
function formatLocalDate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const CARD_ACCENTS = {
  blue: { chip: 'text-blue-700 bg-blue-50 border-blue-100', bar: 'bg-blue-500' },
  emerald: { chip: 'text-emerald-700 bg-emerald-50 border-emerald-100', bar: 'bg-emerald-500' },
  violet: { chip: 'text-violet-700 bg-violet-50 border-violet-100', bar: 'bg-violet-500' },
  amber: { chip: 'text-amber-700 bg-amber-50 border-amber-100', bar: 'bg-amber-500' },
};

function TeamStatCard({ label, value, sub, icon: Icon, accent = 'blue', progress }) {
  const a = CARD_ACCENTS[accent] || CARD_ACCENTS.blue;
  const pct = typeof progress === 'number' ? Math.max(0, Math.min(100, progress)) : null;
  return (
    <div className="rounded-xl border border-line bg-surface-raised p-3.5 shadow-xs transition-shadow hover:shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs text-ink-muted font-medium">{label}</span>
        {Icon && (
          <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border ${a.chip}`}>
            <Icon size={15} />
          </span>
        )}
      </div>
      <div className="mt-1.5 text-2xl font-black text-ink-strong leading-none tabular-nums">{value}</div>
      {sub && <span className="mt-1 block text-2xs text-ink-subtle">{sub}</span>}
      {pct != null && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
          <div className={`h-full rounded-full ${a.bar} transition-[width] duration-500`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

// The two leaderboards ("top" and "needs a nudge") folded into one table with a filter toggle.
function TeamRankingCard({ view, onView, rows }) {
  return (
    <div className="rounded-xl border border-line bg-surface-raised overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-3">
        <p className="text-sm font-bold text-ink-strong flex items-center gap-1.5">
          <Trophy size={14} className="text-amber-600" /> Member ranking
        </p>
        <div className="inline-flex rounded-lg border border-line bg-surface-base p-0.5 text-2xs font-semibold">
          <button
            type="button"
            onClick={() => onView('top')}
            className={`px-2.5 py-1 rounded-md inline-flex items-center gap-1 ${view === 'top' ? 'bg-blue-600 text-white' : 'text-ink-muted hover:text-ink-strong'}`}
          >
            <TrendingUp size={11} /> Top submitters
          </button>
          <button
            type="button"
            onClick={() => onView('low')}
            className={`px-2.5 py-1 rounded-md inline-flex items-center gap-1 ${view === 'low' ? 'bg-blue-600 text-white' : 'text-ink-muted hover:text-ink-strong'}`}
          >
            <TrendingDown size={11} /> Needs a nudge
          </button>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="p-3 text-xs text-ink-muted italic">
          {view === 'top' ? 'No submissions in this period.' : 'No members.'}
        </p>
      ) : (
        <div>
        <table className="w-full table-fixed text-left text-xs border-collapse">
          <thead>
            <tr className="bg-surface-sunken border-b border-line text-ink-muted font-semibold uppercase tracking-wide text-2xs [&_th]:whitespace-normal">
              <th className="p-2 w-7 text-center">#</th>
              <th className="p-2">Member</th>
              <th className="p-2 w-14 text-center">OPL's</th>
              <th className="p-2 w-16 text-center">Appr.</th>
              <th className="p-2 w-14 text-center">Critical</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60">
            {rows.map((m, i) => (
              <tr key={m.emp_id} className="hover:bg-surface-hover/40">
                <td className="p-2 text-center text-ink-subtle font-semibold tabular-nums">{i + 1}</td>
                <td className="p-2 font-semibold text-ink-strong truncate">{m.name}</td>
                <td className="p-2 text-center font-bold text-blue-700 tabular-nums">{m.opl_submitted}</td>
                <td className="p-2 text-center tabular-nums text-ink-subtle">{m.opl_approved}</td>
                <td className="p-2 text-center tabular-nums">
                  {m.opl_critical > 0 ? (
                    <span className="inline-flex items-center gap-0.5 text-amber-600 font-semibold">
                      <Star size={11} className="fill-amber-400 text-amber-500" />{m.opl_critical}
                    </span>
                  ) : <span className="text-ink-subtle">0</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}

// JH-group-scoped analytics for a group's leader / routing reviewer. Access & scope are
// enforced server-side (GET /api/opl-analytics/jh-group) — a removed incharge 403s and the
// tab that renders this disappears.
function MyTeamAnalyticsTab() {
  const _now = new Date();
  const [groupId, setGroupId] = useState(null);
  const [from, setFrom] = useState(formatLocalDate(new Date(_now.getFullYear(), _now.getMonth(), 1)));
  const [to, setTo] = useState(formatLocalDate(_now));
  const [expanded, setExpanded] = useState(null);
  const [memberPage, setMemberPage] = useState(1);
  const [memberSort, setMemberSort] = useState('opl_desc');
  const [leaderView, setLeaderView] = useState('top');
  const [lessonPage, setLessonPage] = useState(1);
  const [remindSel, setRemindSel] = useState({}); // { [empId]: oplId[] }
  const remind = useRemindTraining();
  // Fewer rows per page on a phone (cards are tall), more on a wide screen.
  const [isNarrow, setIsNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const onChange = (e) => { setIsNarrow(e.matches); setMemberPage(1); };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const MEMBER_PAGE_SIZE = isNarrow ? 3 : 5;
  const LESSON_PAGE_SIZE = 5;

  useEffect(() => { setLessonPage(1); }, [expanded]);

  // Longest-pending first, then completed lessons (most recent first).
  const orderedTrainings = (m) => {
    const pending = m.trainings.filter((t) => t.status === 'assigned')
      .sort((a, b) => new Date(a.assigned_at || 0) - new Date(b.assigned_at || 0));
    const done = m.trainings.filter((t) => t.status !== 'assigned')
      .sort((a, b) => new Date(b.completed_at || 0) - new Date(a.completed_at || 0));
    return [...pending, ...done];
  };
  const toggleRemindSel = (empId, oplId) => setRemindSel((prev) => {
    const cur = new Set((prev[empId] || []).map(String));
    const k = String(oplId);
    if (cur.has(k)) cur.delete(k); else cur.add(k);
    return { ...prev, [empId]: [...cur] };
  });
  const setAllPendingSel = (m, on) => setRemindSel((prev) => ({
    ...prev,
    [m.emp_id]: on ? m.trainings.filter((t) => t.status === 'assigned').map((t) => String(t.opl_id)) : [],
  }));
  const sendReminder = (empId, oplIds) => {
    const ids = oplIds.map(Number).filter(Boolean);
    if (ids.length === 0) return;
    remind.mutate({ emp_id: empId, opl_ids: ids }, {
      onSuccess: (r) => {
        toast.success(`Reminder sent for ${r.reminded} ${r.reminded === 1 ? 'lesson' : 'lessons'}`);
        setRemindSel((p) => ({ ...p, [empId]: [] }));
      },
      onError: (e) => toast.error(e?.message || 'Failed to send reminder'),
    });
  };
  const params = {};
  if (groupId) params.jh_group_id = groupId;
  if (from) params.from = new Date(`${from}T00:00:00`).toISOString();
  if (to) params.to = new Date(`${to}T23:59:59`).toISOString();
  const { data, isLoading } = useOplJhGroupAnalytics(params, true);

  const groups = data?.authorized_groups || [];
  const members = data?.members || [];
  const trainingLeft = (m) => Math.max(0, (m.training_assigned || 0) - (m.training_completed || 0));

  // Leaderboards always rank by OPL's submitted, regardless of the table's sort.
  const byOpl = useMemo(
    () => [...members].sort((a, b) => b.opl_submitted - a.opl_submitted || String(a.name).localeCompare(String(b.name))),
    [members]
  );
  const topSubmitters = byOpl.filter((m) => m.opl_submitted > 0).slice(0, 5);
  const lowSubmitters = [...byOpl].reverse().slice(0, 5);

  const SORTS = {
    opl_desc: { label: "Most OPL's submitted", fn: (a, b) => b.opl_submitted - a.opl_submitted },
    opl_asc: { label: "Fewest OPL's submitted", fn: (a, b) => a.opl_submitted - b.opl_submitted },
    left_desc: { label: 'Most trainings left', fn: (a, b) => trainingLeft(b) - trainingLeft(a) },
    completion_asc: { label: 'Lowest completion %', fn: (a, b) => (a.completion_pct ?? 101) - (b.completion_pct ?? 101) },
    critical_desc: { label: "Most critical OPL's", fn: (a, b) => b.opl_critical - a.opl_critical },
    name: { label: 'Name (A–Z)', fn: (a, b) => String(a.name).localeCompare(String(b.name)) },
  };
  const sorted = useMemo(
    () => [...members].sort((a, b) => (SORTS[memberSort] || SORTS.opl_desc).fn(a, b) || String(a.name).localeCompare(String(b.name))),
    [members, memberSort]
  );

  const memberTotalPages = Math.max(1, Math.ceil(sorted.length / MEMBER_PAGE_SIZE));
  const memberValidPage = Math.min(Math.max(memberPage, 1), memberTotalPages);
  const pagedMembers = sorted.slice((memberValidPage - 1) * MEMBER_PAGE_SIZE, memberValidPage * MEMBER_PAGE_SIZE);

  const groupLabel = data?.jh_group_name || 'team';
  const rangeLabel = from || to ? `${from || 'start'}_to_${to || 'today'}` : 'all-time';

  const downloadMemberSummary = () => {
    if (sorted.length === 0) return toast.error('Nothing to export');
    const rows = sorted.map((m) => ({
      'Member': m.name,
      'Employee ID': m.emp_id,
      'Active': m.is_active ? 'Yes' : 'No',
      "OPL's submitted": m.opl_submitted,
      'Approved': m.opl_approved,
      'Critical': m.opl_critical,
      'Trainings assigned': m.training_assigned,
      'Trainings completed': m.training_completed,
      'Completion %': m.completion_pct == null ? '' : m.completion_pct,
      'Unique lessons': m.unique_training_opls,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Team Summary');
    XLSX.writeFile(wb, `team_summary_${groupLabel}_${rangeLabel}.xlsx`.replace(/[^a-z0-9_.-]+/gi, '_'));
  };

  const downloadTrainingStatus = () => {
    const rows = [];
    sorted.forEach((m) => {
      (m.trainings || []).forEach((t) => {
        rows.push({
          'Member': m.name,
          'Employee ID': m.emp_id,
          'OPL #': t.opl_id,
          'Lesson': t.title,
          'Critical': t.is_star ? 'Yes' : 'No',
          'Status': t.status === 'completed' ? 'Completed' : 'Pending',
          'Assigned on': t.assigned_at ? new Date(t.assigned_at).toLocaleDateString() : '',
          'Completed on': t.completed_at ? new Date(t.completed_at).toLocaleString() : '',
        });
      });
    });
    if (rows.length === 0) return toast.error('No training records to export');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Training Status');
    XLSX.writeFile(wb, `team_training_status_${groupLabel}.xlsx`.replace(/[^a-z0-9_.-]+/gi, '_'));
  };

  return (
    <div className="space-y-4 py-4">
      <div className="flex flex-wrap items-center gap-3 bg-surface-raised p-3 rounded-xl border border-line shadow-xs text-xs">
        {groups.length > 1 && (
          <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/60 px-2 py-1.5">
            <Users size={13} className="text-blue-600 shrink-0" />
            <div className="flex flex-col leading-tight">
              <span className="text-2xs uppercase tracking-wider text-blue-700/80 font-semibold">
                Group ({groups.length} you're in charge of)
              </span>
              <select
                value={groupId ?? data?.jh_group_id ?? ''}
                onChange={(e) => setGroupId(e.target.value)}
                className="-ml-0.5 bg-transparent font-bold text-ink-strong focus:outline-none"
              >
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <span className="text-ink-muted">From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-line bg-surface-base px-2 py-1" />
          <span className="text-ink-muted">to</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-line bg-surface-base px-2 py-1" />
        </div>
        <div className="flex items-center gap-1">
          {(() => {
            const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const now = new Date();
            const presets = [
              { label: 'This month', f: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), t: ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0)) },
              { label: 'Last month', f: ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)), t: ymd(new Date(now.getFullYear(), now.getMonth(), 0)) },
              { label: 'This year', f: ymd(new Date(now.getFullYear(), 0, 1)), t: ymd(new Date(now.getFullYear(), 11, 31)) },
            ];
            return presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => { setFrom(p.f); setTo(p.t); }}
                className={`px-2 py-1 rounded-md text-2xs font-semibold border ${from === p.f && to === p.t ? 'bg-blue-600 text-white border-blue-600' : 'bg-surface-base border-line text-ink-muted hover:text-ink-strong'}`}
              >
                {p.label}
              </button>
            ));
          })()}
          <button
            type="button"
            onClick={() => { setFrom(''); setTo(''); }}
            className={`px-2 py-1 rounded-md text-2xs font-semibold border ${!from && !to ? 'bg-blue-600 text-white border-blue-600' : 'bg-surface-base border-line text-ink-muted hover:text-ink-strong'}`}
          >
            All time
          </button>
        </div>
        <span className="text-xs text-ink-muted ml-auto font-semibold">{data?.jh_group_name}</span>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="xs" className="gap-1.5 text-2xs" onClick={downloadMemberSummary}>
            <FileText size={13} /> Team summary
          </Button>
          <Button variant="outline" size="xs" className="gap-1.5 text-2xs" onClick={downloadTrainingStatus}>
            <FileText size={13} /> Training status
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-ink-muted py-6 text-center">Loading team analytics…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <TeamStatCard label="Members" value={data?.member_count ?? 0} icon={Users} accent="blue" />
            <TeamStatCard label="Participation" value={`${data?.participation_pct ?? 0}%`} sub="submitted ≥1 OPL's" icon={TrendingUp} accent="emerald" progress={data?.participation_pct ?? 0} />
            <TeamStatCard label="OPL's submitted" value={data?.total_opl_submitted ?? 0} sub={`${data?.total_opl_approved ?? 0} approved · ${data?.total_opl_critical ?? 0} critical`} icon={FileText} accent="violet" />
            <TeamStatCard label="Trainings done" value={`${data?.total_training_completed ?? 0} / ${data?.total_training_assigned ?? 0}`} sub="completed / assigned" icon={GraduationCap} accent="amber" progress={data?.total_training_assigned ? (data.total_training_completed / data.total_training_assigned) * 100 : 0} />
          </div>

          <TeamRankingCard view={leaderView} onView={setLeaderView} rows={leaderView === 'top' ? topSubmitters : lowSubmitters} />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-bold text-ink-strong">Team members</span>
            <label className="flex items-center gap-1.5 text-xs text-ink-muted">
              Sort by
              <select
                value={memberSort}
                onChange={(e) => { setMemberSort(e.target.value); setMemberPage(1); }}
                className="rounded-lg border border-line bg-surface-base px-2 py-1 text-xs font-semibold text-ink-strong"
              >
                {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </label>
          </div>

          <div className="rounded-xl border border-line">
            {/* Mobile: one card per member — the 8-column table side-scrolls on a phone (owner rejects that) */}
            <div className="sm:hidden divide-y divide-line">
              {members.length === 0 ? (
                <p className="p-4 text-center text-ink-muted text-sm">No members for this period.</p>
              ) : pagedMembers.map((m) => (
                <div key={m.emp_id} className="p-3 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink-strong text-sm break-words">
                        {m.name}
                        {!m.is_active && <span className="ml-1.5 text-2xs text-ink-subtle border border-line rounded px-1 align-middle">inactive</span>}
                      </p>
                      <p className="text-2xs text-ink-muted">{m.emp_id}</p>
                    </div>
                    {m.trainings.length > 0 && (
                      <button type="button" onClick={() => setExpanded(expanded === m.emp_id ? null : m.emp_id)} className="shrink-0 text-blue-700 font-semibold text-xs">
                        {expanded === m.emp_id ? 'Hide lessons' : 'Lessons'}
                      </button>
                    )}
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                    <div><dt className="text-ink-muted">OPL's (approved)</dt><dd className="font-semibold text-ink-strong text-sm">{m.opl_submitted} <span className="text-ink-subtle font-normal">({m.opl_approved})</span></dd></div>
                    <div><dt className="text-ink-muted">Critical</dt><dd className="font-semibold text-sm">{m.opl_critical > 0 ? <span className="inline-flex items-center gap-0.5 text-amber-600"><Star size={11} className="fill-amber-400 text-amber-500" />{m.opl_critical}</span> : <span className="text-ink-subtle">0</span>}</dd></div>
                    <div><dt className="text-ink-muted">Trainings done / assigned</dt><dd className="font-semibold text-ink-strong text-sm">{m.training_completed} / {m.training_assigned}</dd></div>
                    <div><dt className="text-ink-muted">Learning left</dt><dd className="font-semibold text-sm">{trainingLeft(m) > 0 ? <span className="text-amber-700">{trainingLeft(m)}</span> : <span className="text-emerald-600">0</span>}</dd></div>
                    <div><dt className="text-ink-muted">Completion</dt><dd className="font-semibold text-ink-strong text-sm">{m.completion_pct == null ? '—' : `${m.completion_pct}%`}</dd></div>
                    <div><dt className="text-ink-muted">Unique lessons</dt><dd className="font-semibold text-ink-strong text-sm">{m.unique_training_opls}</dd></div>
                  </dl>
                  {expanded === m.emp_id && m.trainings.length > 0 && (() => {
                    const allRows = orderedTrainings(m);
                    const pendingIds = allRows.filter((t) => t.status === 'assigned').map((t) => String(t.opl_id));
                    const sel = new Set((remindSel[m.emp_id] || []).map(String));
                    const selCount = pendingIds.filter((id) => sel.has(id)).length;
                    const lessonTotalPages = Math.max(1, Math.ceil(allRows.length / LESSON_PAGE_SIZE));
                    const lessonValidPage = Math.min(Math.max(lessonPage, 1), lessonTotalPages);
                    const pageRows = allRows.slice((lessonValidPage - 1) * LESSON_PAGE_SIZE, lessonValidPage * LESSON_PAGE_SIZE);
                    return (
                      <div className="rounded-lg border border-line bg-surface-sunken/40 p-2.5 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-2xs text-ink-muted">
                            {allRows.length} lesson{allRows.length === 1 ? '' : 's'}{pendingIds.length > 0 && ` · ${pendingIds.length} pending`} · longest-pending first
                          </span>
                          {pendingIds.length > 0 && (
                            <button type="button" onClick={() => setAllPendingSel(m, selCount !== pendingIds.length)} className="text-2xs font-semibold text-blue-700">
                              {selCount === pendingIds.length ? 'Clear all' : 'Select all pending'}
                            </button>
                          )}
                        </div>
                        {pendingIds.length > 0 && selCount > 0 && (
                          <button type="button" disabled={remind.isPending} onClick={() => sendReminder(m.emp_id, remindSel[m.emp_id] || [])}
                            className="inline-flex items-center gap-1 rounded-md border border-blue-600/40 bg-blue-50/60 px-2.5 py-1 text-2xs font-semibold text-blue-700 disabled:opacity-50">
                            <Bell size={12} /> Remind selected ({selCount})
                          </button>
                        )}
                        <div className="space-y-1.5">
                          {pageRows.map((t) => (
                            <div key={t.opl_id} className={`rounded-md border border-line bg-surface-base p-2 ${t.status === 'assigned' ? '' : 'opacity-70'}`}>
                              <div className="flex items-start gap-2">
                                {t.status === 'assigned' && (
                                  <input type="checkbox" className="mt-0.5 h-3.5 w-3.5 shrink-0" checked={sel.has(String(t.opl_id))} onChange={() => toggleRemindSel(m.emp_id, t.opl_id)} />
                                )}
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs text-ink-strong break-words">
                                    {t.is_star && <Star size={11} className="fill-amber-400 text-amber-500 inline mr-1 align-[-1px]" />}
                                    #{t.opl_id} {t.title}
                                  </p>
                                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-2xs text-ink-subtle">
                                    {t.status === 'completed' ? (
                                      <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold"><CheckCircle2 size={10} /> Done{t.completed_at ? ` · ${new Date(t.completed_at).toLocaleDateString()}` : ''}</span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 text-amber-700 font-semibold"><Clock size={10} /> Pending</span>
                                    )}
                                    {t.assigned_at && <span>assigned {new Date(t.assigned_at).toLocaleDateString()}</span>}
                                  </div>
                                </div>
                                {t.status === 'assigned' && (
                                  <button type="button" disabled={remind.isPending} onClick={() => sendReminder(m.emp_id, [t.opl_id])}
                                    className="shrink-0 inline-flex items-center gap-1 rounded-md border border-blue-600/40 px-2 py-0.5 text-2xs font-semibold text-blue-700 disabled:opacity-50">
                                    <Bell size={10} /> Remind
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                        {lessonTotalPages > 1 && (
                          <div className="flex items-center justify-between gap-2 text-2xs text-ink-muted pt-1">
                            <span>{(lessonValidPage - 1) * LESSON_PAGE_SIZE + 1}–{Math.min(lessonValidPage * LESSON_PAGE_SIZE, allRows.length)} of {allRows.length}</span>
                            <div className="flex items-center gap-1.5">
                              <button type="button" disabled={lessonValidPage <= 1} onClick={() => setLessonPage(lessonValidPage - 1)} className="rounded border border-line px-1.5 py-0.5 disabled:opacity-40">Prev</button>
                              <span className="font-semibold text-ink-strong">{lessonValidPage}/{lessonTotalPages}</span>
                              <button type="button" disabled={lessonValidPage >= lessonTotalPages} onClick={() => setLessonPage(lessonValidPage + 1)} className="rounded border border-line px-1.5 py-0.5 disabled:opacity-40">Next</button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              ))}
            </div>

            <div className="hidden sm:block">
            <table className="w-full table-fixed text-left text-sm border-collapse">
              <colgroup>
                <col className="w-[22%]" /><col className="w-[12%]" /><col className="w-[9%]" />
                <col className="w-[14%]" /><col className="w-[11%]" /><col className="w-[12%]" />
                <col className="w-[12%]" /><col className="w-[8%]" />
              </colgroup>
              <thead>
                <tr className="bg-surface-sunken border-b border-line text-ink-muted font-semibold text-2xs uppercase tracking-wide [&_th]:whitespace-normal [&_th]:leading-tight [&_th]:align-bottom">
                  <th className="px-2 py-2">Member</th>
                  <th className="px-2 py-2 text-center">OPL's<br />(appr.)</th>
                  <th className="px-2 py-2 text-center">Critical</th>
                  <th className="px-2 py-2 text-center">Trainings<br />done / assigned</th>
                  <th className="px-2 py-2 text-center">Learning<br />left</th>
                  <th className="px-2 py-2 text-center">Compl.</th>
                  <th className="px-2 py-2 text-center">Unique<br />lessons</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {members.length === 0 ? (
                  <tr><td colSpan={8} className="p-4 text-center text-ink-muted">No members for this period.</td></tr>
                ) : pagedMembers.map((m) => (
                  <Fragment key={m.emp_id}>
                    <tr className="hover:bg-surface-hover/40 align-top">
                      <td className="px-2 py-2.5 font-semibold text-ink-strong break-words">
                        {m.name}
                        {!m.is_active && <span className="ml-1.5 text-2xs text-ink-subtle border border-line rounded px-1 align-middle">inactive</span>}
                        <span className="block text-2xs text-ink-muted font-normal">{m.emp_id}</span>
                      </td>
                      <td className="px-2 py-2.5 text-center">{m.opl_submitted} <span className="text-ink-subtle">({m.opl_approved})</span></td>
                      <td className="px-2 py-2.5 text-center">
                        {m.opl_critical > 0 ? (
                          <span className="inline-flex items-center gap-0.5 text-amber-600 font-semibold"><Star size={11} className="fill-amber-400 text-amber-500" />{m.opl_critical}</span>
                        ) : <span className="text-ink-subtle">0</span>}
                      </td>
                      <td className="px-2 py-2.5 text-center">{m.training_completed} / {m.training_assigned}</td>
                      <td className="px-2 py-2.5 text-center">
                        {trainingLeft(m) > 0 ? <span className="font-semibold text-amber-700">{trainingLeft(m)}</span> : <span className="text-emerald-600">0</span>}
                      </td>
                      <td className="px-2 py-2.5 text-center">{m.completion_pct == null ? '—' : `${m.completion_pct}%`}</td>
                      <td className="px-2 py-2.5 text-center">{m.unique_training_opls}</td>
                      <td className="px-2 py-2.5 text-right">
                        {m.trainings.length > 0 && (
                          <button type="button" onClick={() => setExpanded(expanded === m.emp_id ? null : m.emp_id)} className="text-blue-700 font-semibold text-2xs">
                            {expanded === m.emp_id ? 'Hide' : 'Lessons'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {expanded === m.emp_id && (() => {
                      const allRows = orderedTrainings(m);
                      const pendingIds = allRows.filter((t) => t.status === 'assigned').map((t) => String(t.opl_id));
                      const sel = new Set((remindSel[m.emp_id] || []).map(String));
                      const selCount = pendingIds.filter((id) => sel.has(id)).length;
                      const lessonTotalPages = Math.max(1, Math.ceil(allRows.length / LESSON_PAGE_SIZE));
                      const lessonValidPage = Math.min(Math.max(lessonPage, 1), lessonTotalPages);
                      const pageRows = allRows.slice((lessonValidPage - 1) * LESSON_PAGE_SIZE, lessonValidPage * LESSON_PAGE_SIZE);
                      return (
                        <tr className="bg-surface-sunken/40">
                          <td colSpan={8} className="p-2.5">
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                              <span className="text-xs text-ink-muted">
                                {allRows.length} lesson{allRows.length === 1 ? '' : 's'}
                                {pendingIds.length > 0 && ` · ${pendingIds.length} pending`}
                                <span className="text-2xs"> · longest-pending first</span>
                              </span>
                              {pendingIds.length > 0 && (
                                <div className="flex items-center gap-2">
                                  <button type="button" onClick={() => setAllPendingSel(m, selCount !== pendingIds.length)} className="text-xs font-semibold text-blue-700 hover:underline">
                                    {selCount === pendingIds.length ? 'Clear all' : 'Select all pending'}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={remind.isPending || selCount === 0}
                                    onClick={() => sendReminder(m.emp_id, remindSel[m.emp_id] || [])}
                                    className="inline-flex items-center gap-1 rounded-md border border-blue-600/40 bg-blue-50/60 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-700 hover:text-white disabled:opacity-50"
                                  >
                                    <Bell size={12} /> Remind selected{selCount > 0 ? ` (${selCount})` : ''}
                                  </button>
                                </div>
                              )}
                            </div>
                            <div className="rounded-lg border border-line overflow-x-auto">
                              <table className="w-full min-w-[560px] text-left text-xs border-collapse">
                                <thead>
                                  <tr className="bg-surface-sunken border-b border-line text-ink-muted font-semibold uppercase tracking-wider">
                                    <th className="p-2 w-6" />
                                    <th className="p-2">Lesson</th>
                                    <th className="p-2 w-24 text-center">Status</th>
                                    <th className="p-2 w-28 text-center">Assigned</th>
                                    <th className="p-2 w-28 text-center">Completed on</th>
                                    <th className="p-2 w-20 text-right">Action</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-line">
                                  {pageRows.map((t) => (
                                    <tr key={t.opl_id} className={t.status === 'assigned' ? '' : 'opacity-70'}>
                                      <td className="p-2 text-center">
                                        {t.status === 'assigned' && (
                                          <input
                                            type="checkbox"
                                            className="h-3.5 w-3.5"
                                            checked={sel.has(String(t.opl_id))}
                                            onChange={() => toggleRemindSel(m.emp_id, t.opl_id)}
                                          />
                                        )}
                                      </td>
                                      <td className="p-2 text-ink-strong text-sm">
                                        {t.is_star && <Star size={11} className="fill-amber-400 text-amber-500 inline mr-1 align-[-1px]" />}
                                        #{t.opl_id} {t.title}
                                      </td>
                                      <td className="p-2 text-center">
                                        {t.status === 'completed' ? (
                                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 px-1.5 py-0.5 font-semibold">
                                            <CheckCircle2 size={10} /> Done
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 border border-amber-200 text-amber-800 px-1.5 py-0.5 font-semibold">
                                            <Clock size={10} /> Pending
                                          </span>
                                        )}
                                      </td>
                                      <td className="p-2 text-center text-ink-subtle">
                                        {t.assigned_at ? new Date(t.assigned_at).toLocaleDateString() : '—'}
                                      </td>
                                      <td className="p-2 text-center text-ink-subtle">
                                        {t.status === 'completed' && t.completed_at ? new Date(t.completed_at).toLocaleDateString() : '—'}
                                      </td>
                                      <td className="p-2 text-right">
                                        {t.status === 'assigned' && (
                                          <button
                                            type="button"
                                            disabled={remind.isPending}
                                            onClick={() => sendReminder(m.emp_id, [t.opl_id])}
                                            className="inline-flex items-center gap-1 rounded-md border border-blue-600/40 px-2 py-0.5 font-semibold text-blue-700 hover:bg-blue-700 hover:text-white"
                                          >
                                            <Bell size={10} /> Remind
                                          </button>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                            {lessonTotalPages > 1 && (
                              <div className="flex items-center justify-between gap-2 border-t border-line bg-surface-sunken px-3 py-1.5 text-xs text-ink-muted">
                                <span>{(lessonValidPage - 1) * LESSON_PAGE_SIZE + 1}–{Math.min(lessonValidPage * LESSON_PAGE_SIZE, allRows.length)} of {allRows.length}</span>
                                <div className="flex items-center gap-1.5">
                                  <button type="button" disabled={lessonValidPage <= 1} onClick={() => setLessonPage(lessonValidPage - 1)} className="rounded border border-line px-1.5 py-0.5 disabled:opacity-40">Prev</button>
                                  <span className="font-semibold text-ink-strong">{lessonValidPage}/{lessonTotalPages}</span>
                                  <button type="button" disabled={lessonValidPage >= lessonTotalPages} onClick={() => setLessonPage(lessonValidPage + 1)} className="rounded border border-line px-1.5 py-0.5 disabled:opacity-40">Next</button>
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                      );
                    })()}
                  </Fragment>
                ))}
              </tbody>
            </table>
            </div>
            {memberTotalPages > 1 && (
              <div className="flex items-center justify-between gap-2 border-t border-line bg-surface-sunken px-3 py-2 text-xs text-ink-muted">
                <span>Showing <strong>{(memberValidPage - 1) * MEMBER_PAGE_SIZE + 1}</strong>–<strong>{Math.min(memberValidPage * MEMBER_PAGE_SIZE, sorted.length)}</strong> of <strong>{sorted.length}</strong></span>
                <div className="flex items-center gap-1.5">
                  <Button variant="outline" size="xs" className="h-7 px-2 text-2xs gap-1" disabled={memberValidPage <= 1} onClick={() => setMemberPage(memberValidPage - 1)}>
                    <ChevronLeft size={12} /> Prev
                  </Button>
                  <span className="px-1 font-semibold text-ink-strong">{memberValidPage} / {memberTotalPages}</span>
                  <Button variant="outline" size="xs" className="h-7 px-2 text-2xs gap-1" disabled={memberValidPage >= memberTotalPages} onClick={() => setMemberPage(memberValidPage + 1)}>
                    Next <ChevronRight size={12} />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function OplAnalyticsTab() {
  // Default range: start of current calendar month through today, matching the backend
  // default so an empty date filter and "This Month" mean the same thing.
  const now = new Date();
  const monthStartStr = formatLocalDate(new Date(now.getFullYear(), now.getMonth(), 1));
  const todayStr = formatLocalDate(now);
  const pastMonthStartStr = formatLocalDate(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const pastMonthEndStr = formatLocalDate(new Date(now.getFullYear(), now.getMonth(), 0));

  const [fromDate, setFromDate] = useState(monthStartStr);
  const [toDate, setToDate] = useState(todayStr);
  const [appliedRange, setAppliedRange] = useState({ from: monthStartStr, to: todayStr });
  const [monthPicker, setMonthPicker] = useState(monthStartStr.slice(0, 7));
  // null = global (every group in the plant); otherwise scopes Category/Critical too.
  // Also driven by the global filter below (type 'jh_group') and by the existing
  // click-a-bar/click-a-row shortcuts elsewhere on this page — all three stay in sync
  // since they share this one piece of state.
  const [breakdownGroupId, setBreakdownGroupId] = useState(null);
  const [breakdownDmtId, setBreakdownDmtId] = useState(null);
  // 'all' | 'jh_group' | 'dmt' — which of the two ids above (if either) is the active scope.
  const [filterType, setFilterType] = useState('all');

  const selectJhGroupFilter = (id) => {
    setFilterType('jh_group');
    setBreakdownGroupId(id);
    setBreakdownDmtId(null);
  };
  const selectDmtFilter = (id) => {
    setFilterType('dmt');
    setBreakdownDmtId(id);
    setBreakdownGroupId(null);
  };
  const clearFilter = () => {
    setFilterType('all');
    setBreakdownGroupId(null);
    setBreakdownDmtId(null);
  };

  // Vertical section tabs — keeps the analytics page from being one long scroll.
  const [analyticsTab, setAnalyticsTab] = useState('submissions');
  const [expandedReviewer, setExpandedReviewer] = useState(null);
  const ANALYTICS_TABS = [
    { key: 'submissions', label: 'Submissions', short: 'Submits', Icon: Layers },
    { key: 'category', label: 'Category & Criticality', short: 'Category', Icon: Tag },
    { key: 'reviewers', label: 'Reviewers', short: 'Reviewers', Icon: UserCheck },
    { key: 'users', label: 'Per-User Breakdown', short: 'Per-User', Icon: User },
    { key: 'members', label: 'Member Submissions', short: 'Members', Icon: Users },
    { key: 'compare', label: 'Compare', short: 'Compare', Icon: Filter },
  ];

  const analyticsParams = filterType === 'jh_group' && breakdownGroupId
    ? { ...appliedRange, jh_group_id: breakdownGroupId }
    : filterType === 'dmt' && breakdownDmtId
      ? { ...appliedRange, dmt_id: breakdownDmtId }
      : appliedRange;
  const { data, isLoading, isError } = useOplAnalytics(analyticsParams);

  // Always-unscoped fetch, purely to populate the JH Group / DMT pickers (global filter +
  // Compare tab) regardless of what's currently selected — dedupes against the main query
  // above via React Query's cache whenever filterType is 'all' (same params, same key).
  const { data: unscopedData } = useOplAnalytics(appliedRange);
  const allJhGroupOptions = unscopedData?.byJhGroup || [];
  const allDmtOptions = unscopedData?.byDmt || [];

  // Compare tab state
  const [compareType, setCompareType] = useState('jh_group'); // 'jh_group' | 'dmt'
  const [compareAId, setCompareAId] = useState(null);
  const [compareBId, setCompareBId] = useState(null);
  const compareKey = compareType === 'jh_group' ? 'jh_group_id' : 'dmt_id';
  const { data: compareDataA } = useOplAnalytics(compareAId ? { ...appliedRange, [compareKey]: compareAId } : appliedRange);
  const { data: compareDataB } = useOplAnalytics(compareBId ? { ...appliedRange, [compareKey]: compareBId } : appliedRange);

  // Per-User Stage Breakdown: filter to one stage to see just who's there, by name.
  const [perUserStageFilter, setPerUserStageFilter] = useState('all');

  const handleApply = () => {
    if (!fromDate || !toDate) {
      toast.error('Select both a from and to date');
      return;
    }
    if (fromDate > toDate) {
      toast.error('"From" date must be before "To" date');
      return;
    }
    setAppliedRange({ from: fromDate, to: toDate });
  };

  const handleResetToMonth = () => {
    setFromDate(monthStartStr);
    setToDate(todayStr);
    setAppliedRange({ from: monthStartStr, to: todayStr });
  };

  const handleResetToPastMonth = () => {
    setFromDate(pastMonthStartStr);
    setToDate(pastMonthEndStr);
    setAppliedRange({ from: pastMonthStartStr, to: pastMonthEndStr });
  };

  const byDmt = data?.byDmt || [];
  const byJhGroup = data?.byJhGroup || [];
  const memberSubmissions = data?.memberSubmissions || [];
  const byClassification = data?.byClassification || [];
  const reviewerWorkload = data?.reviewerWorkload || [];
  const submitterStageBreakdown = data?.submitterStageBreakdown || [];
  const inchargeBreakdown = data?.inchargeBreakdown || [];
  const criticality = data?.criticality || { critical: 0, standard: 0 };
  const totalOpls = byDmt.reduce((sum, d) => sum + d.opl_count, 0);
  const totalMembers = byJhGroup.reduce((sum, g) => sum + g.member_count, 0);

  // Participation per JH group: how many of its members (leader included) submitted
  // at least 1 OPL in this date range, out of the group's total member count.
  const participationByGroupId = useMemo(() => {
    const map = new Map();
    memberSubmissions.forEach(m => {
      if (!map.has(m.jh_group_id)) map.set(m.jh_group_id, 0);
      if (m.opl_count > 0) map.set(m.jh_group_id, map.get(m.jh_group_id) + 1);
    });
    return map;
  }, [memberSubmissions]);

  // Exports everything currently on screen — respects the active global filter, so an
  // export while scoped to one JH group/DMT contains that scope's numbers, matching the
  // page. One workbook, one sheet per analytics section.
  const handleExportAll = () => {
    const hasAnyData = byDmt.length || byJhGroup.length || memberSubmissions.length
      || byClassification.length || reviewerWorkload.length || submitterStageBreakdown.length;
    if (!hasAnyData) {
      toast.error('No data to export for this date range');
      return;
    }
    const dmtByGroupId = new Map(byJhGroup.map(g => [g.jh_group_id, g.dmt_name]));
    const workbook = XLSX.utils.book_new();

    const addSheet = (name, rows, colWidths) => {
      if (!rows || rows.length === 0) return;
      const worksheet = XLSX.utils.json_to_sheet(rows);
      if (colWidths) worksheet['!cols'] = colWidths.map((wch) => ({ wch }));
      XLSX.utils.book_append_sheet(workbook, worksheet, name.slice(0, 31)); // Excel sheet-name limit
    };

    addSheet('Submissions by DMT', byDmt.map(d => ({
      'DMT': d.dmt_name, 'Approved OPLs': d.opl_count,
    })), [20, 16]);

    addSheet('Submissions by JH Group', byJhGroup.map(g => ({
      'JH Group': g.jh_group_name, 'DMT': g.dmt_name, 'Approved OPLs': g.opl_count,
      'Members': g.member_count, 'OPL Index': g.opl_index,
    })), [20, 14, 14, 10, 10]);

    addSheet('Category', byClassification.map(c => ({
      'Classification': c.classification, 'Approved OPLs': c.opl_count,
    })), [22, 16]);

    addSheet('Criticality', [
      { 'Type': 'Critical', 'Approved OPLs': criticality.critical },
      { 'Type': 'Standard', 'Approved OPLs': criticality.standard },
    ], [14, 16]);

    addSheet('Reviewer Workload', reviewerWorkload.map(r => ({
      'Reviewer': r.worker_name, 'Stage': r.stage_name, 'OPLs Awaiting': r.opl_count,
    })), [22, 18, 14]);

    addSheet('Reviewers', inchargeBreakdown.map(r => ({
      'Reviewer': r.worker_name,
      'Groups': (r.groups || []).join(', '),
      'Pending review': r.pending,
      'Oldest pending (days)': r.oldest_days ?? '',
      'Reviews done (range)': r.decided_in_range,
      'Avg turnaround (hours)': r.avg_turnaround_hours ?? '',
      'Team members': r.team_members,
      'Team training done': r.team_training_completed,
      'Team training assigned': r.team_training_assigned,
      'Team training %': r.team_training_pct ?? '',
    })), [22, 26, 12, 16, 16, 16, 12, 14, 16, 12]);

    addSheet('Per-User Stage Breakdown', submitterStageBreakdown.map(r => ({
      'User': r.worker_name, 'Stage': r.stage_label, 'OPL Count': r.opl_count,
    })), [22, 18, 12]);

    addSheet('Member Submissions', [...memberSubmissions]
      .sort((a, b) => (a.jh_group_name || '').localeCompare(b.jh_group_name || '') || (a.worker_name || '').localeCompare(b.worker_name || ''))
      .map(m => ({
        'JH Group': m.jh_group_name || 'Unassigned',
        'DMT': dmtByGroupId.get(m.jh_group_id) || '',
        'Member Name': m.worker_name || m.emp_id,
        'Employee ID': m.emp_id,
        'OPLs Submitted': m.opl_count
      })), [20, 12, 22, 14, 16]);

    const scopeSuffix = filterType === 'jh_group' && breakdownGroupName ? `_${breakdownGroupName.replace(/\s+/g, '')}`
      : filterType === 'dmt' && allDmtOptions.find(d => d.dmt_id === breakdownDmtId) ? `_${allDmtOptions.find(d => d.dmt_id === breakdownDmtId).dmt_name}`
      : '';
    XLSX.writeFile(workbook, `OPL_Analytics${scopeSuffix}_${appliedRange.from}_to_${appliedRange.to}.xlsx`);
  };

  // Sortable "By JH Group" table — click a column heading to sort by it, click again to
  // flip direction. Participation % is computed once here so sorting and display agree.
  const byJhGroupWithParticipation = useMemo(() => byJhGroup.map(row => ({
    ...row,
    participation_pct: row.member_count > 0
      ? Math.round(((participationByGroupId.get(row.jh_group_id) ?? 0) / row.member_count) * 100)
      : null
  })), [byJhGroup, participationByGroupId]);

  const [sortConfig, setSortConfig] = useState({ key: 'jh_group_name', direction: 'asc' });
  const handleSort = (key) => {
    setSortConfig(prev => prev.key === key
      ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
      : { key, direction: 'asc' });
  };
  const sortedByJhGroup = useMemo(() => {
    const { key, direction } = sortConfig;
    const dir = direction === 'asc' ? 1 : -1;
    return [...byJhGroupWithParticipation].sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (typeof av === 'string') return av.localeCompare(bv) * dir;
      return (av - bv) * dir;
    });
  }, [byJhGroupWithParticipation, sortConfig]);

  const SORT_COLUMNS = [
    { key: 'jh_group_name', label: 'JH Group' },
    { key: 'dmt_name', label: 'DMT' },
    { key: 'opl_count', label: 'Approved OPLs' },
    { key: 'member_count', label: 'Members' },
    { key: 'participation_pct', label: 'Participation' },
    { key: 'opl_index', label: 'OPL Index' }
  ];

  // Editable threshold for the "more than N" bucket — recomputed client-side, no re-fetch.
  const [thresholdInput, setThresholdInput] = useState('1');
  const threshold = Math.max(0, parseInt(thresholdInput, 10) || 0);
  const scopedMemberSubmissions = breakdownGroupId
    ? memberSubmissions.filter(m => m.jh_group_id === breakdownGroupId)
    : memberSubmissions;
  const breakdownGroupName = breakdownGroupId
    ? (byJhGroup.find(g => g.jh_group_id === breakdownGroupId)?.jh_group_name || 'Selected Group')
    : null;
  const zeroOplMembers = scopedMemberSubmissions.filter(m => m.opl_count === 0);
  const exactThresholdMembers = scopedMemberSubmissions.filter(m => m.opl_count === threshold && threshold !== 0);
  const moreThanThresholdMembers = scopedMemberSubmissions.filter(m => m.opl_count > threshold);

  return (
    <div className="space-y-4 py-4 max-w-full overflow-hidden">
      {/* Date Range Controls */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-end gap-3 bg-surface-raised p-3 rounded-xl border border-line shadow-xs">
        <div className="flex flex-col gap-1">
          <label className="text-2xs font-semibold text-ink-muted">From</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="rounded-lg border border-line bg-surface-base px-3 py-1.5 text-xs text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-700"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-2xs font-semibold text-ink-muted">To</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="rounded-lg border border-line bg-surface-base px-3 py-1.5 text-xs text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-700"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" onClick={handleApply} className="gap-1.5">
            Apply
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handleResetToMonth} className="gap-1.5">
            This Month
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handleResetToPastMonth} className="gap-1.5">
            Past Month
          </Button>
        </div>

        <div className="flex flex-col gap-1 sm:border-l sm:border-line sm:pl-3">
          <label className="text-2xs font-semibold text-ink-muted">Jump to Month</label>
          <div className="flex items-center gap-2">
            <input
              type="month"
              value={monthPicker}
              onChange={(e) => setMonthPicker(e.target.value)}
              className="rounded-lg border border-line bg-surface-base px-3 py-1.5 text-xs text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-700"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (!monthPicker) return;
                const [y, m] = monthPicker.split('-').map(Number);
                const start = formatLocalDate(new Date(y, m - 1, 1));
                const end = formatLocalDate(new Date(y, m, 0));
                setFromDate(start);
                setToDate(end);
                setAppliedRange({ from: start, to: end });
              }}
              className="gap-1.5"
            >
              Go
            </Button>
          </div>
        </div>
      </div>

      {/* Global Filter — narrows EVERY tab below, including Submissions, to one JH group
          or one DMT. This replaces the old "click a bar to drill in" as the primary way to
          scope the page; those clicks still work and now keep this control in sync. */}
      <div className="flex flex-wrap items-center gap-2 bg-surface-raised p-3 rounded-xl border border-line shadow-xs">
        <span className="text-2xs font-semibold text-ink-muted">Filter:</span>
        <div className="flex items-center gap-1 rounded-lg border border-line bg-surface-sunken p-1 text-2xs">
          <button
            type="button"
            onClick={clearFilter}
            className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
              filterType === 'all' ? 'bg-surface-raised text-blue-700 shadow-2xs' : 'text-ink-muted hover:text-ink-strong'
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setFilterType('jh_group')}
            className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
              filterType === 'jh_group' ? 'bg-surface-raised text-blue-700 shadow-2xs' : 'text-ink-muted hover:text-ink-strong'
            }`}
          >
            JH Group
          </button>
          <button
            type="button"
            onClick={() => setFilterType('dmt')}
            className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
              filterType === 'dmt' ? 'bg-surface-raised text-blue-700 shadow-2xs' : 'text-ink-muted hover:text-ink-strong'
            }`}
          >
            DMT
          </button>
        </div>

        {filterType === 'jh_group' && (
          <select
            value={breakdownGroupId || ''}
            onChange={(e) => selectJhGroupFilter(e.target.value || null)}
            className="rounded-lg border border-line bg-surface-base px-2.5 py-1.5 text-xs text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-700"
          >
            <option value="">-- Choose a JH Group --</option>
            {allJhGroupOptions.map((g) => (
              <option key={g.jh_group_id} value={g.jh_group_id}>{g.jh_group_name}</option>
            ))}
          </select>
        )}
        {filterType === 'dmt' && (
          <select
            value={breakdownDmtId || ''}
            onChange={(e) => selectDmtFilter(e.target.value || null)}
            className="rounded-lg border border-line bg-surface-base px-2.5 py-1.5 text-xs text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-700"
          >
            <option value="">-- Choose a DMT --</option>
            {allDmtOptions.map((d) => (
              <option key={d.dmt_id} value={d.dmt_id}>{d.dmt_name}</option>
            ))}
          </select>
        )}
        {filterType !== 'all' && (
          <span className="text-2xs text-ink-subtle italic">Applies to every tab below.</span>
        )}

        <Button type="button" variant="outline" size="xs" onClick={handleExportAll} className="gap-1.5 text-2xs h-7 ml-auto">
          <FileText size={12} /> Export All to Excel
        </Button>
      </div>

      {isError && (
        <EmptyState title="Failed to load analytics" description="You may not have permission to view this, or the server is unavailable." />
      )}

      {isLoading ? (
        [0, 1].map((i) => <SkeletonRow key={i} columns={3} />)
      ) : (
        <>
          {/* The date range defaults to month-to-date, so early in a month every chart
              legitimately reads zero. Say so, and offer the one tap that usually fixes it. */}
          {totalOpls === 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-500/5 p-3 text-sm text-amber-900 flex flex-col sm:flex-row sm:items-center gap-2">
              <span className="flex-1">
                No approved OPLs between <strong>{appliedRange.from}</strong> and{' '}
                <strong>{appliedRange.to}</strong>{filterType !== 'all' ? ' in the selected scope' : ''}.
              </span>
              <button type="button" onClick={handleResetToPastMonth}
                className="shrink-0 h-9 px-3 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700">
                Show last month
              </button>
            </div>
          )}

          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-line bg-surface-raised p-3 shadow-2xs">
              <span className="text-2xs text-ink-muted font-medium">Approved OPLs in Range</span>
              <div className="text-xl font-black text-blue-700 mt-0.5">{totalOpls}</div>
            </div>
            <div className="rounded-xl border border-line bg-surface-raised p-3 shadow-2xs">
              <span className="text-2xs text-ink-muted font-medium">JH Groups</span>
              <div className="text-xl font-black text-ink-strong mt-0.5">{byJhGroup.length}</div>
            </div>
            <div className="rounded-xl border border-line bg-surface-raised p-3 shadow-2xs">
              <span className="text-2xs text-ink-muted font-medium">Total Members Tracked</span>
              <div className="text-xl font-black text-ink-strong mt-0.5">{totalMembers}</div>
            </div>
          </div>

          {/* Vertical section tabs so the page isn't one long scroll. */}
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="lg:w-52 shrink-0">
              {/* Mobile: a 3-per-row grid with short labels, so every section is visible
                  at once with no sideways scrolling. sm+: the vertical/inline list. */}
              <div className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-surface-raised p-1.5 shadow-2xs sm:hidden">
                {ANALYTICS_TABS.map(({ key, short, Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setAnalyticsTab(key)}
                    className={`flex min-w-0 items-center justify-center gap-1 rounded-lg px-1 py-2 text-xs font-semibold leading-tight transition-colors ${
                      analyticsTab === key
                        ? 'bg-blue-50/60 text-blue-700'
                        : 'text-ink-muted hover:bg-surface-hover hover:text-ink-strong'
                    }`}
                  >
                    <Icon size={12} className="shrink-0" />
                    <span className="truncate">{short}</span>
                  </button>
                ))}
              </div>
              <div className="hidden sm:flex lg:flex-col flex-wrap gap-1 rounded-xl border border-line bg-surface-raised p-1.5 shadow-2xs">
                {ANALYTICS_TABS.map(({ key, label, Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setAnalyticsTab(key)}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-left whitespace-nowrap transition-colors ${
                      analyticsTab === key
                        ? 'bg-blue-50/60 text-blue-700'
                        : 'text-ink-muted hover:bg-surface-hover hover:text-ink-strong'
                    }`}
                  >
                    <Icon size={14} className="shrink-0" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 min-w-0 space-y-4">
          {analyticsTab === 'submissions' && (
            <>
          {/* Charts: OPL submissions by DMT and by JH Group — click a bar to see its exact
              number in the tooltip; DMT numbers live only here (no separate table), while
              JH Group keeps its own detailed table below since it carries more columns. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="rounded-xl border border-line bg-surface-raised shadow-2xs overflow-hidden">
              <div className="px-3 py-2 border-b border-line bg-surface-sunken text-xs font-bold text-ink-strong">
                Approved OPLs by DMT
              </div>
              <div className="p-2">
                {byDmt.length === 0 ? (
                  <div className="p-4 text-xs text-ink-muted text-center">No data to chart.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={byDmt} margin={{ top: 20, right: 12, bottom: 4, left: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={ANALYTICS_CHART_GRID} vertical={false} />
                      <XAxis dataKey="dmt_name" tick={{ fontSize: 11, fill: ANALYTICS_CHART_AXIS }} tickLine={false} axisLine={{ stroke: ANALYTICS_CHART_GRID }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: ANALYTICS_CHART_AXIS }} tickLine={false} axisLine={false} width={28} />
                      <Tooltip
                        cursor={{ fill: 'rgba(180,83,9,0.08)' }}
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E7E5E4' }}
                        formatter={(v) => [v, 'Approved OPLs']}
                      />
                      <Bar dataKey="opl_count" radius={[4, 4, 0, 0]} isAnimationActive={false} label={{ position: 'top', fontSize: 11, fill: '#44403C', fontWeight: 700 }}>
                        {byDmt.map((row, idx) => (
                          <Cell key={row.dmt_id} fill={ANALYTICS_CHART_PALETTE[idx % ANALYTICS_CHART_PALETTE.length]} cursor="pointer" />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-line bg-surface-raised shadow-2xs overflow-hidden">
              <div className="px-3 py-2 border-b border-line bg-surface-sunken text-xs font-bold text-ink-strong">
                Approved OPLs by JH Group
              </div>
              <div className="p-2">
                {byJhGroup.length === 0 ? (
                  <div className="p-4 text-xs text-ink-muted text-center">No data to chart.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={byJhGroup} margin={{ top: 20, right: 12, bottom: 4, left: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={ANALYTICS_CHART_GRID} vertical={false} />
                      <XAxis dataKey="jh_group_name" tick={{ fontSize: 10, fill: ANALYTICS_CHART_AXIS }} tickLine={false} axisLine={{ stroke: ANALYTICS_CHART_GRID }} interval={0} angle={-20} textAnchor="end" height={55} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: ANALYTICS_CHART_AXIS }} tickLine={false} axisLine={false} width={28} />
                      <Tooltip
                        cursor={{ fill: 'rgba(180,83,9,0.08)' }}
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E7E5E4' }}
                        formatter={(v) => [v, 'Approved OPLs']}
                      />
                      <Bar
                        dataKey="opl_count"
                        radius={[4, 4, 0, 0]}
                        isAnimationActive={false}
                        onClick={(entry) => selectJhGroupFilter(entry.jh_group_id)}
                        label={{ position: 'top', fontSize: 11, fill: '#44403C', fontWeight: 700 }}
                      >
                        {byJhGroup.map((row, idx) => (
                          <Cell key={row.jh_group_id} fill={ANALYTICS_CHART_PALETTE[idx % ANALYTICS_CHART_PALETTE.length]} cursor="pointer" />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          {/* By JH Group with OPL Index */}
          <div className="rounded-xl border border-line bg-surface-raised shadow-2xs overflow-hidden">
            <div className="px-3 py-2 border-b border-line bg-surface-sunken text-xs font-bold text-ink-strong flex items-center gap-1.5">
              <Users size={14} className="text-blue-700" /> OPLs by JH Group — OPL Index
            </div>
            <p className="px-3 pt-2 text-2xs text-ink-muted">
              OPL Index = Approved OPLs from the group divided by the number of members in the group.
            </p>
            {byJhGroup.length === 0 ? (
              <div className="p-4 text-xs text-ink-muted text-center">No JH groups found.</div>
            ) : (
              <>
              {/* Six columns can't fit a phone — below sm each row becomes a labelled card
                  instead of a side-scrolling table; the real sortable table returns at sm+. */}
              <div className="space-y-2 p-2 sm:hidden">
                {sortedByJhGroup.map((row) => (
                  <button key={row.jh_group_id} type="button" onClick={() => selectJhGroupFilter(row.jh_group_id)}
                    className={`w-full rounded-xl border border-line p-3 text-left active:bg-surface-hover ${breakdownGroupId === row.jh_group_id ? 'bg-blue-50/40' : 'bg-surface-base'}`}>
                    <div className="flex items-baseline justify-between gap-2 border-b border-line-subtle pb-2">
                      <span className="text-sm font-semibold text-ink-strong">{row.jh_group_name}</span>
                      <span className="shrink-0 text-2xs font-medium text-ink-muted">{row.dmt_name || '—'}</span>
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                      {[
                        ['Approved OPLs', row.opl_count],
                        ['Members', row.member_count],
                        ['Participation', row.participation_pct === null ? 'N/A' : `${row.participation_pct}%`],
                        ['OPL Index', row.opl_index === null ? 'N/A' : row.opl_index.toFixed(2)],
                      ].map(([k, v]) => (
                        <div key={k} className="flex items-baseline justify-between gap-2">
                          <dt className="text-ink-muted">{k}</dt>
                          <dd className="text-sm font-semibold text-ink-strong">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </button>
                ))}
              </div>
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-surface-sunken/60 border-b border-line text-ink-muted font-semibold text-2xs uppercase tracking-wider">
                      {SORT_COLUMNS.map((col) => (
                        <th
                          key={col.key}
                          onClick={() => handleSort(col.key)}
                          className="p-2.5 cursor-pointer select-none hover:text-ink-strong transition-colors"
                          title="Click to sort"
                        >
                          <span className="inline-flex items-center gap-1">
                            {col.label}
                            {sortConfig.key === col.key && (
                              <span className="text-blue-700">{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>
                            )}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {sortedByJhGroup.map((row) => (
                      <tr
                        key={row.jh_group_id}
                        onClick={() => selectJhGroupFilter(row.jh_group_id)}
                        className={`cursor-pointer transition-colors hover:bg-surface-hover ${breakdownGroupId === row.jh_group_id ? 'bg-blue-50/40' : ''}`}
                        title="Click to view this group's member submission breakdown below"
                      >
                        <td className="p-2.5 font-semibold text-ink-strong">{row.jh_group_name}</td>
                        <td className="p-2.5 text-ink-muted">{row.dmt_name || '—'}</td>
                        <td className="p-2.5 text-ink-strong">{row.opl_count}</td>
                        <td className="p-2.5 text-ink-strong">{row.member_count}</td>
                        <td className="p-2.5 text-ink-strong">
                          {row.participation_pct === null ? 'N/A' : `${row.participation_pct}%`}
                        </td>
                        <td className="p-2.5">
                          <span className="inline-flex items-center gap-1 text-2xs font-bold bg-blue-50/60 text-blue-700 px-2 py-0.5 rounded-md border border-blue-600/20">
                            {row.opl_index === null ? 'N/A (0 members)' : row.opl_index.toFixed(2)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </div>
            </>
          )}

          {analyticsTab === 'category' && (
            <>
          {/* Category (classification) and Critical vs Standard bifurcation — scoped to
              the selected JH group when one is chosen, plant-wide otherwise. */}
          {(() => {
            const classTotal = byClassification.reduce((s, r) => s + r.opl_count, 0);
            const byClassificationWithPct = byClassification.map(r => ({
              ...r,
              pct: classTotal > 0 ? Math.round((r.opl_count / classTotal) * 100) : 0
            }));
            const scopeLabel = breakdownGroupId
              ? (byJhGroup.find(g => g.jh_group_id === breakdownGroupId)?.jh_group_name || 'Selected Group')
              : 'All JH Groups (Global)';
            return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="rounded-xl border border-line bg-surface-raised shadow-2xs overflow-hidden">
              <div className="px-3 py-2 border-b border-line bg-surface-sunken text-xs font-bold text-ink-strong flex items-center justify-between gap-2">
                <span>Approved OPLs by Category</span>
                <span className="text-2xs font-semibold text-blue-700 bg-blue-50/50 px-2 py-0.5 rounded-md">{scopeLabel}</span>
              </div>
              <div className="p-2">
                {byClassificationWithPct.length === 0 ? (
                  <div className="p-4 text-xs text-ink-muted text-center">No data to chart.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart margin={{ top: 24, right: 24, bottom: 8, left: 24 }}>
                      <Pie
                        data={byClassificationWithPct}
                        dataKey="opl_count"
                        nameKey="classification"
                        cx="50%"
                        cy="48%"
                        outerRadius={72}
                        label={renderPctLabel}
                        labelLine={false}
                        isAnimationActive={false}
                      >
                        {byClassificationWithPct.map((row, idx) => (
                          <Cell key={row.classification} fill={ANALYTICS_CHART_PALETTE[idx % ANALYTICS_CHART_PALETTE.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E7E5E4' }}
                        formatter={(v, n, entry) => [`${v} (${entry.payload.pct}%)`, entry.payload.classification]}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-line bg-surface-raised shadow-2xs overflow-hidden">
              <div className="px-3 py-2 border-b border-line bg-surface-sunken text-xs font-bold text-ink-strong flex items-center justify-between gap-2">
                <span>Critical vs Standard OPLs</span>
                <span className="text-2xs font-semibold text-blue-700 bg-blue-50/50 px-2 py-0.5 rounded-md">{scopeLabel}</span>
              </div>
              <div className="p-2">
                {(() => {
                  const total = criticality.critical + criticality.standard;
                  const criticalPct = total > 0 ? Math.round((criticality.critical / total) * 100) : 0;
                  const standardPct = total > 0 ? 100 - criticalPct : 0;
                  const pieData = [
                    { name: 'Critical', value: criticality.critical, pct: criticalPct },
                    { name: 'Standard', value: criticality.standard, pct: standardPct }
                  ];
                  if (total === 0) {
                    return <p className="text-xs text-ink-muted text-center py-8">No approved OPLs in this date range.</p>;
                  }
                  return (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart margin={{ top: 24, right: 24, bottom: 8, left: 24 }}>
                        <Pie
                          data={pieData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="48%"
                          outerRadius={72}
                          label={renderPctLabel}
                          labelLine={false}
                          isAnimationActive={false}
                        >
                          <Cell fill="#D97706" />
                          <Cell fill={ANALYTICS_CHART_AXIS} />
                        </Pie>
                        <Tooltip
                          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E7E5E4' }}
                          formatter={(v, n, entry) => [`${v} (${entry.payload.pct}%)`, entry.payload.name]}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  );
                })()}
              </div>
            </div>
          </div>
            );
          })()}

          {breakdownGroupId && <MonthOnMonthTrend jhGroupId={breakdownGroupId} />}
            </>
          )}

          {analyticsTab === 'reviewers' && (() => {
            // Awaiting-by-stage pie (live snapshot) + one row per reviewer, each expandable
            // to its per-stage split. Pending/oldest are live; reviews-done/turnaround are
            // date-range-scoped; team-training is all-time for their groups.
            const byStage = new Map();
            const stagesByEmp = new Map();
            reviewerWorkload.forEach((r) => {
              byStage.set(r.stage_name, (byStage.get(r.stage_name) || 0) + r.opl_count);
              if (!stagesByEmp.has(r.emp_id)) stagesByEmp.set(r.emp_id, []);
              stagesByEmp.get(r.emp_id).push(r);
            });
            const pieData = [...byStage.entries()].map(([name, value]) => ({ name, value }));
            return (
          <div className="space-y-3">
            <div className="rounded-xl border border-line bg-surface-raised shadow-2xs overflow-hidden">
              <div className="px-3 py-2 border-b border-line bg-surface-sunken text-xs font-bold text-ink-strong flex items-center gap-1.5">
                <UserCheck size={14} className="text-blue-700" /> Awaiting Review, by Stage
              </div>
              <div className="p-2">
                {pieData.length === 0 ? (
                  <p className="p-6 text-xs text-ink-muted text-center">Nobody has anything awaiting review.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart margin={{ top: 20, right: 24, bottom: 8, left: 24 }}>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="48%"
                        outerRadius={64}
                        label={renderValueLabel}
                        labelLine={false}
                        isAnimationActive={false}
                      >
                        {pieData.map((row, idx) => (
                          <Cell key={row.name} fill={ANALYTICS_CHART_PALETTE[idx % ANALYTICS_CHART_PALETTE.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E7E5E4' }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-line bg-surface-raised shadow-2xs overflow-hidden">
              <div className="px-3 py-2 border-b border-line bg-surface-sunken text-xs font-bold text-ink-strong flex items-center gap-1.5">
                <UserCheck size={14} className="text-blue-700" /> Reviewers
              </div>
              <p className="px-3 pt-2 text-2xs text-ink-subtle">
                One row per OPL reviewer (JH leader / module lead / named approver). <strong>Pending</strong> &amp; <strong>oldest wait</strong> are live now; <strong>reviews done</strong> &amp; <strong>avg turnaround</strong> cover the selected date range; <strong>team training</strong> is their groups&rsquo; completion, all-time. Click a row for the per-stage split.
              </p>
              {inchargeBreakdown.length === 0 ? (
                <p className="p-4 text-xs text-ink-muted text-center">No OPL reviewers with activity for this scope.</p>
              ) : (
                <div className="overflow-x-auto mt-2">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-line bg-surface-sunken/50 text-2xs text-ink-muted">
                        <th className="px-2 py-2 w-4"></th>
                        <th className="text-left font-semibold px-3 py-2">Reviewer</th>
                        <th className="text-right font-semibold px-3 py-2">Pending</th>
                        <th className="text-right font-semibold px-3 py-2">Oldest wait</th>
                        <th className="text-right font-semibold px-3 py-2">Reviews done</th>
                        <th className="text-right font-semibold px-3 py-2">Avg turnaround</th>
                        <th className="text-right font-semibold px-3 py-2">Team training</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/60">
                      {inchargeBreakdown.map((r) => {
                        const stages = stagesByEmp.get(r.emp_id) || [];
                        const open = expandedReviewer === r.emp_id;
                        return (
                          <Fragment key={r.emp_id}>
                            <tr
                              className={`align-top ${stages.length ? 'cursor-pointer hover:bg-surface-hover/40' : ''}`}
                              onClick={() => stages.length && setExpandedReviewer(open ? null : r.emp_id)}
                            >
                              <td className="px-2 py-1.5 text-ink-subtle">
                                {stages.length > 0 && (open ? <ChevronDown size={12} /> : <ChevronRight size={12} />)}
                              </td>
                              <td className="px-3 py-1.5">
                                <span className="font-semibold text-ink-strong">{r.worker_name}</span>
                                {(r.groups || []).length > 0 && (
                                  <span className="block text-2xs text-ink-muted">{r.groups.join(' · ')}</span>
                                )}
                              </td>
                              <td className="px-3 py-1.5 text-right font-semibold tabular-nums">
                                {r.pending > 0 ? <span className="text-blue-700">{r.pending}</span> : <span className="text-ink-subtle">0</span>}
                              </td>
                              <td className="px-3 py-1.5 text-right tabular-nums">
                                {r.oldest_days == null ? <span className="text-ink-subtle">—</span>
                                  : <span className={r.oldest_days >= 7 ? 'font-semibold text-amber-700' : 'text-ink-muted'}>{r.oldest_days}d</span>}
                              </td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-ink-muted">{r.decided_in_range}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-ink-muted">
                                {r.avg_turnaround_hours == null ? '—'
                                  : r.avg_turnaround_hours < 48 ? `${r.avg_turnaround_hours}h`
                                  : `${r.avg_turnaround_days}d`}
                              </td>
                              <td className="px-3 py-1.5 text-right tabular-nums">
                                {r.team_training_pct == null ? <span className="text-ink-subtle">—</span> : (
                                  <span className={r.team_training_pct >= 80 ? 'font-semibold text-emerald-600' : r.team_training_pct >= 50 ? 'text-amber-700' : 'font-semibold text-rose-600'}>
                                    {r.team_training_pct}%
                                  </span>
                                )}
                                <span className="block text-2xs text-ink-subtle">{r.team_training_completed}/{r.team_training_assigned}</span>
                              </td>
                            </tr>
                            {open && stages.map((s) => (
                              <tr key={`${r.emp_id}-${s.stage_order}`} className="bg-surface-sunken/40 text-2xs">
                                <td></td>
                                <td className="px-3 py-1 text-ink-muted">{s.stage_name}</td>
                                <td className="px-3 py-1 text-right tabular-nums font-semibold text-blue-700">{s.opl_count}</td>
                                <td colSpan={4} className="text-2xs text-ink-subtle px-3">awaiting at this stage</td>
                              </tr>
                            ))}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
            );
          })()}

          {analyticsTab === 'users' && (
            <>

          {/* Per-User Stage Breakdown — every submitter's OPLs, grouped by where each one
              currently sits (draft / a named review stage / approved / rejected). Also a
              current-state snapshot, not date-filtered. */}
          {(() => {
            const byStage = new Map();
            submitterStageBreakdown.forEach((r) => {
              byStage.set(r.stage_label, (byStage.get(r.stage_label) || 0) + r.opl_count);
            });
            const pieData = [...byStage.entries()].map(([name, value]) => ({ name, value }));
            return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="rounded-xl border border-line bg-surface-raised shadow-2xs overflow-hidden">
              <div className="px-3 py-2 border-b border-line bg-surface-sunken text-xs font-bold text-ink-strong flex items-center gap-1.5">
                <User size={14} className="text-blue-700" /> All OPLs, by Stage
              </div>
              <div className="p-2">
                {pieData.length === 0 ? (
                  <p className="p-8 text-xs text-ink-muted text-center">No OPLs submitted yet.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart margin={{ top: 24, right: 24, bottom: 8, left: 24 }}>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="48%"
                        outerRadius={72}
                        label={renderValueLabel}
                        labelLine={false}
                        isAnimationActive={false}
                      >
                        {pieData.map((row, idx) => (
                          <Cell key={row.name} fill={ANALYTICS_CHART_PALETTE[idx % ANALYTICS_CHART_PALETTE.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E7E5E4' }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

          <div className="rounded-xl border border-line bg-surface-raised shadow-2xs overflow-hidden">
            <div className="px-3 py-2 border-b border-line bg-surface-sunken flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs font-bold text-ink-strong flex items-center gap-1.5">
                <User size={14} className="text-blue-700" /> Per-User Stage Breakdown (right now)
              </span>
              {submitterStageBreakdown.length > 0 && (
                <select
                  value={perUserStageFilter}
                  onChange={(e) => setPerUserStageFilter(e.target.value)}
                  className="rounded-md border border-line bg-surface-base px-2 py-1 text-2xs text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-700"
                >
                  <option value="all">All stages</option>
                  {[...new Set(submitterStageBreakdown.map((r) => r.stage_label))].map((label) => (
                    <option key={label} value={label}>{label}</option>
                  ))}
                </select>
              )}
            </div>
            {submitterStageBreakdown.length === 0 ? (
              <p className="p-4 text-xs text-ink-muted text-center">No OPLs submitted yet.</p>
            ) : perUserStageFilter === 'all' ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-line bg-surface-sunken/50 text-2xs text-ink-muted">
                      <th className="text-left font-semibold px-3 py-2">User</th>
                      <th className="text-left font-semibold px-3 py-2">Stage</th>
                      <th className="text-right font-semibold px-3 py-2">OPL Count</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/60">
                    {submitterStageBreakdown.map((r) => (
                      <tr key={`${r.emp_id}-${r.stage_label}`}>
                        <td className="px-3 py-1.5 font-medium text-ink-strong">{r.worker_name}</td>
                        <td className="px-3 py-1.5 text-ink-muted">{r.stage_label}</td>
                        <td className="px-3 py-1.5 text-right font-semibold text-blue-700">{r.opl_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              // Filtered to one stage — the point of the filter is to just see WHO'S there,
              // so this reads as a name list rather than a repeat of the full table's columns.
              (() => {
                const members = submitterStageBreakdown.filter((r) => r.stage_label === perUserStageFilter);
                return members.length === 0 ? (
                  <p className="p-4 text-xs text-ink-muted text-center">Nobody is at this stage right now.</p>
                ) : (
                  <div className="p-3 flex flex-wrap gap-2">
                    {members.map((r) => (
                      <span key={r.emp_id} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-sunken px-3 py-1.5 text-xs font-medium text-ink-strong">
                        {r.worker_name}
                        <span className="rounded-full bg-blue-50/60 text-blue-700 text-2xs font-bold px-1.5 py-0.5">{r.opl_count}</span>
                      </span>
                    ))}
                  </div>
                );
              })()
            )}
          </div>
          </div>
            );
          })()}
            </>
          )}

          {analyticsTab === 'members' && (
            <>
          {/* Member Submission Breakdown — editable threshold, recomputed client-side */}
          <div className="rounded-xl border border-line bg-surface-raised shadow-2xs overflow-hidden">
            <div className="px-3 py-2 border-b border-line bg-surface-sunken text-xs font-bold text-ink-strong flex items-center justify-between gap-1.5">
              <span className="flex items-center gap-1.5">
                <User size={14} className="text-blue-700" /> Member Submission Breakdown
              </span>
            </div>

            {/* Global vs specific JH group toggle */}
            <div className="p-3 flex flex-wrap items-center gap-2 border-b border-line/60">
              <div className="flex items-center gap-1 rounded-lg border border-line bg-surface-sunken p-1 text-2xs">
                <button
                  type="button"
                  onClick={clearFilter}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                    breakdownGroupId === null ? 'bg-surface-raised text-blue-700 shadow-2xs' : 'text-ink-muted hover:text-ink-strong'
                  }`}
                >
                  Global (All Groups)
                </button>
                <button
                  type="button"
                  disabled={!breakdownGroupId}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                    breakdownGroupId ? 'bg-surface-raised text-blue-700 shadow-2xs' : 'text-ink-subtle cursor-not-allowed'
                  }`}
                >
                  {breakdownGroupName || 'Click a JH Group above'}
                </button>
              </div>
              {breakdownGroupId && (
                <button type="button" onClick={clearFilter} className="text-2xs font-semibold text-blue-700 hover:underline">
                  Clear selection
                </button>
              )}
            </div>

            <div className="p-3 flex flex-wrap items-center gap-2 border-b border-line/60">
              <label className="text-2xs text-ink-muted font-medium">
                "More than" threshold:
              </label>
              <input
                type="number"
                min="0"
                value={thresholdInput}
                onChange={(e) => setThresholdInput(e.target.value)}
                className="w-16 rounded-lg border border-line bg-surface-base px-2 py-1 text-xs text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-700"
              />
              <span className="text-2xs text-ink-muted">
                Change this and the buckets below recalculate instantly — no page reload needed.
              </span>
            </div>
            {!breakdownGroupId && (
              <p className="px-3 pt-2 text-2xs text-ink-subtle italic">
                Names are hidden in Global view. Click a JH Group in the table above to see its members by name.
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-line">
              <div className="p-3 space-y-1">
                <span className="text-2xs text-ink-muted font-medium">0 OPLs submitted</span>
                <div className="text-xl font-black text-ink-strong">{zeroOplMembers.length}</div>
                {breakdownGroupId && zeroOplMembers.length > 0 && (
                  <p className="text-2xs text-ink-subtle leading-relaxed">
                    {zeroOplMembers.map(m => m.worker_name || m.emp_id).join(', ')}
                  </p>
                )}
              </div>
              <div className="p-3 space-y-1">
                <span className="text-2xs text-ink-muted font-medium">Exactly {threshold} OPL{threshold === 1 ? '' : 's'} submitted</span>
                <div className="text-xl font-black text-ink-strong">{exactThresholdMembers.length}</div>
                {breakdownGroupId && exactThresholdMembers.length > 0 && (
                  <p className="text-2xs text-ink-subtle leading-relaxed">
                    {exactThresholdMembers.map(m => m.worker_name || m.emp_id).join(', ')}
                  </p>
                )}
              </div>
              <div className="p-3 space-y-1">
                <span className="text-2xs text-ink-muted font-medium">More than {threshold} OPL{threshold === 1 ? '' : 's'} submitted</span>
                <div className="text-xl font-black text-blue-700">{moreThanThresholdMembers.length}</div>
                {breakdownGroupId && moreThanThresholdMembers.length > 0 && (
                  <p className="text-2xs text-ink-subtle leading-relaxed">
                    {moreThanThresholdMembers.map(m => `${m.worker_name || m.emp_id} (${m.opl_count})`).join(', ')}
                  </p>
                )}
              </div>
            </div>
          </div>
            </>
          )}

          {analyticsTab === 'compare' && (
            <>
          {/* Compare — two JH groups, or two DMTs, side by side. Each column is its own
              independently-scoped fetch (same endpoint the rest of this page uses), so no
              backend work was needed beyond the jh_group_id/dmt_id scoping above. */}
          <div className="rounded-xl border border-line bg-surface-raised shadow-2xs p-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-2xs font-semibold text-ink-muted">Compare by:</span>
              <div className="flex items-center gap-1 rounded-lg border border-line bg-surface-sunken p-1 text-2xs">
                <button
                  type="button"
                  onClick={() => { setCompareType('jh_group'); setCompareAId(null); setCompareBId(null); }}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                    compareType === 'jh_group' ? 'bg-surface-raised text-blue-700 shadow-2xs' : 'text-ink-muted hover:text-ink-strong'
                  }`}
                >
                  JH Group
                </button>
                <button
                  type="button"
                  onClick={() => { setCompareType('dmt'); setCompareAId(null); setCompareBId(null); }}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                    compareType === 'dmt' ? 'bg-surface-raised text-blue-700 shadow-2xs' : 'text-ink-muted hover:text-ink-strong'
                  }`}
                >
                  DMT
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <select
                value={compareAId || ''}
                onChange={(e) => setCompareAId(e.target.value || null)}
                className="rounded-lg border border-line bg-surface-base px-2.5 py-1.5 text-xs text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-700"
              >
                <option value="">-- Choose {compareType === 'jh_group' ? 'JH Group A' : 'DMT A'} --</option>
                {(compareType === 'jh_group' ? allJhGroupOptions : allDmtOptions).map((opt) => (
                  <option key={compareType === 'jh_group' ? opt.jh_group_id : opt.dmt_id} value={compareType === 'jh_group' ? opt.jh_group_id : opt.dmt_id}>
                    {compareType === 'jh_group' ? opt.jh_group_name : opt.dmt_name}
                  </option>
                ))}
              </select>
              <select
                value={compareBId || ''}
                onChange={(e) => setCompareBId(e.target.value || null)}
                className="rounded-lg border border-line bg-surface-base px-2.5 py-1.5 text-xs text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-700"
              >
                <option value="">-- Choose {compareType === 'jh_group' ? 'JH Group B' : 'DMT B'} --</option>
                {(compareType === 'jh_group' ? allJhGroupOptions : allDmtOptions).map((opt) => (
                  <option key={compareType === 'jh_group' ? opt.jh_group_id : opt.dmt_id} value={compareType === 'jh_group' ? opt.jh_group_id : opt.dmt_id}>
                    {compareType === 'jh_group' ? opt.jh_group_name : opt.dmt_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!compareAId || !compareBId ? (
            <p className="p-4 text-xs text-ink-muted text-center">Choose both A and B above to compare.</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {[{ label: 'A', data: compareDataA }, { label: 'B', data: compareDataB }].map(({ label, data: colData }) => {
                const colByJhGroup = colData?.byJhGroup || [];
                const colByDmt = colData?.byDmt || [];
                const colClassification = colData?.byClassification || [];
                const colCriticality = colData?.criticality || { critical: 0, standard: 0 };
                const colReviewerWorkload = colData?.reviewerWorkload || [];
                const oplCount = compareType === 'jh_group'
                  ? (colByJhGroup[0]?.opl_count ?? 0)
                  : colByDmt.reduce((s, d) => s + d.opl_count, 0);
                const memberCount = compareType === 'jh_group' ? (colByJhGroup[0]?.member_count ?? null) : null;
                const oplIndex = compareType === 'jh_group' ? (colByJhGroup[0]?.opl_index ?? null) : null;
                const classTotal = colClassification.reduce((s, r) => s + r.opl_count, 0);
                const classPie = colClassification.map((r) => ({ name: r.classification, value: r.opl_count }));
                const critTotal = colCriticality.critical + colCriticality.standard;
                const critPie = [
                  { name: 'Critical', value: colCriticality.critical },
                  { name: 'Standard', value: colCriticality.standard },
                ];
                return (
                  <div key={label} className="space-y-3">
                    <div className="rounded-xl border border-line bg-surface-raised shadow-2xs p-3">
                      <div className="text-2xs font-bold text-blue-700 uppercase tracking-wide">{compareType === 'jh_group' ? 'JH Group' : 'DMT'} {label}</div>
                      <div className="text-sm font-semibold text-ink-strong">
                        {compareType === 'jh_group' ? (colByJhGroup[0]?.jh_group_name || '—') : (colByDmt[0]?.dmt_name || '—')}
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-2">
                        <div>
                          <span className="text-2xs text-ink-muted block">Approved OPLs</span>
                          <span className="text-lg font-black text-ink-strong">{oplCount}</span>
                        </div>
                        {compareType === 'jh_group' && (
                          <>
                            <div>
                              <span className="text-2xs text-ink-muted block">Members</span>
                              <span className="text-lg font-black text-ink-strong">{memberCount ?? '—'}</span>
                            </div>
                            <div>
                              <span className="text-2xs text-ink-muted block">OPL Index</span>
                              <span className="text-lg font-black text-blue-700">{oplIndex === null ? 'N/A' : oplIndex.toFixed(2)}</span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border border-line bg-surface-raised shadow-2xs overflow-hidden">
                      <div className="px-3 py-2 border-b border-line bg-surface-sunken text-2xs font-bold text-ink-strong">Category</div>
                      <div className="p-2">
                        {classTotal === 0 ? (
                          <p className="p-4 text-2xs text-ink-muted text-center">No data.</p>
                        ) : (
                          <ResponsiveContainer width="100%" height={200}>
                            <PieChart margin={{ top: 16, right: 16, bottom: 8, left: 16 }}>
                              <Pie data={classPie} dataKey="value" nameKey="name" cx="50%" cy="48%" outerRadius={56} label={renderPctLabel} labelLine={false} isAnimationActive={false}>
                                {classPie.map((row, idx) => (
                                  <Cell key={row.name} fill={ANALYTICS_CHART_PALETTE[idx % ANALYTICS_CHART_PALETTE.length]} />
                                ))}
                              </Pie>
                              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E7E5E4' }} />
                              <Legend wrapperStyle={{ fontSize: 10 }} />
                            </PieChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border border-line bg-surface-raised shadow-2xs overflow-hidden">
                      <div className="px-3 py-2 border-b border-line bg-surface-sunken text-2xs font-bold text-ink-strong">Critical vs Standard</div>
                      <div className="p-2">
                        {critTotal === 0 ? (
                          <p className="p-4 text-2xs text-ink-muted text-center">No data.</p>
                        ) : (
                          <ResponsiveContainer width="100%" height={200}>
                            <PieChart margin={{ top: 16, right: 16, bottom: 8, left: 16 }}>
                              <Pie data={critPie} dataKey="value" nameKey="name" cx="50%" cy="48%" outerRadius={56} label={renderPctLabel} labelLine={false} isAnimationActive={false}>
                                <Cell fill="#D97706" />
                                <Cell fill={ANALYTICS_CHART_AXIS} />
                              </Pie>
                              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E7E5E4' }} />
                              <Legend wrapperStyle={{ fontSize: 10 }} />
                            </PieChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border border-line bg-surface-raised shadow-2xs overflow-hidden">
                      <div className="px-3 py-2 border-b border-line bg-surface-sunken text-2xs font-bold text-ink-strong">Reviewer Workload</div>
                      {colReviewerWorkload.length === 0 ? (
                        <p className="p-4 text-2xs text-ink-muted text-center">Nothing awaiting review.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-2xs">
                            <tbody className="divide-y divide-line/60">
                              {colReviewerWorkload.map((r) => (
                                <tr key={`${r.emp_id}-${r.stage_order}`}>
                                  <td className="px-3 py-1.5 font-medium text-ink-strong">{r.worker_name}</td>
                                  <td className="px-3 py-1.5 text-ink-muted">{r.stage_name}</td>
                                  <td className="px-3 py-1.5 text-right font-semibold text-blue-700">{r.opl_count}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
            </>
          )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Backend returns "YYYY-MM"; display as MM/YYYY everywhere it's shown.
function formatMonthLabel(yyyyMm) {
  if (!yyyyMm || !yyyyMm.includes('-')) return yyyyMm;
  const [y, m] = yyyyMm.split('-');
  return `${m}/${y}`;
}

function MonthOnMonthTrend({ jhGroupId }) {
  const [monthsBack, setMonthsBack] = useState(6);
  const { data, isLoading, isError } = useOplAnalyticsTrend(
    { jh_group_id: jhGroupId, months: String(monthsBack) },
    { enabled: !!jhGroupId }
  );

  const months = data?.months || [];

  return (
    <div className="rounded-xl border border-line bg-surface-raised shadow-2xs overflow-hidden">
      <div className="px-3 py-2 border-b border-line bg-surface-sunken text-xs font-bold text-ink-strong flex items-center justify-between gap-2 flex-wrap">
        <span>Month-on-Month Trend — {data?.jh_group_name || 'Selected Group'}</span>
        <div className="flex items-center gap-1.5">
          <label className="text-2xs text-ink-muted font-medium">Months:</label>
          <select
            value={monthsBack}
            onChange={(e) => setMonthsBack(Number(e.target.value))}
            className="rounded-md border border-line bg-surface-base px-2 py-1 text-2xs text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-700"
          >
            {[3, 6, 12].map(n => <option key={n} value={n}>{n} months</option>)}
          </select>
        </div>
      </div>

      {isError && (
        <div className="p-4 text-xs text-ink-muted text-center">Failed to load trend data.</div>
      )}

      {isLoading ? (
        <div className="p-4"><SkeletonRow columns={3} /></div>
      ) : months.length === 0 ? (
        <div className="p-4 text-xs text-ink-muted text-center">No data for this group yet.</div>
      ) : (
        <>
          <div className="p-2">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={months} margin={{ top: 12, right: 12, bottom: 4, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={ANALYTICS_CHART_GRID} />
                <XAxis dataKey="month" tickFormatter={formatMonthLabel} tick={{ fontSize: 10, fill: ANALYTICS_CHART_AXIS }} tickLine={false} axisLine={{ stroke: ANALYTICS_CHART_GRID }} />
                <YAxis allowDecimals tick={{ fontSize: 11, fill: ANALYTICS_CHART_AXIS }} tickLine={false} axisLine={false} width={30} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E7E5E4' }} labelFormatter={formatMonthLabel} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="opl_count" name="OPLs Submitted" stroke="#0E7490" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                <Line type="monotone" dataKey="participation_pct" name="Participation %" stroke="#7C3AED" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                <Line type="monotone" dataKey="opl_index" name="OPL Index" stroke="#B45309" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="overflow-x-auto border-t border-line">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-surface-sunken/60 border-b border-line text-ink-muted font-semibold text-2xs uppercase tracking-wider">
                  <th className="p-2.5">Month</th>
                  <th className="p-2.5">OPLs Submitted</th>
                  <th className="p-2.5">Members That Month</th>
                  <th className="p-2.5">Participation %</th>
                  <th className="p-2.5">OPL Index</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {months.map((m) => (
                  <tr key={m.month}>
                    <td className="p-2.5 font-semibold text-ink-strong">{formatMonthLabel(m.month)}</td>
                    <td className="p-2.5 text-ink-strong">{m.opl_count}</td>
                    <td className="p-2.5 text-ink-strong">{m.member_count}</td>
                    <td className="p-2.5 text-ink-strong">{m.participation_pct === null ? 'N/A' : `${m.participation_pct}%`}</td>
                    <td className="p-2.5 text-ink-strong">{m.opl_index === null ? 'N/A' : m.opl_index.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
