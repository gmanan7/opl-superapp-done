import { useState, useRef, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Star, FileText, Send, Clock, User, List, MessageSquare,
  ImagePlus, X, Loader2, History, CheckCircle2, XCircle, AlertTriangle, Tag,
  GraduationCap, ChevronRight, ChevronLeft, Globe, Users, Building2, Search, Filter, BookOpen, Layers,
  Plus, Printer, Share2, TrendingUp, Pencil, Check, Award
} from 'lucide-react';
import { useKaizens } from '../../hooks/useKaizen';
import { useOrgStructure } from '../../hooks/mdm';
import { compressImageAndUpload } from '../../lib/imageUpload';
import { CaptureColumn, StatusBadge, EmptyState, SkeletonRow, ConfirmModal } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { loadSession, getSessionContext, getName } from '../../lib/auth';

const STATUS_KEY = {
  draft: 'neutral',
  submitted: 'warning',
  pending_review: 'warning',
  approved_for_implementation: 'info',
  approved: 'info',
  implemented: 'brand',
  submitted_for_confirmation: 'warning',
  confirmed_close: 'success',
  rejected: 'danger',
  marked_for_deletion: 'danger'
};

const STATUS_LABEL = {
  draft: 'Draft',
  submitted: 'Pending review',
  pending_review: 'Pending review',
  approved_for_implementation: 'Approved for Implementation',
  approved: 'Approved for Implementation',
  implemented: 'Implemented',
  submitted_for_confirmation: 'Submitted for confirmation',
  confirmed_close: 'Confirmed Close/Marked for deletion',
  rejected: 'Marked for deletion',
  marked_for_deletion: 'Marked for deletion'
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

const DEFAULT_KAIZENS = [
  {
    id: 'k-1',
    title: 'Pneumatic Cylinder Air Leakage Reduction in Printing Line 1',
    result_area: 'productivity',
    status: 'confirmed_close',
    total_score: 28,
    scores: { pq: 9, ehs: 3, quant: 9, easy: 7 },
    submitter_name: 'Ramashankar Yadav',
    submitted_by: 'EMP-101',
    jh_group_name: 'Printing - Group A',
    plant_name: 'TVT',
    cost_impl: 2500,
    benefit_description: 'Saved 12 kWh/day compressed air energy',
    brief_description: 'Replaced worn-out pneumatic fittings with quick-connect polyurethane tubes.',
    problem_description: 'Frequent air pressure drops caused line stoppage in printing unit.',
    solution_description: 'Identified 4 leak points using ultrasonic leak detector and replaced fittings.',
    horizontal_deployment: true,
    horizontal_deployment_details: 'Applicable to Printing Line 2 and Coating units.',
    before_image: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=600&q=80',
    after_image: 'https://images.unsplash.com/photo-1581092335397-9583fe92d232?auto=format&fit=crop&w=600&q=80',
    submitted_at: '2026-08-01T09:00:00Z',
    approved_at: '2026-08-03T11:00:00Z',
    approver_name: 'Rajesh Kumar'
  },
  {
    id: 'k-2',
    title: 'Safety Finger Guard for Slitter Rewinder Cutter',
    result_area: 'safety',
    status: 'approved_for_implementation',
    total_score: 33,
    scores: { pq: 9, ehs: 9, quant: 9, easy: 6 },
    submitter_name: 'Priya Verma',
    submitted_by: 'EMP-102',
    jh_group_name: 'Coating & Lamination',
    plant_name: 'TVT',
    cost_impl: 1800,
    benefit_description: 'Eliminated pinch-point injury hazard completely',
    brief_description: 'Fabricated transparent acrylic safety guard over rotary cutting blades.',
    problem_description: 'Open rotating cutter blades posed high risk of accidental hand contact during web threading.',
    solution_description: 'Designed hinged acrylic guard interlocked with proximity sensor.',
    horizontal_deployment: false,
    horizontal_deployment_details: '',
    before_image: 'https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?auto=format&fit=crop&w=600&q=80',
    after_image: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=600&q=80',
    submitted_at: '2026-08-03T10:30:00Z',
    approved_at: '2026-08-05T14:20:00Z',
    approver_name: 'Ankit Srivastava'
  },
  {
    id: 'k-3',
    title: 'Optimization of Doctor Blade Angle for Uniform Ink Transfer',
    result_area: 'quality',
    status: 'submitted',
    total_score: null,
    scores: null,
    submitter_name: 'Anil Kumar Sharma',
    submitted_by: 'EMP-104',
    jh_group_name: 'Maintenance & Utility',
    plant_name: 'NPF',
    cost_impl: 0,
    benefit_description: 'Reduced ink streak defects by 45%',
    brief_description: 'Re-calibrated doctor blade mounting fixture angle to 60 degrees.',
    problem_description: 'Inconsistent doctor blade contact resulted in streak marks on printed foil.',
    solution_description: 'Created fixed angle gauge jig for precision doctor blade alignment during setup.',
    horizontal_deployment: true,
    horizontal_deployment_details: 'Deploy across all 3 rotogravure printing presses.',
    before_image: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=600&q=80',
    after_image: 'https://images.unsplash.com/photo-1581092335397-9583fe92d232?auto=format&fit=crop&w=600&q=80',
    submitted_at: '2026-08-11T16:00:00Z',
    approved_at: null,
    approver_name: null
  },
  {
    id: 'k-4',
    title: 'Solvent Vapor Extraction Hood Extension',
    result_area: 'environment',
    status: 'implemented',
    total_score: 24,
    scores: { pq: 6, ehs: 9, quant: 6, easy: 3 },
    submitter_name: 'Suresh Patel',
    submitted_by: 'EMP-108',
    jh_group_name: 'Packaging & Dispatch',
    plant_name: 'UPF',
    cost_impl: 4200,
    benefit_description: 'Reduced ambient VOC concentration by 60%',
    brief_description: 'Extended extraction duct hood closer to solvent tray.',
    problem_description: 'Slight solvent odor lingering around coating station during high-speed runs.',
    solution_description: 'Installed adjustable stainless steel hood extension with damper control.',
    horizontal_deployment: true,
    horizontal_deployment_details: 'Extend to UPF Coating Unit 2.',
    before_image: 'https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?auto=format&fit=crop&w=600&q=80',
    after_image: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=600&q=80',
    submitted_at: '2026-08-08T12:00:00Z',
    approved_at: '2026-08-10T09:15:00Z',
    approver_name: 'Manan Gupta'
  },
  {
    id: 'k-5',
    title: 'Laser Line Splicing Guide for Raw Material Unwinding',
    result_area: 'cost',
    status: 'submitted_for_confirmation',
    total_score: null,
    scores: null,
    submitter_name: 'Rajesh Kumar',
    submitted_by: 'EMP-002',
    jh_group_name: 'Alpha Team',
    plant_name: 'MPF',
    cost_impl: 500,
    benefit_description: 'Saves ~15 meters of substrate per reel changeover',
    brief_description: 'Added laser line alignment marker for reel splicing.',
    problem_description: 'Manual alignment during reel changeover caused excess trimming waste.',
    solution_description: 'Mounted low-power crosshair laser module to guide exact splice position.',
    horizontal_deployment: false,
    horizontal_deployment_details: '',
    before_image: null,
    after_image: null,
    submitted_at: '2026-08-12T14:45:00Z',
    approved_at: null,
    approver_name: null
  }
];

export function KaizenList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const session = loadSession();
  const ctx = getSessionContext();

  // Main Tabs: 'submit' ("Submit Kaizen & Reviews") or 'standard' ("Standard Kaizens")
  const [mainTab, setMainTab] = useState('submit');

  // Backend Kaizens data
  const { data: apiKaizens = [], isLoading: isKaizensLoading } = useKaizens('all');

  // Combined local & backend state
  const [kaizens, setKaizens] = useState(() => {
    try {
      const stored = localStorage.getItem('tpm_kaizens_list');
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.error(e);
    }
    return DEFAULT_KAIZENS;
  });

  // Keep local storage updated
  useEffect(() => {
    try {
      localStorage.setItem('tpm_kaizens_list', JSON.stringify(kaizens));
    } catch (e) {
      console.error(e);
    }
  }, [kaizens]);

  // Completed Kaizens IDs for worker
  const [completedKaizenIds, setCompletedKaizenIds] = useState(() => {
    try {
      const stored = localStorage.getItem('tpm_completed_kaizens');
      if (stored) return new Set(JSON.parse(stored));
    } catch (e) {
      console.error(e);
    }
    return new Set(['k-1']);
  });

  // Audit Trails
  const [kaizenAuditTrails, setKaizenAuditTrails] = useState(() => {
    try {
      const stored = localStorage.getItem('tpm_kaizen_audit_trail');
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.error(e);
    }
    return {
      'k-1': [
        { id: '1', action: 'Created Draft', performed_by: 'Ramashankar Yadav', timestamp: '2026-08-01T09:00:00Z' },
        { id: '2', action: 'Submitted for Review', performed_by: 'Ramashankar Yadav', timestamp: '2026-08-01T09:15:00Z' },
        { id: '3', action: 'Approved with Score 28/36', performed_by: 'Rajesh Kumar', timestamp: '2026-08-03T11:00:00Z' }
      ]
    };
  });

  const addAuditLog = (kaizenId, action, performedBy) => {
    const newEntry = {
      id: crypto.randomUUID(),
      action,
      performed_by: performedBy || 'User',
      timestamp: new Date().toISOString()
    };
    setKaizenAuditTrails(prev => {
      const existing = prev[kaizenId] || [];
      const updated = { ...prev, [kaizenId]: [newEntry, ...existing] };
      localStorage.setItem('tpm_kaizen_audit_trail', JSON.stringify(updated));
      return updated;
    });
  };

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
  const [reviewFilter, setReviewFilter] = useState('all'); // 'all', 'submitted', 'draft', 'approved', 'rejected'
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(3);

  // Inline Rejection state
  const [inlineRejectId, setInlineRejectId] = useState(null);
  const [inlineRejectReason, setInlineRejectReason] = useState('');

  // Modals state
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [selectedAuditKaizen, setSelectedAuditKaizen] = useState(null);
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

  // Org structure for DMT & JH Groups dropdowns
  const { data: orgData } = useOrgStructure();

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

  const dmtOptions = useMemo(() => {
    const keys = Object.keys(dmtJhMap);
    return [
      { value: 'all', label: 'All DMTs' },
      ...keys.map(k => ({ value: k, label: k }))
    ];
  }, [dmtJhMap]);

  const availableJhGroups = useMemo(() => {
    if (selectedDmt === 'all') {
      const allGroups = new Set();
      Object.values(dmtJhMap).forEach(arr => arr.forEach(g => allGroups.add(g)));
      return [
        { value: 'all', label: 'All Groups' },
        ...Array.from(allGroups).map(g => ({ value: g, label: g }))
      ];
    }
    const list = dmtJhMap[selectedDmt] || [];
    return [
      { value: 'all', label: 'All Groups' },
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
  const userJhGroup = ctx?.jh_group_name || ctx?.jh_group || session?.worker?.jh_group_name || 'Printing - Group A';
  const userPlant = ctx?.factory_name || ctx?.factory_code || session?.worker?.default_plant || 'TVT';
  const userWorkerId = ctx?.worker_id || session?.worker?.worker_id || 'EMP-102';

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
  const handleCreateKaizen = (e, isDraft = false) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!title.trim()) {
      toast.error('Please enter Kaizen Title');
      return;
    }
    if (!isDraft && !problemDesc.trim()) {
      toast.error('Please fill in Problem / Current Description');
      return;
    }
    if (!isDraft && !beforeImage) {
      toast.error('Please attach a Before Photo before submitting for review');
      return;
    }

    const newKaizen = {
      id: `k-${Date.now()}`,
      title: title.trim(),
      result_area: resultArea,
      status: isDraft ? 'draft' : 'submitted',
      total_score: null,
      scores: null,
      submitter_name: currentActorName,
      submitted_by: userWorkerId,
      jh_group_name: userJhGroup,
      plant_name: userPlant,
      cost_impl: costImpl ? Number(costImpl) : 0,
      benefit_description: benefitDesc.trim(),
      brief_description: problemDesc.trim() || title.trim(),
      problem_description: problemDesc.trim(),
      solution_description: solutionDesc.trim(),
      horizontal_deployment: horizontalDep,
      horizontal_deployment_details: horizontalDetails.trim(),
      before_image: beforeImage,
      after_image: afterImage,
      submitted_at: new Date().toISOString(),
      approved_at: null,
      approver_name: null
    };

    setKaizens(prev => [newKaizen, ...prev]);
    addAuditLog(newKaizen.id, isDraft ? 'Created Draft Kaizen' : 'Submitted Kaizen to JH Lead for Review', currentActorName);

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

    toast.success(isDraft ? 'Kaizen saved as Draft!' : 'Kaizen submitted to JH Lead for review! 🎉');
  };

  // Update Kaizen Status Handler
  const handleUpdateStatus = (kaizenId, newStatus, auditNote, toastMsg) => {
    setKaizens(prev => prev.map(k => {
      if (k.id === kaizenId) {
        return {
          ...k,
          status: newStatus,
          ...(newStatus === 'approved_for_implementation' || newStatus === 'approved' ? {
            approved_at: new Date().toISOString(),
            approver_name: currentActorName
          } : {})
        };
      }
      return k;
    }));

    addAuditLog(kaizenId, auditNote, currentActorName);
    toast.success(toastMsg);
  };

  // Mark for Deletion / Reject Handler
  const handleConfirmReject = (kaizenId) => {
    if (!inlineRejectReason.trim()) {
      toast.error('Please enter a reason');
      return;
    }

    setKaizens(prev => prev.map(k => {
      if (k.id === kaizenId) {
        return {
          ...k,
          status: 'marked_for_deletion',
          rejection_reason: inlineRejectReason.trim()
        };
      }
      return k;
    }));

    addAuditLog(kaizenId, `Marked for deletion: ${inlineRejectReason.trim()}`, currentActorName);
    setInlineRejectId(null);
    setInlineRejectReason('');
    toast.error('Marked for deletion');
  };

  // Filtered Kaizens for Reviews
  const filteredReviewKaizens = kaizens.filter(k => {
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

    if (reviewFilter === 'all') return true;
    if (reviewFilter === 'submitted') return k.status === 'submitted' || k.status === 'pending_review';
    if (reviewFilter === 'approved_for_implementation') return k.status === 'approved_for_implementation' || k.status === 'approved';
    if (reviewFilter === 'implemented') return k.status === 'implemented';
    if (reviewFilter === 'submitted_for_confirmation') return k.status === 'submitted_for_confirmation';
    if (reviewFilter === 'confirmed_close') return k.status === 'confirmed_close' || k.status === 'rejected' || k.status === 'marked_for_deletion';
    if (reviewFilter === 'draft') return k.status === 'draft';
    return k.status === reviewFilter;
  });

  const totalReviewItems = filteredReviewKaizens.length;
  const totalReviewPages = Math.ceil(totalReviewItems / pageSize) || 1;
  const validReviewPage = Math.min(Math.max(currentPage, 1), totalReviewPages);
  const paginatedReviewKaizens = filteredReviewKaizens.slice((validReviewPage - 1) * pageSize, validReviewPage * pageSize);

  // Standard Approved Kaizens logic
  const approvedKaizens = useMemo(() => {
    return kaizens.filter(k =>
      k.status === 'approved_for_implementation' ||
      k.status === 'approved' ||
      k.status === 'implemented' ||
      k.status === 'submitted_for_confirmation' ||
      k.status === 'confirmed_close'
    );
  }, [kaizens]);

  const totalRemainingCount = useMemo(() => {
    return approvedKaizens.filter(k => !completedKaizenIds.has(String(k.id))).length;
  }, [approvedKaizens, completedKaizenIds]);

  const handleMarkCompleted = (kaizenId) => {
    setCompletedKaizenIds(prev => {
      const next = new Set(prev).add(String(kaizenId));
      localStorage.setItem('tpm_completed_kaizens', JSON.stringify(Array.from(next)));
      return next;
    });
    toast.success('Kaizen marked as completed! 🎉');
  };

  // Standard Kaizens filtering
  const filteredStandardKaizens = approvedKaizens.filter(k => {
    // Sub-tab filtering
    if (stdTab === 'my_jh_group') {
      if (userJhGroup && k.jh_group_name !== userJhGroup) return false;
    } else if (stdTab === 'my_remaining') {
      if (completedKaizenIds.has(String(k.id))) return false;
    }

    // Plant filter
    if (selectedPlant !== 'all' && k.plant_name !== selectedPlant) return false;

    // DMT level filter
    if (selectedDmt !== 'all') {
      const allowedGroups = dmtJhMap[selectedDmt] || [];
      if (!allowedGroups.includes(k.jh_group_name)) return false;
    }

    // JH Group filter
    if (selectedJhGroup !== 'all' && k.jh_group_name !== selectedJhGroup) return false;

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
              <p className="text-xs text-ink-muted">Submit Kaizens, Review Workflows & Standard Kaizens</p>
            </div>
          </div>

          {/* Main 3 Module Tabs */}
          <div className="grid grid-cols-3 rounded-lg bg-surface-sunken p-1 gap-1">
            <button
              type="button"
              onClick={() => setMainTab('submit')}
              className={`rounded-md px-3 py-2 text-xs sm:text-sm font-medium transition-colors ${
                mainTab === 'submit'
                  ? 'bg-surface-raised text-ink-strong shadow-xs font-semibold'
                  : 'text-ink-muted hover:text-ink-strong'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <Plus size={16} className="shrink-0 text-brand-strong" />
                <span>Submit Kaizen</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setMainTab('review')}
              className={`rounded-md px-3 py-2 text-xs sm:text-sm font-medium transition-colors ${
                mainTab === 'review'
                  ? 'bg-surface-raised text-ink-strong shadow-xs font-semibold'
                  : 'text-ink-muted hover:text-ink-strong'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <Send size={16} className="shrink-0 text-brand-strong" />
                <span>Kaizen Reviews</span>
                {kaizens.length > 0 && (
                  <span className="rounded-full bg-brand-soft text-brand-strong px-1.5 py-0.5 text-2xs font-bold shrink-0">
                    {kaizens.length}
                  </span>
                )}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setMainTab('standard')}
              className={`rounded-md px-3 py-2 text-xs sm:text-sm font-medium transition-colors ${
                mainTab === 'standard'
                  ? 'bg-surface-raised text-ink-strong shadow-xs font-semibold'
                  : 'text-ink-muted hover:text-ink-strong'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <Award size={16} className="shrink-0 text-amber-500" />
                <span>Standard Kaizens</span>
                {approvedKaizens.length > 0 && (
                  <span className="rounded-full bg-amber-500/10 text-amber-700 border border-amber-300/40 px-1.5 py-0.5 text-2xs font-bold shrink-0">
                    {approvedKaizens.length}
                  </span>
                )}
              </div>
            </button>
          </div>
        </CaptureColumn>
      </header>

      {/* Content Area */}
      <CaptureColumn>
        {mainTab === 'submit' && (
          /* Tab 1: Submit Kaizen Form */
          <div className="space-y-8 py-4">
            {/* Section A: Submit New Kaizen Form */}
            <form onSubmit={(e) => handleCreateKaizen(e, false)} className="rounded-xl border border-line bg-surface-raised p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <div className="flex items-center gap-2">
                  <Plus className="text-brand-strong" size={20} />
                  <div>
                    <h2 className="text-lg font-semibold text-ink-strong">Submit New Kaizen</h2>
                    <p className="text-2xs text-ink-muted">Record improvement idea and submit for JH / DMT review</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
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
                    className="w-full rounded-lg border border-line bg-surface-base px-3 py-2 text-sm text-ink-strong focus:outline-none focus:ring-2 focus:ring-brand-strong"
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
                    className="w-full rounded-lg border border-line bg-surface-base px-3 py-2 text-sm text-ink-strong focus:outline-none focus:ring-2 focus:ring-brand-strong"
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
                            ? 'bg-brand-strong text-white border-brand-strong shadow-xs font-bold'
                            : 'bg-surface-base text-ink-muted border-line hover:border-brand-strong/50'
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
                    <div className="relative rounded-lg border border-line overflow-hidden bg-surface-sunken h-36 max-w-xs">
                      <img src={beforeImage} alt="Before" className="w-full h-full object-cover" />
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
                      className="w-full sm:w-80 h-32 rounded-lg border-2 border-dashed border-line bg-surface-base flex flex-col items-center justify-center text-ink-muted hover:border-brand-strong hover:bg-surface-hover transition-colors"
                    >
                      {isCompressingBefore ? (
                        <Loader2 size={20} className="animate-spin text-brand-strong" />
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
                  <Button type="submit" className="text-xs gap-1.5 bg-brand-strong text-white">
                    <Send size={14} />
                    Submit for Review
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
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface-raised p-4 rounded-xl border border-line shadow-xs">
                <div>
                  <h3 className="text-base font-semibold text-ink-strong flex items-center gap-2">
                    <Send size={18} className="text-brand-strong" /> Kaizen Reviews & Workflow
                  </h3>
                  <p className="text-xs text-ink-muted">Evaluate, score, approve, or reject submitted Kaizens</p>
                </div>

                {/* Review Filters */}
                <div className="flex items-center gap-1 bg-surface-sunken p-1 rounded-lg border border-line flex-wrap">
                  {[
                    { value: 'all', label: 'All' },
                    { value: 'submitted', label: 'Pending Review' },
                    { value: 'approved_for_implementation', label: 'Approved for Implementation' },
                    { value: 'implemented', label: 'Implemented' },
                    { value: 'submitted_for_confirmation', label: 'Submitted for Confirmation' },
                    { value: 'confirmed_close', label: 'Confirmed Close / Marked for Deletion' }
                  ].map(f => (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => {
                        setReviewFilter(f.value);
                        setCurrentPage(1);
                      }}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                        reviewFilter === f.value
                          ? 'bg-surface-raised text-brand-strong shadow-xs'
                          : 'text-ink-muted hover:text-ink-strong'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
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
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-line bg-surface-raised text-ink-strong focus:outline-none focus:ring-2 focus:ring-brand-strong"
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
                    const isPending = k.status === 'submitted';

                    return (
                      <div key={k.id} className="rounded-xl border border-line bg-surface-raised p-5 shadow-xs space-y-4">
                        {/* Top Bar: Badges & Info */}
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${areaClass}`}>
                              {AREA_LABEL[k.result_area] || k.result_area}
                            </span>
                            <StatusBadge status={STATUS_KEY[k.status]} label={STATUS_LABEL[k.status]} />
                            {k.horizontal_deployment && (
                              <span className="px-2 py-0.5 rounded-md text-3xs font-bold uppercase tracking-wider bg-purple-500/10 text-purple-700 border border-purple-200">
                                Horizontal Deployment
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedAuditKaizen(k);
                                setAuditModalOpen(true);
                              }}
                              className="h-7 text-3xs gap-1 px-2"
                            >
                              <History size={12} /> Audit Trail
                            </Button>
                          </div>
                        </div>

                        {/* Title & Metadata */}
                        <div>
                          <h4 className="text-base font-semibold text-ink-strong">{k.title}</h4>
                          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
                            <span>Submitter: <strong className="text-ink-strong">{k.submitter_name}</strong> ({k.submitted_by})</span>
                            <span>JH Group: <strong className="text-ink-strong">{k.jh_group_name}</strong></span>
                            <span>Plant: <strong className="text-ink-strong">{k.plant_name}</strong></span>
                            {k.cost_impl > 0 && <span>Cost: <strong className="text-ink-strong">₹{k.cost_impl.toLocaleString('en-IN')}</strong></span>}
                          </div>
                        </div>

                        {/* Summary & Solution */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-surface-sunken p-3 rounded-lg border border-line">
                          <div>
                            <span className="font-semibold text-ink-strong block mb-0.5">Brief Summary:</span>
                            <p className="text-ink-muted leading-relaxed">{k.brief_description}</p>
                          </div>
                          <div>
                            <span className="font-semibold text-ink-strong block mb-0.5">Solution & Benefit:</span>
                            <p className="text-ink-muted leading-relaxed">{k.solution_description || k.benefit_description || '—'}</p>
                          </div>
                        </div>

                        {/* Before and After Image Side-by-Side */}
                        {(k.before_image || k.after_image) && (
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <span className="text-3xs font-bold uppercase tracking-wider text-ink-subtle block mb-1">Before</span>
                              {k.before_image ? (
                                <img src={k.before_image} alt="Before" className="w-full h-32 object-cover rounded-lg border border-line" />
                              ) : (
                                <div className="w-full h-32 rounded-lg border border-line bg-surface-sunken flex items-center justify-center text-3xs text-ink-subtle">No Photo</div>
                              )}
                            </div>
                            <div>
                              <span className="text-3xs font-bold uppercase tracking-wider text-ink-subtle block mb-1">After</span>
                              {k.after_image ? (
                                <img src={k.after_image} alt="After" className="w-full h-32 object-cover rounded-lg border border-line" />
                              ) : (
                                <div className="w-full h-32 rounded-lg border border-line bg-surface-sunken flex items-center justify-center text-3xs text-ink-subtle">No Photo</div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Workflow Action Buttons for Kaizen */}
                        <div className="flex items-center justify-end gap-2 pt-3 border-t border-line flex-wrap">
                          {inlineRejectId === k.id ? (
                            <div className="flex items-center gap-2 w-full">
                              <input
                                type="text"
                                placeholder="Enter reason..."
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
                                Mark for Deletion
                              </Button>
                            </div>
                          ) : (
                            <>
                              {(k.status === 'submitted' || k.status === 'pending_review') && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setInlineRejectId(k.id)}
                                    className="text-xs text-red-600 border-red-200 hover:bg-red-50"
                                  >
                                    <XCircle size={14} className="mr-1" /> Mark for Deletion
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={() => handleUpdateStatus(k.id, 'approved_for_implementation', 'Approved for Implementation', 'Kaizen approved for implementation! 🎉')}
                                    className="text-xs bg-emerald-600 text-white hover:bg-emerald-700"
                                  >
                                    <CheckCircle2 size={14} className="mr-1" /> Approve for Implementation
                                  </Button>
                                </>
                              )}

                              {(k.status === 'approved_for_implementation' || k.status === 'approved') && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setInlineRejectId(k.id)}
                                    className="text-xs text-red-600 border-red-200 hover:bg-red-50"
                                  >
                                    <XCircle size={14} className="mr-1" /> Mark for Deletion
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={() => handleUpdateStatus(k.id, 'implemented', 'Marked as Implemented', 'Kaizen marked as implemented! 🎉')}
                                    className="text-xs bg-blue-600 text-white hover:bg-blue-700"
                                  >
                                    <CheckCircle2 size={14} className="mr-1" /> Mark as Implemented
                                  </Button>
                                </>
                              )}

                              {k.status === 'implemented' && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setInlineRejectId(k.id)}
                                    className="text-xs text-red-600 border-red-200 hover:bg-red-50"
                                  >
                                    <XCircle size={14} className="mr-1" /> Mark for Deletion
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={() => handleUpdateStatus(k.id, 'submitted_for_confirmation', 'Submitted for Confirmation', 'Kaizen submitted for confirmation! 🎉')}
                                    className="text-xs bg-amber-600 text-white hover:bg-amber-700"
                                  >
                                    <Send size={14} className="mr-1" /> Submit for Confirmation
                                  </Button>
                                </>
                              )}

                              {k.status === 'submitted_for_confirmation' && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setInlineRejectId(k.id)}
                                    className="text-xs text-red-600 border-red-200 hover:bg-red-50"
                                  >
                                    <XCircle size={14} className="mr-1" /> Mark for Deletion
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={() => handleUpdateStatus(k.id, 'confirmed_close', 'Confirmed Close', 'Kaizen confirmed closed! 🎉')}
                                    className="text-xs bg-emerald-600 text-white hover:bg-emerald-700"
                                  >
                                    <CheckCircle2 size={14} className="mr-1" /> Confirm Close
                                  </Button>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Pagination */}
                  {totalReviewItems > 0 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-surface-raised p-3 rounded-xl border border-line text-xs text-ink-muted">
                      <span>Showing {(validReviewPage - 1) * pageSize + 1} to {Math.min(validReviewPage * pageSize, totalReviewItems)} of {totalReviewItems} Kaizens</span>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={validReviewPage <= 1}
                          onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                          className="h-8 px-2.5 text-xs"
                        >
                          <ChevronLeft size={14} /> Previous
                        </Button>
                        <span className="font-semibold text-ink-strong">Page {validReviewPage} of {totalReviewPages}</span>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={validReviewPage >= totalReviewPages}
                          onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalReviewPages))}
                          className="h-8 px-2.5 text-xs"
                        >
                          Next <ChevronRight size={14} />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

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
                      ? 'bg-surface-raised text-brand-strong shadow-xs'
                      : 'text-ink-muted hover:text-ink-strong'
                  }`}
                >
                  <Globe size={14} />
                  <span>All Standard Kaizens</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setStdTab('my_jh_group');
                    setStdCurrentPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-md transition-all text-xs font-semibold flex items-center gap-1.5 ${
                    stdTab === 'my_jh_group'
                      ? 'bg-surface-raised text-brand-strong shadow-xs'
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
                  className={`px-3 py-1.5 rounded-md transition-all text-xs font-semibold flex items-center gap-1.5 ${
                    stdTab === 'my_remaining'
                      ? 'bg-surface-raised text-amber-700 shadow-xs border border-amber-300/40'
                      : 'text-ink-muted hover:text-ink-strong'
                  }`}
                >
                  <Clock size={14} className={stdTab === 'my_remaining' ? 'text-amber-600' : 'text-ink-subtle'} />
                  <span>My Remaining</span>
                  <span className="px-1.5 py-0.2 rounded-full text-3xs font-bold bg-amber-500 text-white">
                    {totalRemainingCount}
                  </span>
                </button>
              </div>

              {/* Search input */}
              <div className="relative flex-1 sm:max-w-xs">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-subtle pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search standard kaizens..."
                  value={stdSearchQuery}
                  onChange={(e) => {
                    setStdSearchQuery(e.target.value);
                    setStdCurrentPage(1);
                  }}
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-line bg-surface-base text-ink-strong focus:outline-none focus:ring-1 focus:ring-brand-strong"
                />
              </div>
            </div>

            {/* Standard Filter Section (3 Rows) */}
            <div className="flex flex-col gap-2.5 bg-surface-sunken p-3 rounded-xl border border-line text-xs">
              {/* Row 1: Plant Filter Toggle */}
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
                  ].map(opt => (
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
                    className="px-2.5 py-1 rounded-lg border border-line bg-surface-base text-2xs font-semibold text-ink focus:outline-none focus:ring-1 focus:ring-brand-strong cursor-pointer"
                  >
                    {dmtOptions.map(opt => (
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
                    className="px-2.5 py-1 rounded-lg border border-line bg-surface-base text-2xs font-semibold text-ink focus:outline-none focus:ring-1 focus:ring-brand-strong cursor-pointer"
                  >
                    {availableJhGroups.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 3: Result Area and Priority together */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                {/* Result Area / Type Toggle */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-2xs font-bold text-ink-muted uppercase tracking-wider flex items-center gap-1 shrink-0">
                    <Tag size={12} className="text-brand-strong" /> Area:
                  </span>
                  <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg border border-line bg-surface-base flex-wrap">
                    {[
                      { value: 'all', label: 'All Areas' },
                      { value: 'quality', label: 'Quality' },
                      { value: 'safety', label: 'Safety' },
                      { value: 'productivity', label: 'Productivity' },
                      { value: 'cost', label: 'Cost' },
                      { value: 'environment', label: 'Environment' }
                    ].map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setSelectedArea(opt.value);
                          setStdCurrentPage(1);
                        }}
                        className={`px-2 py-0.5 rounded text-2xs font-semibold transition-all ${
                          selectedArea === opt.value
                            ? 'bg-brand-strong text-white shadow-2xs'
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
                    className="flex items-center gap-1 text-2xs font-semibold text-brand-strong hover:underline px-2 py-1 rounded bg-surface-base border border-line"
                  >
                    <X size={12} /> Clear Filters
                  </button>
                )}
              </div>
            </div>

            {/* Approved Standard Kaizens Grid */}
            {paginatedStandardKaizens.length === 0 ? (
              <EmptyState
                title="No Standard Kaizens found"
                description="Try adjusting your filters or search terms."
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {paginatedStandardKaizens.map(k => {
                  const areaClass = AREA_COLOR[k.result_area] || 'bg-surface-sunken text-ink-muted';
                  const isCompleted = completedKaizenIds.has(String(k.id));

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

                        {/* Images preview */}
                        {(k.before_image || k.after_image) && (
                          <div className="grid grid-cols-2 gap-2 pt-1">
                            {k.before_image ? (
                              <img src={k.before_image} alt="Before" className="w-full h-24 object-cover rounded-md border border-line" />
                            ) : (
                              <div className="w-full h-24 rounded-md border border-line bg-surface-sunken flex items-center justify-center text-3xs text-ink-subtle">No Photo</div>
                            )}
                            {k.after_image ? (
                              <img src={k.after_image} alt="After" className="w-full h-24 object-cover rounded-md border border-line" />
                            ) : (
                              <div className="w-full h-24 rounded-md border border-line bg-surface-sunken flex items-center justify-center text-3xs text-ink-subtle">No Photo</div>
                            )}
                          </div>
                        )}

                        {/* Brief */}
                        <p className="text-xs text-ink-muted line-clamp-2 bg-surface-sunken p-2 rounded-lg border border-line">
                          {k.brief_description}
                        </p>
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

                        <Button
                          size="sm"
                          disabled={isCompleted}
                          onClick={() => handleMarkCompleted(k.id)}
                          className={`text-2xs h-7 gap-1 px-2.5 ${
                            isCompleted
                              ? 'bg-emerald-500/10 text-emerald-700 border border-emerald-300 hover:bg-emerald-50'
                              : 'bg-brand-strong text-white'
                          }`}
                        >
                          {isCompleted ? (
                            <>
                              <Check size={12} /> Completed
                            </>
                          ) : (
                            'Mark as Completed'
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Standard Pagination */}
            {totalStdItems > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-surface-raised p-3 rounded-xl border border-line text-xs text-ink-muted">
                <span>Showing {(validStdPage - 1) * stdPageSize + 1} to {Math.min(validStdPage * stdPageSize, totalStdItems)} of {totalStdItems} Kaizens</span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={validStdPage <= 1}
                    onClick={() => setStdCurrentPage(prev => Math.max(prev - 1, 1))}
                    className="h-8 px-2.5 text-xs"
                  >
                    <ChevronLeft size={14} /> Previous
                  </Button>
                  <span className="font-semibold text-ink-strong">Page {validStdPage} of {totalStdPages}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={validStdPage >= totalStdPages}
                    onClick={() => setStdCurrentPage(prev => Math.min(prev + 1, totalStdPages))}
                    className="h-8 px-2.5 text-xs"
                  >
                    Next <ChevronRight size={14} />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CaptureColumn>

      {/* Audit Trail Modal */}
      {auditModalOpen && selectedAuditKaizen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-surface-raised p-5 shadow-xl space-y-4 border border-line">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2">
                <History size={18} className="text-brand-strong" />
                <h3 className="font-semibold text-ink-strong text-sm">Audit Trail</h3>
              </div>
              <button onClick={() => setAuditModalOpen(false)} className="text-ink-subtle hover:text-ink-strong">
                <X size={16} />
              </button>
            </div>

            <p className="text-xs font-medium text-ink-strong">{selectedAuditKaizen.title}</p>

            <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
              {(kaizenAuditTrails[selectedAuditKaizen.id] || []).length === 0 ? (
                <p className="text-xs text-ink-subtle">No audit logs found.</p>
              ) : (
                (kaizenAuditTrails[selectedAuditKaizen.id] || []).map(log => (
                  <div key={log.id} className="text-2xs p-2.5 rounded-lg bg-surface-sunken border border-line space-y-1">
                    <div className="flex items-center justify-between text-ink-strong font-semibold">
                      <span>{log.action}</span>
                      <span className="text-ink-subtle font-normal">{new Date(log.timestamp).toLocaleString('en-IN')}</span>
                    </div>
                    <p className="text-ink-muted">Performed by: {log.performed_by}</p>
                  </div>
                ))
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
                  <h3 className="font-bold text-ink-strong text-base">Standard Kaizen Sheet</h3>
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
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs bg-surface-sunken p-3 rounded-xl border border-line">
              <div>
                <span className="text-3xs font-bold uppercase text-ink-subtle block">Result Area</span>
                <span className="font-semibold text-ink-strong">{AREA_LABEL[selectedKaizenSheet.result_area] || selectedKaizenSheet.result_area}</span>
              </div>
              <div>
                <span className="text-3xs font-bold uppercase text-ink-subtle block">Submitter</span>
                <span className="font-semibold text-ink-strong">{selectedKaizenSheet.submitter_name}</span>
              </div>
              <div>
                <span className="text-3xs font-bold uppercase text-ink-subtle block">Implementation Cost</span>
                <span className="font-semibold text-ink-strong">₹{(selectedKaizenSheet.cost_impl || 0).toLocaleString('en-IN')}</span>
              </div>
            </div>

            {/* Title & Brief */}
            <div>
              <h2 className="text-lg font-bold text-ink-strong mb-1">{selectedKaizenSheet.title}</h2>
              <p className="text-xs text-ink-muted leading-relaxed bg-surface-base p-3 rounded-lg border border-line">
                {selectedKaizenSheet.brief_description}
              </p>
            </div>

            {/* Problem & Solution */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3 rounded-xl bg-red-500/5 border border-red-200 space-y-1">
                <span className="font-bold text-red-900 block uppercase text-3xs">Problem Description</span>
                <p className="text-ink-strong leading-relaxed">{selectedKaizenSheet.problem_description || '—'}</p>
              </div>
              <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-200 space-y-1">
                <span className="font-bold text-emerald-900 block uppercase text-3xs">Solution & Benefit</span>
                <p className="text-ink-strong leading-relaxed">{selectedKaizenSheet.solution_description || selectedKaizenSheet.benefit_description || '—'}</p>
              </div>
            </div>

            {/* Before / After Images */}
            {(selectedKaizenSheet.before_image || selectedKaizenSheet.after_image) && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-2xs font-bold uppercase tracking-wider text-ink-subtle block mb-1">Before Condition</span>
                  {selectedKaizenSheet.before_image ? (
                    <img src={selectedKaizenSheet.before_image} alt="Before" className="w-full h-48 object-cover rounded-xl border border-line" />
                  ) : (
                    <div className="w-full h-48 rounded-xl border border-line bg-surface-sunken flex items-center justify-center text-xs text-ink-subtle">No Photo</div>
                  )}
                </div>
                <div>
                  <span className="text-2xs font-bold uppercase tracking-wider text-ink-subtle block mb-1">After Condition</span>
                  {selectedKaizenSheet.after_image ? (
                    <img src={selectedKaizenSheet.after_image} alt="After" className="w-full h-48 object-cover rounded-xl border border-line" />
                  ) : (
                    <div className="w-full h-48 rounded-xl border border-line bg-surface-sunken flex items-center justify-center text-xs text-ink-subtle">No Photo</div>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-3 border-t border-line">
              <Button size="sm" onClick={() => setSelectedKaizenSheet(null)} className="text-xs">Close Sheet</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
