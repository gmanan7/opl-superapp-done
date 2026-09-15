import { useState, useRef, useMemo, useEffect } from 'react';
// Default closure target date from the reporting date: white tag = 3 days, red tag = 7 days.
const defaultTargetDate = (tagColor) => {
  const d = new Date();
  d.setDate(d.getDate() + (tagColor === 'red' ? 7 : 3));
  return d.toISOString().slice(0, 10);
};
// target_date comes back from the API as a plain 'YYYY-MM-DD' string — render it directly,
// never through `new Date(...)`, which would reinterpret it as UTC midnight and can shift
// the displayed calendar date by a day depending on the viewer's local timezone.
const formatAbnDate = (dateStr) => {
  if (!dateStr) return '—';
  const [y, m, d] = String(dateStr).slice(0, 10).split('-');
  return `${d}-${m}-${y}`;
};
const ABN_PAGE_SIZE_OPTIONS = [3, 5, 10];
const ABN_DEFAULT_PAGE_SIZE = 3;
import { useTranslation } from 'react-i18next';
import {
  Wrench, CheckCircle2, Droplets, Lock, AlertCircle, Trash2, ShieldAlert,
  ImagePlus, X, Loader2, Send, AlertTriangle, User, Calendar, Plus, ClipboardList,
  UserCheck, CheckCircle, XCircle, Archive, Search, Eye, BarChart3, History, Pencil, Users,
} from 'lucide-react';
import { AbnormalityAnalyticsTab } from './AbnormalityAnalyticsTab';
import { AbnormalityAuditTrailModal } from '../../components/abnormalities/AbnormalityAuditTrailModal';
import { useAbnormalityDetails, useCreateAbnormalityDetail, useReviewAbnormalityDetail, useAbnormalityResponsibilities, getSessionContext, useAbnormalityRepositorySetting, useUpdateAbnormalityRepositorySetting, useAbnormalityJhGroupAnalytics, } from '../../hooks/useAbnormalities';
import { AbnormalityMyTeamAnalyticsTab } from './AbnormalityMyTeamAnalyticsTab';
import { useOrgStructure, useDepartments } from '../../hooks/mdm';
import { loadSession, getName } from '../../lib/auth';
import { compressImageAndUpload } from '../../lib/imageUpload';
import { CaptureColumn, EmptyState, StatusBadge, ListPager } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

const ABN_TYPES = [
  { value: 'minor_flaw', label: 'Minor Flaw', Icon: Wrench },
  { value: 'unfulfilled_basic_condition', label: 'Unfulfilled Basic Condition', Icon: CheckCircle2 },
  { value: 'source_of_contamination', label: 'Source of Contamination', Icon: Droplets },
  { value: 'inaccessible_place', label: 'Inaccessible Place', Icon: Lock },
  { value: 'source_of_quality_defect', label: 'Source of Quality Defect', Icon: AlertCircle },
  { value: 'unnecessary_item', label: 'Unnecessary Item', Icon: Trash2 },
  { value: 'unsafe_place', label: 'Unsafe Place', Icon: ShieldAlert },
];
const TYPE_LABEL = Object.fromEntries(ABN_TYPES.map((t) => [t.value, t.label]));
const REVIEW_CHANGE_FIELD_LABEL = {
  type: 'Type',
  tag_color: 'Tag',
  description: 'Description',
  action: 'Action',
  target_date: 'Target Date',
  responsibility_id: 'Responsibility',
  assignee_emp_id: 'Assigned To',
};
const formatReviewChangeValue = (field, value) => {
  if (value === null || value === undefined || value === '') return '—';
  if (field === 'type') return TYPE_LABEL[value] || value;
  if (field === 'tag_color') return value === 'red' ? 'Red Tag' : 'White Tag';
  if (field === 'target_date') return formatAbnDate(value);
  return value;
};
const STATUS_KEY = {
  draft: 'neutral',
  pending_review: 'warning',
  marked_for_deletion: 'danger',
  assigned: 'info',
  pending_dmt_review: 'warning',
  closed: 'success',
};
const STATUS_LABEL = {
  draft: 'Draft',
  pending_review: 'Pending for Review',
  marked_for_deletion: 'Marked for Deletion',
  assigned: 'Assigned for Closure',
  pending_dmt_review: 'Pending DMT Review',
  closed: 'Closed',
};

function daysOpen(timestamp) {
  return Math.floor((Date.now() - new Date(timestamp).getTime()) / 86_400_000);
}

export function AbnormalityList() {
  const { t } = useTranslation();
  const session = loadSession();
  const ctx = getSessionContext();
  const { data = [], isLoading, error, refetch } = useAbnormalityDetails();
  const createDetail = useCreateAbnormalityDetail();
  const reviewDetail = useReviewAbnormalityDetail();

  // Main tabs: 'submit' ("Report Abnormality") or 'review' ("Abnormality Reviews") — mirrors Kaizen/OPL
  const [mainTab, setMainTab] = useState('submit');
  const [reviewScope, setReviewScope] = useState('assigned_to_me'); // 'to_review' | 'assigned_to_me' | 'my_submissions'

  // Detail modal — any viewer (JH lead, DMT lead, submitter) can open the full record
  const [detailItem, setDetailItem] = useState(null);
  const [auditTrailOpen, setAuditTrailOpen] = useState(false);
  // Full-size photo viewer, opened from inside the detail modal
  const [lightboxImage, setLightboxImage] = useState(null);

  // Inline action state
  const [inlineDeleteId, setInlineDeleteId] = useState(null);
  const [inlineDeleteReason, setInlineDeleteReason] = useState('');
  const [inlineClosureId, setInlineClosureId] = useState(null);
  const [inlineClosureNotes, setInlineClosureNotes] = useState('');
  const [inlineClosureImage, setInlineClosureImage] = useState(null);
  const [isCompressingClosure, setIsCompressingClosure] = useState(false);

  const userWorkerId = ctx?.worker_id || '';
  const userRole = (ctx?.role || '').toLowerCase();
  const isReviewerRole = userRole.includes('jh_lead') || userRole.includes('lead') || userRole === 'admin' || userRole === 'it_lead' || userRole === 'leadership';
  const isBeLeadRole = userRole === 'be_lead' || userRole === 'admin' || userRole === 'it_lead' || userRole === 'leadership';
  // "My Team" — a probe (no filters) just to decide if the tab shows; mirrors OPL's pattern.
  const abnMyTeamProbe = useAbnormalityJhGroupAnalytics({}, true);
  const canSeeAbnMyTeam = !abnMyTeamProbe.isError && (abnMyTeamProbe.data?.authorized_groups?.length > 0);
  const isAdminRole = userRole === 'admin';
  // JH-stage reviewer (mark for deletion / assign for closure) — strictly this item's configured approver(s).
  const canReviewItem = (item) => Boolean(userWorkerId) && (item?.approver_emp_ids || []).includes(userWorkerId);
  // The owner an item was assigned back to for closure work.
  const isAssignee = (item) => Boolean(userWorkerId) && item?.assignee_emp_id === userWorkerId;
  // Module/DMT lead who does the final closure review on red tags.
  const isDmtApprover = (item) => Boolean(userWorkerId) && (item?.dmt_approver_emp_ids || []).includes(userWorkerId);
  const isMySubmission = (item) => Boolean(userWorkerId) && item?.submitter_emp_id === userWorkerId;
  // Whether this item is in the user's REVIEW AUTHORITY queue — JH-stage or DMT-stage
  // approver on it — AT ALL, regardless of its CURRENT status (mirrors OPL's canReviewOpl).
  // This deliberately excludes plain assignee-ship: "To Review" and "Assigned to Me" are two
  // separate tabs below, not one combined bucket, so it's always clear which hat you're
  // wearing on a given item instead of everything reading as one blended list.
  // BE leads additionally get read-only VISIBILITY (not review authority — action buttons stay
  // separately status-gated, so this never grants them an action) into every marked-for-deletion
  // item factory-wide, with its rejection comment, regardless of which JH group marked it.
  const isReviewerAuthority = (item) => (
    canReviewItem(item) || isDmtApprover(item) || (isBeLeadRole && item.status === 'marked_for_deletion')
  );

  // Three clearly-separated scopes, each with its own always-visible count — no more "am I
  // looking at my submission or something assigned to me?" ambiguity.
  const toReviewItems = useMemo(() => data.filter(isReviewerAuthority), [data, userWorkerId]);
  const assignedToMeItems = useMemo(() => data.filter(isAssignee), [data, userWorkerId]);
  const mySubmissionItems = useMemo(() => data.filter(isMySubmission), [data, userWorkerId]);

  const reviewItems = reviewScope === 'to_review'
      // "To Review" = items needing the reviewer's decision. A closed abnormality is done —
      // it stays visible on "Assigned to Me" / "My Submissions", not here.
      ? toReviewItems.filter((item) => item.status !== 'closed')
    : reviewScope === 'assigned_to_me' ? assignedToMeItems
    : mySubmissionItems;

  // Status tabs within Reviews — mirrors Kaizen's reviewFilter row.
  const [reviewFilter, setReviewFilter] = useState('all');
  const REVIEW_STATUS_FILTERS = [
    { value: 'all', label: 'All', short: 'All' },
    { value: 'pending_review', label: 'Pending for Review', short: 'Pending' },
    { value: 'assigned', label: 'Assigned for Closure', short: 'Assigned' },
    { value: 'pending_dmt_review', label: 'Pending DMT Review', short: 'DMT Review' },
    // "Closed" and "Draft" are only meaningful outside the review queue (My Submissions).
    ...(reviewScope === 'to_review' ? [] : [{ value: 'closed', label: 'Closed', short: 'Closed' }]),
    { value: 'marked_for_deletion', label: 'Marked for Deletion', short: 'Deletion' },
    ...(reviewScope === 'my_submissions' ? [{ value: 'draft', label: 'Draft', short: 'Draft' }] : []),
  ];
  useEffect(() => {
    if (reviewScope === 'to_review' && (reviewFilter === 'closed' || reviewFilter === 'draft')) setReviewFilter('all');
    if (reviewScope === 'assigned_to_me' && reviewFilter === 'draft') setReviewFilter('all');
  }, [reviewScope, reviewFilter]);
  const reviewStatusCounts = useMemo(() => {
    const counts = { all: reviewItems.length };
    REVIEW_STATUS_FILTERS.forEach((f) => {
      if (f.value !== 'all') counts[f.value] = reviewItems.filter((item) => item.status === f.value).length;
    });
    return counts;
  }, [reviewItems]);

  const filteredReviewItems = reviewFilter === 'all' ? reviewItems : reviewItems.filter((item) => item.status === reviewFilter);
  const [reviewPage, setReviewPage] = useState(0);
  const [reviewPageSize, setReviewPageSize] = useState(ABN_DEFAULT_PAGE_SIZE);
  useEffect(() => { setReviewPage(0); }, [reviewFilter, reviewScope, reviewPageSize]);
  const reviewPageCount = Math.max(1, Math.ceil(filteredReviewItems.length / reviewPageSize));
  const pagedReviewItems = filteredReviewItems.slice(reviewPage * reviewPageSize, (reviewPage + 1) * reviewPageSize);

  const handleMarkForDeletion = async (id) => {
    if (!inlineDeleteReason.trim()) return toast.error('Please enter a reason');
    try {
      await reviewDetail.mutateAsync({ id, action: 'mark_for_deletion', rejection_reason: inlineDeleteReason.trim() });
      setInlineDeleteId(null);
      setInlineDeleteReason('');
      toast.success('Marked for deletion');
    } catch (err) {
      toast.error(err.message || 'Failed to mark for deletion');
    }
  };
  // Review & Assign modal — the reviewer can edit every reported field, then must pick a
  // responsibility + a specific assignee (in that department) before it can proceed, for
  // both red and white tags. The assignee then does the after-photo+notes closure step.
  const [reviewEditItem, setReviewEditItem] = useState(null);
  const [reviewEditMode, setReviewEditMode] = useState('assign'); // 'assign' (reviewer) | 'draft' (submitter fixing own draft)
  const [reType, setReType] = useState('');
  const [reTagColor, setReTagColor] = useState('white');
  const [reDescription, setReDescription] = useState('');
  const [reAction, setReAction] = useState('');
  const [reResponsibilityId, setReResponsibilityId] = useState('');
  const [reAssigneeEmpId, setReAssigneeEmpId] = useState('');
  const [reTargetDate, setReTargetDate] = useState('');
  const [reBeforeImage, setReBeforeImage] = useState(null);
  const [reIsCompressing, setReIsCompressing] = useState(false);

  const openReviewEdit = (item) => {
    setReviewEditMode('assign');
    setReviewEditItem(item);
    setReType(item.type || '');
    setReTagColor(item.tag_color || 'white');
    setReDescription(item.description || '');
    setReAction(item.action || '');
    setReResponsibilityId(item.responsibility_id ? String(item.responsibility_id) : '');
    setReAssigneeEmpId(item.assignee_emp_id || '');
    setReTargetDate(item.target_date ? String(item.target_date).slice(0, 10) : defaultTargetDate(item.tag_color || 'white'));
    setReBeforeImage(item.before_image || null);
  };
  const closeReviewEdit = () => setReviewEditItem(null);

  const openDraftEdit = (item) => {
    setReviewEditMode('draft');
    setReviewEditItem(item);
    setReType(item.type || '');
    setReTagColor(item.tag_color || 'white');
    setReDescription(item.description || '');
    setReAction(item.action || '');
    setReBeforeImage(item.before_image || null);
  };

  const handleSaveDraft = async (alsoSubmit) => {
    if (!reType) return toast.error('Please select an abnormality type');
    if (!reDescription.trim()) return toast.error('Please describe the abnormality');
    try {
      await reviewDetail.mutateAsync({
        id: reviewEditItem.abnormality_id,
        action: 'edit_draft',
        type: reType,
        tag_color: reTagColor,
        description: reDescription.trim(),
        action_text: reAction.trim() || null,
        before_image: reBeforeImage,
        submit: !!alsoSubmit,
      });
      toast.success(alsoSubmit ? 'Abnormality submitted for review' : 'Draft updated');
      closeReviewEdit();
    } catch (err) {
      toast.error(err.message || 'Failed to save draft');
    }
  };

  const reImageInputRef = useRef(null);
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

  const handleSubmitAssign = async () => {
    if (!reType) return toast.error('Please select an abnormality type');
    if (!reDescription.trim()) return toast.error('Please describe the abnormality');
    if (!reAction.trim()) return toast.error('Please specify the action for the abnormality');
    if (!reResponsibilityId) return toast.error('Please select a responsibility');
    if (!reAssigneeEmpId) return toast.error('Please select who this is assigned to');
    try {
      await reviewDetail.mutateAsync({
        id: reviewEditItem.abnormality_id,
        action: 'assign_for_closure',
        type: reType,
        tag_color: reTagColor,
        description: reDescription.trim(),
        action_text: reAction.trim() || null,
        responsibility_id: reResponsibilityId,
        assignee_emp_id: reAssigneeEmpId,
        target_date: reTargetDate || null,
        before_image: reBeforeImage,
      });
      toast.success('Assigned for closure');
      closeReviewEdit();
    } catch (err) {
      toast.error(err.message || 'Failed to assign for closure');
    }
  };
  const handleClosureImageChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsCompressingClosure(true);
      const url = await compressImageAndUpload(file);
      setInlineClosureImage(url);
      toast.success('After photo attached!');
    } catch {
      toast.error('Failed to compress photo');
    } finally {
      setIsCompressingClosure(false);
      e.target.value = '';
    }
  };
  const [inlineCompletionDate, setInlineCompletionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const resetClosureForm = () => {
    setInlineClosureId(null);
    setInlineClosureNotes('');
    setInlineClosureImage(null);
    setInlineCompletionDate(new Date().toISOString().slice(0, 10));
  };
  const handleSubmitClosure = async (id) => {
    if (!inlineClosureImage) return toast.error('Please attach an after photo');
    if (!inlineClosureNotes.trim()) return toast.error('Please enter closure notes');
    if (!inlineCompletionDate) return toast.error('Please enter the date of completion');
    try {
      await reviewDetail.mutateAsync({ id, action: 'submit_closure', closure_notes: inlineClosureNotes.trim(), after_image: inlineClosureImage, completion_date: inlineCompletionDate });
      resetClosureForm();
      toast.success('Submitted to DMT lead for closure review');
    } catch (err) {
      toast.error(err.message || 'Failed to submit closure');
    }
  };
  const handleDmtClose = async (id) => {
    try {
      await reviewDetail.mutateAsync({ id, action: 'dmt_close' });
      toast.success('Closed! 🎉');
    } catch (err) {
      toast.error(err.message || 'Failed to close');
    }
  };

  // ─── Repository tab: browsable archive of resolved (closed) abnormalities ─────
  const { data: orgData } = useOrgStructure();
  const { data: responsibilities = [] } = useAbnormalityResponsibilities();

  // The reviewer's edit diff ("Changed by the reviewer") is only for the item's chain —
  // submitter, its routing incharges / JH & DMT approvers, the assignee doing the closure,
  // the JH-group leader, and the owning module lead. NOT everyone browsing the repository.
  const canSeeAbnReviewChanges = (item) => {
    if (!item) return false;
    if (isBeLeadRole) return true;                 // BE-lead tier: factory-wide oversight
    if (isMySubmission(item) || isAssignee(item) || canReviewItem(item) || isDmtApprover(item)) return true;
    if (!userWorkerId) return false;
    const jh = (orgData?.jhGroups || []).find((g) => String(g.id) === String(item.jh_group_id));
    if (jh && String(jh.leader_emp_id) === String(userWorkerId)) return true;
    const grp = (orgData?.groups || []).find((g) => String(g.id) === String(jh?.module_group_id));
    if (grp && String(grp.module_lead_emp_id) === String(userWorkerId)) return true;
    return false;
  };

  // Some people don't file an abnormality under their own JH group — they pick one via a
  // cascading DMT -> JH Group dropdown, and that pick is mandatory (server-enforced). Applies
  // to anyone in no JH group, anyone in the Engineering department, and the BE-admin tier.
  // No matter who files it, submission counts always land on the submitter's own group.
  const { data: departments = [] } = useDepartments();
  const engineeringDeptId = departments.find((d) => d.name === 'Engineering')?.id;
  const myDepartmentId = (orgData?.workers || []).find((w) => String(w.id) === String(userWorkerId))?.department_id;
  const isEngineeringSubmitter = Boolean(engineeringDeptId) && myDepartmentId === engineeringDeptId;
  const abnJhList = orgData?.jhGroupsList || [];
  // Leading a JH group counts as belonging to one (mirrors backend resolveSubmitterJhGroup).
  const abnLeadsAnyJhGroup = (orgData?.jhGroups || []).some((g) => String(g.leader_emp_id) === String(userWorkerId));
  const hasNoJhGroup = abnJhList.length > 0 && !abnJhList.some((m) => String(m.emp_id) === String(userWorkerId)) && !abnLeadsAnyJhGroup;
  const canFileForOtherGroup = isEngineeringSubmitter || hasNoJhGroup || isBeLeadRole;
  const [filingDmtId, setFilingDmtId] = useState('');
  const [filingJhGroupId, setFilingJhGroupId] = useState('');
  const filingJhGroupOptions = (orgData?.dmts || []).find((g) => g.id === filingDmtId)?.jhGroups || [];
  // Per-plant Repository scope — mirrors OPL/Kaizen. A plant always sees its own closed
  // abnormalities; a BE lead can opt in to other plants' via Org Structure or the chips below.
  const { data: abnRepoSetting } = useAbnormalityRepositorySetting();
  const updateAbnRepo = useUpdateAbnormalityRepositorySetting();
  const abnRepoMyPlantId = abnRepoSetting?.factory_id ?? null;
  const abnRepoExtraPlantIds = useMemo(() => (abnRepoSetting?.extra_factory_ids ?? []).map(String), [abnRepoSetting]);
  const abnRepoAllPlants = abnRepoSetting?.all_plants ?? [];
  const abnRepoOtherPlants = abnRepoAllPlants.filter((p) => String(p.id) !== String(abnRepoMyPlantId));
  const abnVisiblePlantIds = useMemo(
    () => new Set([abnRepoMyPlantId, ...abnRepoExtraPlantIds].filter((v) => v != null).map(String)),
    [abnRepoMyPlantId, abnRepoExtraPlantIds]
  );
  const toggleAbnExtraPlant = (plantId) => {
    const idStr = String(plantId);
    const next = abnRepoExtraPlantIds.includes(idStr)
      ? abnRepoExtraPlantIds.filter((x) => x !== idStr)
      : [...abnRepoExtraPlantIds, idStr];
    updateAbnRepo.mutate(next, {
      onSuccess: () => toast.success('Repository plant list updated'),
      onError: () => toast.error('Failed to update plant list'),
    });
  };

  const [repoTab, setRepoTab] = useState('all'); // 'all' | 'my_jh_group' — no "my_remaining" (nothing to remain here)
  const [selectedPlant, setSelectedPlant] = useState('all');
  const [selectedDmt, setSelectedDmt] = useState('all');
  const [selectedJhGroup, setSelectedJhGroup] = useState('all');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedTag, setSelectedTag] = useState('all'); // 'all' | 'red' | 'white'
  const [selectedResponsibility, setSelectedResponsibility] = useState('all');
  const [repoSearchQuery, setRepoSearchQuery] = useState('');

  const dmtJhMap = useMemo(() => {
    const map = {};
    if (orgData?.groups && orgData?.jhGroups) {
      orgData.groups.forEach((g) => {
        const dmtName = g.module || g.code || g.name || `DMT ${g.id}`;
        if (!map[dmtName]) map[dmtName] = [];
        const children = (orgData.jhGroups || []).filter((jh) => jh.module_group_id === g.id || jh.dmt_id === g.id);
        children.forEach((jh) => {
          if (jh.name && !map[dmtName].includes(jh.name)) map[dmtName].push(jh.name);
        });
      });
    }
    return map;
  }, [orgData]);

  const dmtOptions = useMemo(() => {
    const keys = Object.keys(dmtJhMap);
    return [{ value: 'all', label: 'All DMTs' }, ...keys.map((k) => ({ value: k, label: k }))];
  }, [dmtJhMap]);

  const availableJhGroups = useMemo(() => {
    if (selectedDmt === 'all') {
      const allGroups = new Set();
      Object.values(dmtJhMap).forEach((arr) => arr.forEach((g) => allGroups.add(g)));
      return [{ value: 'all', label: 'All Groups' }, ...Array.from(allGroups).map((g) => ({ value: g, label: g }))];
    }
    const list = dmtJhMap[selectedDmt] || [];
    return [{ value: 'all', label: 'All Groups' }, ...list.map((g) => ({ value: g, label: g }))];
  }, [selectedDmt, dmtJhMap]);

  const handleDmtChange = (newDmt) => {
    setSelectedDmt(newDmt);
    setSelectedJhGroup('all');
  };

  const plantOptions = useMemo(() => (
    [{ value: 'all', label: 'All' }, ...(orgData?.factories || []).map((f) => ({ value: f.id, label: f.code || f.name }))]
  ), [orgData]);

  const resolvedUserJhGroupName = (orgData?.jhGroups || []).find((g) => g.id === ctx?.jh_group_id)?.name;
  const userJhGroupName = resolvedUserJhGroupName || ctx?.jh_group_name || '';

  const repositoryItems = useMemo(() => data.filter((item) => item.status === 'closed'), [data]);

  const filteredRepositoryItems = repositoryItems.filter((item) => {
    if (repoTab === 'my_jh_group') {
      if (userJhGroupName && item.jh_group_name !== userJhGroupName) return false;
    } else {
      // "All" tab — own plant plus any plants a BE lead has opted into.
      if (item.factory_id != null && abnVisiblePlantIds.size > 0 && !abnVisiblePlantIds.has(String(item.factory_id))) return false;
    }
    if (selectedPlant !== 'all' && item.factory_id !== selectedPlant) return false;
    if (selectedDmt !== 'all') {
      const allowedGroups = dmtJhMap[selectedDmt] || [];
      if (!allowedGroups.includes(item.jh_group_name)) return false;
    }
    if (selectedJhGroup !== 'all' && item.jh_group_name !== selectedJhGroup) return false;
    if (selectedType !== 'all' && item.type !== selectedType) return false;
    if (selectedTag !== 'all' && item.tag_color !== selectedTag) return false;
    if (selectedResponsibility !== 'all' && String(item.responsibility_id || '') !== selectedResponsibility) return false;
    if (repoSearchQuery.trim()) {
      const q = repoSearchQuery.trim().toLowerCase();
      const matches = (item.description || '').toLowerCase().includes(q)
        || (item.submitted_by || '').toLowerCase().includes(q)
        || (item.jh_group_name || '').toLowerCase().includes(q);
      if (!matches) return false;
    }
    return true;
  });

  const [repoPage, setRepoPage] = useState(0);
  const [repoPageSize, setRepoPageSize] = useState(ABN_DEFAULT_PAGE_SIZE);
  useEffect(() => { setRepoPage(0); }, [
    repoTab, selectedPlant, selectedDmt, selectedJhGroup, selectedType, selectedTag, selectedResponsibility, repoSearchQuery, repoPageSize,
  ]);
  const repoPageCount = Math.max(1, Math.ceil(filteredRepositoryItems.length / repoPageSize));
  const pagedRepositoryItems = filteredRepositoryItems.slice(repoPage * repoPageSize, (repoPage + 1) * repoPageSize);

  // Submit form state
  const [abnType, setAbnType] = useState('');
  const [tagColor, setTagColor] = useState('white');
  const [description, setDescription] = useState('');
  const [abnAction, setAbnAction] = useState('');
  const [responsibilityId, setResponsibilityId] = useState('');
  const [assigneeEmpId, setAssigneeEmpId] = useState('');
  const [targetDate, setTargetDate] = useState(defaultTargetDate('white'));
  const targetDateTouchedRef = useRef(false);
  const [beforeImage, setBeforeImage] = useState(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const fileInputRef = useRef(null);

  const handleImageChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsCompressing(true);
      const url = await compressImageAndUpload(file);
      setBeforeImage(url);
      toast.success('Photo attached!');
    } catch {
      toast.error('Failed to compress photo');
    } finally {
      setIsCompressing(false);
      e.target.value = '';
    }
  };

  const handleSubmit = async (e, isDraft = false) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!abnType) return toast.error('Please select an abnormality type');
    if (!description.trim()) return toast.error('Please describe the abnormality');
    if (!isDraft && !beforeImage) return toast.error('Please attach a before photo');
    if (!isDraft && canFileForOtherGroup && !filingJhGroupId) return toast.error('Select a DMT and JH group to file this abnormality under');

    try {
      const workerId = ctx?.worker_id;
      const displayName = getName(session) || 'Worker';
      const submittedBy = workerId ? `${displayName} (ID: ${workerId})` : displayName;
      await createDetail.mutateAsync({
        type: abnType,
        tag_color: tagColor,
        description: description.trim(),
        action: abnAction.trim() || null,
        responsibility_id: responsibilityId || null,
        assignee_emp_id: assigneeEmpId || null,
        target_date: targetDate || null,
        before_image: beforeImage,
        submitted_by: submittedBy,
        status: isDraft ? 'draft' : 'pending_review',
        jh_group_id: canFileForOtherGroup && filingJhGroupId ? filingJhGroupId : undefined,
      });
      setAbnType('');
      setTagColor('white');
      setDescription('');
      setAbnAction('');
      setResponsibilityId('');
      setAssigneeEmpId('');
      targetDateTouchedRef.current = false;
      setTargetDate(defaultTargetDate('white'));
      setBeforeImage(null);
      setFilingDmtId('');
      setFilingJhGroupId('');
      toast.success(isDraft ? 'Saved as draft' : 'Abnormality submitted for JH lead review! 🎉');
    } catch (err) {
      toast.error(err.message || 'Failed to report abnormality');
    }
  };

  return (
    <div className="min-h-full bg-surface-base pb-10">
      <header className="sticky top-0 z-30 border-b border-line bg-surface-raised">
        <CaptureColumn className="space-y-3 py-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-ink-strong">{t('abn.title')}</h1>
            <p className="text-xs text-ink-muted">Report and track shop-floor abnormalities</p>
          </div>

          {/* Main Tabs */}
          <div className={`grid ${({ 3: 'grid-cols-3', 4: 'grid-cols-4', 5: 'grid-cols-5' }[3 + (canSeeAbnMyTeam ? 1 : 0) + (isBeLeadRole ? 1 : 0)] || 'grid-cols-3')} rounded-lg bg-surface-sunken p-1 gap-1`}>
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
                <span className="leading-tight break-words">Report</span>
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
                <ClipboardList size={16} className="shrink-0 text-blue-700" />
                <span className="leading-tight break-words">Reviews</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setMainTab('repository')}
              className={`rounded-md px-1.5 sm:px-3 py-2 text-xs sm:text-sm font-medium transition-colors ${
                mainTab === 'repository'
                  ? 'bg-surface-raised text-ink-strong shadow-xs font-semibold'
                  : 'text-ink-muted hover:text-ink-strong'
              }`}
            >
              <div className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 text-center">
                <Archive size={16} className="shrink-0 text-blue-700" />
                <span className="leading-tight break-words">Repository</span>
              </div>
            </button>

            {canSeeAbnMyTeam && (
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

      <CaptureColumn variant="wide">
        {mainTab === 'submit' && (
        <div className="space-y-8 py-4">
          {/* Submit form */}
          <form onSubmit={(e) => handleSubmit(e, false)} className="rounded-xl border border-line bg-surface-raised p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-line pb-3">
              <AlertTriangle className="text-blue-700" size={20} />
              <div>
                <h2 className="text-lg font-semibold text-ink-strong">Report Abnormality</h2>
                <p className="text-2xs text-ink-muted">Select a type, describe what you observed, attach a photo</p>
              </div>
            </div>

            {/* Type selector */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-ink-muted mb-1.5">
                Abnormality Type <span className="text-danger-fg">*</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {ABN_TYPES.map(({ value, label, Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setAbnType(value)}
                    className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-xs font-semibold transition-all text-left flex-1 min-w-0 basis-[calc(33.333%-0.5rem)] sm:basis-[calc(25%-0.5rem)] ${
                      abnType === value
                        ? 'bg-blue-700 text-white border-blue-700 shadow-xs'
                        : 'bg-surface-base text-ink-muted border-line hover:border-blue-700/50'
                    }`}
                  >
                    <Icon size={15} className="shrink-0" />
                    <span className="leading-tight break-words">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* File this abnormality under a specific team — required for people who submit
                outside their own JH group (no group / Engineering / BE admin). Drives review
                routing; doesn't change whose submission it counts as. */}
            {canFileForOtherGroup && (
              <div className="rounded-lg border border-blue-200 bg-blue-500/5 p-3 space-y-2">
                <p className="text-2xs font-semibold text-blue-800">Which team is this abnormality for? <span className="text-danger-fg">*</span></p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-ink-muted mb-1">
                    DMT
                  </label>
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
                  <label className="block text-xs font-semibold uppercase tracking-wider text-ink-muted mb-1">
                    JH Group
                  </label>
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

            {/* Red / White tag */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-ink-muted mb-1.5">
                Tag Type <span className="text-danger-fg">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2 max-w-xs">
                <button
                  type="button"
                  onClick={() => {
                    setTagColor('red');
                    if (!targetDateTouchedRef.current) setTargetDate(defaultTargetDate('red'));
                  }}
                  className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-xs font-bold transition-all ${
                    tagColor === 'red'
                      ? 'bg-red-600 text-white border-red-600 shadow-xs'
                      : 'bg-surface-base text-ink-muted border-line hover:border-red-300'
                  }`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full ${tagColor === 'red' ? 'bg-white' : 'bg-red-600'}`} />
                  Red Tag
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTagColor('white');
                    if (!targetDateTouchedRef.current) setTargetDate(defaultTargetDate('white'));
                  }}
                  className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-xs font-bold transition-all ${
                    tagColor === 'white'
                      ? 'bg-gray-800 text-white border-gray-800 shadow-xs'
                      : 'bg-surface-base text-ink-muted border-line hover:border-gray-400'
                  }`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full border ${tagColor === 'white' ? 'bg-white' : 'bg-white border-gray-400'}`} />
                  White Tag
                </button>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-ink-muted mb-1">
                What is the abnormality? <span className="text-danger-fg">*</span>
              </label>
              <textarea
                required
                rows={3}
                placeholder="Describe what you observed..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-lg border border-line bg-surface-base px-3 py-2 text-sm text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-700"
              />
            </div>

            {/* Action */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-ink-muted mb-1">
                Action for the abnormality
              </label>
              <textarea
                rows={2}
                placeholder="Action to be taken..."
                value={abnAction}
                onChange={(e) => setAbnAction(e.target.value)}
                className="w-full rounded-lg border border-line bg-surface-base px-3 py-2 text-sm text-ink-strong placeholder-ink-subtle focus:outline-none focus:ring-2 focus:ring-blue-700"
              />
            </div>

            {/* Responsibility */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-ink-muted mb-1">
                Responsibility
              </label>
              <select
                value={responsibilityId}
                onChange={(e) => {
                  setResponsibilityId(e.target.value);
                  if (!e.target.value) setAssigneeEmpId('');
                }}
                className="w-full h-10 rounded-lg border border-line bg-surface-base px-3 text-sm text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-700"
              >
                <option value="">Select responsibility...</option>
                {responsibilities.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>

            {/* Assign to person — auto-filtered to the selected responsibility's department,
                not limited to this JH group */}
            {responsibilityId && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink-muted mb-1">
                  Assign To
                </label>
                <select
                  value={assigneeEmpId}
                  onChange={(e) => setAssigneeEmpId(e.target.value)}
                  className="w-full h-10 rounded-lg border border-line bg-surface-base px-3 text-sm text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-700"
                >
                  <option value="">Select person...</option>
                  {(orgData?.workers || [])
                    .filter((w) => w.is_active !== false)
                    .filter((w) => {
                      const respDeptId = responsibilities.find((r) => String(r.id) === String(responsibilityId))?.department_id;
                      return !respDeptId || w.department_id === respDeptId || String(w.id) === String(userWorkerId);
                    })
                    .slice()
                    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                    .map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                </select>
              </div>
            )}

            {/* Target Date */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-ink-muted mb-1">
                Target Date
              </label>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => {
                  targetDateTouchedRef.current = true;
                  setTargetDate(e.target.value);
                }}
                className="w-full h-10 rounded-lg border border-line bg-surface-base px-3 text-sm text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-700"
              />
            </div>

            {/* Photo */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-ink-muted mb-1">
                Before Photo <span className="text-danger-fg">*</span>
              </label>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
              {beforeImage ? (
                <div className="relative rounded-lg border border-line overflow-hidden bg-surface-sunken h-28 w-28">
                  <img src={beforeImage} alt="" className="w-full h-full object-contain" />
                  <button
                    type="button"
                    onClick={() => setBeforeImage(null)}
                    className="absolute top-1 right-1 bg-surface-raised/90 p-1 rounded-full text-ink-strong hover:bg-surface-raised shadow-xs"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isCompressing}
                  className="w-28 h-28 rounded-lg border-2 border-dashed border-line bg-surface-base flex flex-col items-center justify-center text-ink-muted hover:border-blue-700 hover:bg-surface-hover transition-colors"
                >
                  {isCompressing ? (
                    <Loader2 size={18} className="animate-spin text-blue-700" />
                  ) : (
                    <>
                      <ImagePlus size={20} className="mb-1 text-ink-subtle" />
                      <span className="text-2xs font-medium text-ink-strong">Add photo</span>
                    </>
                  )}
                </button>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-line">
              <Button
                type="button"
                variant="outline"
                disabled={createDetail.isPending}
                onClick={(e) => handleSubmit(e, true)}
                className="text-xs gap-1"
              >
                Save Draft
              </Button>
              <Button type="submit" disabled={createDetail.isPending || !beforeImage} className="text-xs gap-1.5 bg-blue-700 text-white">
                {createDetail.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Submit for Review
              </Button>
            </div>
          </form>
        </div>
        )}

        {mainTab === 'review' && (
        <div className="space-y-4 py-4">
          {/* Three clearly-separated scopes, each always showing its own count — never one
              blended list, so it's always obvious whether you're looking at something
              awaiting YOUR review, assigned to YOU for closure, or something YOU reported. */}
          <div className="flex items-center gap-1 rounded-lg border border-line bg-surface-sunken p-1 text-xs w-fit flex-wrap">
            {[
              ...(isReviewerRole ? [{ key: 'to_review', label: 'To Review', count: toReviewItems.length }] : []),
              { key: 'assigned_to_me', label: 'Assigned to Me', count: assignedToMeItems.length },
              { key: 'my_submissions', label: 'My Submissions', count: mySubmissionItems.length },
            ].map((sc) => (
              <button
                key={sc.key}
                type="button"
                onClick={() => setReviewScope(sc.key)}
                className={`px-3 py-1.5 rounded-md transition-all text-xs font-medium text-center flex items-center gap-1.5 ${
                  reviewScope === sc.key
                    ? 'bg-surface-raised text-blue-700 font-semibold shadow-xs'
                    : 'text-ink-muted hover:text-ink-strong'
                }`}
              >
                {sc.label}
                <span className={`inline-flex items-center justify-center min-w-[1.15rem] h-4.5 px-1 rounded-full text-2xs ${
                  reviewScope === sc.key ? 'bg-blue-100 text-blue-700' : 'bg-surface-raised text-ink-muted'
                }`}>
                  {sc.count}
                </span>
              </button>
            ))}
          </div>

          {/* Status tabs — 2-row grid on a phone (short labels), single row from sm up. */}
          <div className={`grid ${REVIEW_STATUS_FILTERS.length <= 4 ? 'grid-cols-4' : 'grid-cols-3'} sm:flex sm:flex-wrap sm:justify-center gap-0.5 bg-surface-sunken p-1 rounded-lg border border-line`}>
            {REVIEW_STATUS_FILTERS.map((f) => {
              const active = reviewFilter === f.value;
              return (
              <button
                key={f.value}
                type="button"
                onClick={() => setReviewFilter(f.value)}
                className={`inline-flex items-center justify-center gap-1 px-1.5 py-1 rounded-md text-2xs font-semibold transition-all ${
                  active
                    ? 'bg-surface-raised text-blue-700 shadow-xs'
                    : 'text-ink-muted hover:text-ink-strong'
                }`}
              >
                <span className="sm:hidden truncate">{f.short}</span>
                <span className="hidden sm:inline whitespace-nowrap">{f.label}</span>
                <span className={`inline-flex items-center justify-center min-w-[1.1rem] h-4 px-0.5 rounded-full text-2xs shrink-0 ${
                  active ? 'bg-blue-100 text-blue-700' : 'bg-surface-raised text-ink-muted'
                }`}>
                  {reviewStatusCounts[f.value] ?? 0}
                </span>
              </button>
              );
            })}
          </div>

          <div className="space-y-3">
            {isLoading && (
              <div className="flex justify-center py-12 text-ink-subtle">
                <Loader2 size={24} className="animate-spin" />
              </div>
            )}

            {error && (
              <div className="bg-danger-fg/5 border border-danger-fg/20 rounded-xl p-4 text-sm text-danger-fg">
                {t('common.error')}: {error.message}
              </div>
            )}

            {!isLoading && !error && filteredReviewItems.length === 0 && (
              <EmptyState glyph="⚠" title={t('abn.empty')} body="Reported abnormalities will appear here." />
            )}

            {!isLoading && !error && filteredReviewItems.length > 0 && (
              <div className="space-y-3">
                {pagedReviewItems.map((item) => {
                  const days = daysOpen(item.timestamp);
                  return (
                    <div key={item.abnormality_id} className="rounded-xl border border-line bg-surface-raised p-4 shadow-xs flex gap-3">
                      {item.before_image && (
                        <img src={item.before_image} alt="" className="w-16 h-16 rounded-lg object-contain bg-surface-sunken border border-line shrink-0" />
                      )}
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wide ${
                              item.tag_color === 'red' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 border border-gray-300'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${item.tag_color === 'red' ? 'bg-white' : 'bg-white border border-gray-400'}`} />
                              {item.tag_color === 'red' ? 'Red Tag' : 'White Tag'}
                            </span>
                            {item.type && (
                              <p className="text-xs font-semibold text-blue-700">{TYPE_LABEL[item.type] || item.type}</p>
                            )}
                            {item.status && (
                              <StatusBadge status={STATUS_KEY[item.status]} label={STATUS_LABEL[item.status] || item.status} size="sm" />
                            )}
                          </div>
                          <button type="button" onClick={() => setDetailItem(item)} className="shrink-0 p-1.5 rounded-lg text-ink-muted hover:bg-surface-hover hover:text-blue-700" title="View details">
                            <Eye size={16} />
                          </button>
                        </div>
                        {item.description && (
                          <p className="text-sm text-ink-strong leading-snug">{item.description}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-ink-muted pt-1">
                          <span className="flex items-center gap-1"><User size={11} />Submitted by {item.submitted_by || '—'}</span>
                          {item.assignee_emp_id && (
                            <span className="flex items-center gap-1 font-medium text-blue-700">
                              <UserCheck size={11} />
                              Assigned to {(orgData?.workers || []).find((w) => String(w.id) === String(item.assignee_emp_id))?.name || item.assignee_emp_id}
                              {isAssignee(item) && ' (You)'}
                            </span>
                          )}
                          <span className="flex items-center gap-1"><Calendar size={11} />{days === 0 ? 'Today' : `${days}d ago`}</span>
                          {item.jh_group_name && <span>JH Group: <strong className="text-ink-strong font-medium">{item.jh_group_name}</strong></span>}
                        </div>

                        {item.status === 'marked_for_deletion' && item.rejection_reason && (
                          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-500/5 p-2 text-2xs text-red-900 mt-1">
                            <AlertTriangle size={12} className="mt-0.5 shrink-0 text-red-600" />
                            <span><span className="font-semibold">Reason:</span> {item.rejection_reason}</span>
                          </div>
                        )}
                        {item.status === 'closed' && item.closure_notes && (
                          <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-500/5 p-2 text-2xs text-green-900 mt-1">
                            <CheckCircle size={12} className="mt-0.5 shrink-0 text-green-600" />
                            <span><span className="font-semibold">Closure notes:</span> {item.closure_notes}</span>
                          </div>
                        )}

                        {/* Draft actions: the submitter edits / submits their own draft */}
                        {item.status === 'draft' && isMySubmission(item) && (
                          <div className="flex flex-wrap items-center gap-2 pt-2">
                            <Button size="sm" variant="outline" onClick={() => openDraftEdit(item)} className="text-xs">
                              <Pencil size={14} className="mr-1" /> Edit
                            </Button>
                            <Button size="sm" onClick={() => openDraftEdit(item)} className="text-xs bg-blue-600 text-white hover:bg-blue-700">
                              <Send size={14} className="mr-1" /> Submit for Review
                            </Button>
                          </div>
                        )}

                        {/* JH-stage actions: mark for deletion / assign for closure */}
                        {item.status === 'pending_review' && canReviewItem(item) && (
                          inlineDeleteId === item.abnormality_id ? (
                            <div className="flex items-center gap-2 pt-2 w-full">
                              <input
                                type="text"
                                placeholder="Enter reason for deletion..."
                                value={inlineDeleteReason}
                                onChange={(e) => setInlineDeleteReason(e.target.value)}
                                className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-red-300 bg-surface-base focus:outline-none focus:ring-1 focus:ring-red-500"
                              />
                              <Button size="sm" variant="outline" onClick={() => setInlineDeleteId(null)} className="text-xs h-8">Cancel</Button>
                              <Button size="sm" onClick={() => handleMarkForDeletion(item.abnormality_id)} className="text-xs h-8 bg-red-600 text-white hover:bg-red-700">Confirm</Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 pt-2">
                              <Button size="sm" variant="outline" onClick={() => setInlineDeleteId(item.abnormality_id)} className="text-xs text-red-600 border-red-200 hover:bg-red-50">
                                <XCircle size={14} className="mr-1" /> Mark for Deletion
                              </Button>
                              <Button size="sm" onClick={() => openReviewEdit(item)} className="text-xs bg-blue-600 text-white hover:bg-blue-700">
                                <UserCheck size={14} className="mr-1" /> Review &amp; Assign
                              </Button>
                            </div>
                          )
                        )}

                        {/* Assignee actions: self-close (white) / submit for DMT review (red) */}
                        {item.status === 'assigned' && isAssignee(item) && (
                          inlineClosureId === item.abnormality_id ? (
                            <div className="flex flex-col gap-2 pt-2 w-full">
                              <div>
                                <label className="block text-2xs font-semibold uppercase tracking-wider text-ink-muted mb-1">
                                  After Photo <span className="text-danger-fg">*</span>
                                </label>
                                <input id={`closure-file-${item.abnormality_id}`} type="file" accept="image/*" className="hidden" onChange={handleClosureImageChange} />
                                {inlineClosureImage ? (
                                  <div className="relative rounded-lg border border-line overflow-hidden bg-surface-sunken h-20 w-20">
                                    <img src={inlineClosureImage} alt="" className="w-full h-full object-contain" />
                                    <button type="button" onClick={() => setInlineClosureImage(null)} className="absolute top-0.5 right-0.5 bg-surface-raised/90 p-0.5 rounded-full text-ink-strong hover:bg-surface-raised shadow-xs">
                                      <X size={10} />
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => document.getElementById(`closure-file-${item.abnormality_id}`)?.click()}
                                    disabled={isCompressingClosure}
                                    className="w-20 h-20 rounded-lg border-2 border-dashed border-line bg-surface-base flex flex-col items-center justify-center text-ink-muted hover:border-blue-700 hover:bg-surface-hover transition-colors"
                                  >
                                    {isCompressingClosure ? <Loader2 size={16} className="animate-spin text-blue-700" /> : <ImagePlus size={18} className="text-ink-subtle" />}
                                  </button>
                                )}
                              </div>
                              <textarea
                                rows={2}
                                placeholder="Closure notes (what was done)..."
                                value={inlineClosureNotes}
                                onChange={(e) => setInlineClosureNotes(e.target.value)}
                                className="w-full px-3 py-1.5 text-xs rounded-lg border border-line bg-surface-base focus:outline-none focus:ring-1 focus:ring-blue-700"
                              />
                              <div>
                                <label className="block text-2xs font-semibold uppercase tracking-wider text-ink-muted mb-1">
                                  Date of Completion <span className="text-danger-fg">*</span>
                                </label>
                                <input
                                  type="date"
                                  value={inlineCompletionDate}
                                  onChange={(e) => setInlineCompletionDate(e.target.value)}
                                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-line bg-surface-base focus:outline-none focus:ring-1 focus:ring-blue-700"
                                />
                              </div>
                              <div className="flex justify-end gap-2">
                                <Button size="sm" variant="outline" onClick={resetClosureForm} className="text-xs h-8">Cancel</Button>
                                <Button size="sm" disabled={!inlineClosureImage || !inlineClosureNotes.trim() || !inlineCompletionDate || reviewDetail.isPending} onClick={() => handleSubmitClosure(item.abnormality_id)} className="text-xs h-8 bg-blue-600 text-white hover:bg-blue-700">Submit to DMT Lead</Button>
                              </div>
                            </div>
                          ) : (
                            <div className="pt-2">
                              <Button size="sm" onClick={() => setInlineClosureId(item.abnormality_id)} className="text-xs bg-green-600 text-white hover:bg-green-700">
                                <CheckCircle size={14} className="mr-1" />
                                Submit for Closure
                              </Button>
                            </div>
                          )
                        )}

                        {/* DMT-stage final closure on red tags */}
                        {item.status === 'pending_dmt_review' && isDmtApprover(item) && (
                          <div className="pt-2">
                            <Button size="sm" onClick={() => handleDmtClose(item.abnormality_id)} className="text-xs bg-green-600 text-white hover:bg-green-700">
                              <CheckCircle size={14} className="mr-1" /> Approve &amp; Close
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {!isLoading && !error && (
              <ListPager
                total={filteredReviewItems.length}
                noun={filteredReviewItems.length === 1 ? 'abnormality' : 'abnormalities'}
                page={reviewPage}
                pageCount={reviewPageCount}
                pageSize={reviewPageSize}
                pageSizeOptions={ABN_PAGE_SIZE_OPTIONS}
                onPage={setReviewPage}
                onPageSize={setReviewPageSize}
              />
            )}
          </div>
        </div>
        )}

        {mainTab === 'repository' && (
        <div className="space-y-4 py-4">
          <div className="flex flex-col gap-3 bg-surface-raised p-4 rounded-xl border border-line shadow-xs">
            <div className="text-center sm:text-left">
              <h3 className="text-base font-semibold text-ink-strong flex items-center justify-center sm:justify-start gap-2">
                <Archive size={18} className="text-blue-700" /> Abnormalities Repository
              </h3>
              <p className="text-xs text-ink-muted">Browse resolved abnormalities across the plant for reference</p>
            </div>

            <div className="flex items-center justify-center gap-1 bg-surface-sunken p-1 rounded-lg border border-line flex-wrap mx-auto">
              {[
                { key: 'all', label: 'All Abnormalities' },
                { key: 'my_jh_group', label: 'My JH Group' },
              ].map((tb) => (
                <button
                  key={tb.key}
                  type="button"
                  onClick={() => setRepoTab(tb.key)}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                    repoTab === tb.key
                      ? 'bg-surface-raised text-blue-700 shadow-xs'
                      : 'text-ink-muted hover:text-ink-strong'
                  }`}
                >
                  {tb.label}
                </button>
              ))}
            </div>
          </div>

          {/* Plant toggle — only when a BE admin has opened this repository to more than the
              home plant (governed on Org Structure → Repository Plant Scope). */}
          {repoTab === 'all' && abnVisiblePlantIds.size > 1 && (
            <div className="flex items-center gap-1 bg-surface-sunken p-1 rounded-lg border border-line flex-wrap w-fit">
              {plantOptions.filter((p) => p.value === 'all' || abnVisiblePlantIds.has(String(p.value))).map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setSelectedPlant(p.value)}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                    selectedPlant === p.value
                      ? 'bg-surface-raised text-blue-700 shadow-xs'
                      : 'text-ink-muted hover:text-ink-strong'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}

          {/* Filters — 2-up grid on a phone so each dropdown is a full tap target; inline row from sm up. */}
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
            <select value={selectedDmt} onChange={(e) => handleDmtChange(e.target.value)} className="w-full sm:w-auto rounded-lg border border-line bg-surface-raised px-2.5 py-2 sm:py-1.5 text-xs text-ink-strong">
              {dmtOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select value={selectedJhGroup} onChange={(e) => setSelectedJhGroup(e.target.value)} className="w-full sm:w-auto rounded-lg border border-line bg-surface-raised px-2.5 py-2 sm:py-1.5 text-xs text-ink-strong">
              {availableJhGroups.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)} className="w-full sm:w-auto rounded-lg border border-line bg-surface-raised px-2.5 py-2 sm:py-1.5 text-xs text-ink-strong">
              <option value="all">All Types</option>
              {ABN_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <select value={selectedResponsibility} onChange={(e) => setSelectedResponsibility(e.target.value)} className="w-full sm:w-auto rounded-lg border border-line bg-surface-raised px-2.5 py-2 sm:py-1.5 text-xs text-ink-strong">
              <option value="all">All Responsibilities</option>
              {responsibilities.map((r) => <option key={r.id} value={String(r.id)}>{r.name}</option>)}
            </select>

            {/* Red / White tag toggle */}
            <div className="col-span-2 sm:col-auto flex items-center justify-center sm:justify-start gap-1 bg-surface-sunken p-1 rounded-lg border border-line">
              {[
                { key: 'all', label: 'All Tags' },
                { key: 'red', label: 'Red Tag' },
                { key: 'white', label: 'White Tag' },
              ].map((tg) => (
                <button
                  key={tg.key}
                  type="button"
                  onClick={() => setSelectedTag(tg.key)}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                    selectedTag === tg.key
                      ? tg.key === 'red'
                        ? 'bg-red-600 text-white shadow-xs'
                        : tg.key === 'white'
                          ? 'bg-gray-800 text-white shadow-xs'
                          : 'bg-surface-raised text-blue-700 shadow-xs'
                      : 'text-ink-muted hover:text-ink-strong'
                  }`}
                >
                  {tg.label}
                </button>
              ))}
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle pointer-events-none" />
            <input
              type="text"
              placeholder="Search by description, submitter, or JH group..."
              value={repoSearchQuery}
              onChange={(e) => setRepoSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-line bg-surface-raised text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-700"
            />
          </div>

          {isLoading && (
            <div className="flex justify-center py-12 text-ink-subtle">
              <Loader2 size={24} className="animate-spin" />
            </div>
          )}

          {!isLoading && filteredRepositoryItems.length === 0 && (
            <EmptyState glyph="📁" title="No resolved abnormalities found" body="No records match your selected filter or search query." />
          )}

          {!isLoading && filteredRepositoryItems.length > 0 && (
            <div className="space-y-3">
              {pagedRepositoryItems.map((item) => {
                const days = daysOpen(item.timestamp);
                return (
                  <div key={item.abnormality_id} className="rounded-xl border border-line bg-surface-raised p-4 shadow-xs flex gap-3">
                    {item.before_image && (
                      <img src={item.before_image} alt="" className="w-16 h-16 rounded-lg object-contain bg-surface-sunken border border-line shrink-0" />
                    )}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wide ${
                            item.tag_color === 'red' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 border border-gray-300'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${item.tag_color === 'red' ? 'bg-white' : 'bg-white border border-gray-400'}`} />
                            {item.tag_color === 'red' ? 'Red Tag' : 'White Tag'}
                          </span>
                          {item.type && (
                            <p className="text-xs font-semibold text-blue-700">{TYPE_LABEL[item.type] || item.type}</p>
                          )}
                          <StatusBadge status={STATUS_KEY.closed} label="Closed" size="sm" />
                        </div>
                        <button type="button" onClick={() => setDetailItem(item)} className="shrink-0 p-1.5 rounded-lg text-ink-muted hover:bg-surface-hover hover:text-blue-700" title="View details">
                          <Eye size={16} />
                        </button>
                      </div>
                      {item.description && (
                        <p className="text-sm text-ink-strong leading-snug">{item.description}</p>
                      )}
                      {item.closure_notes && (
                        <p className="text-xs text-green-700 leading-snug"><span className="font-semibold">Closure:</span> {item.closure_notes}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-ink-muted pt-1">
                        <span className="flex items-center gap-1"><User size={11} />Submitted by {item.submitted_by || '—'}</span>
                        {item.closed_by && (
                          <span className="flex items-center gap-1 font-medium text-blue-700">
                            <UserCheck size={11} />
                            Closed by {(orgData?.workers || []).find((w) => String(w.id) === String(item.closed_by))?.name || item.closed_by}
                          </span>
                        )}
                        <span className="flex items-center gap-1"><Calendar size={11} />{days === 0 ? 'Today' : `${days}d ago`}</span>
                        {item.jh_group_name && <span>JH Group: <strong className="text-ink-strong font-medium">{item.jh_group_name}</strong></span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {!isLoading && (
            <ListPager
              total={filteredRepositoryItems.length}
              noun={filteredRepositoryItems.length === 1 ? 'abnormality' : 'abnormalities'}
              page={repoPage}
              pageCount={repoPageCount}
              pageSize={repoPageSize}
              pageSizeOptions={ABN_PAGE_SIZE_OPTIONS}
              onPage={setRepoPage}
              onPageSize={setRepoPageSize}
            />
          )}
        </div>
        )}

        {mainTab === 'myteam' && canSeeAbnMyTeam && <AbnormalityMyTeamAnalyticsTab />}

        {mainTab === 'analytics' && isBeLeadRole && (
          <AbnormalityAnalyticsTab />
        )}
      </CaptureColumn>

      {/* Review & Assign modal — JH reviewer can edit every reported field, then must pick
          a responsibility + assignee (locked to that department) before proceeding */}
      <Dialog open={!!reviewEditItem} onOpenChange={(open) => !open && closeReviewEdit()}>
        <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto text-base">
          <DialogHeader>
            <DialogTitle className="text-xl">{reviewEditMode === 'draft' ? 'Edit Draft Abnormality' : 'Review & Assign Abnormality'}</DialogTitle>
          </DialogHeader>
          {reviewEditItem && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold uppercase tracking-wider text-ink-muted mb-1.5">
                  Type <span className="text-danger-fg">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {ABN_TYPES.map(({ value, label, Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setReType(value)}
                      className={`flex items-center gap-2 py-2 px-3 rounded-lg border text-sm font-medium text-left transition-all ${
                        reType === value
                          ? 'bg-blue-50 text-blue-700 border-blue-300 shadow-xs'
                          : 'bg-surface-base text-ink-muted border-line hover:border-blue-200'
                      }`}
                    >
                      <Icon size={15} className="shrink-0" />
                      <span className="leading-tight break-words">{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold uppercase tracking-wider text-ink-muted mb-1.5">
                  Tag Type <span className="text-danger-fg">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2 max-w-xs">
                  <button
                    type="button"
                    onClick={() => setReTagColor('red')}
                    className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-sm font-bold transition-all ${
                      reTagColor === 'red'
                        ? 'bg-red-600 text-white border-red-600 shadow-xs'
                        : 'bg-surface-base text-ink-muted border-line hover:border-red-300'
                    }`}
                  >
                    <span className={`w-2.5 h-2.5 rounded-full ${reTagColor === 'red' ? 'bg-white' : 'bg-red-600'}`} />
                    Red Tag
                  </button>
                  <button
                    type="button"
                    onClick={() => setReTagColor('white')}
                    className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-sm font-bold transition-all ${
                      reTagColor === 'white'
                        ? 'bg-gray-800 text-white border-gray-800 shadow-xs'
                        : 'bg-surface-base text-ink-muted border-line hover:border-gray-400'
                    }`}
                  >
                    <span className={`w-2.5 h-2.5 rounded-full border ${reTagColor === 'white' ? 'bg-white' : 'bg-white border-gray-400'}`} />
                    White Tag
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold uppercase tracking-wider text-ink-muted mb-1">
                  What is the abnormality? <span className="text-danger-fg">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={reDescription}
                  onChange={(e) => setReDescription(e.target.value)}
                  className="w-full rounded-lg border border-line bg-surface-base px-3 py-2 text-base text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold uppercase tracking-wider text-ink-muted mb-1">
                  Action for the abnormality <span className="text-danger-fg">*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  value={reAction}
                  onChange={(e) => setReAction(e.target.value)}
                  className="w-full rounded-lg border border-line bg-surface-base px-3 py-2 text-base text-ink-strong placeholder-ink-subtle focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
              </div>

              {reviewEditMode !== 'draft' && (<>
              <div>
                <label className="block text-sm font-semibold uppercase tracking-wider text-ink-muted mb-1">
                  Responsibility <span className="text-danger-fg">*</span>
                </label>
                <select
                  value={reResponsibilityId}
                  onChange={(e) => {
                    setReResponsibilityId(e.target.value);
                    setReAssigneeEmpId('');
                  }}
                  className="w-full h-11 rounded-lg border border-line bg-surface-base px-3 text-base text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-700"
                >
                  <option value="">Select responsibility...</option>
                  {responsibilities.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold uppercase tracking-wider text-ink-muted mb-1">
                  Assign To <span className="text-danger-fg">*</span>
                </label>
                <select
                  value={reAssigneeEmpId}
                  onChange={(e) => setReAssigneeEmpId(e.target.value)}
                  disabled={!reResponsibilityId}
                  className="w-full h-11 rounded-lg border border-line bg-surface-base px-3 text-base text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-700 disabled:opacity-50"
                >
                  <option value="">Select person...</option>
                  {(orgData?.workers || [])
                    .filter((w) => w.is_active !== false)
                    .filter((w) => {
                      const respDeptId = responsibilities.find((r) => String(r.id) === String(reResponsibilityId))?.department_id;
                      return !respDeptId || w.department_id === respDeptId || String(w.id) === String(userWorkerId);
                    })
                    .slice()
                    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                    .map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold uppercase tracking-wider text-ink-muted mb-1">
                  Target Date
                </label>
                <input
                  type="date"
                  value={reTargetDate}
                  onChange={(e) => setReTargetDate(e.target.value)}
                  className="w-full h-11 rounded-lg border border-line bg-surface-base px-3 text-base text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
              </div>
              </>)}

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
                  <Button onClick={handleSubmitAssign} disabled={reviewDetail.isPending} className="text-sm bg-blue-600 text-white hover:bg-blue-700">
                    <Send size={14} className="mr-1" /> Assign for Closure
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Detail modal — any viewer (JH lead, DMT lead, submitter, etc.) can open this */}
      <Dialog open={!!detailItem} onOpenChange={(open) => !open && setDetailItem(null)}>
        <DialogContent className="max-w-3xl max-h-[95vh] overflow-y-auto text-base">
          {detailItem && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl">Abnormality Detail</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wide ${
                    detailItem.tag_color === 'red' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 border border-gray-300'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${detailItem.tag_color === 'red' ? 'bg-white' : 'bg-white border border-gray-400'}`} />
                    {detailItem.tag_color === 'red' ? 'Red Tag' : 'White Tag'}
                  </span>
                  {detailItem.type && (
                    <span className="text-sm font-semibold text-blue-700">{TYPE_LABEL[detailItem.type] || detailItem.type}</span>
                  )}
                  {detailItem.status && (
                    <StatusBadge status={STATUS_KEY[detailItem.status]} label={STATUS_LABEL[detailItem.status] || detailItem.status} size="sm" />
                  )}
                  </div>
                  {isAdminRole && (
                    <button
                      type="button"
                      onClick={() => setAuditTrailOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line bg-surface-sunken text-xs font-medium text-ink-strong hover:bg-surface-hover transition-colors shrink-0"
                    >
                      <History size={14} className="text-blue-700" />
                      <span>Audit Trail</span>
                    </button>
                  )}
                </div>

                {detailItem.description && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted mb-1">What is the abnormality?</p>
                    <p className="text-base text-ink-strong leading-relaxed">{detailItem.description}</p>
                  </div>
                )}

                {detailItem.action && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted mb-1">Action for the abnormality</p>
                    <p className="text-base text-ink-strong leading-relaxed">{detailItem.action}</p>
                  </div>
                )}

                {(detailItem.before_image || detailItem.after_image) && (
                  <div className="grid grid-cols-2 gap-3">
                    {detailItem.before_image && (
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-ink-subtle mb-1">Before</p>
                        <button type="button" onClick={() => setLightboxImage(detailItem.before_image)} className="block w-full aspect-[4/3] rounded-lg border border-line bg-surface-sunken overflow-hidden">
                          <img src={detailItem.before_image} alt="Before" className="w-full h-full object-contain cursor-zoom-in hover:opacity-90 transition-opacity" />
                        </button>
                      </div>
                    )}
                    {detailItem.after_image && (
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-ink-subtle mb-1">After</p>
                        <button type="button" onClick={() => setLightboxImage(detailItem.after_image)} className="block w-full aspect-[4/3] rounded-lg border border-line bg-surface-sunken overflow-hidden">
                          <img src={detailItem.after_image} alt="After" className="w-full h-full object-contain cursor-zoom-in hover:opacity-90 transition-opacity" />
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-2 gap-x-3 gap-y-2.5 text-sm bg-surface-sunken p-3 rounded-lg border border-line">
                  <div><span className="text-ink-muted">Submitted by</span><br /><span className="text-ink-strong font-medium break-words">{detailItem.submitted_by || '—'}</span></div>
                  <div><span className="text-ink-muted">JH Group</span><br /><span className="text-ink-strong font-medium">{detailItem.jh_group_name || '—'}</span></div>
                  <div><span className="text-ink-muted">Reported</span><br /><span className="text-ink-strong font-medium">{new Date(detailItem.timestamp).toLocaleString()}</span></div>
                  {detailItem.target_date && (
                    <div><span className="text-ink-muted">Target Date</span><br /><span className="text-ink-strong font-medium">{formatAbnDate(detailItem.target_date)}</span></div>
                  )}
                  {detailItem.responsibility_name && (
                    <div><span className="text-ink-muted">Responsibility</span><br /><span className="text-ink-strong font-medium">{detailItem.responsibility_name}</span></div>
                  )}
                  {detailItem.assignee_emp_id && (
                    <div><span className="text-ink-muted">Assigned to</span><br /><span className="text-ink-strong font-medium">{(orgData?.workers || []).find((w) => String(w.id) === String(detailItem.assignee_emp_id))?.name || detailItem.assignee_emp_id}</span></div>
                  )}
                  {detailItem.assigned_by && (
                    <div><span className="text-ink-muted">Assigned by</span><br /><span className="text-ink-strong font-medium">{(orgData?.workers || []).find((w) => String(w.id) === String(detailItem.assigned_by))?.name || detailItem.assigned_by}</span></div>
                  )}
                  {detailItem.assigned_at && (
                    <div><span className="text-ink-muted">Assigned at</span><br /><span className="text-ink-strong font-medium">{new Date(detailItem.assigned_at).toLocaleString()}</span></div>
                  )}
                  {detailItem.reviewed_by && (
                    <div><span className="text-ink-muted">Reviewed by</span><br /><span className="text-ink-strong font-medium">{(orgData?.workers || []).find((w) => String(w.id) === String(detailItem.reviewed_by))?.name || detailItem.reviewed_by}</span></div>
                  )}
                  {detailItem.reviewed_at && (
                    <div><span className="text-ink-muted">Reviewed at</span><br /><span className="text-ink-strong font-medium">{new Date(detailItem.reviewed_at).toLocaleString()}</span></div>
                  )}
                  {detailItem.closed_by && (
                    <div><span className="text-ink-muted">Closed by</span><br /><span className="text-ink-strong font-medium">{(orgData?.workers || []).find((w) => String(w.id) === String(detailItem.closed_by))?.name || detailItem.closed_by}</span></div>
                  )}
                  {detailItem.closed_at && (
                    <div><span className="text-ink-muted">Closed at</span><br /><span className="text-ink-strong font-medium">{new Date(detailItem.closed_at).toLocaleString()}</span></div>
                  )}
                  {detailItem.completion_date && (
                    <div><span className="text-ink-muted">Date of Completion</span><br /><span className="text-ink-strong font-medium">{formatAbnDate(detailItem.completion_date)}</span></div>
                  )}
                </div>

                {canSeeAbnReviewChanges(detailItem) && detailItem.review_changes && Object.keys(detailItem.review_changes).length > 0 && (
                  <div className="rounded-lg border border-blue-200 bg-blue-500/5 p-3 text-sm text-blue-900">
                    <p className="font-semibold mb-1.5">Changed by the reviewer</p>
                    <div className="space-y-1">
                      {Object.entries(detailItem.review_changes).map(([field, { from, to }]) => {
                        const resolve = (value) => {
                          if (field === 'responsibility_id') {
                            return responsibilities.find((r) => String(r.id) === String(value))?.name || (value ? String(value) : '—');
                          }
                          if (field === 'assignee_emp_id') {
                            return (orgData?.workers || []).find((w) => String(w.id) === String(value))?.name || (value ? String(value) : '—');
                          }
                          return formatReviewChangeValue(field, value);
                        };
                        return (
                          <p key={field} className="leading-relaxed">
                            <span className="font-medium capitalize">{REVIEW_CHANGE_FIELD_LABEL[field] || field}:</span>{' '}
                            <span className="line-through text-blue-700/60">{resolve(from)}</span>
                            {' → '}
                            <span className="font-medium">{resolve(to)}</span>
                          </p>
                        );
                      })}
                    </div>
                  </div>
                )}

                {detailItem.closure_notes && (
                  <div className="rounded-lg border border-green-200 bg-green-500/5 p-3 text-sm text-green-900">
                    <p className="font-semibold mb-0.5">Closure Notes</p>
                    <p className="leading-relaxed">{detailItem.closure_notes}</p>
                  </div>
                )}
                {detailItem.rejection_reason && (
                  <div className="rounded-lg border border-red-200 bg-red-500/5 p-3 text-sm text-red-900">
                    <p className="font-semibold mb-0.5">Marked for Deletion — Reason</p>
                    <p className="leading-relaxed">{detailItem.rejection_reason}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {isAdminRole && (
        <AbnormalityAuditTrailModal
          isOpen={auditTrailOpen}
          onClose={() => setAuditTrailOpen(false)}
          abnormalityId={detailItem?.abnormality_id}
          abnormalityDescription={detailItem?.description}
        />
      )}

      {/* Full-size photo viewer */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setLightboxImage(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxImage(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <X size={22} />
          </button>
          <img src={lightboxImage} alt="Full size" className="max-w-full max-h-full object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
