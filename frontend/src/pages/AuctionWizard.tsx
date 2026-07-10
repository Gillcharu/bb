import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { 
  ArrowLeft, ArrowRight, Save, CheckCircle, 
  Users, DollarSign, FileText, Lock, Plus, Trash2, AlertTriangle, CheckCircle2, X
} from 'lucide-react';
import { useAuth } from '../providers/AuthProvider';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

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

  // Custom Toast state
  const [toasts, setToasts] = useState<{ id: number; message: string; type: 'success' | 'error' }[]>([]);
  
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  // Custom Confirmation Dialog state
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);

  // State to hold entire wizard payload
  const [formData, setFormData] = useState<any>({
    title: '',
    description: '',
    startAt: '',
    endAt: '',
    approverId: '',
    state: '',
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
    rankVisibility: 'RANK_ONLY',
    // Team & Observers
    teamUsers: [], // ids
    observerUsers: [], // ids
    // Selected vendors list
    vendorParticipants: [], // ids
    // Templates
    termsTemplateId: '',
    disclosureTemplateId: '',
  });

  // Load wizard presets
  useEffect(() => {
    const loadWizardPresets = async () => {
      try {
        const [vRes, aRes] = await Promise.all([
          axios.get(`${API_URL}/settings/vendors`),
          axios.get(`${API_URL}/settings/users`),
        ]);
        setVendorsList(vRes.data.data);
        const approvers = (aRes.data.data || []).filter((u: any) => u.role === 'APPROVER' || u.role === 'SYSTEM_ADMIN');
        setApproversList(approvers);
      } catch (err) {
        console.error('Failed to load presets:', err);
        showToast('Failed to load configuration presets', 'error');
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
          title: auction.title,
          description: auction.description || '',
          startAt: auction.startAt ? new Date(auction.startAt).toISOString().slice(0, 16) : '',
          endAt: auction.endAt ? new Date(auction.endAt).toISOString().slice(0, 16) : '',
          approverId: auction.approverId || '',
          state: auction.state || '',
          conversionRate: rule.conversionRate || 1.0,
          loadingPercent: rule.loadingPercent || 0.0,
          fixedLoading: rule.fixedLoading || 0.0,
          minDecrement: rule.minDecrement || 100.0,
          auctionType: rule.auctionType || 'REVERSE',
          overtimeEnabled: rule.overtimeEnabled !== false,
          overtimeWindowMins: rule.overtimeWindowMins || 3,
          overtimeExtensionMins: rule.overtimeExtensionMins || 5,
          overtimeTriggerRank: rule.overtimeTriggerRank || 'RANK_1',
          rankVisibility: rule.rankVisibility || 'RANK_ONLY',
          teamUsers: auction.teamUsers || [],
          observerUsers: auction.observerUsers || [],
          vendorParticipants: auction.participants?.map((p: any) => p.vendorId) || [],
          termsTemplateId: auction.termsTemplateId || '',
          disclosureTemplateId: auction.disclosureTemplateId || '',
        });
      } catch (err) {
        console.error('Failed to load details:', err);
        showToast('Failed to load auction parameters', 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchAuctionDetails();
  }, [id]);

  const updateField = (field: string, value: any) => {
    setFormData((prev: any) => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      if (id) {
        await axios.patch(`${API_URL}/auctions/${id}`, formData);
      } else {
        const createRes = await axios.post(`${API_URL}/auctions`, {
          title: formData.title || 'Untitled Auction',
          description: formData.description,
        });
        const newId = createRes.data.data.id;
        await axios.patch(`${API_URL}/auctions/${newId}`, formData);
        navigate(`/auctions/${newId}/edit`);
      }
      showToast('Draft saved successfully!');
    } catch (err) {
      console.error('Failed to save draft:', err);
      showToast('Failed to save draft details', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleNext = () => {
    if (currentStep < 9) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      let targetId = id;
      if (!targetId) {
        const createRes = await axios.post(`${API_URL}/auctions`, {
          title: formData.title,
          description: formData.description,
        });
        targetId = createRes.data.data.id;
      }

      await axios.patch(`${API_URL}/auctions/${targetId}`, formData);
      await axios.post(`${API_URL}/auctions/${targetId}/submit-for-approval`);
      showToast('Auction submitted successfully to approvals queue!');
      navigate(`/auctions/${targetId}`);
    } catch (err: any) {
      console.error('Failed to submit:', err);
      showToast(err.response?.data?.message || 'Verification failed. Review parameters.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const calculatedPreview = () => {
    const base = 10000;
    const rate = Number(formData.conversionRate);
    const loadP = Number(formData.loadingPercent);
    const fixed = Number(formData.fixedLoading);
    const rawVal = base * rate;
    const calculated = rawVal + fixed + (rawVal * loadP / 100);
    return calculated;
  };

  const calc = calculatedPreview();

  const stepLabels = [
    'Auction Details',
    'Bid Rules',
    'Team & Observers',
    'Participants',
    'Bid Formula',
    'Terms & Conditions',
    'Disclosures',
    'Approvers',
    'Review Summary',
  ];

  if (loading) {
    /* Loading Skeletons */
    return (
      <div className="flex h-full min-h-[calc(100vh-4rem)] bg-slate-50/50 dark:bg-slate-950/20 animate-pulse p-8 justify-center items-center">
        <div className="bg-white dark:bg-slate-900 border border-neutral-200 dark:border-slate-800 rounded-2xl p-8 max-w-lg w-full space-y-6">
          <div className="h-6 w-1/3 bg-neutral-200 dark:bg-slate-800 rounded"></div>
          <div className="space-y-3">
            <div className="h-4.5 w-3/4 bg-neutral-200 dark:bg-slate-800 rounded"></div>
            <div className="h-4.5 w-full bg-neutral-200 dark:bg-slate-800 rounded"></div>
            <div className="h-4.5 w-5/6 bg-neutral-200 dark:bg-slate-800 rounded"></div>
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
          {stepLabels.map((label, index) => {
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
                }`}>
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
            <h2 className="text-base font-bold text-neutral-900 dark:text-white font-sans">{stepLabels[currentStep - 1]}</h2>
            <p className="text-xs text-neutral-500 mt-1">Step {currentStep} of 9 • Formulate parameters for compliance gating.</p>
          </div>

          {/* Wizard Panels */}
          {currentStep === 1 && (
            <div className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500">Auction Title</label>
                <input
                  type="text"
                  placeholder="Enter auction title (e.g. Copper cathodes supply)"
                  value={formData.title}
                  onChange={(e) => updateField('title', e.target.value)}
                  className="w-full border border-neutral-200 dark:border-slate-800 rounded-xl p-3 text-xs bg-white dark:bg-slate-950 focus:outline-none focus:ring-1 focus:ring-indigo-605 text-neutral-800 dark:text-neutral-200"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500">Description</label>
                <textarea
                  rows={4}
                  placeholder="Provide scope description details..."
                  value={formData.description}
                  onChange={(e) => updateField('description', e.target.value)}
                  className="w-full border border-neutral-200 dark:border-slate-800 rounded-xl p-3 text-xs bg-white dark:bg-slate-950 focus:outline-none focus:ring-1 focus:ring-indigo-605 text-neutral-800 dark:text-neutral-200"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500">Start Date & Time</label>
                  <input
                    type="datetime-local"
                    value={formData.startAt}
                    onChange={(e) => updateField('startAt', e.target.value)}
                    className="w-full border border-neutral-200 dark:border-slate-800 rounded-xl p-3 text-xs bg-white dark:bg-slate-950 focus:outline-none text-neutral-800 dark:text-neutral-200"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500">End Date & Time</label>
                  <input
                    type="datetime-local"
                    value={formData.endAt}
                    onChange={(e) => updateField('endAt', e.target.value)}
                    className="w-full border border-neutral-200 dark:border-slate-800 rounded-xl p-3 text-xs bg-white dark:bg-slate-950 focus:outline-none text-neutral-800 dark:text-neutral-200"
                  />
                </div>
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500">Conversion Rate</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={formData.conversionRate}
                    onChange={(e) => updateField('conversionRate', Number(e.target.value))}
                    className="w-full border border-neutral-200 dark:border-slate-800 rounded-xl p-3 text-xs bg-white dark:bg-slate-950 focus:outline-none text-neutral-800 dark:text-neutral-250"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500">Min Decrement Value (INR)</label>
                  <input
                    type="number"
                    value={formData.minDecrement}
                    onChange={(e) => updateField('minDecrement', Number(e.target.value))}
                    className="w-full border border-neutral-200 dark:border-slate-800 rounded-xl p-3 text-xs bg-white dark:bg-slate-950 focus:outline-none text-neutral-800 dark:text-neutral-250"
                  />
                </div>
              </div>

              <div className="border border-neutral-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-neutral-800 dark:text-neutral-200">Overtime Trigger Auto-Extension</span>
                  <input
                    type="checkbox"
                    checked={formData.overtimeEnabled}
                    onChange={(e) => updateField('overtimeEnabled', e.target.checked)}
                    className="h-4 w-4 text-indigo-600 rounded focus:ring-indigo-650"
                  />
                </div>

                {formData.overtimeEnabled && (
                  <div className="grid grid-cols-2 gap-4 pt-2 border-t border-neutral-100 dark:border-slate-800">
                    <div className="space-y-1">
                      <label className="block text-[10px] font-bold text-neutral-400 uppercase">Trigger Window (minutes before end)</label>
                      <input
                        type="number"
                        value={formData.overtimeWindowMins}
                        onChange={(e) => updateField('overtimeWindowMins', Number(e.target.value))}
                        className="w-full border border-neutral-200 dark:border-slate-800 rounded-lg p-2 text-xs bg-white dark:bg-slate-950 focus:outline-none text-neutral-850 dark:text-neutral-250"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[10px] font-bold text-neutral-400 uppercase">Extension Duration (minutes)</label>
                      <input
                        type="number"
                        value={formData.overtimeExtensionMins}
                        onChange={(e) => updateField('overtimeExtensionMins', Number(e.target.value))}
                        className="w-full border border-neutral-200 dark:border-slate-800 rounded-lg p-2 text-xs bg-white dark:bg-slate-950 focus:outline-none text-neutral-850 dark:text-neutral-250"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-4 text-xs">
              <p className="text-neutral-500 italic">Select internal users to assign coordinator and review observer roles (configured in user directory settings).</p>
            </div>
          )}

          {currentStep === 4 && (
            <div className="space-y-4 text-xs">
              <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500">Map Invited Vendors</label>
              <div className="border border-neutral-200 dark:border-slate-800 rounded-xl divide-y divide-neutral-200 dark:divide-slate-800 max-h-60 overflow-y-auto bg-white dark:bg-slate-950">
                {vendorsList.map(vendor => {
                  const isChecked = formData.vendorParticipants.includes(vendor.id);
                  return (
                    <div key={vendor.id} className="p-3 flex items-center justify-between">
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
                        className="h-4 w-4 text-indigo-600 rounded focus:ring-indigo-650 cursor-pointer"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {currentStep === 5 && (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500">Fixed Loading ($)</label>
                  <input
                    type="number"
                    value={formData.fixedLoading}
                    onChange={(e) => updateField('fixedLoading', Number(e.target.value))}
                    className="w-full border border-neutral-200 dark:border-slate-800 rounded-xl p-3 text-xs bg-white dark:bg-slate-950 focus:outline-none text-neutral-800 dark:text-neutral-250"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500">Loading Percent (%)</label>
                  <input
                    type="number"
                    value={formData.loadingPercent}
                    onChange={(e) => updateField('loadingPercent', Number(e.target.value))}
                    className="w-full border border-neutral-200 dark:border-slate-800 rounded-xl p-3 text-xs bg-white dark:bg-slate-950 focus:outline-none text-neutral-800 dark:text-neutral-250"
                  />
                </div>
              </div>

              <div className="bg-neutral-50/50 dark:bg-slate-900 border border-neutral-200 dark:border-slate-800 rounded-2xl p-5 space-y-2">
                <h4 className="font-bold text-neutral-900 dark:text-white">Commercial Bid Formula Calculation Preview</h4>
                <p className="text-neutral-500">Formula: <code className="bg-neutral-100 dark:bg-slate-950 px-1 py-0.5 rounded">(Bid * Conversion) + Fixed Loading + (Bid * Conversion * Loading%)</code></p>
                <div className="border-t border-dashed border-neutral-200 dark:border-slate-800 pt-3 flex justify-between items-center text-xs">
                  <span>Standard Demo Bid Amount (₹10,000)</span>
                  <span className="font-bold text-indigo-650 dark:text-indigo-400">Evaluated Total: ₹{calc.toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}

          {currentStep === 6 && (
            <div className="space-y-4 text-xs">
              <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500">Terms & Compliance Templates</label>
              <p className="text-neutral-500 italic">Static e-auction compliance gate document will be attached to invitation letters.</p>
            </div>
          )}

          {currentStep === 7 && (
            <div className="space-y-4 text-xs">
              <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500">Legal Disclosures</label>
              <p className="text-neutral-500 italic">Statutory disclosure checklists will be rendered inside compliance gateway screens.</p>
            </div>
          )}

          {currentStep === 8 && (
            <div className="space-y-4 text-xs">
              <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500">Assign Approving Supervisor</label>
              <select
                value={formData.approverId}
                onChange={(e) => updateField('approverId', e.target.value)}
                className="w-full border border-neutral-200 dark:border-slate-800 rounded-xl p-3 text-xs bg-white dark:bg-slate-950 focus:outline-none text-neutral-800 dark:text-neutral-200 cursor-pointer"
              >
                <option value="">-- MAPPED SUPERVISOR LIST --</option>
                {approversList.map(u => (
                  <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                ))}
              </select>
            </div>
          )}

          {currentStep === 9 && (
            <div className="space-y-4 text-xs leading-relaxed">
              <h4 className="font-bold text-neutral-900 dark:text-white text-sm">Verify Auction Configuration</h4>
              <div className="border border-neutral-200 dark:border-slate-800 rounded-2xl p-5 grid grid-cols-2 gap-4">
                <div className="space-y-0.5">
                  <span className="text-[10px] font-bold text-neutral-400 uppercase">Auction Title</span>
                  <p className="font-semibold text-neutral-800 dark:text-neutral-200">{formData.title || 'Untitled'}</p>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] font-bold text-neutral-400 uppercase">Start Schedule</span>
                  <p className="font-semibold text-neutral-800 dark:text-neutral-200">{formData.startAt ? new Date(formData.startAt).toLocaleString() : 'Not scheduled'}</p>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] font-bold text-neutral-400 uppercase">Invited Suppliers</span>
                  <p className="font-semibold text-neutral-800 dark:text-neutral-200">{formData.vendorParticipants.length} Suppliers</p>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] font-bold text-neutral-400 uppercase">Min Step Decrement</span>
                  <p className="font-semibold text-neutral-800 dark:text-neutral-200">₹{Number(formData.minDecrement).toLocaleString()}</p>
                </div>
              </div>

              {user && user.role === 'SYSTEM_ADMIN' && (
                <div className="border border-indigo-150 dark:border-indigo-950 bg-indigo-50/10 p-4 rounded-2xl space-y-2 mt-4">
                  <label className="block text-[10px] font-bold text-indigo-650 dark:text-indigo-400 uppercase tracking-wider">Administrative State Override</label>
                  <p className="text-[10px] text-neutral-500 mb-1">Force this auction into a specific phase for demonstration testing.</p>
                  <select
                    value={formData.state}
                    onChange={(e) => updateField('state', e.target.value)}
                    className="w-full border border-neutral-200 dark:border-slate-800 rounded-xl p-2.5 text-xs bg-white dark:bg-slate-950 text-neutral-800 dark:text-neutral-200 focus:outline-none cursor-pointer font-semibold"
                  >
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
            className="flex items-center gap-1.5 px-4 py-2 border border-neutral-250 dark:border-slate-850 disabled:opacity-40 hover:bg-neutral-100 dark:hover:bg-slate-800 rounded-xl text-xs font-semibold transition cursor-pointer"
          >
            <ArrowLeft size={13} />
            Back
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveDraft}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-950/20 dark:text-indigo-400 rounded-xl text-xs font-semibold cursor-pointer"
            >
              <Save size={13} />
              {saving ? 'Saving...' : 'Save Draft'}
            </button>

            {currentStep < 9 ? (
              <button
                onClick={handleNext}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold cursor-pointer"
              >
                Next
                <ArrowRight size={13} />
              </button>
            ) : (
              <button
                onClick={() => setShowConfirmSubmit(true)}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-emerald-600/15 cursor-pointer"
              >
                <CheckCircle size={13} />
                {saving ? 'Submitting...' : 'Submit for Approval'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Dialog Overlay for Submitting for Approval */}
      {showConfirmSubmit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 border border-neutral-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
                <AlertTriangle size={20} />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-neutral-900 dark:text-white font-sans">Submit for Approval</h3>
                <p className="text-xs text-neutral-500 leading-relaxed">Are you sure you want to lock configuration parameters and submit this e-auction to the supervisor approvals queue?</p>
              </div>
            </div>

            <div className="flex gap-2.5 justify-end pt-2">
              <button
                onClick={() => setShowConfirmSubmit(false)}
                className="px-4 py-2 border border-neutral-250 dark:border-slate-800 rounded-xl text-xs font-semibold hover:bg-neutral-100 dark:hover:bg-slate-800 text-neutral-600 dark:text-slate-350 cursor-pointer"
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

      {/* Floating Success/Error Toast Notifications Stack */}
      <div className="fixed top-6 right-6 z-50 flex flex-col gap-2.5 max-w-sm pointer-events-none">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`pointer-events-auto p-4 rounded-xl border shadow-xl flex items-center justify-between gap-3 animate-slide-in transition-all duration-300 ${
              toast.type === 'error'
                ? 'bg-red-500/10 border-red-500/25 text-red-500'
                : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-500'
            }`}
          >
            <div className="flex items-center gap-2">
              {toast.type === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
              <span className="text-xs font-semibold leading-relaxed font-sans">{toast.message}</span>
            </div>
            <button 
              onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
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
