import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../providers/AuthProvider';
import { 
  Play, Edit, Eye, ShieldAlert, 
  FileText, ShieldCheck, HelpCircle, XCircle, Clock, AlertTriangle, CheckCircle2, X
} from 'lucide-react';
import { getAuctionDisplayId } from '../utils/auctionHelper';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

// Relative timestamp helper
const getRelativeTimeString = (dateInput: string | Date): string => {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHrs = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHrs / 24);

  if (diffSecs < 10) return 'Just now';
  if (diffSecs < 60) return `${diffSecs}s ago`;
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return `${diffDays}d ago`;
};

const AuctionDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [auction, setAuction] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  // Approval decision fields
  const [comment, setComment] = useState('');
  const [acting, setActing] = useState(false);

  // Publish checklist validator fields
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [checklist, setChecklist] = useState<any[]>([]);
  const [allPassed, setAllPassed] = useState(false);
  const [validating, setValidating] = useState(false);

  // Custom Toast state
  const [toasts, setToasts] = useState<{ id: number; message: string; type: 'success' | 'error' }[]>([]);
  
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  // Custom Confirmation state
  const [confirmAction, setConfirmAction] = useState<{
    type: 'approve' | 'reject' | 'publish';
    title: string;
    message: string;
  } | null>(null);

  const fetchDetails = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/auctions/${id}`);
      setAuction(res.data.data);
    } catch (err) {
      console.error('Failed to load details:', err);
      showToast('Failed to load auction details', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
  }, [id]);

  const handleApprove = async () => {
    setActing(true);
    try {
      await axios.post(`${API_URL}/auctions/${id}/approve`);
      showToast('Auction approved successfully!');
      fetchDetails();
    } catch (err) {
      console.error('Approval failed:', err);
      showToast('Failed to approve auction', 'error');
    } finally {
      setActing(false);
    }
  };

  const handleReject = async () => {
    if (!comment || comment.trim().length < 10) {
      showToast('Rejection comment must be at least 10 characters', 'error');
      return;
    }
    setActing(true);
    try {
      await axios.post(`${API_URL}/auctions/${id}/reject`, { comment });
      showToast('Auction rejected and returned to draft');
      fetchDetails();
    } catch (err) {
      console.error('Rejection failed:', err);
      showToast('Failed to reject auction', 'error');
    } finally {
      setActing(false);
    }
  };

  // Run Publish validation panel checklist
  const handleValidatePublish = async () => {
    setValidating(true);
    setShowPublishModal(true);
    try {
      const res = await axios.get(`${API_URL}/auctions/${id}/validate-publish`);
      setChecklist(res.data.checklist);
      setAllPassed(res.data.allPassed);
    } catch (err) {
      console.error('Checklist check failed:', err);
      showToast('Validation checks failed', 'error');
    } finally {
      setValidating(false);
    }
  };

  const handlePublish = async () => {
    setActing(true);
    try {
      await axios.post(`${API_URL}/auctions/${id}/publish`);
      showToast('Auction published successfully! Invites sent.');
      setShowPublishModal(false);
      fetchDetails();
    } catch (err) {
      console.error('Publishing failed:', err);
      showToast('Failed to publish auction', 'error');
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    /* Premium Loading Skeletons */
    return (
      <div className="p-6 space-y-6 max-w-5xl mx-auto animate-pulse">
        <div className="bg-white dark:bg-slate-900 border border-neutral-200 dark:border-slate-800 p-6 rounded-2xl space-y-4">
          <div className="flex gap-2 items-center">
            <div className="h-5 w-20 bg-neutral-200 dark:bg-slate-800 rounded-full"></div>
            <div className="h-4 w-32 bg-neutral-200 dark:bg-slate-800 rounded"></div>
          </div>
          <div className="h-6 w-1/2 bg-neutral-200 dark:bg-slate-800 rounded"></div>
        </div>
        <div className="flex gap-4 border-b border-neutral-200 dark:border-slate-800 pb-2">
          <div className="h-8 w-24 bg-neutral-200 dark:bg-slate-800 rounded-lg"></div>
          <div className="h-8 w-24 bg-neutral-200 dark:bg-slate-800 rounded-lg"></div>
          <div className="h-8 w-24 bg-neutral-200 dark:bg-slate-800 rounded-lg"></div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-neutral-200 dark:border-slate-800 p-6 rounded-2xl h-48 space-y-4">
          <div className="h-4 w-3/4 bg-neutral-200 dark:bg-slate-800 rounded"></div>
          <div className="h-4 w-5/6 bg-neutral-200 dark:bg-slate-800 rounded"></div>
        </div>
      </div>
    );
  }

  if (!auction) {
    return (
      <div className="p-8 text-center text-neutral-500 border border-dashed rounded-xl max-w-sm mx-auto mt-12 space-y-3">
        <ShieldAlert size={32} className="mx-auto text-neutral-400" />
        <h3 className="font-bold text-sm">Auction not found</h3>
        <button onClick={() => navigate('/auctions')} className="text-xs text-indigo-600 font-semibold underline cursor-pointer">Back to list</button>
      </div>
    );
  }

  const isPendingApprover = auction.state === 'PENDING_APPROVAL' && user && (user.role === 'APPROVER' || user.role === 'SYSTEM_ADMIN') && user.id === auction.approverId;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto relative">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-neutral-200 dark:border-slate-800 p-6 rounded-2xl shadow-sm">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase border ${
              ['LIVE', 'OVERTIME'].includes(auction.state)
                ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                : auction.state === 'APPROVED'
                ? 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20'
                : 'bg-neutral-500/10 text-neutral-600 border-neutral-350/20'
            }`}>
              {auction.state}
            </span>
            <span className="text-xs font-mono text-neutral-400">ID: {getAuctionDisplayId(auction.id, auction.title).id}</span>
            <span className="text-xs font-mono text-neutral-400">| Ref: {getAuctionDisplayId(auction.id, auction.title).ref}</span>
            <span className="text-[10px] text-zinc-400 flex items-center gap-1 pl-1">
              <Clock size={11} />
              {getRelativeTimeString(auction.updatedAt)}
            </span>
          </div>
          <h2 className="text-xl font-bold text-neutral-900 dark:text-white">{auction.title}</h2>
        </div>

        <div className="flex items-center gap-2">
          {(['DRAFT', 'REJECTED'].includes(auction.state) || (user && user.role === 'SYSTEM_ADMIN')) && (
            <button 
              onClick={() => navigate(`/auctions/${auction.id}/edit`)}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold py-2 px-3.5 rounded-xl shadow transition cursor-pointer"
            >
              <Edit size={13} />
              Continue Editing
            </button>
          )}

          {auction.state === 'APPROVED' && (
            <button 
              onClick={handleValidatePublish}
              className="flex items-center gap-1.5 bg-indigo-650 hover:bg-indigo-700 text-white text-xs font-semibold py-2 px-3.5 rounded-xl shadow transition cursor-pointer"
            >
              <ShieldCheck size={13} />
              Run Publish Validation
            </button>
          )}

          {['LIVE', 'OVERTIME', 'PUBLISHED'].includes(auction.state) && (
            <button 
              onClick={() => navigate(`/auctions/${auction.id}/live`)}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold py-2 px-3.5 rounded-xl shadow transition cursor-pointer"
            >
              <Play size={13} className="fill-white" />
              Open Live Console
            </button>
          )}

          {auction.state === 'COMPLETED' && (
            <button 
              onClick={() => navigate(`/reports`)}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold py-2 px-3.5 rounded-xl shadow transition cursor-pointer"
            >
              <FileText size={13} />
              View Reports
            </button>
          )}
        </div>
      </div>

      {/* Tabs Menu */}
      <div className="flex border-b border-neutral-200 dark:border-slate-800 gap-4 text-xs font-semibold">
        {['overview', 'bid-rules', 'participants', 'approvals'].map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`pb-2.5 capitalize px-1 transition cursor-pointer ${
              activeTab === t
                ? 'border-b-2 border-indigo-600 text-indigo-600 font-bold'
                : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-white'
            }`}
          >
            {t.replace('-', ' ')}
          </button>
        ))}
      </div>

      {/* Tab Panels */}
      <div className="bg-white dark:bg-slate-900 border border-neutral-200 dark:border-slate-800 p-6 rounded-2xl shadow-sm text-xs space-y-4">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-2 gap-6 leading-relaxed">
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Start Schedule</span>
              <p className="font-semibold text-neutral-800 dark:text-neutral-200">
                {auction.startAt ? new Date(auction.startAt).toLocaleString() : 'Not scheduled'}
              </p>
            </div>
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">End Schedule</span>
              <p className="font-semibold text-neutral-800 dark:text-neutral-200">
                {auction.endAt ? new Date(auction.endAt).toLocaleString() : 'Not scheduled'}
              </p>
            </div>
            <div className="col-span-2 space-y-0.5 border-t border-neutral-100 dark:border-slate-800 pt-3">
              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Scope Description</span>
              <p className="text-neutral-600 dark:text-neutral-400">{auction.description || 'No description entered.'}</p>
            </div>
          </div>
        )}

        {activeTab === 'bid-rules' && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold text-neutral-400 uppercase">Conversion Rate</span>
              <p className="font-semibold text-neutral-800 dark:text-neutral-200">{Number(auction.bidRuleSnapshot?.conversionRate || 1)}</p>
            </div>
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold text-neutral-400 uppercase">Min Step Size (Decrement)</span>
              <p className="font-semibold text-neutral-800 dark:text-neutral-200">₹{Number(getAuctionDisplayId(auction.id, auction.title).decrement).toLocaleString()}</p>
            </div>
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold text-neutral-400 uppercase">Base Price</span>
              <p className="font-semibold text-neutral-800 dark:text-neutral-200">₹{Number(getAuctionDisplayId(auction.id, auction.title).basePrice).toLocaleString()}</p>
            </div>
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold text-neutral-400 uppercase">Overtime Enabled</span>
              <p className="font-semibold text-neutral-800 dark:text-neutral-200">{auction.bidRuleSnapshot?.overtimeEnabled ? 'Yes' : 'No'}</p>
            </div>
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold text-neutral-400 uppercase">Visibility Policy</span>
              <p className="font-semibold text-neutral-800 dark:text-neutral-200">{auction.bidRuleSnapshot?.rankVisibility}</p>
            </div>
          </div>
        )}

        {activeTab === 'participants' && (
          <div className="space-y-3">
            <h4 className="font-bold text-neutral-900 dark:text-white">Invited Suppliers</h4>
            <div className="border border-neutral-100 dark:border-slate-800 rounded-xl overflow-hidden divide-y divide-neutral-100 dark:divide-slate-800">
              {auction.participants?.length === 0 ? (
                <div className="p-4 text-center text-neutral-400">No participants mapped.</div>
              ) : (
                auction.participants?.map((p: any) => (
                  <div key={p.id} className="p-3 flex justify-between items-center bg-slate-50/20 dark:bg-slate-900/10">
                    <div>
                      <p className="font-bold text-neutral-800 dark:text-neutral-200">{p.vendor.name}</p>
                      <p className="text-[10px] text-neutral-500 font-mono mt-0.5">{p.vendor.email}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                      p.blocked ? 'bg-red-100 text-red-650' : 'bg-green-100 text-green-750'
                    }`}>
                      {p.blocked ? 'Blocked' : 'Active'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'approvals' && (
          <div className="space-y-4">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-neutral-400 uppercase">Assigned Supervisor</span>
              <p className="font-semibold text-neutral-800 dark:text-neutral-200">
                {auction.approver ? auction.approver.email : 'No supervisor mapped'}
              </p>
            </div>

            {/* Approval decision panel */}
            {isPendingApprover ? (
              <div className="border border-indigo-100 dark:border-indigo-950 bg-indigo-50/15 p-5 rounded-2xl space-y-4">
                <h4 className="font-bold text-neutral-900 dark:text-white">Supervisor Decision Panel</h4>
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold text-neutral-500 uppercase">Comments/Feedback Note</label>
                  <textarea
                    rows={3}
                    placeholder="Enter review comments (required for rejection, min 10 chars)..."
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    className="w-full border border-neutral-200 dark:border-slate-800 rounded-xl p-3 text-xs bg-white dark:bg-slate-950 focus:outline-none text-neutral-800 dark:text-neutral-200"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmAction({
                      type: 'approve',
                      title: 'Approve & Release Auction',
                      message: 'Are you sure you want to approve this auction? It will be released to approved status.'
                    })}
                    disabled={acting}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-4 rounded-xl text-xs cursor-pointer"
                  >
                    {acting ? 'Processing...' : 'Approve & Release'}
                  </button>
                  <button
                    onClick={() => setConfirmAction({
                      type: 'reject',
                      title: 'Reject & Revert Draft',
                      message: 'Are you sure you want to reject this auction draft and request revision comments?'
                    })}
                    disabled={acting}
                    className="bg-red-650 hover:bg-red-750 text-white font-semibold py-2 px-4 rounded-xl text-xs cursor-pointer"
                  >
                    {acting ? 'Processing...' : 'Reject Draft'}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-neutral-500 italic">No decision actions required at this time.</p>
            )}
          </div>
        )}
      </div>

      {/* Publish validation checklist Modal */}
      {showPublishModal && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 border border-neutral-200 dark:border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-xl space-y-6">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="font-bold text-neutral-900 dark:text-white">Publish Validation Checklist</h3>
              <button onClick={() => setShowPublishModal(false)} className="text-neutral-400 hover:text-neutral-650 cursor-pointer">
                <XCircle size={18} />
              </button>
            </div>

            <div className="space-y-2.5 max-h-80 overflow-y-auto">
              {validating ? (
                <div className="text-center text-xs text-neutral-400 py-6">Running checklist checks...</div>
              ) : (
                checklist.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-2.5 text-xs">
                    <span className={`h-4.5 w-4.5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      item.passed ? 'bg-green-100 text-green-600' : 'bg-red-105 text-red-500'
                    }`}>
                      {item.passed ? '✓' : '✗'}
                    </span>
                    <div>
                      <p className="font-semibold text-neutral-850 dark:text-neutral-200">{item.name}</p>
                      <p className="text-[10px] text-neutral-500">{item.message}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button 
                onClick={() => setShowPublishModal(false)} 
                className="px-4 py-2 border border-neutral-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-neutral-700 dark:text-slate-350 cursor-pointer"
              >
                Close
              </button>
              <button
                disabled={!allPassed || acting}
                onClick={() => setConfirmAction({
                  type: 'publish',
                  title: 'Publish Auction Gateway',
                  message: 'Are you sure you want to publish this auction? This will trigger live countdown schedules and send vendor email invites.'
                })}
                className="px-4 py-2 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold disabled:opacity-50 cursor-pointer"
              >
                {acting ? 'Publishing...' : 'Publish Auction'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Confirmation Modal Dialog Overlay */}
      {confirmAction && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 border border-neutral-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
                <AlertTriangle size={20} />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-neutral-900 dark:text-white font-sans">{confirmAction.title}</h3>
                <p className="text-xs text-neutral-500 leading-relaxed">{confirmAction.message}</p>
              </div>
            </div>

            <div className="flex gap-2.5 justify-end pt-2">
              <button
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2 border border-neutral-250 dark:border-slate-800 rounded-xl text-xs font-semibold hover:bg-neutral-100 dark:hover:bg-slate-800 text-neutral-600 dark:text-slate-350 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const actType = confirmAction.type;
                  setConfirmAction(null);
                  if (actType === 'approve') handleApprove();
                  else if (actType === 'reject') handleReject();
                  else if (actType === 'publish') handlePublish();
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold cursor-pointer"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Toast Notification Center */}
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

export default AuctionDetail;
