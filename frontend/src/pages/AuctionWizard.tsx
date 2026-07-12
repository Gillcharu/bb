import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, ArrowRight, Save, CheckCircle,
  AlertTriangle, CheckCircle2, X
} from 'lucide-react';
import { useAuth } from '../providers/AuthProvider';
import { formatDateTime, isoToLocalInput, localInputToIso, currencySymbol } from '../utils/format';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

const STEP_LABELS = [
  'Auction Details',
  'Bid Rules',
  'Participants',
  'Bid Formula',
  'Approver',
  'Review Summary',
];

interface FieldErrors {
  [key: string]: string | undefined;
}

const AuctionWizard: React.FC = () => {
  const { id } = useParams(); // If editing
  const navigate = useNavigate();
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Available options loaded from backend settings
  const [vendorsList, setVendorsList] = useState<any[]>([]);
  const [approversList, setApproversList] = useState<any[]>([]);

  // Toasts
  const [toasts, setToasts] = useState<{ id: number; message: string; type: 'success' | 'error' }[]>([]);
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    const toastId = Date.now();
    setToasts(prev => [...prev, { id: toastId, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== toastId));
    }, 4000);
  };

  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const [formData, setFormData] = useState<any>({
    title: '',
    description: '',
    startAt: '', // local datetime-local value
    endAt: '',   // local datetime-local value
    approverId: '',
    state: '',
    baseCurrency: 'INR',
    // Rules Snapshot
    conversionRate: 1.0,
    loadingPercent: 0.0,
    fixedLoading: 0.0,
    minDecrement: 100.0,
    auctionType: 'REVERSE',
    overtimeEnabled: true,
    overtimeWindowMins: 3,
    overtimeExtensionMins: 5,
    overtimeTriggerRank: 'RANK_1',
    maxExtensions: '' as string | number,
    rankVisibility: 'OWN_RANK_ONLY',
    vendorParticipants: [] as string[],
  });

  // Load wizard presets
  useEffect(() => {
    const loadWizardPresets = async () => {
      try {
        const [vRes, aRes] = await Promise.all([
          axios.get(`${API_URL}/settings/vendors`),
          axios.get(`${API_URL}/settings/users`),
        ]);
        setVendorsList(vRes.data.data || []);
        const approvers = (aRes.data.data || []).filter((u: any) => u.role === 'APPROVER' || u.role === 'SYSTEM_ADMIN');
        setApproversList(approvers);
      } catch (err: any) {
        showToast(err.response?.data?.error?.message || 'Failed to load configuration presets', 'error');
      }
    };
    loadWizardPresets();
  }, []);

  // Fetch auction details if editing
  useEffect(() => {
    if (!id) return;
    const fetchAuctionDetails = async () => {
      setLoading(true);
      try {
        const res = await axios.get(`${API_URL}/auctions/${id}`);
        const auction = res.data.data;
        const rule = auction.bidRuleSnapshot || {};

        setFormData({
          title: auction.title || '',
          description: auction.description || '',
          startAt: isoToLocalInput(auction.startAt),
          endAt: isoToLocalInput(auction.endAt),
          approverId: auction.approverId || '',
          state: '',
          baseCurrency: auction.baseCurrency || 'INR',
          conversionRate: Number(rule.conversionRate ?? 1.0),
          loadingPercent: Number(rule.loadingPercent ?? 0.0),
          fixedLoading: Number(rule.fixedLoading ?? 0.0),
          minDecrement: Number(rule.minDecrement ?? 100.0),
          auctionType: rule.auctionType || 'REVERSE',
          overtimeEnabled: rule.overtimeEnabled !== false,
          overtimeWindowMins: Number(rule.overtimeWindowMins ?? 3),
          overtimeExtensionMins: Number(rule.overtimeExtensionMins ?? 5),
          overtimeTriggerRank: rule.overtimeTriggerRank || 'RANK_1',
          maxExtensions: rule.maxExtensions ?? '',
          rankVisibility: rule.rankVisibility || 'OWN_RANK_ONLY',
          vendorParticipants: auction.participants?.map((p: any) => p.vendorId) || [],
        });
      } catch (err: any) {
        showToast(err.response?.data?.error?.message || 'Failed to load auction parameters', 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchAuctionDetails();
  }, [id]);

  const updateField = (field: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: undefined }));
  };

  // -- Validation -------------------------------------------------------------
  const validateStep = (step: number): FieldErrors => {
    const errs: FieldErrors = {};

    if (step === 1) {
      if (!formData.title || formData.title.trim().length < 3) {
        errs.title = 'Title is required (at least 3 characters).';
      } else if (formData.title.trim().length > 150) {
        errs.title = 'Title must be 150 characters or fewer.';
      }
      if (formData.description && formData.description.length > 2000) {
        errs.description = 'Description must be 2000 characters or fewer.';
      }
      if (!formData.startAt) {
        errs.startAt = 'Start date & time is required.';
      }
      if (!formData.endAt) {
        errs.endAt = 'End date & time is required.';
      }
      if (formData.startAt && formData.endAt) {
        const start = new Date(formData.startAt).getTime();
        const end = new Date(formData.endAt).getTime();
        if (end <= start) {
          errs.endAt = 'End time must be after the start time.';
        } else if (end - start < 5 * 60 * 1000) {
          errs.endAt = 'The auction must run for at least 5 minutes.';
        }
        if (start <= Date.now()) {
          errs.startAt = 'Start time must be in the future.';
        }
      }
    }

    if (step === 2) {
      if (!(Number(formData.minDecrement) > 0)) {
        errs.minDecrement = 'Must be a positive amount.';
      }
      if (!(Number(formData.conversionRate) > 0)) {
        errs.conversionRate = 'Must be a positive number.';
      }
      if (formData.overtimeEnabled) {
        if (!(Number.isInteger(Number(formData.overtimeWindowMins)) && Number(formData.overtimeWindowMins) >= 1)) {
          errs.overtimeWindowMins = 'Enter a whole number of minutes (min 1).';
        }
        if (!(Number.isInteger(Number(formData.overtimeExtensionMins)) && Number(formData.overtimeExtensionMins) >= 1)) {
          errs.overtimeExtensionMins = 'Enter a whole number of minutes (min 1).';
        }
        if (formData.maxExtensions !== '' && !(Number.isInteger(Number(formData.maxExtensions)) && Number(formData.maxExtensions) >= 1)) {
          errs.maxExtensions = 'Leave empty for unlimited, or enter a whole number ≥ 1.';
        }
      }
    }

    if (step === 3) {
      if (formData.vendorParticipants.length === 0) {
        errs.vendorParticipants = 'Select at least one vendor to invite.';
      }
    }

    if (step === 4) {
      if (Number(formData.loadingPercent) < 0 || Number(formData.loadingPercent) > 100) {
        errs.loadingPercent = 'Loading percent must be between 0 and 100.';
      }
      if (Number(formData.fixedLoading) < 0) {
        errs.fixedLoading = 'Fixed loading cannot be negative.';
      }
    }

    if (step === 5) {
      if (!formData.approverId) {
        errs.approverId = 'An approving supervisor is required before submission.';
      }
    }

    return errs;
  };

  const validateAll = (): boolean => {
    let all: FieldErrors = {};
    for (let s = 1; s <= 5; s++) {
      all = { ...validateStep(s), ...all };
    }
    setErrors(all);
    const firstBad = Object.keys(all).find(k => all[k]);
    if (firstBad) {
      const stepForField: Record<string, number> = {
        title: 1, description: 1, startAt: 1, endAt: 1,
        minDecrement: 2, conversionRate: 2, overtimeWindowMins: 2, overtimeExtensionMins: 2, maxExtensions: 2,
        vendorParticipants: 3,
        loadingPercent: 4, fixedLoading: 4,
        approverId: 5,
      };
      setCurrentStep(stepForField[firstBad] || 1);
      return false;
    }
    return true;
  };

  // -- Persistence ------------------------------------------------------------
  const buildPayload = () => {
    const payload: any = {
      title: formData.title.trim(),
      description: formData.description || '',
      startAt: localInputToIso(formData.startAt),
      endAt: localInputToIso(formData.endAt),
      approverId: formData.approverId || null,
      baseCurrency: formData.baseCurrency,
      conversionRate: Number(formData.conversionRate),
      loadingPercent: Number(formData.loadingPercent),
      fixedLoading: Number(formData.fixedLoading),
      minDecrement: Number(formData.minDecrement),
      auctionType: formData.auctionType,
      overtimeEnabled: !!formData.overtimeEnabled,
      overtimeWindowMins: Number(formData.overtimeWindowMins),
      overtimeExtensionMins: Number(formData.overtimeExtensionMins),
      overtimeTriggerRank: formData.overtimeTriggerRank,
      maxExtensions: formData.maxExtensions === '' ? null : Number(formData.maxExtensions),
      rankVisibility: formData.rankVisibility,
      participantVendorIds: formData.vendorParticipants,
    };
    // Only system admins may force a state override, and only when explicitly chosen.
    if (user?.role === 'SYSTEM_ADMIN' && formData.state) {
      payload.state = formData.state;
    }
    return payload;
  };

  const handleSaveDraft = async () => {
    if (!formData.title || formData.title.trim().length < 3) {
      setErrors(prev => ({ ...prev, title: 'Title is required (at least 3 characters) to save a draft.' }));
      setCurrentStep(1);
      return;
    }
    setSaving(true);
    try {
      if (id) {
        await axios.patch(`${API_URL}/auctions/${id}`, buildPayload());
        showToast('Draft saved successfully!');
      } else {
        const createRes = await axios.post(`${API_URL}/auctions`, {
          title: formData.title.trim(),
          description: formData.description,
        });
        const newId = createRes.data.data.id;
        await axios.patch(`${API_URL}/auctions/${newId}`, buildPayload());
        showToast('Draft saved successfully!');
        navigate(`/auctions/${newId}/edit`, { replace: true });
      }
    } catch (err: any) {
      showToast(err.response?.data?.error?.message || 'Failed to save draft details', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleNext = () => {
    const stepErrs = validateStep(currentStep);
    setErrors(stepErrs);
    if (Object.keys(stepErrs).some(k => stepErrs[k])) return;
    if (currentStep < STEP_LABELS.length) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleSubmit = async () => {
    if (!validateAll()) {
      showToast('Please fix the highlighted fields before submitting.', 'error');
      return;
    }
    setSaving(true);
    try {
      let targetId = id;
      if (!targetId) {
        const createRes = await axios.post(`${API_URL}/auctions`, {
          title: formData.title.trim(),
          description: formData.description,
        });
        targetId = createRes.data.data.id;
      }

      await axios.patch(`${API_URL}/auctions/${targetId}`, buildPayload());
      await axios.post(`${API_URL}/auctions/${targetId}/submit-for-approval`);
      showToast('Auction submitted successfully to the approvals queue!');
      navigate(`/auctions/${targetId}`);
    } catch (err: any) {
      showToast(err.response?.data?.error?.message || 'Submission failed. Review the configuration.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Formula preview — identical to the server-side calculation:
  // (amount × conversionRate) + fixedLoading + (amount × loading% / 100)
  const calculatedPreview = () => {
    const base = 10000;
    const rate = Number(formData.conversionRate) || 0;
    const loadP = Number(formData.loadingPercent) || 0;
    const fixed = Number(formData.fixedLoading) || 0;
    return base * rate + fixed + (base * loadP) / 100;
  };

  const calc = calculatedPreview();
  const currency = currencySymbol(formData.baseCurrency);

  const inputClass = (field: string) =>
    `w-full border rounded-xl p-3 text-xs bg-white dark:bg-slate-950 focus:outline-none focus:ring-1 text-neutral-800 dark:text-neutral-200 ${
      errors[field]
        ? 'border-red-400 focus:ring-red-500'
        : 'border-neutral-200 dark:border-slate-800 focus:ring-indigo-600'
    }`;

  const FieldError: React.FC<{ field: string }> = ({ field }) =>
    errors[field] ? (
      <p className="text-[10px] text-red-500 font-semibold mt-1" role="alert">{errors[field]}</p>
    ) : null;

  if (loading) {
    return (
      <div className="flex h-full min-h-[calc(100vh-4rem)] bg-slate-50/50 dark:bg-slate-950/20 animate-pulse p-8 justify-center items-center" role="status" aria-label="Loading auction configuration">
        <div className="bg-white dark:bg-slate-900 border border-neutral-200 dark:border-slate-800 rounded-2xl p-8 max-w-lg w-full space-y-6">
          <div className="h-6 w-1/3 bg-neutral-200 dark:bg-slate-800 rounded"></div>
          <div className="space-y-3">
            <div className="h-4 w-3/4 bg-neutral-200 dark:bg-slate-800 rounded"></div>
            <div className="h-4 w-full bg-neutral-200 dark:bg-slate-800 rounded"></div>
            <div className="h-4 w-5/6 bg-neutral-200 dark:bg-slate-800 rounded"></div>
          </div>
          <div className="h-10 bg-neutral-200 dark:bg-slate-800 rounded-xl"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[calc(100vh-4rem)] bg-slate-50/50 dark:bg-slate-950/20 relative">
      {/* Sidebar steppers */}
      <aside className="w-64 border-r border-neutral-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 hidden lg:block space-y-6">
        <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Configuration</h3>
        <div className="space-y-1">
          {STEP_LABELS.map((label, index) => {
            const stepNum = index + 1;
            const isActive = currentStep === stepNum;
            const isCompleted = currentStep > stepNum;
            return (
              <button
                key={stepNum}
                onClick={() => setCurrentStep(stepNum)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs font-semibold transition cursor-pointer ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/25 dark:text-indigo-400 font-bold'
                    : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-slate-800/60'
                }`}
              >
                <span className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] border ${
                  isActive
                    ? 'border-indigo-600 bg-indigo-600 text-white'
                    : isCompleted
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600'
                    : 'border-neutral-300 dark:border-slate-700'
                }`} aria-hidden="true">
                  {isCompleted ? '✓' : stepNum}
                </span>
                {label}
              </button>
            );
          })}
        </div>
      </aside>

      {/* Main Form content */}
      <div className="flex-1 flex flex-col justify-between">
        <div className="p-8 max-w-3xl w-full mx-auto space-y-6">
          <div className="border-b border-neutral-200 dark:border-slate-800 pb-3">
            <h2 className="text-base font-bold text-neutral-900 dark:text-white font-sans">{STEP_LABELS[currentStep - 1]}</h2>
            <p className="text-xs text-neutral-500 mt-1">Step {currentStep} of {STEP_LABELS.length}</p>
          </div>

          {/* Step 1: Details */}
          {currentStep === 1 && (
            <div className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label htmlFor="wz-title" className="block text-xs font-bold uppercase tracking-wider text-neutral-500">Auction Title *</label>
                <input
                  id="wz-title"
                  type="text"
                  placeholder="Enter auction title (e.g. Copper cathodes supply)"
                  value={formData.title}
                  onChange={(e) => updateField('title', e.target.value)}
                  maxLength={150}
                  className={inputClass('title')}
                />
                <FieldError field="title" />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="wz-desc" className="block text-xs font-bold uppercase tracking-wider text-neutral-500">Description</label>
                <textarea
                  id="wz-desc"
                  rows={4}
                  placeholder="Provide scope description details..."
                  value={formData.description}
                  onChange={(e) => updateField('description', e.target.value)}
                  maxLength={2000}
                  className={inputClass('description')}
                />
                <FieldError field="description" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="wz-start" className="block text-xs font-bold uppercase tracking-wider text-neutral-500">
                    Start Date & Time * <span className="normal-case font-medium">(your local time)</span>
                  </label>
                  <input
                    id="wz-start"
                    type="datetime-local"
                    value={formData.startAt}
                    onChange={(e) => updateField('startAt', e.target.value)}
                    className={inputClass('startAt')}
                  />
                  <FieldError field="startAt" />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="wz-end" className="block text-xs font-bold uppercase tracking-wider text-neutral-500">
                    End Date & Time * <span className="normal-case font-medium">(your local time)</span>
                  </label>
                  <input
                    id="wz-end"
                    type="datetime-local"
                    value={formData.endAt}
                    onChange={(e) => updateField('endAt', e.target.value)}
                    className={inputClass('endAt')}
                  />
                  <FieldError field="endAt" />
                </div>
              </div>
              <div className="space-y-1.5 max-w-[12rem]">
                <label htmlFor="wz-currency" className="block text-xs font-bold uppercase tracking-wider text-neutral-500">Base Currency</label>
                <select
                  id="wz-currency"
                  value={formData.baseCurrency}
                  onChange={(e) => updateField('baseCurrency', e.target.value)}
                  className={`${inputClass('baseCurrency')} cursor-pointer`}
                >
                  <option value="INR">INR (₹)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                </select>
              </div>
            </div>
          )}

          {/* Step 2: Bid Rules */}
          {currentStep === 2 && (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="wz-type" className="block text-xs font-bold uppercase tracking-wider text-neutral-500">Auction Type</label>
                  <select
                    id="wz-type"
                    value={formData.auctionType}
                    onChange={(e) => updateField('auctionType', e.target.value)}
                    className={`${inputClass('auctionType')} cursor-pointer font-semibold`}
                  >
                    <option value="REVERSE">REVERSE (Procurement)</option>
                    <option value="FORWARD">FORWARD (Sales / Bidding)</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="wz-rate" className="block text-xs font-bold uppercase tracking-wider text-neutral-500">Conversion Rate *</label>
                  <input
                    id="wz-rate"
                    type="number"
                    step="0.0001"
                    min="0"
                    value={formData.conversionRate}
                    onChange={(e) => updateField('conversionRate', e.target.value)}
                    className={inputClass('conversionRate')}
                  />
                  <FieldError field="conversionRate" />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="wz-step" className="block text-xs font-bold uppercase tracking-wider text-neutral-500">
                    {formData.auctionType === 'FORWARD' ? `Min Increment (${currency})` : `Min Decrement (${currency})`} *
                  </label>
                  <input
                    id="wz-step"
                    type="number"
                    min="0"
                    step="any"
                    value={formData.minDecrement}
                    onChange={(e) => updateField('minDecrement', e.target.value)}
                    className={inputClass('minDecrement')}
                  />
                  <FieldError field="minDecrement" />
                </div>
              </div>

              <div className="border border-neutral-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <label htmlFor="wz-ot" className="font-semibold text-neutral-800 dark:text-neutral-200 cursor-pointer">
                    Overtime Trigger Auto-Extension (anti-sniping)
                  </label>
                  <input
                    id="wz-ot"
                    type="checkbox"
                    checked={formData.overtimeEnabled}
                    onChange={(e) => updateField('overtimeEnabled', e.target.checked)}
                    className="h-4 w-4 text-indigo-600 rounded focus:ring-indigo-600 cursor-pointer"
                  />
                </div>

                {formData.overtimeEnabled && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-neutral-100 dark:border-slate-800">
                    <div className="space-y-1">
                      <label htmlFor="wz-otw" className="block text-[10px] font-bold text-neutral-400 uppercase">Trigger Window (min before end)</label>
                      <input
                        id="wz-otw"
                        type="number"
                        min="1"
                        value={formData.overtimeWindowMins}
                        onChange={(e) => updateField('overtimeWindowMins', e.target.value)}
                        className={inputClass('overtimeWindowMins')}
                      />
                      <FieldError field="overtimeWindowMins" />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="wz-ote" className="block text-[10px] font-bold text-neutral-400 uppercase">Extension Duration (minutes)</label>
                      <input
                        id="wz-ote"
                        type="number"
                        min="1"
                        value={formData.overtimeExtensionMins}
                        onChange={(e) => updateField('overtimeExtensionMins', e.target.value)}
                        className={inputClass('overtimeExtensionMins')}
                      />
                      <FieldError field="overtimeExtensionMins" />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="wz-otm" className="block text-[10px] font-bold text-neutral-400 uppercase">Max Extensions (empty = unlimited)</label>
                      <input
                        id="wz-otm"
                        type="number"
                        min="1"
                        placeholder="Unlimited"
                        value={formData.maxExtensions}
                        onChange={(e) => updateField('maxExtensions', e.target.value)}
                        className={inputClass('maxExtensions')}
                      />
                      <FieldError field="maxExtensions" />
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-1.5 max-w-[16rem]">
                <label htmlFor="wz-vis" className="block text-xs font-bold uppercase tracking-wider text-neutral-500">Vendor Rank Visibility</label>
                <select
                  id="wz-vis"
                  value={formData.rankVisibility}
                  onChange={(e) => updateField('rankVisibility', e.target.value)}
                  className={`${inputClass('rankVisibility')} cursor-pointer`}
                >
                  <option value="OWN_RANK_ONLY">Own rank only (blind)</option>
                  <option value="FULL_LEADERBOARD">Full leaderboard</option>
                </select>
              </div>
            </div>
          )}

          {/* Step 3: Participants */}
          {currentStep === 3 && (
            <div className="space-y-4 text-xs">
              <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500">Map Invited Vendors *</label>
              <FieldError field="vendorParticipants" />
              {vendorsList.length === 0 ? (
                <div className="p-6 text-center border border-dashed border-neutral-300 dark:border-slate-800 rounded-xl text-neutral-400">
                  No vendors in your directory yet. Add suppliers in Settings → Vendor Directory first.
                </div>
              ) : (
                <div className="border border-neutral-200 dark:border-slate-800 rounded-xl divide-y divide-neutral-200 dark:divide-slate-800 max-h-60 overflow-y-auto bg-white dark:bg-slate-950">
                  {vendorsList.map(vendor => {
                    const isChecked = formData.vendorParticipants.includes(vendor.id);
                    return (
                      <label key={vendor.id} className="p-3 flex items-center justify-between cursor-pointer hover:bg-slate-50/50 dark:hover:bg-slate-900/40">
                        <div>
                          <p className="font-bold text-neutral-800 dark:text-neutral-200">{vendor.name}</p>
                          <p className="text-[10px] text-neutral-500 font-mono">{vendor.email}</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            const updated = isChecked
                              ? formData.vendorParticipants.filter((vid: string) => vid !== vendor.id)
                              : [...formData.vendorParticipants, vendor.id];
                            updateField('vendorParticipants', updated);
                          }}
                          className="h-4 w-4 text-indigo-600 rounded focus:ring-indigo-600 cursor-pointer"
                          aria-label={`Invite ${vendor.name}`}
                        />
                      </label>
                    );
                  })}
                </div>
              )}
              <p className="text-neutral-500">{formData.vendorParticipants.length} vendor(s) selected.</p>
            </div>
          )}

          {/* Step 4: Bid Formula */}
          {currentStep === 4 && (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="wz-fixed" className="block text-xs font-bold uppercase tracking-wider text-neutral-500">Fixed Loading ({currency})</label>
                  <input
                    id="wz-fixed"
                    type="number"
                    min="0"
                    step="any"
                    value={formData.fixedLoading}
                    onChange={(e) => updateField('fixedLoading', e.target.value)}
                    className={inputClass('fixedLoading')}
                  />
                  <FieldError field="fixedLoading" />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="wz-loadp" className="block text-xs font-bold uppercase tracking-wider text-neutral-500">Loading Percent (%)</label>
                  <input
                    id="wz-loadp"
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    value={formData.loadingPercent}
                    onChange={(e) => updateField('loadingPercent', e.target.value)}
                    className={inputClass('loadingPercent')}
                  />
                  <FieldError field="loadingPercent" />
                </div>
              </div>

              <div className="bg-neutral-50/50 dark:bg-slate-900 border border-neutral-200 dark:border-slate-800 rounded-2xl p-5 space-y-2">
                <h4 className="font-bold text-neutral-900 dark:text-white">Commercial Bid Formula Preview</h4>
                <p className="text-neutral-500">
                  Formula: <code className="bg-neutral-100 dark:bg-slate-950 px-1 py-0.5 rounded">(Bid × Conversion) + Fixed Loading + (Bid × Loading% / 100)</code>
                </p>
                <div className="border-t border-dashed border-neutral-200 dark:border-slate-800 pt-3 flex justify-between items-center text-xs">
                  <span>Example bid of {currency}10,000</span>
                  <span className="font-bold text-indigo-600 dark:text-indigo-400">Effective Total: {currency}{calc.toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}

          {/* Step 5: Approver */}
          {currentStep === 5 && (
            <div className="space-y-4 text-xs">
              <label htmlFor="wz-approver" className="block text-xs font-bold uppercase tracking-wider text-neutral-500">Assign Approving Supervisor *</label>
              <select
                id="wz-approver"
                value={formData.approverId}
                onChange={(e) => updateField('approverId', e.target.value)}
                className={`${inputClass('approverId')} cursor-pointer`}
              >
                <option value="">-- Select an approver --</option>
                {approversList.map(u => (
                  <option key={u.id} value={u.id}>{u.email} ({u.role.replace('_', ' ')})</option>
                ))}
              </select>
              <FieldError field="approverId" />
              {approversList.length === 0 && (
                <p className="text-neutral-500 italic">
                  No approver accounts exist yet. Create one in Settings → Users & RBAC first.
                </p>
              )}
            </div>
          )}

          {/* Step 6: Review */}
          {currentStep === 6 && (
            <div className="space-y-4 text-xs leading-relaxed">
              <h4 className="font-bold text-neutral-900 dark:text-white text-sm">Verify Auction Configuration</h4>
              <div className="border border-neutral-200 dark:border-slate-800 rounded-2xl p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-0.5">
                  <span className="text-[10px] font-bold text-neutral-400 uppercase">Auction Title</span>
                  <p className="font-semibold text-neutral-800 dark:text-neutral-200">{formData.title || 'Untitled'}</p>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] font-bold text-neutral-400 uppercase">Type</span>
                  <p className="font-semibold text-neutral-800 dark:text-neutral-200">{formData.auctionType}</p>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] font-bold text-neutral-400 uppercase">Start Schedule</span>
                  <p className="font-semibold text-neutral-800 dark:text-neutral-200">
                    {formData.startAt ? formatDateTime(new Date(formData.startAt)) : 'Not scheduled'}
                  </p>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] font-bold text-neutral-400 uppercase">End Schedule</span>
                  <p className="font-semibold text-neutral-800 dark:text-neutral-200">
                    {formData.endAt ? formatDateTime(new Date(formData.endAt)) : 'Not scheduled'}
                  </p>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] font-bold text-neutral-400 uppercase">Invited Suppliers</span>
                  <p className="font-semibold text-neutral-800 dark:text-neutral-200">{formData.vendorParticipants.length} supplier(s)</p>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] font-bold text-neutral-400 uppercase">
                    {formData.auctionType === 'FORWARD' ? 'Min Increment' : 'Min Decrement'}
                  </span>
                  <p className="font-semibold text-neutral-800 dark:text-neutral-200">{currency}{Number(formData.minDecrement).toLocaleString()}</p>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] font-bold text-neutral-400 uppercase">Overtime</span>
                  <p className="font-semibold text-neutral-800 dark:text-neutral-200">
                    {formData.overtimeEnabled
                      ? `${formData.overtimeWindowMins} min window / +${formData.overtimeExtensionMins} min${formData.maxExtensions !== '' ? ` (max ${formData.maxExtensions})` : ' (unlimited)'}`
                      : 'Disabled'}
                  </p>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] font-bold text-neutral-400 uppercase">Approver</span>
                  <p className="font-semibold text-neutral-800 dark:text-neutral-200">
                    {approversList.find(a => a.id === formData.approverId)?.email || 'Not assigned'}
                  </p>
                </div>
              </div>

              {user && user.role === 'SYSTEM_ADMIN' && (
                <div className="border border-indigo-100 dark:border-indigo-950 bg-indigo-50/10 p-4 rounded-2xl space-y-2 mt-4">
                  <label htmlFor="wz-state" className="block text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Administrative State Override</label>
                  <p className="text-[10px] text-neutral-500 mb-1">Optional: force this auction into a specific phase. Leave unset for the normal approval workflow.</p>
                  <select
                    id="wz-state"
                    value={formData.state}
                    onChange={(e) => updateField('state', e.target.value)}
                    className={`${inputClass('state')} cursor-pointer font-semibold`}
                  >
                    <option value="">No override (recommended)</option>
                    <option value="DRAFT">DRAFT</option>
                    <option value="PENDING_APPROVAL">PENDING_APPROVAL</option>
                    <option value="APPROVED">APPROVED</option>
                    <option value="PUBLISHED">PUBLISHED (Upcoming / Lobby)</option>
                    <option value="LIVE">LIVE (Active console)</option>
                    <option value="OVERTIME">OVERTIME (Active console)</option>
                    <option value="COMPLETED">COMPLETED (Closed)</option>
                    <option value="CANCELLED">CANCELLED</option>
                  </select>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Navigation bottom bar */}
        <div className="border-t border-neutral-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-4 px-8 flex justify-between items-center">
          <button
            onClick={handleBack}
            disabled={currentStep === 1}
            className="flex items-center gap-1.5 px-4 py-2 border border-neutral-200 dark:border-slate-800 disabled:opacity-40 hover:bg-neutral-100 dark:hover:bg-slate-800 rounded-xl text-xs font-semibold transition cursor-pointer disabled:cursor-not-allowed"
          >
            <ArrowLeft size={13} aria-hidden="true" />
            Back
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveDraft}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-950/20 dark:text-indigo-400 rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-50"
            >
              <Save size={13} aria-hidden="true" />
              {saving ? 'Saving...' : 'Save Draft'}
            </button>

            {currentStep < STEP_LABELS.length ? (
              <button
                onClick={handleNext}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold cursor-pointer"
              >
                Next
                <ArrowRight size={13} aria-hidden="true" />
              </button>
            ) : (
              <button
                onClick={() => {
                  if (validateAll()) setShowConfirmSubmit(true);
                  else showToast('Please fix the highlighted fields before submitting.', 'error');
                }}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-emerald-600/15 cursor-pointer disabled:opacity-50"
              >
                <CheckCircle size={13} aria-hidden="true" />
                {saving ? 'Submitting...' : 'Submit for Approval'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Dialog Overlay */}
      {showConfirmSubmit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
          <div className="bg-white dark:bg-slate-900 border border-neutral-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
                <AlertTriangle size={20} aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-neutral-900 dark:text-white font-sans">Submit for Approval</h3>
                <p className="text-xs text-neutral-500 leading-relaxed">
                  Lock the configuration and submit this e-auction to the supervisor approvals queue?
                </p>
              </div>
            </div>

            <div className="flex gap-2.5 justify-end pt-2">
              <button
                onClick={() => setShowConfirmSubmit(false)}
                className="px-4 py-2 border border-neutral-200 dark:border-slate-800 rounded-xl text-xs font-semibold hover:bg-neutral-100 dark:hover:bg-slate-800 text-neutral-600 dark:text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowConfirmSubmit(false);
                  handleSubmit();
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold cursor-pointer"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toasts */}
      <div className="fixed top-6 right-6 z-50 flex flex-col gap-2.5 max-w-sm pointer-events-none" aria-live="polite">
        {toasts.map(toast => (
          <div
            key={toast.id}
            role="alert"
            className={`pointer-events-auto p-4 rounded-xl border shadow-xl flex items-center justify-between gap-3 transition-all duration-300 ${
              toast.type === 'error'
                ? 'bg-red-500/10 border-red-500/25 text-red-500'
                : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-500'
            }`}
          >
            <div className="flex items-center gap-2">
              {toast.type === 'error' ? <AlertTriangle size={16} aria-hidden="true" /> : <CheckCircle2 size={16} aria-hidden="true" />}
              <span className="text-xs font-semibold leading-relaxed font-sans">{toast.message}</span>
            </div>
            <button
              onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
              aria-label="Dismiss notification"
              className="text-neutral-400 hover:text-neutral-600 dark:hover:text-white transition cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AuctionWizard;
