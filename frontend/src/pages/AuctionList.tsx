import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../providers/AuthProvider';
import {
  Plus, Search, Trash2, Copy, Eye,
  Play, ShieldAlert, AlertTriangle, CheckCircle2, X, Clock, ChevronLeft, ChevronRight
} from 'lucide-react';
import { getAuctionDisplayId } from '../utils/auctionHelper';
import { formatDateTime } from '../utils/format';

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

const AuctionList: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [auctions, setAuctions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>(searchParams.get('search') || '');

  // Keep the global header quick-search in sync with this page.
  useEffect(() => {
    const fromUrl = searchParams.get('search') || '';
    setSearchQuery(prev => (prev === fromUrl ? prev : fromUrl));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

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
  const [confirmDialog, setConfirmDialog] = useState<{
    type: 'duplicate' | 'cancel';
    targetId: string;
    title: string;
    message: string;
    showInput?: boolean;
    inputValue?: string;
  } | null>(null);

  const tabs = [
    { value: 'ALL', label: 'All' },
    { value: 'DRAFT', label: 'Draft' },
    { value: 'PENDING_APPROVAL', label: 'Pending Approval' },
    { value: 'APPROVED', label: 'Approved' },
    { value: 'PUBLISHED', label: 'Published' },
    { value: 'LIVE', label: 'Live' },
    { value: 'COMPLETED', label: 'Completed' },
    { value: 'REJECTED', label: 'Rejected' },
    { value: 'CANCELLED', label: 'Cancelled' },
  ];

  const fetchAuctions = async () => {
    setLoading(true);
    try {
      let url = `${API_URL}/auctions`;
      const params: any = {};
      if (activeTab !== 'ALL') {
        params.status = activeTab;
      }
      if (searchQuery) {
        params.search = searchQuery;
      }
      const res = await axios.get(url, { params });
      setAuctions(res.data.data);
      setCurrentPage(1); // Reset to page 1 on filter
    } catch (err: any) {
      showToast(err.response?.data?.error?.message || 'Failed to load auctions', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuctions();
  }, [activeTab, searchQuery]);

  const handleDuplicate = async (id: string) => {
    try {
      await axios.post(`${API_URL}/auctions/${id}/duplicate`);
      showToast('Auction duplicated successfully!');
      fetchAuctions();
    } catch (err: any) {
      showToast(err.response?.data?.error?.message || 'Failed to duplicate auction', 'error');
    }
  };

  const handleCancel = async (id: string, reason: string) => {
    if (!reason || reason.trim().length < 5) {
      showToast('Cancellation reason must be at least 5 characters', 'error');
      return;
    }
    try {
      await axios.post(`${API_URL}/auctions/${id}/cancel`, { comment: reason });
      showToast('Auction cancelled successfully!');
      fetchAuctions();
    } catch (err: any) {
      showToast(err.response?.data?.error?.message || 'Failed to cancel auction', 'error');
    }
  };

  // Filtered/Paginated auctions computation
  const totalPages = Math.ceil(auctions.length / itemsPerPage);
  const paginatedAuctions = auctions.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="p-6 space-y-6 relative">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white font-sans">Auction Management</h1>
          <p className="text-xs text-neutral-500 mt-1">
            Review and coordinate all e-auction lifecycles.
          </p>
        </div>

        {(user?.role === 'SYSTEM_ADMIN' || user?.role === 'AUCTION_OWNER') && (
          <button 
            onClick={() => navigate('/auctions/create')}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold py-2.5 px-4 rounded-xl shadow transition duration-200 transform active:scale-95 cursor-pointer"
          >
            <Plus size={14} />
            Create Auction
          </button>
        )}
      </div>

      {/* Tabs list & search */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-neutral-200 dark:border-slate-800 pb-2">
        <div className="flex flex-wrap gap-1.5">
          {tabs.map(tab => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeTab === tab.value
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-neutral-500 hover:bg-neutral-200 dark:hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full lg:max-w-xs">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-neutral-400">
            <Search size={14} />
          </span>
          <input
            type="text"
            placeholder="Search by title..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 border border-neutral-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-950 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-600 text-neutral-800 dark:text-neutral-200"
          />
        </div>
      </div>

      {/* Grid listing */}
      {loading ? (
        /* Loading Skeletons */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div 
              key={n} 
              className="bg-white dark:bg-slate-900 border border-neutral-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 animate-pulse"
            >
              <div className="flex justify-between items-start">
                <div className="h-5 w-20 bg-neutral-200 dark:bg-slate-800 rounded-full"></div>
                <div className="h-3.5 w-16 bg-neutral-200 dark:bg-slate-800 rounded"></div>
              </div>
              <div className="space-y-2">
                <div className="h-4 w-3/4 bg-neutral-200 dark:bg-slate-800 rounded"></div>
                <div className="h-3.5 w-full bg-neutral-200 dark:bg-slate-800 rounded"></div>
                <div className="h-3.5 w-1/2 bg-neutral-200 dark:bg-slate-800 rounded"></div>
              </div>
              <div className="border-t border-neutral-100 dark:border-slate-800 pt-3 flex justify-between items-center">
                <div className="space-y-1">
                  <div className="h-2 w-10 bg-neutral-200 dark:bg-slate-800 rounded"></div>
                  <div className="h-3 w-20 bg-neutral-200 dark:bg-slate-800 rounded"></div>
                </div>
                <div className="space-y-1 text-right">
                  <div className="h-2 w-10 bg-neutral-200 dark:bg-slate-800 rounded"></div>
                  <div className="h-3 w-12 bg-neutral-200 dark:bg-slate-800 rounded"></div>
                </div>
              </div>
              <div className="flex gap-2 pt-1.5">
                <div className="flex-1 h-8 bg-neutral-200 dark:bg-slate-800 rounded-xl"></div>
                <div className="h-8 w-8 bg-neutral-200 dark:bg-slate-800 rounded-xl"></div>
                <div className="h-8 w-8 bg-neutral-200 dark:bg-slate-800 rounded-xl"></div>
              </div>
            </div>
          ))}
        </div>
      ) : paginatedAuctions.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center text-neutral-400 border border-dashed border-neutral-300 dark:border-slate-800 rounded-xl space-y-2">
          <ShieldAlert size={28} className="text-neutral-500" />
          <p className="text-xs font-medium">No auctions found matching your parameters</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {paginatedAuctions.map((auc) => (
              <div 
                key={auc.id} 
                className="bg-white dark:bg-slate-900 border border-neutral-200 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm space-y-4 hover:shadow-md transition-all duration-200"
              >
                <div className="flex justify-between items-start">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                    ['LIVE', 'OVERTIME'].includes(auc.state)
                      ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                      : auc.state === 'COMPLETED'
                      ? 'bg-neutral-500/10 text-neutral-600 border border-neutral-500/20'
                      : auc.state === 'PENDING_APPROVAL'
                      ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                      : 'bg-indigo-500/10 text-indigo-600 border border-indigo-500/20'
                  }`}>
                    {auc.state}
                  </span>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-[10px] font-mono text-neutral-400">#{getAuctionDisplayId(auc.id).id}</span>
                    <span className="text-[9px] text-zinc-400 flex items-center gap-1">
                      <Clock size={10} />
                      {getRelativeTimeString(auc.updatedAt)}
                    </span>
                  </div>
                </div>

                <div>
                  <h4 className="font-bold text-neutral-900 dark:text-white text-sm line-clamp-1">
                    {auc.title}
                  </h4>
                  <p className="text-xs text-neutral-500 mt-1 line-clamp-2 min-h-[2.5rem]">
                    {auc.description || 'No description provided.'}
                  </p>
                </div>

                <div className="border-t border-neutral-100 dark:border-slate-800/60 pt-3 flex justify-between items-center">
                  <div className="space-y-0.5">
                    <p className="text-[10px] text-neutral-400">Start Time (local)</p>
                    <p className="text-[11px] font-medium text-neutral-800 dark:text-neutral-300">
                      {auc.startAt ? formatDateTime(auc.startAt) : 'Not scheduled'}
                    </p>
                  </div>
                  <div className="text-right space-y-0.5">
                    <p className="text-[10px] text-neutral-400">Participants</p>
                    <p className="text-[11px] font-bold text-neutral-800 dark:text-neutral-200">{auc.participants?.length || 0} Vendors</p>
                  </div>
                </div>

                <div className="flex gap-2 pt-1.5">
                  <button
                    onClick={() => navigate(
                      ['LIVE', 'OVERTIME'].includes(auc.state)
                        ? `/auctions/${auc.id}/live`
                        : `/auctions/${auc.id}`
                    )}
                    className="flex-1 flex justify-center items-center gap-1.5 bg-neutral-100 hover:bg-neutral-200 dark:bg-slate-800 dark:hover:bg-slate-800/80 text-neutral-800 dark:text-slate-200 py-2 rounded-xl text-xs font-semibold transition cursor-pointer"
                  >
                    {['LIVE', 'OVERTIME'].includes(auc.state) ? (
                      <>
                        <Play size={12} className="text-emerald-500 fill-emerald-500" />
                        Live Console
                      </>
                    ) : (
                      <>
                        <Eye size={12} />
                        View Details
                      </>
                    )}
                  </button>

                  {(user?.role === 'SYSTEM_ADMIN' || user?.role === 'AUCTION_OWNER') && (
                    <>
                      <button
                        onClick={() => setConfirmDialog({
                          type: 'duplicate',
                          targetId: auc.id,
                          title: 'Duplicate Auction',
                          message: `Are you sure you want to duplicate this auction: "${auc.title}"?`
                        })}
                        title="Duplicate Auction"
                        className="p-2 border border-neutral-200 dark:border-slate-800 hover:bg-neutral-100 dark:hover:bg-slate-800 text-neutral-500 rounded-xl transition cursor-pointer"
                      >
                        <Copy size={13} />
                      </button>

                      {auc.state !== 'CANCELLED' && auc.state !== 'COMPLETED' && (
                        <button
                          onClick={() => setConfirmDialog({
                            type: 'cancel',
                            targetId: auc.id,
                            title: 'Cancel Auction',
                            message: `Are you sure you want to cancel the auction: "${auc.title}"? Please enter the cancellation reason below:`,
                            showInput: true,
                            inputValue: ''
                          })}
                          title="Cancel Auction"
                          className="p-2 border border-red-200 dark:border-red-950 hover:bg-red-50 dark:hover:bg-red-950/20 text-red-500 rounded-xl transition cursor-pointer"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-neutral-200 dark:border-slate-800 pt-4 mt-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => prev - 1)}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg border border-neutral-200 dark:border-slate-800 disabled:opacity-40 hover:bg-neutral-100 dark:hover:bg-slate-800 transition flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed text-neutral-700 dark:text-neutral-300"
              >
                <ChevronLeft size={14} />
                Previous
              </button>
              <span className="text-xs text-neutral-500 font-medium">Page {currentPage} of {totalPages}</span>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => prev + 1)}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg border border-neutral-200 dark:border-slate-800 disabled:opacity-40 hover:bg-neutral-100 dark:hover:bg-slate-800 transition flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed text-neutral-700 dark:text-neutral-300"
              >
                Next
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </>
      )}

      {/* Custom Confirmation Modal Dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 border border-neutral-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4 transform scale-100 transition-all duration-300">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
                <AlertTriangle size={20} />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-neutral-900 dark:text-white font-sans">{confirmDialog.title}</h3>
                <p className="text-xs text-neutral-500 leading-relaxed">{confirmDialog.message}</p>
              </div>
            </div>

            {confirmDialog.showInput && (
              <textarea
                placeholder="Enter cancellation reason (min 5 characters)..."
                value={confirmDialog.inputValue || ''}
                onChange={(e) => setConfirmDialog(prev => prev ? { ...prev, inputValue: e.target.value } : null)}
                className="w-full p-3 text-xs border border-neutral-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 focus:outline-none focus:ring-1 focus:ring-indigo-600 min-h-[70px] text-neutral-800 dark:text-neutral-200"
              />
            )}

            <div className="flex gap-2.5 justify-end pt-2">
              <button
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 border border-neutral-200 dark:border-slate-800 rounded-xl text-xs font-semibold hover:bg-neutral-100 dark:hover:bg-slate-800 text-neutral-600 dark:text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const { type, targetId, inputValue } = confirmDialog;
                  setConfirmDialog(null);
                  if (type === 'duplicate') {
                    handleDuplicate(targetId);
                  } else if (type === 'cancel') {
                    handleCancel(targetId, inputValue || '');
                  }
                }}
                className={`px-4 py-2 rounded-xl text-xs font-semibold text-white cursor-pointer ${
                  confirmDialog.type === 'cancel'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
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

export default AuctionList;
