import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../providers/AuthProvider';
import { 
  Radio, Clock, AlertCircle, CheckCircle2, 
  Plus, ArrowRight, ShieldCheck 
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

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [auctions, setAuctions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAuctions = async () => {
      try {
        const res = await axios.get(`${API_URL}/auctions`);
        setAuctions(res.data.data);
      } catch {
        // Dashboard is non-critical; widgets show their empty states on failure.
      } finally {
        setLoading(false);
      }
    };
    fetchAuctions();
  }, []);

  const getStatsCount = (state: string) => auctions.filter(a => a.state === state).length;

  const stats = [
    { label: 'Live Auctions', value: getStatsCount('LIVE') + getStatsCount('OVERTIME'), icon: Radio, color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' },
    { label: 'Pending Approval', value: getStatsCount('PENDING_APPROVAL'), icon: AlertCircle, color: 'text-amber-500 bg-amber-500/10 border-amber-500/20' },
    { label: 'Published (Upcoming)', value: getStatsCount('PUBLISHED'), icon: Clock, color: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/20' },
    { label: 'Completed Auctions', value: getStatsCount('COMPLETED'), icon: CheckCircle2, color: 'text-slate-500 bg-slate-500/10 border-slate-500/20' },
  ];

  const activeOrUpcoming = auctions.filter(a => 
    ['LIVE', 'OVERTIME', 'PUBLISHED', 'PENDING_APPROVAL'].includes(a.state)
  ).slice(0, 5);

  return (
    <div className="p-6 space-y-6">
      {/* Header banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">Workspace Summary</h1>
          <p className="text-xs text-neutral-500 mt-1">
            Real-time status overview and operational metrics for {user?.company.name}.
          </p>
        </div>
        
        {(user?.role === 'SYSTEM_ADMIN' || user?.role === 'AUCTION_OWNER') && (
          <button 
            onClick={() => navigate('/auctions/create')}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold py-2.5 px-4 rounded-xl shadow-md shadow-indigo-600/15 transition-all duration-200 transform active:scale-95 cursor-pointer"
          >
            <Plus size={15} />
            Create Auction
          </button>
        )}
      </div>

      {/* Stats Widgets */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          /* Stats loading skeleton */
          [1, 2, 3, 4].map(n => (
            <div 
              key={n} 
              className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-neutral-200 dark:border-slate-800/80 shadow-sm flex items-center justify-between animate-pulse"
            >
              <div className="space-y-2">
                <div className="h-3 w-20 bg-neutral-200 dark:bg-slate-800 rounded"></div>
                <div className="h-8 w-10 bg-neutral-200 dark:bg-slate-800 rounded"></div>
              </div>
              <div className="h-10 w-10 bg-neutral-200 dark:bg-slate-800 rounded-xl"></div>
            </div>
          ))
        ) : (
          stats.map((stat, i) => {
            const Icon = stat.icon;
            return (
              <div 
                key={i} 
                className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-neutral-200 dark:border-slate-800/80 shadow-sm flex items-center justify-between transition-all duration-200 hover:shadow-md"
              >
                <div className="space-y-1">
                  <span className="text-xs text-neutral-500 font-semibold">{stat.label}</span>
                  <p className="text-3xl font-bold font-mono text-neutral-900 dark:text-white">{stat.value}</p>
                </div>
                <div className={`p-3 rounded-xl border ${stat.color}`}>
                  <Icon size={20} />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Body grids */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Auctions list widget */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-neutral-200 dark:border-slate-800/80 shadow-sm lg:col-span-2 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-neutral-900 dark:text-white text-sm">Active & Scheduled Auctions</h3>
            <button 
              onClick={() => navigate('/auctions')}
              className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
            >
              View all <ArrowRight size={12} />
            </button>
          </div>

          <div className="divide-y divide-neutral-100 dark:divide-slate-800">
            {loading ? (
              /* Active auctions loading skeleton */
              [1, 2, 3].map(n => (
                <div key={n} className="py-4 flex items-center justify-between animate-pulse">
                  <div className="space-y-2 w-2/3">
                    <div className="flex gap-2">
                      <div className="h-4 w-14 bg-neutral-200 dark:bg-slate-800 rounded-full"></div>
                      <div className="h-3 w-16 bg-neutral-200 dark:bg-slate-800 rounded"></div>
                    </div>
                    <div className="h-4 w-3/4 bg-neutral-200 dark:bg-slate-800 rounded"></div>
                  </div>
                  <div className="h-8 w-20 bg-neutral-200 dark:bg-slate-800 rounded-lg"></div>
                </div>
              ))
            ) : activeOrUpcoming.length === 0 ? (
              <div className="py-8 text-center text-xs text-neutral-400">No active or pending auctions currently</div>
            ) : (
              activeOrUpcoming.map((auc) => (
                <div key={auc.id} className="py-3.5 flex items-center justify-between group">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                        ['LIVE', 'OVERTIME'].includes(auc.state)
                          ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                          : auc.state === 'PENDING_APPROVAL'
                          ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                          : 'bg-indigo-500/10 text-indigo-600 border border-indigo-500/20'
                      }`}>
                        {['LIVE', 'OVERTIME'].includes(auc.state) && <Radio size={9} className="animate-pulse" />}
                        {auc.state}
                      </span>
                      <span className="text-[10px] font-mono text-neutral-400">{getAuctionDisplayId(auc.id).id}</span>
                      <span className="text-[9px] text-zinc-400 flex items-center gap-1">
                        <Clock size={10} />
                        {getRelativeTimeString(auc.updatedAt)}
                      </span>
                    </div>
                    <p className="text-sm font-bold text-neutral-900 dark:text-white group-hover:text-indigo-600 transition">
                      {auc.title}
                    </p>
                    <p className="text-[11px] text-neutral-500">
                      {auc.participants?.length || 0} participants mapped
                    </p>
                  </div>
                  <button 
                    onClick={() => navigate(
                      ['LIVE', 'OVERTIME'].includes(auc.state)
                        ? `/auctions/${auc.id}/live`
                        : `/auctions/${auc.id}`
                    )}
                    className="text-xs font-bold bg-neutral-100 hover:bg-neutral-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-neutral-700 dark:text-slate-300 py-1.5 px-3 rounded-lg transition cursor-pointer"
                  >
                    {['LIVE', 'OVERTIME'].includes(auc.state) ? 'Open Console' : 'View'}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Quick Operations cards */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-neutral-200 dark:border-slate-800/80 shadow-sm space-y-4">
          <h3 className="font-bold text-neutral-900 dark:text-white text-sm flex items-center gap-1.5">
            <ShieldCheck size={16} className="text-indigo-600" />
            Control Operations
          </h3>
          <p className="text-[11px] text-neutral-500 leading-normal">
            Quick links to access global settings, vendor master directories, and audit files.
          </p>

          <div className="space-y-2 pt-2">
            <button 
              onClick={() => navigate('/settings')}
              className="flex w-full items-center justify-between p-3 rounded-xl border border-neutral-200 dark:border-slate-800 hover:bg-indigo-50/20 hover:border-indigo-600/30 dark:hover:bg-slate-800/50 transition-all text-xs font-semibold text-neutral-700 dark:text-slate-300 cursor-pointer"
            >
              <span>Manage Users & Roles</span>
              <ArrowRight size={13} className="text-neutral-400" />
            </button>
            <button 
              onClick={() => navigate('/settings')}
              className="flex w-full items-center justify-between p-3 rounded-xl border border-neutral-200 dark:border-slate-800 hover:bg-indigo-50/20 hover:border-indigo-600/30 dark:hover:bg-slate-800/50 transition-all text-xs font-semibold text-neutral-700 dark:text-slate-300 cursor-pointer"
            >
              <span>Vendor Master List</span>
              <ArrowRight size={13} className="text-neutral-400" />
            </button>
            <button 
              onClick={() => navigate('/audit-trail')}
              className="flex w-full items-center justify-between p-3 rounded-xl border border-neutral-200 dark:border-slate-800 hover:bg-indigo-50/20 hover:border-indigo-600/30 dark:hover:bg-slate-800/50 transition-all text-xs font-semibold text-neutral-700 dark:text-slate-300 cursor-pointer"
            >
              <span>Export Compliance Audit Log</span>
              <ArrowRight size={13} className="text-neutral-400" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
