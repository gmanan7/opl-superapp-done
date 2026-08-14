import { useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    Star, FileText, Send, Clock, User, List, MessageSquare,
    ImagePlus, X, Loader2, History, CheckCircle2, XCircle, AlertTriangle, Tag,
    GraduationCap, ChevronRight, ChevronLeft, Globe, Users, Building2, Search, Filter, BookOpen, Layers
} from 'lucide-react';
import {
    useOPLs, useOplDetails, useCreateOplDetail, useSubmitOPL,
    useJhAcceptOPL, useJhRejectOPL, useBeAcceptOPL, useBeRejectOPL,
    useSetStarOPL, useUpdateOplClassification
} from '../../hooks/useOPL';
import { useMyTrainingDue } from '../../hooks/useOPLTraining';
import { useOrgStructure } from '../../hooks/mdm';
import { compressImageAndUpload } from '../../lib/imageUpload';
import { CaptureColumn, StatusBadge, EmptyState, SkeletonRow, ConfirmModal } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { loadSession, getSessionContext, getName } from '../../lib/auth';
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
    pending_jh_review: 'Pending JH Review',
    pending_approval: 'Pending JH Review',
    pending_be_review: 'Pending BE Review',
    published: 'Approved',
    approved: 'Approved',
    rejected: 'Rejected'
};

const TYPE_LABEL = { know_how: 'opl.classBasic', problem_alert: 'opl.classProblem', std_change: 'opl.classStandard' };
const FILTERS = ['all', 'pending', 'approved', 'mine'];
const FILTER_LABEL = { all: 'opl.filterAll', pending: 'opl.filterPending', approved: 'opl.filterApproved', mine: 'opl.filterMine' };
const CLASSIFICATIONS = ['Knowledge', 'Basic Condition', 'Troubleshoot', 'Improvement'];

export function OPLList() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const session = loadSession();
    const ctx = getSessionContext();

    const [mainTab, setMainTab] = useState('details');
    const [filter, setFilter] = useState('all');

    // Standard OPL data
    const { data: opls = [], isLoading: isOplsLoading } = useOPLs(filter);
    const myDue = useMyTrainingDue();
    const dueCount = myDue.data?.length ?? 0;

    // OPL Details (opl_details table) data & mutations
    const { data: oplDetails = [], isLoading: isDetailsLoading } = useOplDetails();
    const createDetailMutation = useCreateOplDetail();
    const submitOplMutation = useSubmitOPL();
    const jhAcceptMutation = useJhAcceptOPL();
    const jhRejectMutation = useJhRejectOPL();
    const updateClassMutation = useUpdateOplClassification();

    const [classification, setClassification] = useState('Knowledge');
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
    const [detailsFilter, setDetailsFilter] = useState('draft');
    const [approvedSubFilter, setApprovedSubFilter] = useState('all');
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
    const [stdPageSize, setStdPageSize] = useState(3);
    const [selectedLessonSheet, setSelectedLessonSheet] = useState(null);

    // Fetch MDM OrgStructure to dynamically populate DMT and JH Groups hierarchy
    const { data: orgData } = useOrgStructure();

    // Mapping of DMT Levels to their corresponding JH Groups
    const dmtJhMap = useMemo(() => {
        const map = {
            'DMT 1': ['Printing - Group A', 'Printing - Group B', 'Alpha Team', 'Printing'],
            'DMT 2': ['Coating & Lamination', 'Beta Team', 'Coating'],
            'DMT 3': ['Maintenance & Utility', 'Gamma Team', 'Maintenance'],
            'DMT 4': ['Packaging & Dispatch', 'Delta Team', 'Packaging']
        };

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
            { value: 'all', label: 'All DMTs' },
            ...keys.map(k => ({ value: k, label: k }))
        ];
    }, [dmtJhMap]);

    // Cascading JH Group filter options based on selected DMT
    const availableJhGroups = useMemo(() => {
        if (selectedDmt === 'all') {
            const allGroups = new Set();
            Object.values(dmtJhMap).forEach(arr => arr.forEach(g => allGroups.add(g)));
            return [
                { value: 'all', label: 'All Groups' },
                ...Array.from(allGroups).map(g => ({ value: g, label: g }))
            ];
        }

        const groupList = dmtJhMap[selectedDmt] || [];
        return [
            { value: 'all', label: 'All Groups' },
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

    // Track clicked/viewed lessons & completed training status
    const [clickedLessonIds, setClickedLessonIds] = useState(() => {
        try {
            const stored = localStorage.getItem('tpm_clicked_lessons');
            return stored ? new Set(JSON.parse(stored)) : new Set();
        } catch {
            return new Set();
        }
    });

    const [completedLessonIds, setCompletedLessonIds] = useState(() => {
        try {
            const stored = localStorage.getItem('tpm_completed_trainings');
            return stored ? new Set(JSON.parse(stored)) : new Set();
        } catch {
            return new Set();
        }
    });

    const [completionRecords, setCompletionRecords] = useState(() => {
        try {
            const stored = localStorage.getItem('tpm_opl_completion_records');
            if (stored) return JSON.parse(stored);
        } catch (e) {
            console.error(e);
        }
        return [
            {
                opl_id: '1',
                worker_id: 'EMP-101',
                worker_name: 'Ramashankar Yadav',
                jh_group_name: 'Printing - Group A',
                plant_name: 'TVT',
                completed_at: '2026-08-10T10:30:00Z'
            },
            {
                opl_id: '1',
                worker_id: 'EMP-104',
                worker_name: 'Anil Kumar Sharma',
                jh_group_name: 'Maintenance & Utility',
                plant_name: 'TVT',
                completed_at: '2026-08-11T14:15:00Z'
            },
            {
                opl_id: '2',
                worker_id: 'EMP-102',
                worker_name: 'Priya Verma',
                jh_group_name: 'Coating & Lamination',
                plant_name: 'TVT',
                completed_at: '2026-08-09T09:00:00Z'
            },
            {
                opl_id: '2',
                worker_id: 'EMP-108',
                worker_name: 'Suresh Patel',
                jh_group_name: 'Packaging & Dispatch',
                plant_name: 'TVT',
                completed_at: '2026-08-10T16:20:00Z'
            }
        ];
    });

    const [viewingCompletionsOpl, setViewingCompletionsOpl] = useState(null);

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

        setCompletedLessonIds(prev => {
            const next = new Set(prev).add(key);
            localStorage.setItem('tpm_completed_trainings', JSON.stringify(Array.from(next)));
            return next;
        });

        const currentWorkerName = ctx?.worker_name || ctx?.user_name || session?.worker?.name || 'Ramashankar Yadav';
        const currentWorkerId = ctx?.worker_id || session?.worker?.worker_id || 'EMP-102';
        const currentJhGroup = ctx?.jh_group_name || ctx?.jh_group || session?.worker?.jh_group_name || 'Printing - Group A';
        const currentPlant = ctx?.factory_name || ctx?.factory_code || session?.worker?.default_plant || 'TVT';

        setCompletionRecords(prev => {
            const exists = prev.some(r => String(r.opl_id) === key && r.worker_id === currentWorkerId);
            if (exists) return prev;

            const newRecord = {
                opl_id: key,
                worker_id: currentWorkerId,
                worker_name: currentWorkerName,
                jh_group_name: currentJhGroup,
                plant_name: currentPlant,
                completed_at: new Date().toISOString()
            };
            const updated = [newRecord, ...prev];
            localStorage.setItem('tpm_opl_completion_records', JSON.stringify(updated));
            return updated;
        });

        toast.success('Training marked as completed successfully! 🎉');
    };

    // Accept / Approve Modal state
    const [acceptModalOpen, setAcceptModalOpen] = useState(false);
    const [targetDetailForAccept, setTargetDetailForAccept] = useState(null);
    const [isCriticalForAccept, setIsCriticalForAccept] = useState(false);

    // Inline Rejection state (no separate modal)
    const [inlineRejectOplId, setInlineRejectOplId] = useState(null);
    const [inlineRejectReason, setInlineRejectReason] = useState('');

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
            setClassification('Knowledge');
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

    const handleOpenAcceptModal = (detail) => {
        setTargetDetailForAccept(detail);
        setIsCriticalForAccept(Boolean(detail.is_star));
        setAcceptModalOpen(true);
    };

    const handleConfirmAccept = async () => {
        if (!targetDetailForAccept) return;
        try {
            await jhAcceptMutation.mutateAsync({
                id: targetDetailForAccept.opl_id,
                classification: targetDetailForAccept.classification,
                is_star: isCriticalForAccept,
                comments: `Approved by JH Group Lead ${currentActorName}${isCriticalForAccept ? ' (Marked Critical ★)' : ''}`,
                performed_by: currentActorName
            });
            toast.success(isCriticalForAccept ? 'OPL accepted and marked as Critical ★!' : 'OPL accepted and approved!');
            setAcceptModalOpen(false);
            setTargetDetailForAccept(null);
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

    const handleConfirmInlineReject = async (detail) => {
        if (!inlineRejectReason.trim()) {
            toast.error('Rejection comments are mandatory');
            return;
        }

        try {
            const formattedReason = `JH Lead ${currentActorName}: ${inlineRejectReason.trim()}`;
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

    const handleChangeClassification = async (detail, newClass) => {
        if (detail.classification === newClass) return;
        try {
            await updateClassMutation.mutateAsync({
                id: detail.opl_id,
                classification: newClass,
                performed_by: currentActorName
            });
            toast.success(`Classification changed to "${newClass}" and logged in Audit Trail`);
        } catch {
            toast.error('Failed to change classification');
        }
    };

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

    // Context for Standard Lessons & Roles
    const userJhGroup = ctx?.jh_group_name || ctx?.jh_group || session?.worker?.jh_group_name || 'Alpha Team';
    const userPlant = ctx?.factory_name || ctx?.factory_code || session?.worker?.default_plant || 'TVT';
    const userRole = (ctx?.role || session?.role || session?.worker?.tpm_role || 'operator').toLowerCase();

    const isBeLeadRole = userRole.includes('be_lead') || userRole === 'be_lead' || userRole === 'admin' || userRole === 'it_lead' || userRole === 'leadership';

    const isPlantBeLeadForOpl = (item) => {
        if (!isBeLeadRole) return false;
        const uPlant = (userPlant || '').toLowerCase();
        const itemPlant = (item?.plant_name || item?.plant || '').toLowerCase();
        if (!uPlant || !itemPlant) return true;
        return uPlant === itemPlant || uPlant === 'all' || userRole === 'admin' || userRole === 'it_lead' || userRole === 'leadership';
    };

    // Filtered list of Approved Standard Lessons
    const totalRemainingLessonsCount = oplDetails.filter(d => {
        const isApproved = d.status === 'approved' || d.status === 'published';
        if (!isApproved) return false;
        return !completedLessonIds.has(String(d.opl_id));
    }).length;

    const canPushTraining = userRole.includes('jh_lead') || userRole.includes('lead') || userRole === 'admin' || isBeLeadRole || userRole === 'it_lead' || userRole === 'leadership';

    const approvedStandardLessons = oplDetails.filter(d => {
        const isApproved = d.status === 'approved' || d.status === 'published';
        if (!isApproved) return false;

        const itemPlant = d.plant_name || 'TVT';
        const itemGroup = d.jh_group_name || 'Alpha Team';
        const itemDmt = d.dmt_level || d.dmt_name || d.dmt_code || d.dmt || null;

        if (stdTab === 'my_remaining') {
            if (completedLessonIds.has(String(d.opl_id))) return false;
            if (selectedDmt !== 'all') {
                if (itemDmt) {
                    if (itemDmt.toLowerCase() !== selectedDmt.toLowerCase()) return false;
                } else {
                    const validGroups = dmtJhMap[selectedDmt] || [];
                    if (!validGroups.some(g => g.toLowerCase() === itemGroup.toLowerCase())) return false;
                }
            }
            if (selectedPlant !== 'all' && itemPlant !== selectedPlant) return false;
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
            if (selectedPlant !== 'all' && itemPlant !== selectedPlant) return false;
            if (selectedJhGroup !== 'all' && itemGroup.toLowerCase() !== selectedJhGroup.toLowerCase()) return false;
        }

        if (selectedClassification !== 'all') {
            const itemClass = (d.classification || 'Knowledge').toLowerCase();
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
          <div className="grid grid-cols-3 rounded-lg bg-surface-sunken p-1 gap-1">
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
                {oplDetails.length > 0 && (
                  <span className="rounded-full bg-brand-soft text-brand-strong border border-brand-soft px-1.5 py-0.5 text-2xs sm:text-xs font-bold shrink-0">
                    {oplDetails.length}
                  </span>
                )}
              </div>
            </button>

            <button type="button" onClick={() => setMainTab('standard')} className={`rounded-md px-1.5 sm:px-3 py-2 text-xs sm:text-sm font-medium transition-colors ${mainTab === 'standard' ? 'bg-surface-raised text-ink-strong shadow-xs font-semibold' : 'text-ink-muted hover:text-ink-strong'}`}>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 text-center sm:text-left">
                <List size={16} className="shrink-0"/>
                <span className="leading-tight break-words">Standard Lessons</span>
              </div>
            </button>
          </div>


        </CaptureColumn>
      </header>

      <CaptureColumn>
        {mainTab === 'details' ? (<div className="space-y-6 py-4">
            {/* OPL Details Form */}
            <form onSubmit={handleCreateDetail} className="rounded-xl border border-line bg-surface-raised p-5 shadow-xs space-y-4">
              <div className="flex items-center gap-2 border-b border-line pb-3">
                <FileText className="text-brand-strong" size={20}/>
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
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {CLASSIFICATIONS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setClassification(c)}
                        className={`min-h-touch rounded-lg border px-3 py-2 text-xs font-semibold transition-all ${
                          classification === c
                            ? 'border-brand-strong bg-brand-strong text-white shadow-xs'
                            : 'border-line bg-surface-base text-ink-muted hover:bg-surface-raised hover:text-ink-strong'
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label htmlFor="opl-title-input" className="block text-sm font-medium text-ink-strong mb-1">
                    Title <span className="text-danger-fg">*</span>
                  </label>
                  <input id="opl-title-input" type="text" required placeholder="Enter OPL Title" value={detailTitle} onChange={(e) => setDetailTitle(e.target.value)} className="w-full rounded-lg border border-line bg-surface-base px-3 py-2 text-sm text-ink-strong focus:outline-none focus:ring-2 focus:ring-brand-strong"/>
                </div>

                <div>
                  <label htmlFor="opl-content-input" className="block text-sm font-medium text-ink-strong mb-1">
                    Description <span className="text-danger-fg">*</span>
                  </label>
                  <textarea id="opl-content-input" required rows={4} placeholder="Provide key descriptive steps and instructions." value={detailContent} onChange={(e) => setDetailContent(e.target.value)} className="w-full rounded-lg border border-line bg-surface-base px-3 py-2 text-sm text-ink-strong focus:outline-none focus:ring-2 focus:ring-brand-strong"/>
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
                        <img src={beforeImage} alt="Before" className="h-32 w-full object-cover rounded-md" />
                        <button type="button" onClick={() => setBeforeImage(null)} className="absolute top-2 right-2 rounded-full bg-black/60 p-1 text-white hover:bg-black/80 transition-colors">
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => beforeFileRef.current?.click()} disabled={isCompressingBefore} className="flex h-32 w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-line bg-surface-base hover:border-brand-strong hover:bg-surface-raised transition-colors text-ink-muted">
                        {isCompressingBefore ? <Loader2 size={20} className="animate-spin text-brand-strong" /> : <ImagePlus size={20} className="text-brand-strong" />}
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
                        placeholder="Describe before condition..."
                        value={beforeDescription}
                        onChange={(e) => setBeforeDescription(e.target.value)}
                        className="w-full rounded-lg border border-line bg-surface-base px-2.5 py-1.5 text-xs text-ink-strong focus:outline-none focus:ring-2 focus:ring-brand-strong"
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
                        <img src={afterImage} alt="After" className="h-32 w-full object-cover rounded-md" />
                        <button type="button" onClick={() => setAfterImage(null)} className="absolute top-2 right-2 rounded-full bg-black/60 p-1 text-white hover:bg-black/80 transition-colors">
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => afterFileRef.current?.click()} disabled={isCompressingAfter} className="flex h-32 w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-line bg-surface-base hover:border-brand-strong hover:bg-surface-raised transition-colors text-ink-muted">
                        {isCompressingAfter ? <Loader2 size={20} className="animate-spin text-brand-strong" /> : <ImagePlus size={20} className="text-brand-strong" />}
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
                        placeholder="Describe after condition..."
                        value={afterDescription}
                        onChange={(e) => setAfterDescription(e.target.value)}
                        className="w-full rounded-lg border border-line bg-surface-base px-2.5 py-1.5 text-xs text-ink-strong focus:outline-none focus:ring-2 focus:ring-brand-strong"
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
              <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 bg-surface-raised p-2.5 sm:p-3 rounded-xl border border-line shadow-xs">
                <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
                  <div className="flex items-center gap-1 rounded-lg border border-line bg-surface-sunken p-1 text-xs">
                    {[
                      { key: 'draft', label: 'Draft' },
                      { key: 'pending_jh_review', label: 'Pending' },
                      { key: 'approved', label: 'Approved' },
                      { key: 'rejected', label: 'Rejected' }
                    ].map((st) => (
                      <button
                        key={st.key}
                        type="button"
                        onClick={() => {
                          setDetailsFilter(st.key);
                          setCurrentPage(1);
                        }}
                        className={`px-3 py-1.5 rounded-md transition-all text-xs font-medium text-center ${
                          detailsFilter === st.key
                            ? 'bg-surface-raised text-brand-strong font-semibold shadow-xs'
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
                  className="rounded-lg border border-line bg-surface-base px-3 py-1.5 text-xs text-ink-strong focus:outline-none focus:ring-2 focus:ring-brand-strong w-full md:w-48 shrink-0"
                />
              </div>

              {isDetailsLoading ? ([0, 1].map((i) => <SkeletonRow key={i} columns={3}/>)) : filteredDetails.length === 0 ? (
                <EmptyState title="No OPLs Found" description="Submit a new OPL or adjust filters to view items in the review workflow."/>
              ) : (
                <div className="space-y-4">
                  {paginatedDetails.map((detail) => (
                    <div key={detail.opl_id} className="rounded-xl border border-line bg-surface-raised p-4 transition-all hover:border-brand-soft shadow-xs max-w-full overflow-hidden space-y-3">
                      
                      {/* Card Header */}
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 border-b border-line/60 pb-2">
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          {detail.is_star && (
                            <span className="inline-flex items-center gap-1 text-2xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 px-2 py-0.5 rounded-md shrink-0" title="Critical OPL">
                              <Star size={13} className="fill-amber-400 text-amber-500" />
                              <span>Critical</span>
                            </span>
                          )}

                          <span className="inline-block rounded-md bg-stone-100 dark:bg-stone-800 px-2 py-0.5 text-xs font-mono font-medium text-ink-muted shrink-0">
                            OPL #{detail.opl_id}
                          </span>

                          <h4 className="inline text-base font-semibold text-ink-strong break-words min-w-0">{detail.title}</h4>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <StatusBadge
                            status={STATUS_KEY[detail.status] ?? 'neutral'}
                            label={STATUS_LABEL[detail.status] ?? detail.status}
                            size="sm"
                          />
                          <span className="inline-flex items-center gap-1 text-2xs text-ink-muted">
                            <Clock size={12}/>
                            {detail.timestamp ? new Date(detail.timestamp).toLocaleString() : 'Just now'}
                          </span>
                        </div>
                      </div>

                      {/* Author & Classification Bar */}
                      <div className="flex flex-wrap items-center justify-between gap-2 bg-surface-sunken px-3 py-2 rounded-lg text-xs">
                        <div className="flex items-center gap-1.5 text-ink-muted">
                          <User size={13} className="text-brand-strong" />
                          <span>Submitted by: <strong className="text-ink-strong">{detail.submitted_by || 'Plant Admin'}</strong></span>
                        </div>

                        {/* Editable Classification dropdown */}
                        <div className="flex items-center gap-1.5">
                          <Tag size={13} className="text-brand-strong" />
                          <span className="text-ink-muted font-medium">Classification:</span>
                          <select
                            value={detail.classification || 'Knowledge'}
                            onChange={(e) => handleChangeClassification(detail, e.target.value)}
                            className="rounded-md border border-line bg-surface-raised px-2 py-0.5 text-xs font-semibold text-brand-strong focus:outline-none focus:ring-1 focus:ring-brand-strong"
                          >
                            {CLASSIFICATIONS.map(c => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
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
                                <img src={detail.before_image} alt="Before" className="h-36 w-full object-cover rounded-lg border border-line bg-surface-sunken" />
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
                                <img src={detail.after_image} alt="After" className="h-36 w-full object-cover rounded-lg border border-line bg-surface-sunken" />
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
                        <div className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                          <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-semibold text-amber-800 dark:text-amber-300">Review / Rejection Note:</p>
                            <p className="mt-0.5 whitespace-pre-wrap">{detail.rejection_reason}</p>
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
                            <History size={14} className="text-brand-strong" />
                            <span>Audit Trail</span>
                          </button>
                        ) : <div />}

                        <div className="flex items-center gap-2">
                          {/* Submit for Review if Draft */}
                          {detail.status === 'draft' && (
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

                          {/* JH Lead Review Actions */}
                          {(detail.status === 'pending_jh_review' || detail.status === 'pending_approval' || detail.status === 'pending_be_review') && (
                            <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950/30 p-1.5 rounded-lg border border-amber-200 dark:border-amber-800/50">
                              <span className="text-2xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wide px-1">JH Lead Review:</span>
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => handleOpenAcceptModal(detail)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1 text-xs px-2.5 py-1 h-8"
                              >
                                <CheckCircle2 size={14} />
                                <span>Accept</span>
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                onClick={() => handleToggleInlineReject(detail)}
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
                    </div>
                  ))}

                  {/* Pagination Controls */}
                  {totalItems > 0 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-surface-raised p-3 rounded-xl border border-line shadow-xs text-xs text-ink-muted">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>Showing <strong>{(validPage - 1) * pageSize + 1}</strong> to <strong>{Math.min(validPage * pageSize, totalItems)}</strong> of <strong>{totalItems}</strong> OPLs</span>
                        <select
                          value={pageSize}
                          onChange={(e) => {
                            setPageSize(Number(e.target.value));
                            setCurrentPage(1);
                          }}
                          className="rounded border border-line bg-surface-base px-2 py-1 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-brand-strong font-medium"
                        >
                          <option value={3}>3 / page</option>
                          <option value={5}>5 / page</option>
                          <option value={10}>10 / page</option>
                          <option value={20}>20 / page</option>
                          <option value={50}>50 / page</option>
                        </select>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={validPage <= 1}
                          onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                          className="h-8 px-2.5 text-xs gap-1"
                        >
                          <ChevronLeft size={14} />
                          <span>Previous</span>
                        </Button>

                        <span className="px-2 font-medium text-ink-strong">
                          Page {validPage} of {totalPages}
                        </span>

                        <Button
                          variant="outline"
                          size="sm"
                          disabled={validPage >= totalPages}
                          onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                          className="h-8 px-2.5 text-xs gap-1"
                        >
                          <span>Next</span>
                          <ChevronRight size={14} />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* Standard Lessons Tab */
            <div className="space-y-4 py-4 max-w-full overflow-hidden">
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
                        ? 'bg-surface-raised text-brand-strong font-semibold shadow-xs'
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
                        ? 'bg-surface-raised text-brand-strong font-semibold shadow-xs'
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
                    <span className="px-1.5 py-0.2 rounded-full text-3xs font-bold bg-amber-500 text-white shadow-2xs">
                      {totalRemainingLessonsCount}
                    </span>
                  </button>
                </div>

                {/* Search Bar for Standard Lessons */}
                <div className="relative flex-1 sm:max-w-xs">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-subtle pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search standard lessons..."
                    value={stdSearchQuery}
                    onChange={(e) => {
                      setStdSearchQuery(e.target.value);
                      setStdCurrentPage(1);
                    }}
                    className="w-full rounded-lg border border-line bg-surface-base pl-8 pr-3 py-1.5 text-xs text-ink-strong focus:outline-none focus:ring-2 focus:ring-brand-strong"
                  />
                </div>
              </div>

              {/* Sub-Tab Specific Header / Controls */}
              {stdTab === 'all' ? (
                /* Toggle Options for DMT Level, Plants, JH Groups, Classification, Priority */
                <div className="flex flex-col gap-2.5 bg-surface-sunken p-3 rounded-xl border border-line text-xs">
                  {/* Row 1: Plant Filter */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-2xs font-bold text-ink-muted uppercase tracking-wider flex items-center gap-1 shrink-0">
                      <Building2 size={12} className="text-brand-strong" /> Plant:
                    </span>
                    <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg border border-line bg-surface-base flex-wrap">
                      {[
                        { value: 'all', label: 'All Plants' },
                        { value: 'TVT', label: 'TVT' },
                        { value: 'NPF', label: 'NPF' },
                        { value: 'UPF', label: 'UPF' },
                        { value: 'MPF', label: 'MPF' }
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            setSelectedPlant(opt.value);
                            setStdCurrentPage(1);
                          }}
                          className={`px-2.5 py-1 rounded-md text-2xs font-semibold transition-all ${
                            selectedPlant === opt.value
                              ? 'bg-brand-strong text-white shadow-2xs'
                              : 'text-ink-muted hover:text-ink-strong hover:bg-surface-raised/70'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Row 2: DMT Level and JH Group together */}
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                    {/* DMT Level Select */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-2xs font-bold text-ink-muted uppercase tracking-wider flex items-center gap-1 shrink-0">
                        <Layers size={12} className="text-brand-strong" /> DMT Level:
                      </span>
                      <select
                        value={selectedDmt}
                        onChange={(e) => handleDmtChange(e.target.value)}
                        className="px-2.5 py-1 rounded-lg border border-line bg-surface-base text-2xs font-semibold text-ink-strong focus:outline-none focus:ring-2 focus:ring-brand-strong cursor-pointer shadow-2xs"
                      >
                        {dmtOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Cascading JH Group Select */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-2xs font-bold text-ink-muted uppercase tracking-wider flex items-center gap-1 shrink-0">
                        <Users size={12} className="text-brand-strong" /> JH Group:
                      </span>
                      <select
                        value={selectedJhGroup}
                        onChange={(e) => {
                          setSelectedJhGroup(e.target.value);
                          setStdCurrentPage(1);
                        }}
                        className="px-2.5 py-1 rounded-lg border border-line bg-surface-base text-2xs font-semibold text-ink-strong focus:outline-none focus:ring-2 focus:ring-brand-strong cursor-pointer shadow-2xs"
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
                        <Tag size={12} className="text-brand-strong" /> Type:
                      </span>
                      <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg border border-line bg-surface-base flex-wrap">
                        {[
                          { value: 'all', label: 'All Types' },
                          { value: 'Knowledge', label: 'Knowledge' },
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
                            className={`px-2.5 py-1 rounded-md text-2xs font-semibold transition-all ${
                              selectedClassification === opt.value
                                ? 'bg-brand-strong text-white shadow-2xs'
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
                      <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg border border-line bg-surface-base flex-wrap">
                        {[
                          { value: 'all', label: 'All Priorities' },
                          { value: 'critical', label: '★ Critical Only' },
                          { value: 'standard', label: 'Standard Only' }
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              setSelectedCriticalFilter(opt.value);
                              setStdCurrentPage(1);
                            }}
                            className={`px-2.5 py-1 rounded-md text-2xs font-semibold transition-all ${
                              selectedCriticalFilter === opt.value
                                ? opt.value === 'critical'
                                  ? 'bg-amber-500 text-white shadow-2xs font-bold'
                                  : 'bg-brand-strong text-white shadow-2xs'
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
                        className="flex items-center gap-1 text-xs font-semibold text-brand-strong hover:text-brand-strong/80 px-2.5 py-1 bg-surface-base rounded-lg border border-line hover:border-brand-strong transition-colors"
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
                <div className="flex flex-col gap-3 bg-brand-soft/20 border border-brand-strong/20 p-3 rounded-xl text-xs">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
                    <div className="flex items-center gap-2 pr-3 border-r border-brand-strong/20">
                      <Users size={16} className="text-brand-strong" />
                      <span className="font-bold text-ink-strong">My JH Group: {userJhGroup}</span>
                    </div>

                    {/* Classification / Type Toggle */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-2xs font-bold text-ink-muted uppercase tracking-wider flex items-center gap-1 shrink-0">
                        <Tag size={12} className="text-brand-strong" /> Type:
                      </span>
                      <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg border border-line bg-surface-base flex-wrap">
                        {[
                          { value: 'all', label: 'All Types' },
                          { value: 'Knowledge', label: 'Knowledge' },
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
                            className={`px-2.5 py-1 rounded-md text-2xs font-semibold transition-all ${
                              selectedClassification === opt.value
                                ? 'bg-brand-strong text-white shadow-2xs'
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
                      <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg border border-line bg-surface-base flex-wrap">
                        {[
                          { value: 'all', label: 'All Priorities' },
                          { value: 'critical', label: '★ Critical Only' },
                          { value: 'standard', label: 'Standard Only' }
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              setSelectedCriticalFilter(opt.value);
                              setStdCurrentPage(1);
                            }}
                            className={`px-2.5 py-1 rounded-md text-2xs font-semibold transition-all ${
                              selectedCriticalFilter === opt.value
                                ? opt.value === 'critical'
                                  ? 'bg-amber-500 text-white shadow-2xs font-bold'
                                  : 'bg-brand-strong text-white shadow-2xs'
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
                        className="flex items-center gap-1 text-xs font-semibold text-brand-strong hover:text-brand-strong/80 px-2.5 py-1 bg-surface-base rounded-lg border border-line hover:border-brand-strong transition-colors"
                      >
                        <X size={12} /> Clear Filters
                      </button>
                    )}
                  </div>

                  <div className="text-2xs text-ink-muted font-medium pt-1.5 border-t border-brand-strong/15 flex items-center justify-between">
                    <span>JH Group Lessons</span>
                    <span>Showing <span className="font-bold text-ink-strong">{approvedStandardLessons.length}</span> lessons in {userJhGroup}</span>
                  </div>
                </div>
              ) : (
                /* Header / Controls for My Remaining Trainings with Toggle Options */
                <div className="flex flex-col gap-2.5 bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl text-xs">
                  {/* Row 1: Remaining Badge & Plant Filter */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <div className="flex items-center gap-2 pr-3 border-r border-amber-500/20 shrink-0">
                      <Clock size={16} className="text-amber-600" />
                      <span className="font-bold text-amber-900">Remaining Trainings ({totalRemainingLessonsCount})</span>
                    </div>

                    {/* Plant Toggle */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-2xs font-bold text-amber-950/70 uppercase tracking-wider flex items-center gap-1 shrink-0">
                        <Building2 size={12} className="text-amber-600" /> Plant:
                      </span>
                      <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg border border-amber-300/40 bg-surface-base flex-wrap">
                        {[
                          { value: 'all', label: 'All Plants' },
                          { value: 'TVT', label: 'TVT' },
                          { value: 'NPF', label: 'NPF' },
                          { value: 'UPF', label: 'UPF' },
                          { value: 'MPF', label: 'MPF' }
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              setSelectedPlant(opt.value);
                              setStdCurrentPage(1);
                            }}
                            className={`px-2.5 py-1 rounded-md text-2xs font-semibold transition-all ${
                              selectedPlant === opt.value
                                ? 'bg-amber-600 text-white shadow-2xs font-bold'
                                : 'text-amber-950/80 hover:text-amber-950 hover:bg-amber-500/10'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Row 2: DMT Level and JH Group together */}
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                    {/* DMT Level Select */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-2xs font-bold text-amber-950/70 uppercase tracking-wider flex items-center gap-1 shrink-0">
                        <Layers size={12} className="text-amber-600" /> DMT Level:
                      </span>
                      <select
                        value={selectedDmt}
                        onChange={(e) => handleDmtChange(e.target.value)}
                        className="px-2.5 py-1 rounded-lg border border-amber-300/60 bg-surface-base text-2xs font-semibold text-amber-950 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer shadow-2xs"
                      >
                        {dmtOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Cascading JH Group Select */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-2xs font-bold text-amber-950/70 uppercase tracking-wider flex items-center gap-1 shrink-0">
                        <Users size={12} className="text-amber-600" /> JH Group:
                      </span>
                      <select
                        value={selectedJhGroup}
                        onChange={(e) => {
                          setSelectedJhGroup(e.target.value);
                          setStdCurrentPage(1);
                        }}
                        className="px-2.5 py-1 rounded-lg border border-amber-300/60 bg-surface-base text-2xs font-semibold text-amber-950 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer shadow-2xs"
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
                      <span className="text-2xs font-bold text-amber-950/70 uppercase tracking-wider flex items-center gap-1 shrink-0">
                        <Tag size={12} className="text-amber-600" /> Type:
                      </span>
                      <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg border border-amber-300/40 bg-surface-base flex-wrap">
                        {[
                          { value: 'all', label: 'All Types' },
                          { value: 'Knowledge', label: 'Knowledge' },
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
                            className={`px-2.5 py-1 rounded-md text-2xs font-semibold transition-all ${
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
                          { value: 'all', label: 'All Priorities' },
                          { value: 'critical', label: '★ Critical Only' },
                          { value: 'standard', label: 'Standard Only' }
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              setSelectedCriticalFilter(opt.value);
                              setStdCurrentPage(1);
                            }}
                            className={`px-2.5 py-1 rounded-md text-2xs font-semibold transition-all ${
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
                  title={stdTab === 'my_remaining' ? 'No Remaining Trainings Due' : 'No Approved Standard Lessons Found'}
                  description={
                    stdTab === 'my_remaining'
                      ? 'Great job! You have completed all required standard lesson trainings.'
                      : stdTab === 'my_jh_group'
                      ? `No approved standard lessons currently found for ${userJhGroup}.`
                      : 'Try adjusting your Plant, JH Group, Type, or search filters.'
                  }
                />
              ) : (
                <div className="space-y-3">
                  {paginatedStandardLessons.map((item) => {
                    const itemKey = String(item.opl_id);
                    const isClicked = clickedLessonIds.has(itemKey);
                    const isCompleted = completedLessonIds.has(itemKey);
                    const oplCompletions = completionRecords.filter(r => String(r.opl_id) === itemKey);

                    return (
                      <div
                        key={item.opl_id}
                        onClick={() => {
                          handleLessonOpened(item.opl_id);
                          setSelectedLessonSheet(item);
                        }}
                        className="group rounded-xl border border-line bg-surface-raised p-4 shadow-2xs space-y-3 transition-all hover:border-brand-strong/60 hover:shadow-md cursor-pointer"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line/60 pb-2.5">
                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-semibold text-ink-muted bg-surface-sunken px-2 py-0.5 rounded-md border border-line">
                                {item.classification || 'Knowledge'}
                              </span>
                              {item.is_star && (
                                <span className="inline-flex items-center gap-1 text-2xs font-bold bg-amber-500 text-white px-2 py-0.5 rounded-md shadow-2xs">
                                  <Star size={12} className="fill-white text-white" />
                                  Critical OPL
                                </span>
                              )}
                            </div>
                            <h3 className="text-sm sm:text-base font-semibold text-ink-strong group-hover:text-brand-strong transition-colors">
                              {item.title}
                            </h3>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="outline"
                              size="xs"
                              onClick={() => {
                                handleLessonOpened(item.opl_id);
                                setSelectedLessonSheet(item);
                              }}
                              className="text-2xs h-7 px-2.5 bg-brand-soft/40 border-brand-strong/30 text-brand-strong font-semibold hover:bg-brand-strong hover:text-white transition-colors"
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
                                className="text-2xs h-7 px-2.5 bg-brand-soft/70 border-brand-strong/40 text-brand-strong font-bold hover:bg-brand-strong hover:text-white transition-all shadow-2xs"
                              >
                                <Send size={12} className="mr-1" /> Push Training
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
                                className="text-2xs h-7 px-2 text-ink-muted hover:text-brand-strong"
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
                                <Building2 size={12} className="text-ink-subtle" /> Plant: <strong className="text-ink-strong">{item.plant_name || 'TVT'}</strong>
                              </span>
                              <span className="flex items-center gap-1">
                                <Users size={12} className="text-ink-subtle" /> JH Group: <strong className="text-ink-strong">{item.jh_group_name || 'Alpha Team'}</strong>
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
                                  <img src={item.before_image} alt="Before" className="h-full w-full object-cover" />
                                  <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-3xs text-center py-0.5">Before</span>
                                </div>
                              )}
                              {item.after_image && (
                                <div className="relative h-20 w-24 rounded-lg overflow-hidden border border-line bg-black/5">
                                  <img src={item.after_image} alt="After" className="h-full w-full object-cover" />
                                  <span className="absolute bottom-0 inset-x-0 bg-brand-strong/80 text-white text-3xs text-center py-0.5">After</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Trainees Completion Section & Training Completion Actions */}
                        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3 border-t border-line/60" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => setViewingCompletionsOpl(item)}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-line bg-surface-sunken hover:bg-surface-hover hover:border-brand-strong/40 text-ink-strong text-2xs font-medium transition-all shadow-2xs group/comp"
                          >
                            <div className="flex items-center gap-1 text-brand-strong">
                              <Users size={14} />
                              <span className="font-bold">{oplCompletions.length}</span>
                            </div>
                            <span>Completed Trainees (JH Groups)</span>
                            <span className="text-3xs bg-brand-soft text-brand-strong px-1.5 py-0.5 rounded font-semibold group-hover/comp:bg-brand-strong group-hover/comp:text-white transition-colors">
                              View List →
                            </span>
                          </button>

                          <div className="flex items-center gap-2">
                            {isCompleted ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-2xs shadow-2xs">
                                <CheckCircle2 size={14} className="text-emerald-600" />
                                <span>Training Completed</span>
                              </span>
                            ) : isClicked ? (
                              <Button
                                variant="default"
                                size="xs"
                                onClick={() => handleMarkTrainingCompleted(item)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 px-3.5 font-bold shadow-xs transition-colors"
                              >
                                <CheckCircle2 size={15} className="mr-1" /> Complete My Training
                              </Button>
                            ) : (
                              <span className="text-2xs text-ink-muted italic">
                                Tap card to read lesson & unlock training completion
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Standard Lessons Pagination Controls */}
                  {approvedStandardLessons.length > 0 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-line/60">
                      <div className="flex items-center gap-2 text-xs text-ink-muted">
                        <span>
                          Showing <strong className="text-ink-strong">{stdStartIndex + 1}</strong> to{' '}
                          <strong className="text-ink-strong">
                            {Math.min(stdStartIndex + stdPageSize, approvedStandardLessons.length)}
                          </strong>{' '}
                          of <strong className="text-ink-strong">{approvedStandardLessons.length}</strong> lessons
                        </span>
                        <div className="flex items-center gap-1.5 ml-2 border-l border-line pl-3">
                          <label htmlFor="std-page-size-select" className="text-2xs font-medium">Per page:</label>
                          <select
                            id="std-page-size-select"
                            value={stdPageSize}
                            onChange={(e) => {
                              setStdPageSize(Number(e.target.value));
                              setStdCurrentPage(1);
                            }}
                            className="rounded border border-line bg-surface-base px-2 py-1 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-brand-strong font-medium"
                          >
                            <option value={3}>3 / page</option>
                            <option value={5}>5 / page</option>
                            <option value={10}>10 / page</option>
                            <option value={20}>20 / page</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={stdValidPage <= 1}
                          onClick={() => setStdCurrentPage(prev => Math.max(prev - 1, 1))}
                          className="h-8 px-2.5 text-xs gap-1"
                        >
                          <ChevronLeft size={14} />
                          <span>Previous</span>
                        </Button>
                        <span className="text-xs font-semibold px-2 text-ink-strong">
                          Page {stdValidPage} of {stdTotalPages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={stdValidPage >= stdTotalPages}
                          onClick={() => setStdCurrentPage(prev => Math.min(prev + 1, stdTotalPages))}
                          className="h-8 px-2.5 text-xs gap-1"
                        >
                          <span>Next</span>
                          <ChevronRight size={14} />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
      </CaptureColumn>

      {/* Modals for Accept/Approve, Rejection Comments, Audit Trail & Submitter Edit */}
      <ConfirmModal
        open={acceptModalOpen}
        onOpenChange={setAcceptModalOpen}
        title="Is this critical OPL?"
        description="Choose whether to mark this OPL as critical upon approval."
        severity="success"
        primaryLabel="Approve OPL"
        isWorking={jhAcceptMutation.isPending}
        onConfirm={handleConfirmAccept}
      >
        <div className="space-y-3 pt-1">
          {targetDetailForAccept && (
            <div className="p-3 rounded-lg border border-line bg-surface-sunken space-y-1">
              <p className="text-2xs font-medium text-ink-muted">Title:</p>
              <p className="text-sm font-semibold text-ink-strong">{targetDetailForAccept.title}</p>
            </div>
          )}

          <label className="flex items-start gap-3 p-3 rounded-lg border border-amber-200 dark:border-amber-800/60 bg-amber-50/50 dark:bg-amber-950/20 cursor-pointer hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors">
            <input
              type="checkbox"
              checked={isCriticalForAccept}
              onChange={(e) => setIsCriticalForAccept(e.target.checked)}
              className="mt-0.5 rounded text-amber-600 focus:ring-amber-500 h-4 w-4"
            />
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1">
                <Star size={14} className="fill-amber-400 text-amber-500" />
                Yes, mark as Critical OPL
              </span>
              <p className="text-2xs text-amber-800/80 dark:text-amber-300/80">
                Critical OPLs display a prominent Star ★ badge in the library for high priority operator training.
              </p>
            </div>
          </label>
        </div>
      </ConfirmModal>

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
          isCompleted={completedLessonIds.has(String(selectedLessonSheet.opl_id))}
          onMarkCompleted={(id) => handleMarkTrainingCompleted(id)}
          onLessonOpened={(id) => handleLessonOpened(id)}
        />
      )}

      {/* Training Completion Records Modal by JH Groups */}
      {viewingCompletionsOpl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-2xl rounded-2xl bg-surface-raised border border-line p-5 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-start justify-between border-b border-line pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <GraduationCap size={20} className="text-brand-strong" />
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
              const records = completionRecords.filter(r => String(r.opl_id) === itemKey);
              const uniqueJhGroups = Array.from(new Set(records.map(r => r.jh_group_name).filter(Boolean)));

              return (
                <div className="space-y-4 flex-1 overflow-y-auto pr-1">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-line bg-surface-sunken p-3">
                      <span className="text-2xs text-ink-muted font-medium">Total Trainees Completed</span>
                      <div className="text-xl font-black text-brand-strong mt-0.5">
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

                  {/* List / Table of trainees who completed */}
                  {records.length > 0 ? (
                    <div className="rounded-xl border border-line overflow-hidden">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-surface-sunken border-b border-line text-ink-muted font-semibold text-2xs uppercase tracking-wider">
                            <th className="p-2.5">Trainee Name</th>
                            <th className="p-2.5">JH Group</th>
                            <th className="p-2.5">Plant</th>
                            <th className="p-2.5">Date Completed</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                          {records.map((r, idx) => (
                            <tr key={idx} className="hover:bg-surface-hover/50 transition-colors">
                              <td className="p-2.5 font-semibold text-ink-strong">
                                {r.worker_name}
                                <span className="block text-3xs text-ink-muted font-normal">{r.worker_id}</span>
                              </td>
                              <td className="p-2.5">
                                <span className="inline-flex items-center gap-1 text-2xs font-bold bg-brand-soft/60 text-brand-strong px-2 py-0.5 rounded-md border border-brand-strong/20">
                                  <Users size={11} /> {r.jh_group_name || 'Printing'}
                                </span>
                              </td>
                              <td className="p-2.5 text-ink-muted font-medium">
                                {r.plant_name || 'TVT'}
                              </td>
                              <td className="p-2.5 text-ink-subtle text-2xs">
                                {r.completed_at ? new Date(r.completed_at).toLocaleDateString() : 'Recent'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
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
          userJhGroup={userJhGroup}
          onPush={(assignmentData) => {
            toast.success(`Training for OPL #${assignmentData.opl_id} successfully pushed to ${assignmentData.target_group}!`);
            try {
              const existing = JSON.parse(localStorage.getItem('tpm_pushed_trainings') || '[]');
              existing.unshift(assignmentData);
              localStorage.setItem('tpm_pushed_trainings', JSON.stringify(existing));
            } catch (e) {
              console.error(e);
            }
          }}
        />
      )}
    </div>);
}

function PushTrainingModal({ isOpen, onClose, opl, userJhGroup, onPush }) {
  const [selectedGroup, setSelectedGroup] = useState(userJhGroup || 'Alpha Team');
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [urgency, setUrgency] = useState('mandatory');
  const [notes, setNotes] = useState('');

  const sampleMembers = [
    { id: 'EMP-101', name: 'Ramashankar Yadav', group: 'Printing - Group A' },
    { id: 'EMP-102', name: 'Priya Verma', group: 'Coating & Lamination' },
    { id: 'EMP-103', name: 'Anil Kumar Sharma', group: 'Maintenance & Utility' },
    { id: 'EMP-104', name: 'Suresh Patel', group: 'Packaging & Dispatch' },
    { id: 'EMP-105', name: 'Rajesh Verma', group: 'Alpha Team' },
    { id: 'EMP-106', name: 'Vikram Singh', group: 'Beta Team' },
    { id: 'EMP-107', name: 'Sanjay Dutt', group: 'Gamma Team' },
    { id: 'EMP-108', name: 'Manoj Tiwari', group: 'Delta Team' },
  ];

  if (!isOpen || !opl) return null;

  const toggleMember = (id) => {
    setSelectedMembers(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedMembers.length === sampleMembers.length) {
      setSelectedMembers([]);
    } else {
      setSelectedMembers(sampleMembers.map(m => m.id));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onPush({
      opl_id: opl.opl_id,
      opl_title: opl.title,
      target_group: selectedGroup,
      selected_member_ids: selectedMembers,
      urgency,
      notes: notes.trim(),
      pushed_at: new Date().toISOString()
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-surface-raised p-5 shadow-xl border border-line space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-brand-strong font-bold">
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
            <span className="text-brand-strong font-bold">{opl.classification || 'Knowledge'}</span>
          </div>
          <p className="text-xs font-bold text-ink-strong">{opl.title}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Target Group Selection */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-ink-strong flex items-center gap-1.5">
              <Users size={14} className="text-brand-strong" /> Select Target JH Group
            </label>
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="w-full rounded-lg border border-line bg-surface-base px-3 py-2 text-xs font-medium text-ink-strong focus:outline-none focus:ring-2 focus:ring-brand-strong"
            >
              <option value="All Groups">All JH Groups</option>
              <option value="Alpha Team">Alpha Team</option>
              <option value="Beta Team">Beta Team</option>
              <option value="Gamma Team">Gamma Team</option>
              <option value="Delta Team">Delta Team</option>
              <option value="Printing - Group A">Printing - Group A</option>
              <option value="Coating & Lamination">Coating & Lamination</option>
              <option value="Packaging & Dispatch">Packaging & Dispatch</option>
              <option value="Maintenance & Utility">Maintenance & Utility</option>
            </select>
          </div>

          {/* Select Specific Members */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-ink-strong flex items-center gap-1.5">
                <User size={14} className="text-brand-strong" /> Assign to Specific Members (Optional)
              </label>
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-2xs font-semibold text-brand-strong hover:underline"
              >
                {selectedMembers.length === sampleMembers.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto p-2 rounded-xl border border-line bg-surface-sunken">
              {sampleMembers.map((m) => {
                const isChecked = selectedMembers.includes(m.id);
                return (
                  <label
                    key={m.id}
                    className={`flex items-center gap-2 p-2 rounded-lg border text-2xs cursor-pointer transition-all ${
                      isChecked
                        ? 'bg-brand-soft/60 border-brand-strong/40 font-semibold text-ink-strong'
                        : 'bg-surface-base border-line text-ink-muted hover:border-brand-strong/30'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleMember(m.id)}
                      className="rounded border-line text-brand-strong focus:ring-brand-strong h-3.5 w-3.5"
                    />
                    <div className="truncate">
                      <p className="font-semibold truncate">{m.name}</p>
                      <p className="text-3xs text-ink-subtle truncate">{m.group}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Urgency & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-ink-strong">Training Priority</label>
              <select
                value={urgency}
                onChange={(e) => setUrgency(e.target.value)}
                className="w-full rounded-lg border border-line bg-surface-base px-3 py-2 text-xs font-medium text-ink-strong focus:outline-none focus:ring-2 focus:ring-brand-strong"
              >
                <option value="mandatory">Mandatory Retraining</option>
                <option value="high_priority">High Priority (Urgent)</option>
                <option value="routine">Routine Refresh (90 Days)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-ink-strong">Special Instructions</label>
              <input
                type="text"
                placeholder="e.g. Complete before shift ends"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-lg border border-line bg-surface-base px-3 py-2 text-xs font-medium text-ink-strong focus:outline-none focus:ring-2 focus:ring-brand-strong"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-line">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" className="bg-brand-strong text-white font-semibold gap-1.5">
              <Send size={14} /> Push Training
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
