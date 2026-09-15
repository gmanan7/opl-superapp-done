import { useState, useRef, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Star, FileText, Send, Clock, User, List, MessageSquare,
  ImagePlus, X, Loader2, History, CheckCircle2, XCircle, AlertTriangle, Tag,
  GraduationCap, ChevronRight, ChevronLeft, Globe, Users, Building2, Search, Filter, BookOpen, Layers,
  Plus, Printer, Share2, TrendingUp, Pencil, Award, Eye
} from 'lucide-react';
import { useKaizenDetails, useCreateKaizenDetail, useReviewKaizenDetail, useKaizenAuditTrail, useKaizenRepositorySetting, useUpdateKaizenRepositorySetting, useKaizenJhGroupAnalytics } from '../../hooks/useKaizen';
import { KaizenAnalyticsTab } from './KaizenAnalyticsTab';
import { KaizenMyTeamAnalyticsTab } from './KaizenMyTeamAnalyticsTab';
import { BarChart3 } from 'lucide-react';
import { useOrgStructure, useDepartments } from '../../hooks/mdm';
import { compressImageAndUpload } from '../../lib/imageUpload';
import { CaptureColumn, StatusBadge, EmptyState, SkeletonRow, ConfirmModal, ListPager, WorkerPicker } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { loadSession, getSessionContext, getName } from '../../lib/auth';

const STATUS_KEY = {
  draft: 'neutral',
  proposed: 'warning',
  submitted: 'warning',
  pending_review: 'warning',
  changes_requested: 'warning',
  approved_for_implementation: 'info',
  approved: 'info',
  submitted_for_confirmation: 'warning',
  confirmed_close: 'success',
  confirmed_closed: 'success',
  rejected: 'danger'
};

const STATUS_LABEL = {
  draft: 'Draft',
  proposed: 'Proposed',
  submitted: 'Pending review',
  pending_review: 'Pending review',
  changes_requested: 'Changes Requested',
  approved_for_implementation: 'Approved for Implementation',
  approved: 'Approved for Implementation',
  submitted_for_confirmation: 'Submitted for Validation',
  confirmed_close: 'Confirmed Close/Marked for deletion',
  confirmed_closed: 'Confirmed Closed',
  rejected: 'Rejected'
};

// One-time benefit units (not recurring / not "per annum") — the submitter picks one on the
// implementation report. The server accepts any non-empty string, so the "Others" option
// passes its free-text through; this list is just the toggle presets.
const SAVINGS_UNITS = ['Rs', 'Units', 'Hr', 'Others'];
const OTHER_UNIT = 'Others';

// Human labels for the fields that can appear in review_changes / audit diffs.
const FIELD_LABELS = {
  title: 'Title', content: 'Description', category: 'Category', before_image: 'Before Photo',
  after_image: 'After Photo', savings_estimate: 'One-Time Benefit', savings_unit: 'Benefit Unit',
  improvement_notes: 'Improvements Made', implementation_date: 'Implementation Date',
};

const AREA_LABEL = {
  productivity: 'Productivity',
  quality: 'Quality',
  cost: 'Cost',
  delivery: 'Delivery',
  safety: 'Safety',
  morale: 'Morale'
};

const AREA_COLOR = {
  productivity: 'bg-emerald-500/10 text-emerald-700 border-emerald-200',
  quality: 'bg-blue-500/10 text-blue-700 border-blue-200',
  cost: 'bg-amber-500/10 text-amber-700 border-amber-200',
  delivery: 'bg-purple-500/10 text-purple-700 border-purple-200',
  safety: 'bg-red-500/10 text-red-700 border-red-200',
  morale: 'bg-pink-500/10 text-pink-700 border-pink-200'
};

export function KaizenList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const session = loadSession();
  const ctx = getSessionContext();

  // Main Tabs: 'submit' ("Submit Kaizen & Reviews") or 'standard' ("Standard Kaizens")
  const [mainTab, setMainTab] = useState('submit');

  // Backend Kaizens data — real kaizen_details rows, mapped to the shape this screen renders.
  // Standard Kaizens catalogue fields (scores, cost, solution, after-image, horizontal
  // deployment) aren't in kaizen_details yet — reviewed step-wise, added as we go.
  const { data: kaizenDetailsRows = [], isLoading: isKaizensLoading } = useKaizenDetails();
  const createDetail = useCreateKaizenDetail();
  const reviewDetail = useReviewKaizenDetail();

  const kaizens = useMemo(() => kaizenDetailsRows.map((kd) => ({
    id: kd.kaizen_id,
    title: kd.title,
    result_area: kd.category,
    status: kd.status,
    total_score: null,
    scores: null,
    submitter_name: kd.submitted_by,
    submitted_by: kd.submitter_emp_id,
    submitter_emp_id: kd.submitter_emp_id,
    jh_group_id: kd.jh_group_id,
    jh_group_name: kd.jh_group_name,
    factory_id: kd.factory_id,
    plant_code: kd.factory_code,
    plant_name: kd.factory_name || kd.factory_code || kd.factory_id,
    approver_emp_ids: kd.approver_emp_ids || [],
    phase2_stage_approver_emp_ids: kd.phase2_stage_approver_emp_ids || [],
    dmt_approver_emp_ids: kd.dmt_approver_emp_ids || [],
    previous_category: kd.previous_category,
    forwarded_to_dmt_at: kd.forwarded_to_dmt_at,
    forwarded_to_dmt_by: kd.forwarded_to_dmt_by,
    current_stage_order: kd.current_stage_order,
    current_stage_name: kd.current_stage_name,
    total_stages: kd.total_stages,
    // "is this rejection from after implementation was reported" — replaces the old
    // forwarded_to_dmt_at signal now that phase 2 has no mandatory forward step.
    reached_phase2: Boolean(kd.implementation_date || kd.after_image || kd.forwarded_to_dmt_at),
    benefit_description: '',
    brief_description: kd.content,
    problem_description: kd.content,
    solution_description: '',
    horizontal_deployment: false,
    horizontal_deployment_details: '',
    before_image: kd.before_image,
    after_image: kd.after_image,
    savings_estimate: kd.savings_estimate,
    savings_unit: kd.savings_unit,
    improvement_notes: kd.improvement_notes,
    implementation_date: kd.implementation_date,
    team_member_emp_ids: kd.team_member_emp_ids || [],
    implementation_cost: kd.implementation_cost,
    submitted_at: kd.timestamp,
    approved_at: kd.status === 'approved_for_implementation' ? kd.reviewed_at : null,
    approver_name: kd.reviewed_by || null,
    rejection_reason: kd.rejection_reason,
    change_requested_field: kd.change_requested_field,
    change_requested_note: kd.change_requested_note,
    content: kd.content,
    review_changes: kd.review_changes,
  })), [kaizenDetailsRows]);

  // Submit Form State
  const [resultArea, setResultArea] = useState('productivity');
  const [title, setTitle] = useState('');
  const [problemDesc, setProblemDesc] = useState('');
  const [solutionDesc, setSolutionDesc] = useState('');
  const [costImpl, setCostImpl] = useState('');
  const [benefitDesc, setBenefitDesc] = useState('');
  const [horizontalDep, setHorizontalDep] = useState(false);
  const [horizontalDetails, setHorizontalDetails] = useState('');
  const [beforeImage, setBeforeImage] = useState(null);
  const [afterImage, setAfterImage] = useState(null);
  const [isCompressingBefore, setIsCompressingBefore] = useState(false);
  const [isCompressingAfter, setIsCompressingAfter] = useState(false);
  const beforeFileRef = useRef(null);
  const afterFileRef = useRef(null);

  // Reviews List Filters
  const [reviewFilter, setReviewFilter] = useState('submitted'); // 'submitted' (Pending Review), 'approved_for_implementation', 'submitted_for_confirmation' (Validation), 'confirmed_close', 'rejected', 'draft' — no "all" tab (mirrors OPL)
  const [rejectedStage, setRejectedStage] = useState('all'); // 'all' | '1st' | '2nd' — sub-tab, only shown/used when reviewFilter === 'rejected'
  const [reviewScope, setReviewScope] = useState('to_review'); // mirrors OPL's To Review / My Submissions split
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(3);

  // Inline Rejection state
  const [inlineRejectId, setInlineRejectId] = useState(null);
  // Separate inline state for the DMT lead's "Mark for Deletion" reason, so it doesn't share
  // state with the JH-stage reject box above (different stage, different approver).
  const [inlineDmtRejectId, setInlineDmtRejectId] = useState(null);
  const [inlineDmtRejectReason, setInlineDmtRejectReason] = useState('');
  const [inlineRejectReason, setInlineRejectReason] = useState('');
  // "Validate before closing" panel — clicking Confirm & Close opens a summary of everything
  // done since implementation was reported (the report itself + reviewer edits + any prior
  // phase-2 stage approvals) so the closing reviewer signs off on what they've seen.
  const [confirmCloseId, setConfirmCloseId] = useState(null);

  // Review & Edit modal — the JH reviewer can edit title/content/category/before-photo before
  // approving, same as Abnormality's Review & Assign edit-and-diff pattern. Every field they
  // actually change is snapshotted server-side to review_changes for the submitter to see.
  const [reviewEditItem, setReviewEditItem] = useState(null);
  const [reviewEditMode, setReviewEditMode] = useState('approve'); // 'approve' (reviewer) | 'draft' (submitter fixing own draft)
  const [reTitle, setReTitle] = useState('');
  const [reContent, setReContent] = useState('');
  const [reCategory, setReCategory] = useState('');
  const [reBeforeImage, setReBeforeImage] = useState(null);
  const [reIsCompressing, setReIsCompressing] = useState(false);
  const reImageInputRef = useRef(null);

  const openReviewEdit = (k) => {
    setReviewEditMode('approve');
    setReviewEditItem(k);
    setReTitle(k.title || '');
    setReContent(k.content || '');
    setReCategory(k.result_area || '');
    setReBeforeImage(k.before_image || null);
  };
  const openDraftEdit = (k) => {
    setReviewEditMode('draft');
    setReviewEditItem(k);
    setReTitle(k.title || '');
    setReContent(k.content || '');
    setReCategory(k.result_area || '');
    setReBeforeImage(k.before_image || null);
  };
  const closeReviewEdit = () => setReviewEditItem(null);

  const handleSaveDraft = async (alsoSubmit) => {
    if (!reTitle.trim()) return toast.error('Title is required');
    if (!reContent.trim()) return toast.error('Description is required');
    try {
      await reviewDetail.mutateAsync({
        id: reviewEditItem.id,
        action: 'edit_draft',
        title: reTitle.trim(),
        content: reContent.trim(),
        category: reCategory,
        before_image: reBeforeImage,
        submit: !!alsoSubmit,
      });
      toast.success(alsoSubmit ? 'Kaizen proposed for review! 🎉' : 'Draft updated');
      closeReviewEdit();
    } catch (err) {
      toast.error(err.message || 'Failed to save draft');
    }
  };

  const handleReImageChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setReIsCompressing(true);
      const url = await compressImageAndUpload(file);
      setReBeforeImage(url);
    } catch {
      toast.error('Failed to compress photo');
    } finally {
      setReIsCompressing(false);
      e.target.value = '';
    }
  };

  const handleReviewApprove = async () => {
    if (!reTitle.trim()) return toast.error('Title is required');
    if (!reContent.trim()) return toast.error('Description is required');
    try {
      await reviewDetail.mutateAsync({
        id: reviewEditItem.id,
        action: 'approve',
        title: reTitle.trim(),
        content: reContent.trim(),
        category: reCategory,
        before_image: reBeforeImage,
      });
      toast.success('Kaizen approved for implementation! 🎉');
      closeReviewEdit();
    } catch (err) {
      toast.error(err.message || 'Failed to approve');
    }
  };

  // Modals state
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [selectedAuditKaizen, setSelectedAuditKaizen] = useState(null);
  const auditTrail = useKaizenAuditTrail(auditModalOpen ? selectedAuditKaizen?.id : null);
  const confirmCloseAudit = useKaizenAuditTrail(confirmCloseId);
  const [editSubmitterModalOpen, setEditSubmitterModalOpen] = useState(false);
  const [editingKaizen, setEditingKaizen] = useState(null);

  // Standard Kaizens States
  const [stdTab, setStdTab] = useState('all'); // 'all', 'my_jh_group', 'my_remaining'
  const [selectedPlant, setSelectedPlant] = useState('all');
  const [selectedDmt, setSelectedDmt] = useState('all');
  const [selectedJhGroup, setSelectedJhGroup] = useState('all');
  const [selectedArea, setSelectedArea] = useState('all');
  const [stdSearchQuery, setStdSearchQuery] = useState('');
  const [stdCurrentPage, setStdCurrentPage] = useState(1);
  const [stdPageSize, setStdPageSize] = useState(3);
  const [selectedKaizenSheet, setSelectedKaizenSheet] = useState(null);
  const [lightboxImage, setLightboxImage] = useState(null); // full-size photo viewer (tap any card/sheet photo)

  // Every Kaizen Repository sub-tab starts with a clean filter slate — a filter set on one
  // sub-tab never carries over to another. Mirrors OPL Repository.
  useEffect(() => {
    setSelectedPlant('all');
    setSelectedDmt('all');
    setSelectedJhGroup('all');
    setSelectedArea('all');
    setStdSearchQuery('');
    setStdCurrentPage(1);
  }, [stdTab]);

  // Org structure for DMT & JH Groups dropdowns
  const { data: orgData } = useOrgStructure();
  const { data: departments = [] } = useDepartments();
  const resolveWorkerName = (empId) => (orgData?.workers || []).find((w) => String(w.id) === String(empId))?.name || empId;

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

  const dmtOptions = useMemo(() => {
    const keys = Object.keys(dmtJhMap);
    return [
      { value: 'all', label: 'All' },
      ...keys.map(k => ({ value: k, label: k }))
    ];
  }, [dmtJhMap]);

  // Plant filter options come from real factory master data, never a hardcoded list.
  const plantOptions = useMemo(() => ([
    { value: 'all', label: 'All' },
    ...(orgData?.factories || []).map((f) => ({ value: String(f.id), label: f.code || f.name })),
  ]), [orgData]);

  const availableJhGroups = useMemo(() => {
    if (selectedDmt === 'all') {
      const allGroups = new Set();
      Object.values(dmtJhMap).forEach(arr => arr.forEach(g => allGroups.add(g)));
      return [
        { value: 'all', label: 'All' },
        ...Array.from(allGroups).map(g => ({ value: g, label: g }))
      ];
    }
    const list = dmtJhMap[selectedDmt] || [];
    return [
      { value: 'all', label: 'All' },
      ...list.map(g => ({ value: g, label: g }))
    ];
  }, [selectedDmt, dmtJhMap]);

  const handleDmtChange = (newDmt) => {
    setSelectedDmt(newDmt);
    setSelectedJhGroup('all');
    setStdCurrentPage(1);
  };

  // User Context
  const currentActorName = getName(session) || 'Plant Leader';
  // ctx only ever carries jh_group_id, never a name — resolve the real name from org data
  // first (mirrors OPL's resolvedUserJhGroupName), same as OPL does.
  const resolvedUserJhGroupName = (orgData?.jhGroups || []).find(g => g.id === ctx?.jh_group_id)?.name;
  const userJhGroup = resolvedUserJhGroupName || ctx?.jh_group_name || ctx?.jh_group || session?.worker?.jh_group_name || '';
  const userPlant = ctx?.factory_name || ctx?.factory_code || session?.worker?.default_plant || '';
  // Empty, not a fake ID — matches OPL's currentEmpId fallback. A real employee ID here would
  // silently misattribute submissions/approvals to whatever real worker happens to share it.
  const userWorkerId = ctx?.worker_id || session?.worker?.worker_id || '';

  const userRole = (ctx?.role || session?.role || session?.worker?.tpm_role || 'operator').toLowerCase();
  // Some people don't file under their own JH group when they submit — they pick one via a
  // cascading DMT -> JH Group dropdown, and that pick is mandatory (server-enforced). Applies to:
  //   - anyone in no JH group at all (incl. DMT members with no group)
  //   - anyone in the Engineering department (even if also in a JH group)
  //   - BE-admin tier
  // The picked group drives routing; it does NOT change whose submission count it is.
  const engineeringDeptId = departments.find((d) => d.name === 'Engineering')?.id;
  const myDepartmentId = (orgData?.workers || []).find((w) => String(w.id) === String(userWorkerId))?.department_id;
  const isEngineeringSubmitter = Boolean(engineeringDeptId) && myDepartmentId === engineeringDeptId;
  const kzJhList = orgData?.jhGroupsList || [];
  // Leading a JH group counts as belonging to one (mirrors backend resolveSubmitterJhGroup).
  const kzLeadsAnyJhGroup = (orgData?.jhGroups || []).some((g) => String(g.leader_emp_id) === String(userWorkerId));
  const hasNoJhGroup = kzJhList.length > 0 && !kzJhList.some((m) => String(m.emp_id) === String(userWorkerId)) && !kzLeadsAnyJhGroup;
  const isBeAdminRole = userRole.includes('be_lead') || userRole === 'it_lead' || userRole === 'leadership' || userRole === 'admin';
  const canFileForOtherGroup = isEngineeringSubmitter || hasNoJhGroup || isBeAdminRole;
  const [filingDmtId, setFilingDmtId] = useState('');
  const [filingJhGroupId, setFilingJhGroupId] = useState('');
  const filingJhGroupOptions = (orgData?.dmts || []).find((g) => g.id === filingDmtId)?.jhGroups || [];

  const isBeLeadRole = userRole.includes('be_lead') || userRole === 'admin' || userRole === 'it_lead' || userRole === 'leadership';
  // "My Team" — a probe (no filters) just to decide if the tab shows; the tab itself
  // re-fetches with real filters. Mirrors OPL's canSeeMyTeam pattern exactly.
  const kzMyTeamProbe = useKaizenJhGroupAnalytics({}, true);
  const canSeeKzMyTeam = !kzMyTeamProbe.isError && (kzMyTeamProbe.data?.authorized_groups?.length > 0);

  // Per-plant Standard Kaizens scope — mirrors OPL's Standard Lessons repository setting.
  // A plant always sees its own closed kaizens; a BE lead can opt in to other plants.
  const { data: kzRepoSetting } = useKaizenRepositorySetting();
  const updateKzRepo = useUpdateKaizenRepositorySetting();
  const kzRepoCanEdit = kzRepoSetting?.can_edit === true && isBeLeadRole;
  const kzMyPlantId = kzRepoSetting?.factory_id ?? null;
  const kzExtraPlantIds = useMemo(() => (kzRepoSetting?.extra_factory_ids ?? []).map(String), [kzRepoSetting]);
  const kzAllPlants = kzRepoSetting?.all_plants ?? [];
  const kzOtherPlants = kzAllPlants.filter((p) => String(p.id) !== String(kzMyPlantId));
  const kzVisiblePlantIds = useMemo(
    () => new Set([kzMyPlantId, ...kzExtraPlantIds].filter((v) => v != null).map(String)),
    [kzMyPlantId, kzExtraPlantIds]
  );
  const toggleKzExtraPlant = (plantId) => {
    const idStr = String(plantId);
    const next = kzExtraPlantIds.includes(idStr)
      ? kzExtraPlantIds.filter((x) => x !== idStr)
      : [...kzExtraPlantIds, idStr];
    updateKzRepo.mutate(next, {
      onSuccess: () => toast.success('Kaizen repository plant list updated'),
      onError: () => toast.error('Failed to update plant list'),
    });
  };

  // Mirrors OPL's isPlantBeLeadForOpl — Audit Trail is a BE-lead-tier, plant-scoped view, never
  // shown to the submitter or to a JH lead reviewing the item.
  const isPlantBeLeadForKaizen = (k) => {
    if (!isBeLeadRole) return false;
    const uPlant = (userPlant || '').toLowerCase();
    const itemPlant = (k?.plant_name || '').toLowerCase();
    if (!uPlant || !itemPlant) return true;
    return uPlant === itemPlant || uPlant === 'all' || userRole === 'admin' || userRole === 'it_lead' || userRole === 'leadership';
  };

  // Mirrors the backend authorization in PUT /api/kaizen-details/:id (resolveKaizenApprovers) —
  // review actions (approve/reject/request changes/category edit) are strictly limited to this
  // Kaizen's configured/derived approver(s), never shown to the submitter themselves.
  const canReviewKaizen = (k) => Boolean(userWorkerId) && (k?.approver_emp_ids || []).includes(userWorkerId);
  // Phase 2, non-final stage (the "Review & Forward" step) — a separate field from
  // approver_emp_ids since that one is phase-1-scoped only.
  const canForwardKaizen = (k) => Boolean(userWorkerId) && (k?.phase2_stage_approver_emp_ids || []).includes(userWorkerId);
  // Same idea, but for the LAST phase-2 stage's final review (confirm-close / reject) —
  // mirrors resolveStageApproversFor server-side for that stage.
  const canDmtReviewKaizen = (k) => Boolean(userWorkerId) && (k?.dmt_approver_emp_ids || []).includes(userWorkerId);
  const canReviewAnyStage = (k) => canReviewKaizen(k) || canForwardKaizen(k) || canDmtReviewKaizen(k);
  // A phase-2 Kaizen is on its final review stage when the stage pointer has reached the last
  // configured stage. With the default single-stage phase 2 this is true as soon as
  // implementation is reported (no forward step). Replaces the old forwarded_to_dmt_at check.
  const isKaizenFinalPhase2Stage = (k) => (k?.current_stage_order || 1) >= (k?.total_stages || 1);
  const isMySubmissionKaizen = (k) => Boolean(userWorkerId) && k?.submitted_by === userWorkerId;

  // The reviewer's edit diff ("Changed by the reviewer") is only for the people in the
  // item's chain — submitter, its routing incharges / JH-stage approvers, its JH-group
  // leader, and the owning module lead. NOT everyone browsing the repository.
  const kzJhGroupOf = (k) => (orgData?.jhGroups || []).find((g) => String(g.id) === String(k?.jh_group_id));
  const canSeeKaizenReviewChanges = (k) => {
    if (!k) return false;
    if (isBeLeadRole) return true;                 // BE-lead tier: factory-wide oversight
    if (isMySubmissionKaizen(k)) return true;
    if (canReviewAnyStage(k)) return true;
    if (!userWorkerId) return false;
    const jh = kzJhGroupOf(k);
    if (jh && String(jh.leader_emp_id) === String(userWorkerId)) return true;
    const grp = (orgData?.groups || []).find((g) => String(g.id) === String(jh?.module_group_id));
    if (grp && String(grp.module_lead_emp_id) === String(userWorkerId)) return true;
    return false;
  };

  // Who this Kaizen is waiting on RIGHT NOW, by lifecycle position — mirrors OPL's
  // reviewerNamesFor(): pick the approver list that matches the current stage.
  const PENDING_KAIZEN_STATUSES = new Set(['proposed', 'submitted', 'pending_review', 'changes_requested', 'submitted_for_confirmation']);
  const kaizenStageReviewerIds = (k) => {
    if (!k) return [];
    if (k.status === 'submitted_for_confirmation') {
      return isKaizenFinalPhase2Stage(k) ? (k.dmt_approver_emp_ids || []) : (k.phase2_stage_approver_emp_ids || []);
    }
    if (['proposed', 'submitted', 'pending_review', 'changes_requested'].includes(k.status)) {
      return k.approver_emp_ids || [];
    }
    return [];
  };
  const kaizenReviewerNames = (k) => {
    const ids = kaizenStageReviewerIds(k);
    if (!ids.length) return '';
    return ids.map(resolveWorkerName).filter(Boolean).join(', ');
  };
  // "Stage X of Y" text — same wording as OPL's card chip.
  const kaizenStageLabel = (k) => {
    const total = k?.total_stages || 1;
    if (total <= 1) return '';
    const order = k?.current_stage_order || 1;
    if (k?.status === 'rejected') return `Rejected at stage ${order} of ${total}`;
    if (k?.status === 'confirmed_closed' || k?.status === 'confirmed_close') return `Cleared all ${total} stages`;
    return `Stage ${order} of ${total}`;
  };

  // Count of kaizens actually waiting on THIS user's action right now — drives the
  // "Kaizen Reviews" tab badge. (Was `kaizens.length`, i.e. every kaizen in the system,
  // which stayed non-zero even when the user's own queue was empty.)
  const myReviewQueueCount = useMemo(() => kaizens.filter((k) => {
    if (isMySubmissionKaizen(k)) return false;
    const s = k.status;
    if (['proposed', 'submitted', 'pending_review', 'changes_requested'].includes(s)) return canReviewKaizen(k);
    if (s === 'submitted_for_confirmation' && !isKaizenFinalPhase2Stage(k)) return canForwardKaizen(k);
    if (s === 'submitted_for_confirmation' && isKaizenFinalPhase2Stage(k)) return canDmtReviewKaizen(k);
    return false;
  }).length, [kaizens, userWorkerId]);

  // Same split as OPL: only roles that can ever be a reviewer (JH lead and above) get the
  // "To Review" tab — operators only ever submit, so their view is submissions-only.
  const isReviewerRole = isBeLeadRole || userRole.includes('jh_lead') || userRole.includes('lead');
  const effectiveReviewScope = isReviewerRole ? reviewScope : 'my_submissions';
  // On "To Review", only statuses that need the reviewer's decision are shown. "Approved for
  // Implementation" (ball is with the submitter) and "Confirmed Close" (done) live on My
  // Submissions only — snap the filter back to All if one of those was active.
  const TO_REVIEW_HIDDEN_FILTERS = ['approved_for_implementation', 'confirmed_close', 'draft'];
  useEffect(() => {
    if (effectiveReviewScope !== 'my_submissions' && TO_REVIEW_HIDDEN_FILTERS.includes(reviewFilter)) setReviewFilter('submitted');
  }, [effectiveReviewScope, reviewFilter]);

  // Image Upload Handlers
  const handleBeforeSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsCompressingBefore(true);
      const url = await compressImageAndUpload(file);
      setBeforeImage(url);
      toast.success('Before image attached!');
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
      toast.success('After image attached!');
    } catch {
      toast.error('Failed to compress after image');
    } finally {
      setIsCompressingAfter(false);
    }
  };

  // Form Submit Handler
  const handleCreateKaizen = async (e, isDraft = false) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!title.trim()) {
      toast.error('Please enter Kaizen Title');
      return;
    }
    if (!isDraft && !(problemDesc.trim() && resultArea && beforeImage)) {
      toast.error('Please fill in Problem / Current Description, select a Category, and attach a Before Photo before proposing');
      return;
    }
    if (!isDraft && canFileForOtherGroup && !filingJhGroupId) {
      toast.error('Select a DMT and JH group to file this Kaizen under');
      return;
    }

    try {
      const autoSubmittedBy = userWorkerId ? `${currentActorName} (ID: ${userWorkerId})` : currentActorName;
      await createDetail.mutateAsync({
        title: title.trim(),
        content: problemDesc.trim() || null,
        category: resultArea || null,
        before_image: beforeImage,
        submitted_by: autoSubmittedBy,
        status: isDraft ? 'draft' : 'proposed',
        jh_group_id: canFileForOtherGroup && filingJhGroupId ? filingJhGroupId : undefined,
      });

      // Reset Form
      setTitle('');
      setProblemDesc('');
      setSolutionDesc('');
      setCostImpl('');
      setBenefitDesc('');
      setHorizontalDep(false);
      setHorizontalDetails('');
      setBeforeImage(null);
      setAfterImage(null);
      setFilingDmtId('');
      setFilingJhGroupId('');

      toast.success(isDraft ? 'Kaizen saved as Draft!' : 'Kaizen proposed to JH Lead for review! 🎉');
    } catch (err) {
      toast.error(err.message || 'Failed to save Kaizen');
    }
  };

  // Reject with a reason — JH-group approver only (server-enforced). Mirrors OPL's reject flow.
  const handleConfirmReject = async (kaizenId) => {
    if (!inlineRejectReason.trim()) {
      toast.error('Please enter a reason');
      return;
    }
    try {
      await reviewDetail.mutateAsync({ id: kaizenId, action: 'reject', rejection_reason: inlineRejectReason.trim() });
      setInlineRejectId(null);
      setInlineRejectReason('');
      toast.error('Kaizen rejected');
    } catch (err) {
      toast.error(err.message || 'Failed to reject');
    }
  };

  // JH lead reviews (and can edit) what the submitter reported at implementation, then
  // forwards to the DMT lead for final review — JH-group approver only (server-enforced).
  // Replaces the old 3-checkbox validation with the same edit-and-diff pattern used at the
  // approve stage: only fields actually changed are recorded.
  const [forwardOpenId, setForwardOpenId] = useState(null);
  const [fwdAfterImage, setFwdAfterImage] = useState(null);
  const [fwdSavings, setFwdSavings] = useState('');
  const [fwdUnit, setFwdUnit] = useState('');
  const [fwdUnitOther, setFwdUnitOther] = useState('');
  const [fwdNotes, setFwdNotes] = useState('');
  const [fwdDate, setFwdDate] = useState('');
  const [isCompressingFwdAfter, setIsCompressingFwdAfter] = useState(false);
  // Snapshot of what the submitter originally reported, taken when the form opens — compared
  // against the live edit state below to auto-derive each field's "unchanged" tick, rather
  // than a manually-clicked checkbox.
  const [fwdOriginal, setFwdOriginal] = useState(null);
  const openForwardForm = (k) => {
    setForwardOpenId(k.id);
    const initialAfterImage = k.after_image || null;
    const initialSavings = k.savings_estimate ?? '';
    const isStandardUnit = SAVINGS_UNITS.includes(k.savings_unit);
    const initialUnit = isStandardUnit ? k.savings_unit : (k.savings_unit ? OTHER_UNIT : '');
    const initialUnitOther = isStandardUnit ? '' : (k.savings_unit || '');
    const initialNotes = k.improvement_notes || '';
    const initialDate = k.implementation_date ? String(k.implementation_date).slice(0, 10) : '';
    setFwdAfterImage(initialAfterImage);
    setFwdSavings(initialSavings);
    setFwdUnit(initialUnit);
    setFwdUnitOther(initialUnitOther);
    setFwdNotes(initialNotes);
    setFwdDate(initialDate);
    setFwdOriginal({
      after_image: initialAfterImage,
      savings: `${initialSavings}|${initialUnit === OTHER_UNIT ? initialUnitOther : initialUnit}`,
      notes: initialNotes,
      date: initialDate,
    });
  };
  const fwdUnchanged = fwdOriginal ? {
    after_image: fwdAfterImage === fwdOriginal.after_image,
    savings: `${fwdSavings}|${fwdUnit === OTHER_UNIT ? fwdUnitOther : fwdUnit}` === fwdOriginal.savings,
    notes: fwdNotes.trim().toLowerCase() === fwdOriginal.notes.trim().toLowerCase(),
    date: fwdDate === fwdOriginal.date,
  } : {};
  const FwdFieldTick = ({ unchanged }) => (
    unchanged
      ? <span className="inline-flex items-center gap-1 text-2xs font-medium text-emerald-700"><CheckCircle2 size={13} /> Unchanged</span>
      : <span className="inline-flex items-center gap-1 text-2xs font-medium text-blue-700"><Pencil size={11} /> Edited</span>
  );
  const closeForwardForm = () => setForwardOpenId(null);
  const handleFwdAfterImageSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsCompressingFwdAfter(true);
      const url = await compressImageAndUpload(file);
      setFwdAfterImage(url);
    } catch {
      toast.error('Failed to compress photo');
    } finally {
      setIsCompressingFwdAfter(false);
      e.target.value = '';
    }
  };
  const handleForwardToDmt = async (kaizenId) => {
    const finalUnit = fwdUnit === OTHER_UNIT ? fwdUnitOther.trim() : fwdUnit;
    if (!fwdNotes.trim()) return toast.error('Improvements made cannot be empty');
    if (!fwdDate) return toast.error('Implementation date cannot be empty');
    try {
      await reviewDetail.mutateAsync({
        id: kaizenId,
        action: 'forward_to_dmt',
        after_image: fwdAfterImage,
        savings_estimate: fwdSavings === '' ? null : fwdSavings,
        savings_unit: finalUnit,
        improvement_notes: fwdNotes.trim(),
        implementation_date: fwdDate,
      });
      closeForwardForm();
      toast.success('Forwarded to the next review stage');
    } catch (err) {
      toast.error(err.message || 'Failed to forward');
    }
  };

  // DMT lead's final call — confirm & close, or mark for deletion with a reason (never a
  // permanent delete; the item just moves into the Marked for Deletion tab, visible with the
  // DMT lead's comment to both the BE lead and JH lead). DMT-approver only (server-enforced).
  const handleConfirmClose = async (kaizenId) => {
    try {
      await reviewDetail.mutateAsync({ id: kaizenId, action: 'confirm_close' });
      setConfirmCloseId(null);
      toast.success('Kaizen confirmed and closed! 🎉');
    } catch (err) {
      toast.error(err.message || 'Failed to confirm and close');
    }
  };
  const handleConfirmMarkForDeletion = async (kaizenId) => {
    if (!inlineDmtRejectReason.trim()) {
      toast.error('Please enter a reason');
      return;
    }
    try {
      await reviewDetail.mutateAsync({ id: kaizenId, action: 'mark_for_deletion', rejection_reason: inlineDmtRejectReason.trim() });
      setInlineDmtRejectId(null);
      setInlineDmtRejectReason('');
      toast.error('Kaizen rejected at implementation review');
    } catch (err) {
      toast.error(err.message || 'Failed to mark for deletion');
    }
  };

  // Submitter's implementation report — only field on their own approved Kaizen; one panel
  // open at a time. Moves status to 'submitted_for_confirmation' once sent.
  const [implementOpenId, setImplementOpenId] = useState(null);
  const [implementAfterImage, setImplementAfterImage] = useState(null);
  const [implementSavings, setImplementSavings] = useState('');
  const [implementUnit, setImplementUnit] = useState('');
  const [implementUnitOther, setImplementUnitOther] = useState('');
  const [implementNotes, setImplementNotes] = useState('');
  const [implementDate, setImplementDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [implementCost, setImplementCost] = useState('');
  const [isCompressingImplementAfter, setIsCompressingImplementAfter] = useState(false);
  // Optional — "did someone help?" is not everyone's answer, so this starts empty and stays
  // empty unless the submitter picks people. Capped at 3.
  const [implementTeamMembers, setImplementTeamMembers] = useState([]);
  const MAX_IMPLEMENT_TEAM_MEMBERS = 3;
  const openImplementForm = (k) => {
    setImplementOpenId(k.id);
    setImplementAfterImage(null);
    setImplementSavings('');
    setImplementUnit('');
    setImplementUnitOther('');
    setImplementNotes('');
    setImplementCost('');
    setImplementTeamMembers([]);
    // Defaults to today — the submitter can still change it if implementation actually
    // happened on an earlier date.
    setImplementDate(new Date().toISOString().slice(0, 10));
  };
  const closeImplementForm = () => setImplementOpenId(null);
  const handleImplementAfterImageSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsCompressingImplementAfter(true);
      const url = await compressImageAndUpload(file);
      setImplementAfterImage(url);
      toast.success('After image attached!');
    } catch {
      toast.error('Failed to compress after image');
    } finally {
      setIsCompressingImplementAfter(false);
    }
  };
  const handleSubmitImplementation = async (k) => {
    if (!implementAfterImage) return toast.error('After Photo is required');
    if (!implementSavings.trim() || Number.isNaN(Number(implementSavings))) return toast.error('Enter a valid savings estimate');
    if (!implementUnit) return toast.error('Select a savings unit');
    if (implementUnit === OTHER_UNIT && !implementUnitOther.trim()) return toast.error('Enter the custom unit');
    if (!implementNotes.trim()) return toast.error('Describe the improvements made');
    if (!implementDate) return toast.error('Enter the implementation date');
    if (implementCost.trim() && (Number.isNaN(Number(implementCost)) || Number(implementCost) < 0)) return toast.error('Enter a valid implementation cost, or leave it blank');
    const finalUnit = implementUnit === OTHER_UNIT ? implementUnitOther.trim() : implementUnit;
    try {
      await reviewDetail.mutateAsync({
        id: k.id,
        action: 'submit_implementation',
        after_image: implementAfterImage,
        savings_estimate: Number(implementSavings),
        savings_unit: finalUnit,
        improvement_notes: implementNotes.trim(),
        implementation_date: implementDate,
        team_member_emp_ids: implementTeamMembers.map((m) => m.id),
        implementation_cost: implementCost.trim() === '' ? null : Number(implementCost),
      });
      closeImplementForm();
      toast.success('Implementation reported — sent for validation');
    } catch (err) {
      toast.error(err.message || 'Failed to report implementation');
    }
  };

  // Which review-status bucket a kaizen falls in — one place, reused by both the list filter
  // and the per-tab count badges so they can never disagree.
  const matchesReviewFilter = (k, filterValue) => {
    if (filterValue === 'submitted') return k.status === 'submitted' || k.status === 'pending_review' || k.status === 'proposed' || k.status === 'changes_requested';
    if (filterValue === 'approved_for_implementation') return k.status === 'approved_for_implementation' || k.status === 'approved';
    if (filterValue === 'submitted_for_confirmation') return k.status === 'submitted_for_confirmation';
    if (filterValue === 'confirmed_close') return k.status === 'confirmed_close' || k.status === 'confirmed_closed';
    if (filterValue === 'rejected') {
      if (k.status !== 'rejected') return false;
      if (rejectedStage === '1st') return !k.reached_phase2;
      if (rejectedStage === '2nd') return Boolean(k.reached_phase2);
      return true;
    }
    if (filterValue === 'draft') return k.status === 'draft';
    return k.status === filterValue;
  };

  // Scope + search applied, but NOT the status filter — this is what the count badges count over.
  const scopedReviewKaizens = kaizens.filter(k => {
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      const match =
        (k.title || '').toLowerCase().includes(q) ||
        (k.submitter_name || '').toLowerCase().includes(q) ||
        (k.result_area || '').toLowerCase().includes(q) ||
        (k.jh_group_name || '').toLowerCase().includes(q) ||
        (k.plant_name || '').toLowerCase().includes(q);
      if (!match) return false;
    }

    if (effectiveReviewScope === 'my_submissions') {
      if (!isMySubmissionKaizen(k)) return false;
    } else {
      // "To Review": strictly this Kaizen's configured JH or DMT approver, no role bypass —
      // and only statuses that need the reviewer's decision (the submitter owns the
      // implementation step; a closed kaizen is done).
      if (!canReviewAnyStage(k)) return false;
      if (k.status === 'approved_for_implementation' || k.status === 'approved') return false;
      if (k.status === 'confirmed_closed' || k.status === 'confirmed_close') return false;
    }
    return true;
  });

  const reviewCountFor = (filterValue) => scopedReviewKaizens.filter(k => matchesReviewFilter(k, filterValue)).length;

  const filteredReviewKaizens = scopedReviewKaizens.filter(k => matchesReviewFilter(k, reviewFilter));

  const totalReviewItems = filteredReviewKaizens.length;
  const totalReviewPages = Math.ceil(totalReviewItems / pageSize) || 1;
  const validReviewPage = Math.min(Math.max(currentPage, 1), totalReviewPages);
  const paginatedReviewKaizens = filteredReviewKaizens.slice((validReviewPage - 1) * pageSize, validReviewPage * pageSize);

  // Standard Approved Kaizens logic
  const approvedKaizens = useMemo(() => {
    return kaizens.filter(k =>
      k.status === 'approved_for_implementation' ||
      k.status === 'approved' ||
      k.status === 'submitted_for_confirmation' ||
      k.status === 'confirmed_close' ||
      k.status === 'confirmed_closed'
    );
  }, [kaizens]);

  // Standard Kaizens filtering — split so we can also derive which categories actually
  // occur in the current scope (everything EXCEPT the category + search filters).
  const stdScopedKaizens = approvedKaizens.filter(k => {
    // Sub-tab filtering. The catalogue tabs ("All" / "My JH Group") are a repository of
    // *completed* improvements — only kaizens the DMT lead confirmed and closed (i.e. the
    // 2nd/DMT review stage passed). "My Remaining" is a personal to-do, so it still shows
    // your own approved-but-not-yet-implemented ones.
    if (stdTab === 'all') {
      if (k.status !== 'confirmed_closed') return false;
      // Own plant + any plants a BE lead has opted into.
      if (k.factory_id != null && kzVisiblePlantIds.size > 0 && !kzVisiblePlantIds.has(String(k.factory_id))) return false;
    } else if (stdTab === 'my_jh_group') {
      if (k.status !== 'confirmed_closed') return false;
      if (userJhGroup && k.jh_group_name !== userJhGroup) return false;
    } else if (stdTab === 'my_remaining') {
      if (k.status !== 'approved_for_implementation' && k.status !== 'approved') return false;
      if (k.submitted_by !== userWorkerId) return false;
    }

    // Plant filter — compare by factory id, not display name
    if (selectedPlant !== 'all' && String(k.factory_id) !== selectedPlant) return false;

    // DMT level filter
    if (selectedDmt !== 'all') {
      const allowedGroups = dmtJhMap[selectedDmt] || [];
      if (!allowedGroups.includes(k.jh_group_name)) return false;
    }

    // JH Group filter
    if (selectedJhGroup !== 'all' && k.jh_group_name !== selectedJhGroup) return false;

    return true;
  });

  const filteredStandardKaizens = stdScopedKaizens.filter(k => {
    // Result Area filter
    if (selectedArea !== 'all' && k.result_area !== selectedArea) return false;

    // Search query
    if (stdSearchQuery.trim()) {
      const sq = stdSearchQuery.trim().toLowerCase();
      const matches =
        (k.title || '').toLowerCase().includes(sq) ||
        (k.brief_description || '').toLowerCase().includes(sq) ||
        (k.solution_description || '').toLowerCase().includes(sq) ||
        (k.submitter_name || '').toLowerCase().includes(sq) ||
        (k.jh_group_name || '').toLowerCase().includes(sq);
      if (!matches) return false;
    }

    return true;
  });

  const totalStdItems = filteredStandardKaizens.length;
  const totalStdPages = Math.ceil(totalStdItems / stdPageSize) || 1;
  const validStdPage = Math.min(Math.max(stdCurrentPage, 1), totalStdPages);
  const paginatedStandardKaizens = filteredStandardKaizens.slice((validStdPage - 1) * stdPageSize, validStdPage * stdPageSize);

  return (
    <div className="min-h-full bg-surface-base pb-10 overflow-x-hidden">
      {/* Sticky Header */}
      <header className="sticky top-0 z-30 border-b border-line bg-surface-raised">
        <CaptureColumn className="space-y-3 py-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold text-ink-strong">
                Kaizen Management
              </h1>
              <p className="text-xs text-ink-muted">Submit Kaizens, Review Workflows & Kaizen Repository</p>
            </div>
          </div>

          {/* Main Module Tabs */}
          <div className={`grid ${({ 3: 'grid-cols-3', 4: 'grid-cols-4', 5: 'grid-cols-5' }[3 + (canSeeKzMyTeam ? 1 : 0) + (isBeLeadRole ? 1 : 0)] || 'grid-cols-3')} rounded-lg bg-surface-sunken p-1 gap-1`}>
            <button
              type="button"
              onClick={() => setMainTab('submit')}
              className={`rounded-md px-1.5 sm:px-3 py-2 text-xs sm:text-sm font-medium transition-colors ${
                mainTab === 'submit'
                  ? 'bg-surface-raised text-ink-strong shadow-xs font-semibold'
                  : 'text-ink-muted hover:text-ink-strong'
              }`}
            >
              <div className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 text-center">
                <Plus size={16} className="shrink-0 text-blue-700" />
                <span className="leading-tight break-words">Submit Kaizen</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setMainTab('review')}
              className={`rounded-md px-1.5 sm:px-3 py-2 text-xs sm:text-sm font-medium transition-colors ${
                mainTab === 'review'
                  ? 'bg-surface-raised text-ink-strong shadow-xs font-semibold'
                  : 'text-ink-muted hover:text-ink-strong'
              }`}
            >
              <div className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 text-center">
                <Send size={16} className="shrink-0 text-blue-700" />
                <span className="leading-tight break-words">Kaizen Reviews</span>
                {myReviewQueueCount > 0 && (
                  <span className="rounded-full bg-blue-50 text-blue-700 px-1.5 py-0.5 text-2xs font-bold shrink-0">
                    {myReviewQueueCount}
                  </span>
                )}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setMainTab('standard')}
              className={`rounded-md px-1.5 sm:px-3 py-2 text-xs sm:text-sm font-medium transition-colors ${
                mainTab === 'standard'
                  ? 'bg-surface-raised text-ink-strong shadow-xs font-semibold'
                  : 'text-ink-muted hover:text-ink-strong'
              }`}
            >
              <div className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 text-center">
                <Award size={16} className="shrink-0 text-amber-500" />
                <span className="leading-tight break-words">Kaizen Repository</span>
              </div>
            </button>

            {canSeeKzMyTeam && (
              <button
                type="button"
                onClick={() => setMainTab('myteam')}
                className={`rounded-md px-1.5 sm:px-3 py-2 text-xs sm:text-sm font-medium transition-colors ${
                  mainTab === 'myteam'
                    ? 'bg-surface-raised text-ink-strong shadow-xs font-semibold'
                    : 'text-ink-muted hover:text-ink-strong'
                }`}
              >
                <div className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 text-center">
                  <Users size={16} className="shrink-0 text-blue-700" />
                  <span className="leading-tight break-words">My Team</span>
                </div>
              </button>
            )}

            {isBeLeadRole && (
              <button
                type="button"
                onClick={() => setMainTab('analytics')}
                className={`rounded-md px-1.5 sm:px-3 py-2 text-xs sm:text-sm font-medium transition-colors ${
                  mainTab === 'analytics'
                    ? 'bg-surface-raised text-ink-strong shadow-xs font-semibold'
                    : 'text-ink-muted hover:text-ink-strong'
                }`}
              >
                <div className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 text-center">
                  <BarChart3 size={16} className="shrink-0 text-blue-700" />
                  <span className="leading-tight break-words">Analytics</span>
                </div>
              </button>
            )}
          </div>
        </CaptureColumn>
      </header>

      {/* Content Area */}
      <CaptureColumn variant="wide">
        {mainTab === 'submit' && (
          /* Tab 1: Submit Kaizen Form */
          <div className="space-y-8 py-4">
            {/* Section A: Submit New Kaizen Form */}
            <form onSubmit={(e) => handleCreateKaizen(e, false)} className="rounded-xl border border-line bg-surface-raised p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <div className="flex items-center gap-2">
                  <Plus className="text-blue-700" size={20} />
                  <div>
                    <h2 className="text-lg font-semibold text-ink-strong">Submit New Kaizen</h2>
                    <p className="text-2xs text-ink-muted">Record improvement idea and submit for JH / DMT review</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {/* File this Kaizen under a specific team — required for people who submit
                    outside their own JH group (no group / Engineering / BE admin). The picked
                    group drives the review routing; it doesn't change whose submission it counts as. */}
                {canFileForOtherGroup && (
                  <div className="rounded-lg border border-blue-200 bg-blue-500/5 p-3 space-y-2">
                    <p className="text-2xs font-semibold text-blue-800">Which team is this Kaizen for? <span className="text-danger-fg">*</span></p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-ink-muted mb-1">DMT</label>
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
                        <label className="block text-xs font-semibold uppercase tracking-wider text-ink-muted mb-1">JH Group</label>
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

                {/* Title */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-ink-muted mb-1">
                    Kaizen Title <span className="text-danger-fg">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Enter kaizen title..."
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full rounded-lg border border-line bg-surface-base px-3 py-2 text-sm text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-700"
                  />
                </div>

                {/* Problem / Current Description */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-ink-muted mb-1">
                    Problem / Current Description <span className="text-danger-fg">*</span>
                  </label>
                  <textarea
                    required
                    rows={3}
                    placeholder="Describe the current problem, defect, or area of improvement..."
                    value={problemDesc}
                    onChange={(e) => setProblemDesc(e.target.value)}
                    className="w-full rounded-lg border border-line bg-surface-base px-3 py-2 text-sm text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-700"
                  />
                </div>

                {/* Category Selector */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-ink-muted mb-1.5">
                    Category <span className="text-danger-fg">*</span>
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                    {Object.entries(AREA_LABEL).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setResultArea(key)}
                        className={`py-2 px-3 rounded-lg border text-xs font-semibold transition-all ${
                          resultArea === key
                            ? 'bg-blue-600 text-white border-blue-600 shadow-xs font-bold'
                            : 'bg-surface-base text-ink-muted border-line hover:border-blue-600/50'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Before Photo (Mandatory) */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-ink-muted mb-1">
                    Before Photo <span className="text-danger-fg">*</span>
                  </label>
                  <input ref={beforeFileRef} type="file" accept="image/*" className="hidden" onChange={handleBeforeSelect} />
                  {beforeImage ? (
                    <div className="relative rounded-lg border border-line overflow-hidden bg-surface-sunken h-48 max-w-xs">
                      <img src={beforeImage} alt="Before" className="w-full h-full object-contain" />
                      <button
                        type="button"
                        onClick={() => setBeforeImage(null)}
                        className="absolute top-2 right-2 bg-surface-raised/90 p-1 rounded-full text-ink-strong hover:bg-surface-raised shadow-xs"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => beforeFileRef.current?.click()}
                      disabled={isCompressingBefore}
                      className="w-full sm:w-80 h-32 rounded-lg border-2 border-dashed border-line bg-surface-base flex flex-col items-center justify-center text-ink-muted hover:border-blue-300 hover:bg-surface-hover transition-colors"
                    >
                      {isCompressingBefore ? (
                        <Loader2 size={20} className="animate-spin text-blue-700" />
                      ) : (
                        <>
                          <ImagePlus size={22} className="mb-1 text-ink-subtle" />
                          <span className="text-xs font-medium text-ink-strong">Attach Before Photo</span>
                          <span className="text-2xs text-ink-subtle">Required before submitting for review</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Submit Actions */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-line">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={(e) => handleCreateKaizen(e, true)}
                    className="text-xs gap-1"
                  >
                    Save Draft
                  </Button>
                  <Button type="submit" className="text-xs gap-1.5 bg-blue-600 text-white">
                    <Send size={14} />
                    Propose Idea
                  </Button>
                </div>
              </div>
            </form>
          </div>
        )}

        {mainTab === 'review' && (
          /* Tab 2: Kaizen Reviews List */
          <div className="space-y-4 py-4">
            <div className="space-y-4">
              {isReviewerRole && (
                <div className="flex items-center gap-1 rounded-lg border border-line bg-surface-sunken p-1 text-xs w-fit">
                  {[
                    { key: 'to_review', label: 'To Review' },
                    { key: 'my_submissions', label: 'My Submissions' }
                  ].map((sc) => (
                    <button
                      key={sc.key}
                      type="button"
                      onClick={() => { setReviewScope(sc.key); setCurrentPage(1); }}
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

              <div className="space-y-3 bg-surface-raised p-4 rounded-xl border border-line shadow-xs">
                <div>
                  <h3 className="text-base font-semibold text-ink-strong flex items-center gap-2">
                    <Send size={18} className="text-blue-700" /> Kaizen Reviews & Workflow
                  </h3>
                  <p className="text-xs text-ink-muted">Evaluate, score, approve, or reject submitted Kaizens</p>
                </div>

                {/* Review Filters. "Confirmed Close" is only meaningful on My Submissions (a
                    closed kaizen has nothing left for a reviewer to do), so it's hidden on To
                    Review. Mobile: a 2-row grid so every tab is one tap and nothing is tiny.
                    Desktop (sm+): the single pill row. */}
                {(() => {
                  const reviewFilterOptions = [
                    { value: 'submitted', label: 'Pending Review', short: 'Pending' },
                    { value: 'approved_for_implementation', label: 'Approved', short: 'Approved' },
                    { value: 'submitted_for_confirmation', label: 'Validation', short: 'Validation' },
                    { value: 'confirmed_close', label: 'Closed', short: 'Closed' },
                    { value: 'rejected', label: 'Rejected', short: 'Rejected' },
                    { value: 'draft', label: 'Draft', short: 'Draft' },
                  ].filter(f => effectiveReviewScope === 'my_submissions' || !TO_REVIEW_HIDDEN_FILTERS.includes(f.value));
                  const pickFilter = (value) => { setReviewFilter(value); setRejectedStage('all'); setCurrentPage(1); };
                  // To Review has 4 tabs (fit one mobile row); My Submissions has 6 (two rows of 3).
                  const mobileCols = reviewFilterOptions.length <= 4 ? 'grid-cols-4' : 'grid-cols-3';
                  const Pill = ({ f, mobile }) => {
                    const count = reviewCountFor(f.value);
                    const active = reviewFilter === f.value;
                    return (
                      <button
                        type="button"
                        onClick={() => pickFilter(f.value)}
                        className={`inline-flex items-center justify-center gap-1 rounded-md font-semibold transition-all ${
                          mobile ? 'w-full px-1 py-2 text-xs leading-tight' : 'shrink-0 whitespace-nowrap px-2 py-1 text-xs'
                        } ${
                          active
                            ? 'bg-surface-raised text-blue-700 shadow-xs'
                            : 'text-ink-muted hover:text-ink-strong hover:bg-surface-raised/60'
                        }`}
                      >
                        <span className={mobile ? 'truncate' : ''}>{mobile ? f.short : f.label}</span>
                        <span className={`rounded-full px-1 min-w-[16px] text-center text-2xs font-bold ${
                          active ? 'bg-blue-100 text-blue-700' : 'bg-surface-sunken text-ink-subtle'
                        }`}>
                          {count}
                        </span>
                      </button>
                    );
                  };
                  return (
                    <>
                      {/* Mobile: grid — 4 tabs in one row (To Review), 6 in two rows (My Submissions) */}
                      <div className={`grid ${mobileCols} gap-1 bg-surface-sunken p-1 rounded-lg border border-line sm:hidden`}>
                        {reviewFilterOptions.map(f => <Pill key={f.value} f={f} mobile />)}
                      </div>
                      {/* Desktop: single pill row */}
                      <div className="hidden sm:flex items-center gap-1 bg-surface-sunken p-1 rounded-lg border border-line overflow-x-auto max-w-full [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:justify-center">
                        {reviewFilterOptions.map(f => <Pill key={f.value} f={f} />)}
                      </div>
                    </>
                  );
                })()}

                {/* Nested sub-tabs — only shown once "Rejected" is the active top-level
                    filter, not flattened into the global filter row above. */}
                {reviewFilter === 'rejected' && (
                  <div className="flex items-center justify-center gap-1 mt-1.5">
                    {[
                      { value: 'all', label: 'All Rejected' },
                      { value: '1st', label: 'Proposal Review' },
                      { value: '2nd', label: 'Implementation Review' },
                    ].map((s) => (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => { setRejectedStage(s.value); setCurrentPage(1); }}
                        className={`shrink-0 whitespace-nowrap px-2 py-0.5 rounded-full text-2xs font-medium border transition-all ${
                          rejectedStage === s.value
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-surface-base text-ink-muted border-line hover:border-blue-200'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Search Bar for Reviews */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search Kaizens by title, submitter, area, JH group..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-line bg-surface-raised text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
              </div>

              {/* Kaizen Review Cards */}
              {paginatedReviewKaizens.length === 0 ? (
                <EmptyState
                  title="No Kaizens found"
                  description="No records match your selected filter or search query."
                />
              ) : (
                <div className="space-y-4">
                  {paginatedReviewKaizens.map(k => {
                    const areaClass = AREA_COLOR[k.result_area] || 'bg-surface-sunken text-ink-muted';

                    return (
                      <div key={k.id} className="rounded-xl border border-line bg-surface-raised p-4 shadow-xs flex gap-4">
                        {(k.before_image || k.after_image) && (
                          <div className="shrink-0 flex flex-col gap-2">
                            {[['Before', k.before_image], ['After', k.after_image]].filter(([, src]) => src).map(([label, src]) => (
                              <button key={label} type="button" onClick={() => setLightboxImage(src)} className="group relative block" title="Tap to view full size">
                                <img src={src} alt={label} className="w-20 h-20 rounded-lg object-contain bg-surface-sunken border border-line cursor-zoom-in transition group-hover:border-blue-300" />
                                <span className="absolute bottom-0 inset-x-0 rounded-b-lg bg-ink-strong/60 text-2xs font-semibold uppercase tracking-wider text-white text-center leading-4">{label}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="min-w-0 flex-1 space-y-2">
                          {/* Top Bar: Badges & Info */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wide border ${areaClass}`}>
                                {AREA_LABEL[k.result_area] || k.result_area}
                              </span>
                              {k.previous_category && k.previous_category !== k.result_area && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-medium bg-surface-sunken text-ink-subtle border border-line" title="Category changed by JH Lead">
                                  <Tag size={10} />
                                  {AREA_LABEL[k.previous_category] || k.previous_category} → {AREA_LABEL[k.result_area] || k.result_area}
                                </span>
                              )}
                              <StatusBadge status={STATUS_KEY[k.status]} label={STATUS_LABEL[k.status]} size="sm" />
                              {/* "Stage X of Y" — shown once the factory has configured more
                                  than one reviewer stage for this phase. Invisible otherwise. */}
                              {kaizenStageLabel(k) && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                                  <Layers size={10} /> {kaizenStageLabel(k)}
                                </span>
                              )}
                              {/* Who it's waiting on right now — mirrors OPL's amber "With <name>" chip. */}
                              {PENDING_KAIZEN_STATUSES.has(k.status) && kaizenReviewerNames(k) && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                  <User size={10} /> With {kaizenReviewerNames(k)}
                                </span>
                              )}
                              {k.horizontal_deployment && (
                                <span className="px-2 py-0.5 rounded-md text-2xs font-bold uppercase tracking-wider bg-purple-500/10 text-purple-700 border border-purple-200">
                                  Horizontal Deployment
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button type="button" onClick={() => setSelectedKaizenSheet(k)} className="p-1.5 rounded-lg text-ink-muted hover:bg-surface-hover hover:text-blue-700" title="View details">
                                <Eye size={16} />
                              </button>
                              {isPlantBeLeadForKaizen(k) && (
                                <button type="button" onClick={() => { setSelectedAuditKaizen(k); setAuditModalOpen(true); }} className="p-1.5 rounded-lg text-ink-muted hover:bg-surface-hover hover:text-blue-700" title="Audit trail">
                                  <History size={16} />
                                </button>
                              )}
                            </div>
                          </div>

                          <div>
                            <p className="text-sm font-semibold text-ink-strong leading-snug">{k.title}</p>
                            {k.brief_description && k.brief_description.trim() && k.brief_description.trim().toLowerCase() !== (k.title || '').trim().toLowerCase() && (
                              <p className="text-xs text-ink-muted leading-snug mt-0.5 line-clamp-2">{k.brief_description}</p>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted border-t border-line-subtle pt-2">
                            {/* submitter_name is already the free-text "Name (ID: xxxxx)" string
                                captured at creation — appending submitted_by again would repeat
                                the same id a second time. */}
                            <span className="flex items-center gap-1"><User size={11} />Submitted by {k.submitter_name}</span>
                            {k.jh_group_name && <span>JH Group: <strong className="text-ink-strong font-medium">{k.jh_group_name}</strong></span>}
                            {k.plant_name && <span>Plant: <strong className="text-ink-strong font-medium">{k.plant_name}</strong></span>}
                          </div>

                        {/* Rejection comment — visible to everyone who can see this card
                            (submitter, BE lead, and the originating JH lead all keep visibility
                            after this), never a permanent delete. Stage is told apart by
                            whether implementation was reported, not a separate status. */}
                        {k.status === 'rejected' && k.rejection_reason && (
                          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-500/5 p-2 text-2xs text-red-900 mt-1">
                            <AlertTriangle size={12} className="mt-0.5 shrink-0 text-red-600" />
                            <span><span className="font-semibold">{k.reached_phase2 ? 'Rejected at implementation review:' : 'Rejected at proposal review:'}</span> {k.rejection_reason}</span>
                          </div>
                        )}

                        {/* Submitter's implementation report — after-photo, savings estimate
                            (unit driven by category), improvements made, implementation date. */}
                        {implementOpenId === k.id && (
                          <div className="rounded-lg border border-line overflow-hidden">
                            <div className="flex items-center gap-1.5 px-3 py-2 border-b border-line bg-surface-sunken">
                              <CheckCircle2 size={13} className="text-blue-600" />
                              <span className="text-xs font-semibold text-ink-strong">Report Implementation</span>
                            </div>
                            <div className="space-y-3 p-3">
                              <div className="space-y-1">
                                <label className="text-2xs font-semibold text-ink-muted">After Photo <span className="text-danger-fg">*</span></label>
                                {implementAfterImage ? (
                                  <div className="relative h-36 w-52 rounded-md border border-line overflow-hidden bg-surface-sunken">
                                    <img src={implementAfterImage} alt="After" className="h-full w-full object-contain" />
                                    <button type="button" onClick={() => setImplementAfterImage(null)} className="absolute top-1 right-1 rounded-full bg-surface-raised/90 p-1 shadow-xs">
                                      <X size={12} />
                                    </button>
                                  </div>
                                ) : (
                                  <label className="flex h-28 w-40 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-line hover:border-blue-300 hover:bg-surface-hover">
                                    {isCompressingImplementAfter ? <Loader2 size={18} className="animate-spin text-blue-700" /> : (<>
                                      <ImagePlus size={18} className="text-ink-subtle" />
                                      <span className="text-2xs text-ink-strong">Attach After Photo</span>
                                    </>)}
                                    <input type="file" accept="image/*" className="hidden" disabled={isCompressingImplementAfter} onChange={handleImplementAfterImageSelect} />
                                  </label>
                                )}
                              </div>
                              <div className="space-y-1">
                                <label className="text-2xs font-semibold text-ink-muted">One-Time Benefit <span className="text-danger-fg">*</span></label>
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                  <input
                                    type="number"
                                    inputMode="decimal"
                                    value={implementSavings}
                                    onChange={(e) => setImplementSavings(e.target.value)}
                                    placeholder="Enter value"
                                    className="w-full sm:w-40 rounded-md border border-line bg-surface-raised px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-700"
                                  />
                                  <div className="flex flex-wrap gap-1.5">
                                    {SAVINGS_UNITS.map((u) => (
                                      <button
                                        key={u}
                                        type="button"
                                        onClick={() => setImplementUnit(u)}
                                        className={`rounded-full border px-2.5 py-1 text-2xs font-semibold ${implementUnit === u ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-line bg-surface-raised text-ink-muted hover:bg-surface-hover'}`}
                                      >
                                        {u}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                {implementUnit === OTHER_UNIT && (
                                  <input
                                    type="text"
                                    value={implementUnitOther}
                                    onChange={(e) => setImplementUnitOther(e.target.value)}
                                    placeholder="Enter the unit (e.g. kg scrap saved)"
                                    className="mt-2 w-full sm:w-64 rounded-md border border-line bg-surface-raised px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-700"
                                  />
                                )}
                              </div>
                              <div className="space-y-1">
                                <label className="text-2xs font-semibold text-ink-muted">Implementation Cost <span className="text-ink-subtle font-normal">(optional, Rs)</span></label>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  min="0"
                                  value={implementCost}
                                  onChange={(e) => setImplementCost(e.target.value)}
                                  placeholder="Leave blank if none"
                                  className="w-full sm:w-40 rounded-md border border-line bg-surface-raised px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-700"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-2xs font-semibold text-ink-muted">What Improvements Were Made <span className="text-danger-fg">*</span></label>
                                <textarea
                                  rows={2}
                                  value={implementNotes}
                                  onChange={(e) => setImplementNotes(e.target.value)}
                                  placeholder="Describe what was actually implemented..."
                                  className="w-full rounded-md border border-line bg-surface-raised px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-700"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-2xs font-semibold text-ink-muted">Team Members Who Helped <span className="text-ink-subtle font-normal">(optional, up to {MAX_IMPLEMENT_TEAM_MEMBERS})</span></label>
                                {implementTeamMembers.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5 mb-1">
                                    {implementTeamMembers.map((m) => (
                                      <span key={m.id} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-sunken px-2 py-0.5 text-2xs text-ink-strong">
                                        {m.name} <span className="text-ink-subtle">#{m.employee_id || m.id}</span>
                                        <button type="button" onClick={() => setImplementTeamMembers((prev) => prev.filter((x) => x.id !== m.id))} className="text-ink-subtle hover:text-danger-fg">
                                          <X size={11} />
                                        </button>
                                      </span>
                                    ))}
                                  </div>
                                )}
                                {implementTeamMembers.length < MAX_IMPLEMENT_TEAM_MEMBERS ? (
                                  <WorkerPicker
                                    className="w-full sm:w-64"
                                    placeholder="Search by name or employee ID"
                                    excludeIds={[...implementTeamMembers.map((m) => m.id), userWorkerId]}
                                    onSelect={(r) => setImplementTeamMembers((prev) => [...prev, r])}
                                  />
                                ) : (
                                  <p className="text-2xs text-ink-subtle">Limit reached ({MAX_IMPLEMENT_TEAM_MEMBERS}) — remove someone to add another.</p>
                                )}
                              </div>
                              <div className="space-y-1">
                                <label className="text-2xs font-semibold text-ink-muted">Implementation Date <span className="text-danger-fg">*</span></label>
                                <input
                                  type="date"
                                  value={implementDate}
                                  onChange={(e) => setImplementDate(e.target.value)}
                                  className="w-full sm:w-64 rounded-md border border-line bg-surface-raised px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-700"
                                />
                              </div>
                              <div className="flex justify-end gap-2 pt-1">
                                <Button size="sm" variant="outline" onClick={closeImplementForm} className="text-xs h-8">Cancel</Button>
                                <Button size="sm" onClick={() => handleSubmitImplementation(k)} className="text-xs h-8 bg-blue-600 text-white hover:bg-blue-700">
                                  <Send size={13} className="mr-1" /> Submit
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* JH lead reviews and can edit what the submitter reported at
                            implementation before forwarding to the DMT lead — same
                            edit-and-diff pattern as the approve stage. */}
                        {forwardOpenId === k.id && (
                          <div className="rounded-lg border border-line overflow-hidden">
                            <div className="flex items-center gap-1.5 px-3 py-2 border-b border-line bg-surface-sunken">
                              <Send size={13} className="text-blue-600" />
                              <span className="text-xs font-semibold text-ink-strong">Review before forwarding to the next stage</span>
                            </div>
                            <div className="space-y-3 p-3">
                              <div className="space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                  <label className="text-2xs font-semibold text-ink-muted">After Photo <span className="text-danger-fg">*</span></label>
                                  <FwdFieldTick unchanged={fwdUnchanged.after_image} />
                                </div>
                                {fwdAfterImage ? (
                                  <div className="relative h-36 w-52 rounded-md border border-line overflow-hidden bg-surface-sunken">
                                    <img src={fwdAfterImage} alt="After" className="h-full w-full object-contain" />
                                    <button type="button" onClick={() => setFwdAfterImage(null)} className="absolute top-1 right-1 rounded-full bg-surface-raised/90 p-1 shadow-xs">
                                      <X size={12} />
                                    </button>
                                  </div>
                                ) : (
                                  <label className="flex h-28 w-40 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-line hover:border-blue-300 hover:bg-surface-hover">
                                    {isCompressingFwdAfter ? <Loader2 size={18} className="animate-spin text-blue-700" /> : (<>
                                      <ImagePlus size={18} className="text-ink-subtle" />
                                      <span className="text-2xs text-ink-strong">Attach After Photo</span>
                                    </>)}
                                    <input type="file" accept="image/*" className="hidden" disabled={isCompressingFwdAfter} onChange={handleFwdAfterImageSelect} />
                                  </label>
                                )}
                              </div>
                              <div className="space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                  <label className="text-2xs font-semibold text-ink-muted">One-Time Benefit <span className="text-danger-fg">*</span></label>
                                  <FwdFieldTick unchanged={fwdUnchanged.savings} />
                                </div>
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                  <input
                                    type="number"
                                    inputMode="decimal"
                                    value={fwdSavings}
                                    onChange={(e) => setFwdSavings(e.target.value)}
                                    placeholder="Enter value"
                                    className="w-full sm:w-40 rounded-md border border-line bg-surface-raised px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-700"
                                  />
                                  <div className="flex flex-wrap gap-1.5">
                                    {SAVINGS_UNITS.map((u) => (
                                      <button
                                        key={u}
                                        type="button"
                                        onClick={() => setFwdUnit(u)}
                                        className={`rounded-full border px-2.5 py-1 text-2xs font-semibold ${fwdUnit === u ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-line bg-surface-raised text-ink-muted hover:bg-surface-hover'}`}
                                      >
                                        {u}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                {fwdUnit === OTHER_UNIT && (
                                  <input
                                    type="text"
                                    value={fwdUnitOther}
                                    onChange={(e) => setFwdUnitOther(e.target.value)}
                                    placeholder="Enter the unit (e.g. kg scrap saved)"
                                    className="mt-2 w-full sm:w-64 rounded-md border border-line bg-surface-raised px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-700"
                                  />
                                )}
                              </div>
                              <div className="space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                  <label className="text-2xs font-semibold text-ink-muted">What Improvements Were Made <span className="text-danger-fg">*</span></label>
                                  <FwdFieldTick unchanged={fwdUnchanged.notes} />
                                </div>
                                <textarea
                                  rows={2}
                                  value={fwdNotes}
                                  onChange={(e) => setFwdNotes(e.target.value)}
                                  placeholder="Describe what was actually implemented..."
                                  className="w-full rounded-md border border-line bg-surface-raised px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-700"
                                />
                              </div>
                              <div className="space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                  <label className="text-2xs font-semibold text-ink-muted">Implementation Date <span className="text-danger-fg">*</span></label>
                                  <FwdFieldTick unchanged={fwdUnchanged.date} />
                                </div>
                                <input
                                  type="date"
                                  value={fwdDate}
                                  onChange={(e) => setFwdDate(e.target.value)}
                                  className="w-full sm:w-64 rounded-md border border-line bg-surface-raised px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-700"
                                />
                              </div>
                              <div className="flex justify-end gap-2 pt-1">
                                <Button size="sm" variant="outline" onClick={closeForwardForm} className="text-xs h-8">Cancel</Button>
                                <Button size="sm" onClick={() => handleForwardToDmt(k.id)} disabled={reviewDetail.isPending} className="text-xs h-8 bg-blue-600 text-white hover:bg-blue-700">
                                  <Send size={13} className="mr-1" /> Forward to Next Stage
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Confirms the JH lead reviewed the implementation report before
                            forwarding, and shows the DMT lead (and anyone else) exactly which
                            fields were left as the submitter reported them vs edited —
                            auto-derived from review_changes, not a manually-ticked box. */}
                        {k.forwarded_to_dmt_at && (
                          <div className="rounded-lg border border-blue-200 bg-blue-500/5 px-3 py-2 text-xs text-blue-900 space-y-1">
                            <div className="flex items-center gap-1.5">
                              <CheckCircle2 size={13} className="shrink-0 text-blue-600" />
                              <span className="font-semibold">Reviewed and forwarded to DMT Lead{k.forwarded_to_dmt_by ? ` by ${resolveWorkerName(k.forwarded_to_dmt_by)}` : ''}</span>
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 pl-[19px]">
                              {[
                                { key: 'after_image', label: 'After Photo' },
                                { key: 'savings_estimate', label: 'One-Time Benefit' },
                                { key: 'improvement_notes', label: 'Improvements Made' },
                                { key: 'implementation_date', label: 'Implementation Date' },
                              ].map(({ key, label }) => {
                                const edited = Boolean(k.review_changes && key in k.review_changes);
                                return (
                                  <span key={key} className={`inline-flex items-center gap-1 text-2xs font-medium ${edited ? 'text-blue-700' : 'text-emerald-700'}`}>
                                    {edited ? <Pencil size={11} /> : <CheckCircle2 size={12} />}
                                    {label}{edited ? ' edited' : ' unchanged'}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Workflow Action Buttons for Kaizen */}
                        <div className="flex items-center justify-end gap-2 pt-3 border-t border-line flex-wrap">
                          {inlineRejectId === k.id ? (
                            <div className="flex items-center gap-2 w-full">
                              <input
                                type="text"
                                placeholder="Enter rejection reason..."
                                value={inlineRejectReason}
                                onChange={(e) => setInlineRejectReason(e.target.value)}
                                className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-red-300 bg-surface-base focus:outline-none focus:ring-1 focus:ring-red-500"
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setInlineRejectId(null)}
                                className="text-xs h-8"
                              >
                                Cancel
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => handleConfirmReject(k.id)}
                                className="text-xs h-8 bg-red-600 text-white hover:bg-red-700"
                              >
                                Reject
                              </Button>
                            </div>
                          ) : inlineDmtRejectId === k.id ? (
                            <div className="flex items-center gap-2 w-full">
                              <input
                                type="text"
                                placeholder="Enter rejection reason..."
                                value={inlineDmtRejectReason}
                                onChange={(e) => setInlineDmtRejectReason(e.target.value)}
                                className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-red-300 bg-surface-base focus:outline-none focus:ring-1 focus:ring-red-500"
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setInlineDmtRejectId(null)}
                                className="text-xs h-8"
                              >
                                Cancel
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => handleConfirmMarkForDeletion(k.id)}
                                className="text-xs h-8 bg-red-600 text-white hover:bg-red-700"
                              >
                                Reject
                              </Button>
                            </div>
                          ) : confirmCloseId === k.id ? (
                            <div className="w-full space-y-3 rounded-lg border border-emerald-200 bg-emerald-500/5 p-3">
                              <p className="text-xs font-semibold text-ink-strong flex items-center gap-1.5">
                                <CheckCircle2 size={14} className="text-emerald-600" /> Validate before closing
                              </p>
                              <p className="text-2xs text-ink-muted -mt-1.5">Everything below happened since the submitter reported implementation. Confirm it looks right, then close.</p>

                              {/* The implementation report itself */}
                              <div className="rounded-lg border border-line bg-surface-base p-2.5 space-y-2">
                                <p className="text-2xs font-bold uppercase tracking-wider text-ink-subtle">Implementation Report</p>
                                <div className="flex gap-3">
                                  {k.after_image && (
                                    <button type="button" onClick={() => setLightboxImage(k.after_image)} className="shrink-0" title="Tap to view full size">
                                      <img src={k.after_image} alt="After" className="w-16 h-16 rounded-lg object-contain bg-surface-sunken border border-line cursor-zoom-in" />
                                    </button>
                                  )}
                                  <div className="min-w-0 flex-1 text-2xs text-ink-strong space-y-1">
                                    {k.savings_estimate != null && k.savings_estimate !== '' && (
                                      <p className="flex items-center gap-1"><TrendingUp size={11} className="text-emerald-600 shrink-0" /> <span className="font-semibold">{k.savings_estimate}{k.savings_unit ? ` ${k.savings_unit}` : ''}</span></p>
                                    )}
                                    {k.implementation_date && <p className="text-ink-muted">Implemented: {k.implementation_date}</p>}
                                    {k.implementation_cost != null && <p className="text-ink-muted">Implementation cost: Rs {k.implementation_cost}</p>}
                                    {k.improvement_notes && <p className="whitespace-pre-wrap">{k.improvement_notes}</p>}
                                    {k.team_member_emp_ids?.length > 0 && (
                                      <p className="text-ink-muted">Helped by: {k.team_member_emp_ids.map(resolveWorkerName).join(', ')}</p>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* What the reviewer(s) edited on the way through */}
                              {k.review_changes && Object.keys(k.review_changes).length > 0 && (
                                <div className="rounded-lg border border-blue-200 bg-blue-500/5 p-2.5 text-2xs text-blue-900 space-y-1">
                                  <p className="text-2xs font-bold uppercase tracking-wider text-blue-700/80">Edited by a reviewer</p>
                                  {Object.entries(k.review_changes).map(([field, { from, to }]) => (
                                    <p key={field} className="leading-relaxed">
                                      <span className="font-semibold">{FIELD_LABELS[field] || field}: </span>
                                      {(field === 'before_image' || field === 'after_image')
                                        ? <span className="italic">photo replaced</span>
                                        : <><span className="line-through text-blue-700/60">{(field === 'category' ? (AREA_LABEL[from] || from) : from) || '—'}</span> → <span className="font-medium">{(field === 'category' ? (AREA_LABEL[to] || to) : to) || '—'}</span></>}
                                    </p>
                                  ))}
                                </div>
                              )}

                              {/* Prior workflow steps since implementation (multi-stage phase 2) */}
                              {(() => {
                                const logs = confirmCloseAudit.data || [];
                                const implLog = [...logs].reverse().find(l => l.action === 'submit_implementation');
                                const since = implLog ? new Date(implLog.timestamp).getTime() : 0;
                                const steps = logs
                                  .filter(l => new Date(l.timestamp).getTime() >= since && ['submit_implementation', 'forward_to_dmt', 'category_updated'].includes(l.action))
                                  .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                                if (confirmCloseAudit.isLoading) return <p className="text-2xs text-ink-subtle">Loading activity…</p>;
                                if (steps.length === 0) return null;
                                return (
                                  <div className="rounded-lg border border-line bg-surface-base p-2.5 space-y-1.5">
                                    <p className="text-2xs font-bold uppercase tracking-wider text-ink-subtle">Steps performed</p>
                                    {steps.map(l => (
                                      <div key={l.id} className="text-2xs text-ink-strong">
                                        <span className="font-semibold capitalize">{(l.action || '').replace(/_/g, ' ')}</span>
                                        <span className="text-ink-subtle"> · {resolveWorkerName(l.performed_by) || l.performed_by} · {new Date(l.timestamp).toLocaleDateString('en-IN')}</span>
                                        {l.comments && <p className="text-ink-muted">{l.comments}</p>}
                                      </div>
                                    ))}
                                  </div>
                                );
                              })()}

                              <div className="flex items-center justify-end gap-2 pt-1">
                                <Button size="sm" variant="outline" onClick={() => setConfirmCloseId(null)} className="text-xs h-8">Cancel</Button>
                                <Button size="sm" onClick={() => handleConfirmClose(k.id)} disabled={reviewDetail.isPending} className="text-xs h-8 bg-emerald-600 text-white hover:bg-emerald-700">
                                  <CheckCircle2 size={14} className="mr-1" /> Confirm &amp; Close
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              {k.status === 'draft' && isMySubmissionKaizen(k) && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => openDraftEdit(k)}
                                    className="text-xs"
                                  >
                                    <Pencil size={14} className="mr-1" /> Edit
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={() => { openDraftEdit(k); }}
                                    className="text-xs bg-blue-600 text-white hover:bg-blue-700"
                                  >
                                    <Send size={14} className="mr-1" /> Submit for Review
                                  </Button>
                                </>
                              )}
                              {(k.status === 'proposed' || k.status === 'submitted' || k.status === 'pending_review') && canReviewKaizen(k) && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setInlineRejectId(k.id)}
                                    className="text-xs text-red-600 border-red-200 hover:bg-red-50"
                                  >
                                    <XCircle size={14} className="mr-1" /> Reject
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={() => openReviewEdit(k)}
                                    className="text-xs bg-emerald-600 text-white hover:bg-emerald-700"
                                  >
                                    <CheckCircle2 size={14} className="mr-1" /> Review &amp; Approve
                                  </Button>
                                </>
                              )}

                              {/* Once approved, the ball is in the submitter's court — the JH
                                  lead has no action here at all (not even Mark for Deletion)
                                  until the submitter reports implementation, below. */}
                              {(k.status === 'approved_for_implementation' || k.status === 'approved') && k.submitted_by === userWorkerId && implementOpenId !== k.id && (
                                <Button
                                  size="sm"
                                  onClick={() => openImplementForm(k)}
                                  className="text-xs bg-blue-600 text-white hover:bg-blue-700"
                                >
                                  <CheckCircle2 size={14} className="mr-1" /> Report Implementation
                                </Button>
                              )}

                              {/* JH lead reviews (and can edit) the submitter's implementation
                                  report, then forwards it on — no reject at this stage.
                                  canForwardKaizen is already false once on the final phase-2
                                  stage, so no separate "not yet forwarded" check is needed
                                  here (that would break a 3+-stage phase-2 config). */}
                              {k.status === 'submitted_for_confirmation' && canForwardKaizen(k) && forwardOpenId !== k.id && (
                                <Button
                                  size="sm"
                                  onClick={() => openForwardForm(k)}
                                  className="text-xs bg-blue-600 text-white hover:bg-blue-700"
                                >
                                  <Send size={14} className="mr-1" /> Review &amp; Forward
                                </Button>
                              )}

                              {/* Final implementation review — validate &amp; close, or reject
                                  (the same terminal "rejected" status as the proposal-stage
                                  reject, never a real delete; notifies submitter, BE leads and
                                  the JH leader). */}
                              {k.status === 'submitted_for_confirmation' && isKaizenFinalPhase2Stage(k) && canDmtReviewKaizen(k) && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setInlineDmtRejectId(k.id)}
                                    className="text-xs text-red-600 border-red-200 hover:bg-red-50"
                                  >
                                    <XCircle size={14} className="mr-1" /> Reject
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={() => setConfirmCloseId(k.id)}
                                    className="text-xs bg-emerald-600 text-white hover:bg-emerald-700"
                                  >
                                    <CheckCircle2 size={14} className="mr-1" /> Confirm & Close
                                  </Button>
                                </>
                              )}
                            </>
                          )}
                        </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Pagination */}
                  <ListPager
                    total={totalReviewItems}
                    noun={totalReviewItems === 1 ? 'Kaizen' : 'Kaizens'}
                    page={validReviewPage - 1}
                    pageCount={totalReviewPages}
                    pageSize={pageSize}
                    onPage={(i) => setCurrentPage(i + 1)}
                    onPageSize={(n) => { setPageSize(n); setCurrentPage(1); }}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {mainTab === 'myteam' && canSeeKzMyTeam && <KaizenMyTeamAnalyticsTab />}

        {mainTab === 'analytics' && isBeLeadRole && <KaizenAnalyticsTab />}

        {mainTab === 'standard' && (
          /* Tab 3: Standard Kaizens Catalogue */
          <div className="space-y-4 py-4">
            {/* Top Sub-Tab Navigation Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-surface-raised p-3 rounded-xl border border-line shadow-xs">
              <div className="flex items-center gap-1.5 rounded-lg border border-line bg-surface-sunken p-1 text-xs flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setStdTab('all');
                    setStdCurrentPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-md transition-all text-xs font-semibold flex items-center gap-1.5 ${
                    stdTab === 'all'
                      ? 'bg-surface-raised text-blue-700 shadow-xs'
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
                    setSelectedPlant('all');
                    setSelectedDmt('all');
                    setSelectedJhGroup('all');
                    setStdCurrentPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-md transition-all text-xs font-semibold flex items-center gap-1.5 ${
                    stdTab === 'my_jh_group'
                      ? 'bg-surface-raised text-blue-700 shadow-xs'
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
                    setSelectedPlant('all');
                    setSelectedDmt('all');
                    setSelectedJhGroup('all');
                    setStdCurrentPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-md transition-all text-xs font-semibold flex items-center gap-1.5 ${
                    stdTab === 'my_remaining'
                      ? 'bg-surface-raised text-amber-700 shadow-xs border border-amber-300/40'
                      : 'text-ink-muted hover:text-ink-strong'
                  }`}
                >
                  <Clock size={14} className={stdTab === 'my_remaining' ? 'text-amber-600' : 'text-ink-subtle'} />
                  <span>My Remaining</span>
                </button>
              </div>

              {/* Search input */}
              <div className="relative flex-1 sm:max-w-xs">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-subtle pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search the Kaizen repository..."
                  value={stdSearchQuery}
                  onChange={(e) => {
                    setStdSearchQuery(e.target.value);
                    setStdCurrentPage(1);
                  }}
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-line bg-surface-base text-ink-strong focus:outline-none focus:ring-1 focus:ring-blue-700"
                />
              </div>
            </div>

            {/* Standard Filter Section (3 Rows) */}
            <div className="flex flex-col gap-2.5 bg-surface-sunken p-3 rounded-xl border border-line text-xs">
              {/* Plant / DMT Level / JH Group only make sense on "All Standard Kaizens" — the
                  other two sub-tabs are already scoped to the viewer's own group. */}
              {stdTab === 'all' && (
                <>
                  {/* Which other plants' kaizens this repository also shows is governed by a
                      BE admin on Org Structure → Repository Plant Scope, not here. */}

                  {/* Row 1: Plant Filter Toggle — shown only when this repository spans more
                      than the home plant (a BE admin opted others in on Org Structure). */}
                  {kzVisiblePlantIds.size > 1 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-2xs font-bold text-ink-muted uppercase tracking-wider flex items-center gap-1 shrink-0">
                      <Building2 size={12} className="text-blue-700" /> Plant:
                    </span>
                    <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg border border-line bg-surface-base flex-wrap">
                      {plantOptions.filter(opt => opt.value === 'all' || kzVisiblePlantIds.has(String(opt.value))).map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            setSelectedPlant(opt.value);
                            setStdCurrentPage(1);
                          }}
                          className={`px-2.5 py-1 rounded-md text-2xs font-semibold transition-all ${
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
                  )}

                  {/* Row 2: DMT Level and JH Group together — stack full-width on mobile so the
                      dropdowns are easy to tap; side by side from sm up. */}
                  <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-x-6">
                    {/* DMT Level Select */}
                    <div className="flex items-center gap-1.5 sm:shrink-0">
                      <span className="text-2xs font-bold text-ink-muted uppercase tracking-wider flex items-center gap-1 shrink-0">
                        <Layers size={12} className="text-blue-700" /> DMT Level:
                      </span>
                      <select
                        value={selectedDmt}
                        onChange={(e) => handleDmtChange(e.target.value)}
                        className="flex-1 sm:flex-none px-2.5 py-1.5 sm:py-1 rounded-lg border border-line bg-surface-base text-2xs font-semibold text-ink focus:outline-none focus:ring-1 focus:ring-blue-700 cursor-pointer"
                      >
                        {dmtOptions.map(opt => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {/* end DMT Level */}

                    {/* Cascading JH Group Select */}
                    <div className="flex items-center gap-1.5 sm:shrink-0">
                      <span className="text-2xs font-bold text-ink-muted uppercase tracking-wider flex items-center gap-1 shrink-0">
                        <Users size={12} className="text-blue-700" /> JH Group:
                      </span>
                      <select
                        value={selectedJhGroup}
                        onChange={(e) => {
                          setSelectedJhGroup(e.target.value);
                          setStdCurrentPage(1);
                        }}
                        className="flex-1 sm:flex-none px-2.5 py-1.5 sm:py-1 rounded-lg border border-line bg-surface-base text-2xs font-semibold text-ink focus:outline-none focus:ring-1 focus:ring-blue-700 cursor-pointer"
                      >
                        {availableJhGroups.map(opt => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </>
              )}

              {/* Row 3: Category + Clear. All six categories always listed. On a phone the
                  pills wrap to ~2 lines; from sm up they sit on one line. They never push the
                  panel wider than itself. */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                {/* Category Toggle */}
                <div className="flex items-start sm:items-center gap-1.5 min-w-0">
                  <span className="text-2xs font-bold text-ink-muted uppercase tracking-wider flex items-center gap-1 shrink-0 pt-1 sm:pt-0">
                    <Tag size={12} className="text-blue-700" /> Category:
                  </span>
                  <div className="flex flex-wrap sm:flex-nowrap items-center gap-0.5 p-0.5 rounded-lg border border-line bg-surface-base">
                    {[
                      { value: 'all', label: 'All' },
                      ...Object.entries(AREA_LABEL).map(([value, label]) => ({ value, label })),
                    ].map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setSelectedArea(opt.value);
                          setStdCurrentPage(1);
                        }}
                        className={`px-2 py-0.5 rounded text-2xs font-semibold transition-all whitespace-nowrap ${
                          selectedArea === opt.value
                            ? 'bg-blue-600 text-white shadow-2xs'
                            : 'text-ink-muted hover:text-ink-strong'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Clear Filters */}
                {(selectedPlant !== 'all' || selectedDmt !== 'all' || selectedJhGroup !== 'all' || selectedArea !== 'all' || stdSearchQuery !== '') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPlant('all');
                      setSelectedDmt('all');
                      setSelectedJhGroup('all');
                      setSelectedArea('all');
                      setStdSearchQuery('');
                      setStdCurrentPage(1);
                    }}
                    className="flex items-center gap-1 text-2xs font-semibold text-blue-700 hover:underline px-2 py-1 rounded bg-surface-base border border-line"
                  >
                    <X size={12} /> Clear Filters
                  </button>
                )}
              </div>
            </div>

            {/* Approved Standard Kaizens Grid */}
            {paginatedStandardKaizens.length === 0 ? (
              <EmptyState
                title="No Kaizens in the Repository"
                description="Try adjusting your filters or search terms."
              />
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {paginatedStandardKaizens.map(k => {
                  const areaClass = AREA_COLOR[k.result_area] || 'bg-surface-sunken text-ink-muted';

                  return (
                    <div key={k.id} className="rounded-xl border border-line bg-surface-raised p-4 shadow-xs flex flex-col justify-between gap-3">
                      <div className="space-y-2">
                        {/* Area Badge */}
                        <div className="flex items-center justify-between gap-2">
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${areaClass}`}>
                            {AREA_LABEL[k.result_area] || k.result_area}
                          </span>
                        </div>

                        {/* Title */}
                        <h4 className="text-sm font-semibold text-ink-strong line-clamp-2">{k.title}</h4>

                        {/* Submitter & Location */}
                        <div className="text-2xs text-ink-muted space-y-0.5">
                          <p>Submitter: <strong className="text-ink-strong">{k.submitter_name}</strong></p>
                          <p>JH Group: <strong className="text-ink-strong">{k.jh_group_name}</strong> ({k.plant_name})</p>
                        </div>

                        {/* Images preview — only shows a column for a photo that actually exists */}
                        {(k.before_image || k.after_image) && (
                          <div className={`grid gap-2 pt-1 ${(k.before_image && k.after_image) ? 'grid-cols-2' : 'grid-cols-1'}`}>
                            {k.before_image && (
                              <button type="button" onClick={() => setLightboxImage(k.before_image)} className="block w-full" title="Tap to view full size">
                                <img src={k.before_image} alt="Before" className="w-full h-24 object-contain rounded-md border border-line bg-surface-sunken cursor-zoom-in hover:opacity-90 transition-opacity" />
                              </button>
                            )}
                            {k.after_image && (
                              <button type="button" onClick={() => setLightboxImage(k.after_image)} className="block w-full" title="Tap to view full size">
                                <img src={k.after_image} alt="After" className="w-full h-24 object-contain rounded-md border border-line bg-surface-sunken cursor-zoom-in hover:opacity-90 transition-opacity" />
                              </button>
                            )}
                          </div>
                        )}

                        {/* Brief */}
                        <p className="text-xs text-ink-muted line-clamp-2 bg-surface-sunken p-2 rounded-lg border border-line">
                          {k.brief_description}
                        </p>

                        {/* Implementation outcome — savings + improvements the submitter
                            reported. Only present once the Kaizen has been implemented. */}
                        {(k.savings_estimate != null || k.improvement_notes || k.implementation_date) && (
                          <div className="rounded-lg border border-emerald-200 bg-emerald-500/5 p-2 space-y-1 text-2xs">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-semibold text-emerald-900">
                              {k.savings_estimate != null && (
                                <span className="inline-flex items-center gap-1"><TrendingUp size={11} /> {k.savings_estimate}{k.savings_unit ? ` ${k.savings_unit}` : ''}</span>
                              )}
                              {k.implementation_date && (
                                <span className="text-emerald-800/80">Implemented {String(k.implementation_date).slice(0, 10)}</span>
                              )}
                              {k.implementation_cost != null && (
                                <span className="text-emerald-800/80">Cost Rs {k.implementation_cost}</span>
                              )}
                            </div>
                            {k.improvement_notes && (
                              <p className="text-ink-strong line-clamp-2">{k.improvement_notes}</p>
                            )}
                            {k.team_member_emp_ids?.length > 0 && (
                              <p className="text-emerald-800/80">Helped by: {k.team_member_emp_ids.map(resolveWorkerName).join(', ')}</p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-line">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedKaizenSheet(k)}
                          className="text-2xs h-7 gap-1 px-2.5"
                        >
                          <BookOpen size={12} /> View Sheet
                        </Button>

                        <StatusBadge status={STATUS_KEY[k.status]} label={STATUS_LABEL[k.status]} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Standard Pagination */}
            <ListPager
              total={totalStdItems}
              noun={totalStdItems === 1 ? 'Kaizen' : 'Kaizens'}
              page={validStdPage - 1}
              pageCount={totalStdPages}
              pageSize={stdPageSize}
              onPage={(i) => setStdCurrentPage(i + 1)}
              onPageSize={(n) => { setStdPageSize(n); setStdCurrentPage(1); }}
            />
          </div>
        )}
      </CaptureColumn>

      {/* Review & Edit modal — the JH reviewer can edit title/content/category/before-photo
          before approving, mirroring Abnormality's Review & Assign edit-and-diff pattern. */}
      <Dialog open={!!reviewEditItem} onOpenChange={(open) => !open && closeReviewEdit()}>
        <DialogContent className="max-w-2xl max-h-[95vh] overflow-y-auto text-base">
          <DialogHeader>
            <DialogTitle className="text-xl">{reviewEditMode === 'draft' ? 'Edit Draft Kaizen' : 'Review & Approve Kaizen'}</DialogTitle>
          </DialogHeader>
          {reviewEditItem && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold uppercase tracking-wider text-ink-muted mb-1.5">
                  Title <span className="text-danger-fg">*</span>
                </label>
                <input
                  type="text"
                  value={reTitle}
                  onChange={(e) => setReTitle(e.target.value)}
                  className="w-full h-11 rounded-lg border border-line bg-surface-base px-3 text-base text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold uppercase tracking-wider text-ink-muted mb-1.5">
                  Category <span className="text-danger-fg">*</span>
                </label>
                <select
                  value={reCategory}
                  onChange={(e) => setReCategory(e.target.value)}
                  className="w-full h-11 rounded-lg border border-line bg-surface-base px-3 text-base text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-700"
                >
                  {Object.entries(AREA_LABEL).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold uppercase tracking-wider text-ink-muted mb-1">
                  Description <span className="text-danger-fg">*</span>
                </label>
                <textarea
                  required
                  rows={4}
                  value={reContent}
                  onChange={(e) => setReContent(e.target.value)}
                  className="w-full rounded-lg border border-line bg-surface-base px-3 py-2 text-base text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold uppercase tracking-wider text-ink-muted mb-1">
                  Before Photo
                </label>
                <input ref={reImageInputRef} type="file" accept="image/*" className="hidden" onChange={handleReImageChange} />
                {reBeforeImage ? (
                  <div className="relative rounded-lg border border-line overflow-hidden bg-surface-sunken h-28 w-28">
                    <img src={reBeforeImage} alt="" className="w-full h-full object-contain" />
                    <button type="button" onClick={() => setReBeforeImage(null)} className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white">
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => reImageInputRef.current?.click()}
                    disabled={reIsCompressing}
                    className="flex items-center gap-2 rounded-lg border border-dashed border-line px-3 py-2 text-sm text-ink-muted hover:border-blue-300 hover:text-blue-700"
                  >
                    {reIsCompressing ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
                    {reIsCompressing ? 'Compressing...' : 'Add photo'}
                  </button>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 flex-wrap">
                <Button variant="outline" onClick={closeReviewEdit} className="text-sm">Cancel</Button>
                {reviewEditMode === 'draft' ? (
                  <>
                    <Button variant="outline" onClick={() => handleSaveDraft(false)} disabled={reviewDetail.isPending} className="text-sm">
                      <Pencil size={14} className="mr-1" /> Save draft
                    </Button>
                    <Button onClick={() => handleSaveDraft(true)} disabled={reviewDetail.isPending} className="text-sm bg-blue-600 text-white hover:bg-blue-700">
                      <Send size={14} className="mr-1" /> Save &amp; Submit for Review
                    </Button>
                  </>
                ) : (
                  <Button onClick={handleReviewApprove} disabled={reviewDetail.isPending} className="text-sm bg-emerald-600 text-white hover:bg-emerald-700">
                    <CheckCircle2 size={14} className="mr-1" /> Approve for Implementation
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Audit Trail Modal */}
      {auditModalOpen && selectedAuditKaizen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-surface-raised p-5 shadow-xl space-y-4 border border-line">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2">
                <History size={18} className="text-blue-700" />
                <h3 className="font-semibold text-ink-strong text-sm">Audit Trail</h3>
              </div>
              <button onClick={() => setAuditModalOpen(false)} className="text-ink-subtle hover:text-ink-strong">
                <X size={16} />
              </button>
            </div>

            <p className="text-xs font-medium text-ink-strong">{selectedAuditKaizen.title}</p>

            <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
              {auditTrail.isLoading ? (
                <p className="text-xs text-ink-subtle">Loading…</p>
              ) : (auditTrail.data || []).length === 0 ? (
                <p className="text-xs text-ink-subtle">No audit logs found.</p>
              ) : (
                (auditTrail.data || []).map(log => {
                  let diffs = [];
                  try { diffs = log.changed_fields ? JSON.parse(log.changed_fields) : []; } catch { diffs = []; }
                  return (
                    <div key={log.id} className="text-2xs p-2.5 rounded-lg bg-surface-sunken border border-line space-y-1">
                      <div className="flex items-center justify-between text-ink-strong font-semibold">
                        <span className="capitalize">{(log.action || '').replace(/_/g, ' ')}</span>
                        <span className="text-ink-subtle font-normal">{new Date(log.timestamp).toLocaleString('en-IN')}</span>
                      </div>
                      <p className="text-ink-muted">Performed by: {log.performed_by}</p>
                      {log.comments && <p className="text-ink-muted">{log.comments}</p>}
                      {diffs.length > 0 && (
                        <div className="space-y-1 pt-1">
                          {diffs.map((d, i) => (
                            <div key={i} className="rounded-md bg-surface-base border border-line px-2 py-1">
                              <span className="font-semibold text-ink-strong">{d.label || d.field}: </span>
                              <span className="text-danger-fg line-through">{d.old || '(empty)'}</span>
                              <span className="mx-1 text-ink-subtle">→</span>
                              <span className="text-success-fg font-medium">{d.new || '(empty)'}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-line">
              <Button size="sm" onClick={() => setAuditModalOpen(false)} className="text-xs">Close</Button>
            </div>
          </div>
        </div>
      )}

      {/* Kaizen Sheet Modal */}
      {selectedKaizenSheet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
          <div className="w-full max-w-2xl my-8 rounded-2xl bg-surface-raised p-6 shadow-2xl space-y-5 border border-line">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2">
                <Award size={20} className="text-amber-500" />
                <div>
                  <h3 className="font-bold text-ink-strong text-base">Kaizen Sheet</h3>
                  <p className="text-xs text-ink-muted">{selectedKaizenSheet.plant_name} · {selectedKaizenSheet.jh_group_name}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => window.print()} className="text-xs gap-1">
                  <Printer size={14} /> Print
                </Button>
                <button onClick={() => setSelectedKaizenSheet(null)} className="text-ink-subtle hover:text-ink-strong p-1">
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Sheet Header Info */}
            <div className="grid grid-cols-2 gap-3 text-xs bg-surface-sunken p-3 rounded-xl border border-line">
              <div>
                <span className="text-2xs font-bold uppercase text-ink-subtle block">Result Area</span>
                <span className="font-semibold text-ink-strong">{AREA_LABEL[selectedKaizenSheet.result_area] || selectedKaizenSheet.result_area}</span>
              </div>
              <div>
                <span className="text-2xs font-bold uppercase text-ink-subtle block">Submitter</span>
                <span className="font-semibold text-ink-strong">{selectedKaizenSheet.submitter_name}</span>
              </div>
            </div>

            {/* Title & Brief */}
            <div>
              <h2 className="text-lg font-bold text-ink-strong mb-1">{selectedKaizenSheet.title}</h2>
              <p className="text-xs text-ink-muted leading-relaxed bg-surface-base p-3 rounded-lg border border-line">
                {selectedKaizenSheet.brief_description}
              </p>
            </div>

            {/* Problem & Solution — Solution & Benefit only renders once the submitter has
                actually reported it (implementation stage); nothing to show before that. */}
            <div className={`grid grid-cols-1 gap-4 text-xs ${(selectedKaizenSheet.solution_description || selectedKaizenSheet.benefit_description) ? 'sm:grid-cols-2' : ''}`}>
              <div className="p-3 rounded-xl bg-red-500/5 border border-red-200 space-y-1">
                <span className="font-bold text-red-900 block uppercase text-2xs">Problem Description</span>
                <p className="text-ink-strong leading-relaxed">{selectedKaizenSheet.problem_description || '—'}</p>
              </div>
              {(selectedKaizenSheet.solution_description || selectedKaizenSheet.benefit_description) && (
                <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-200 space-y-1">
                  <span className="font-bold text-emerald-900 block uppercase text-2xs">Solution & Benefit</span>
                  <p className="text-ink-strong leading-relaxed">{selectedKaizenSheet.solution_description || selectedKaizenSheet.benefit_description}</p>
                </div>
              )}
            </div>

            {/* What the JH reviewer changed at review time — visible only to the item's chain
                (submitter, routing incharges, JH-group leader, module lead), not repository browsers. */}
            {canSeeKaizenReviewChanges(selectedKaizenSheet) && selectedKaizenSheet.review_changes && Object.keys(selectedKaizenSheet.review_changes).length > 0 && (
              <div className="rounded-lg border border-blue-200 bg-blue-500/5 p-3 text-sm text-blue-900">
                <p className="font-semibold mb-1.5">Changed by the reviewer</p>
                <div className="space-y-1">
                  {Object.entries(selectedKaizenSheet.review_changes).map(([field, { from, to }]) => (
                    <p key={field} className="leading-relaxed">
                      <span className="font-medium capitalize">{{
                        title: 'Title', content: 'Description', category: 'Category', before_image: 'Before Photo',
                        after_image: 'After Photo', savings_estimate: 'One-Time Benefit', savings_unit: 'Benefit Unit',
                        improvement_notes: 'Improvements Made', implementation_date: 'Implementation Date',
                      }[field] || field}:</span>{' '}
                      {(field === 'before_image' || field === 'after_image') ? (
                        <span className="italic text-blue-700/70">photo replaced</span>
                      ) : field === 'category' ? (
                        <>
                          <span className="line-through text-blue-700/60">{AREA_LABEL[from] || from || '—'}</span>
                          {' → '}
                          <span className="font-medium">{AREA_LABEL[to] || to || '—'}</span>
                        </>
                      ) : (
                        <>
                          <span className="line-through text-blue-700/60">{from || '—'}</span>
                          {' → '}
                          <span className="font-medium">{to || '—'}</span>
                        </>
                      )}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Before / After Images — each column only renders once that photo actually
                exists; no "No Photo" placeholder for a stage that hasn't happened yet. */}
            {(selectedKaizenSheet.before_image || selectedKaizenSheet.after_image) && (
              <div className={`grid gap-4 ${(selectedKaizenSheet.before_image && selectedKaizenSheet.after_image) ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {selectedKaizenSheet.before_image && (
                  <div>
                    <span className="text-2xs font-bold uppercase tracking-wider text-ink-subtle block mb-1">Before Condition</span>
                    <button type="button" onClick={() => setLightboxImage(selectedKaizenSheet.before_image)} className="block w-full" title="Tap to view full size">
                      <img src={selectedKaizenSheet.before_image} alt="Before" className="w-full h-48 object-contain rounded-xl border border-line bg-surface-sunken cursor-zoom-in hover:opacity-90 transition-opacity" />
                    </button>
                  </div>
                )}
                {selectedKaizenSheet.after_image && (
                  <div>
                    <span className="text-2xs font-bold uppercase tracking-wider text-ink-subtle block mb-1">After Condition</span>
                    <button type="button" onClick={() => setLightboxImage(selectedKaizenSheet.after_image)} className="block w-full" title="Tap to view full size">
                      <img src={selectedKaizenSheet.after_image} alt="After" className="w-full h-48 object-contain rounded-xl border border-line bg-surface-sunken cursor-zoom-in hover:opacity-90 transition-opacity" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Implementation details the submitter reported (and the JH reviewer may have
                adjusted) — only present once the Kaizen has been through the implementation
                stage, so guard on any of the fields existing. */}
            {(selectedKaizenSheet.savings_estimate != null || selectedKaizenSheet.improvement_notes || selectedKaizenSheet.implementation_date || selectedKaizenSheet.implementation_cost != null || selectedKaizenSheet.team_member_emp_ids?.length > 0) && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-500/5 p-3 space-y-2">
                <span className="text-2xs font-bold uppercase tracking-wider text-emerald-900 block">Implementation</span>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  {selectedKaizenSheet.savings_estimate != null && (
                    <div>
                      <span className="text-2xs font-bold uppercase text-ink-subtle block">One-Time Benefit</span>
                      <span className="font-semibold text-ink-strong">
                        {selectedKaizenSheet.savings_estimate}{selectedKaizenSheet.savings_unit ? ` ${selectedKaizenSheet.savings_unit}` : ''}
                      </span>
                    </div>
                  )}
                  {selectedKaizenSheet.implementation_cost != null && (
                    <div>
                      <span className="text-2xs font-bold uppercase text-ink-subtle block">Implementation Cost</span>
                      <span className="font-semibold text-ink-strong">Rs {selectedKaizenSheet.implementation_cost}</span>
                    </div>
                  )}
                  {selectedKaizenSheet.implementation_date && (
                    <div>
                      <span className="text-2xs font-bold uppercase text-ink-subtle block">Implemented On</span>
                      <span className="font-semibold text-ink-strong">{String(selectedKaizenSheet.implementation_date).slice(0, 10)}</span>
                    </div>
                  )}
                </div>
                {selectedKaizenSheet.improvement_notes && (
                  <div>
                    <span className="text-2xs font-bold uppercase text-ink-subtle block">Improvements Made</span>
                    <p className="text-xs text-ink-strong leading-relaxed">{selectedKaizenSheet.improvement_notes}</p>
                  </div>
                )}
                {selectedKaizenSheet.team_member_emp_ids?.length > 0 && (
                  <div>
                    <span className="text-2xs font-bold uppercase text-ink-subtle block">Team Members Who Helped</span>
                    <p className="text-xs text-ink-strong leading-relaxed">{selectedKaizenSheet.team_member_emp_ids.map(resolveWorkerName).join(', ')}</p>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end pt-3 border-t border-line">
              <Button size="sm" onClick={() => setSelectedKaizenSheet(null)} className="text-xs">Close Sheet</Button>
            </div>
          </div>
        </div>
      )}

      {/* Full-size photo viewer — tap any before/after photo on a Kaizen card or sheet */}
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
    </div>
  );
}
