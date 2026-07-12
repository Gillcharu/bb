import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';
import {
  Play, Pause, Square, Clock,
  Activity, BarChart3, AlertTriangle, CheckCircle2, X
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { getActiveToken } from '../utils/tokenHelper';
import { formatTime, currencySymbol } from '../utils/format';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000';

const LINE_COLORS = ['#10B981', '#6366F1', '#F59E0B', '#EC4899', '#06B6D4', '#6B7280'];

const AdminLiveConsole: React.FC = () => {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [auction, setAuction] = useState<any>(null);

  // Rankings & bids history sync
  const [rankings, setRankings] = useState<any[]>([]);
  const [bidHistory, setBidHistory] = useState<any[]>([]);
  const [socketConnected, setSocketConnected] = useState(false);

  // Server-anchored countdown
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [endAtMs, setEndAtMs] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());

  // Toasts + modals
  const [toasts, setToasts] = useState<{ id: number; message: string; type: 'success' | 'error' }[]>([]);
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [extendMinutes, setExtendMinutes] = useState('5');
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [acting, setActing] = useState(false);

  const socketRef = useRef<Socket | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    const toastId = Date.now();
    setToasts(prev => [...prev, { id: toastId, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== toastId));
    }, 4000);
  };

  const fetchLiveState = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/auctions/${id}/live-state`);
      const data = res.data.data;
      setAuction(data);
      setRankings(data.rankings || []);
      setBidHistory(data.bidHistory || []);
      setLoadError(null);
      if (data.serverNow) {
        setServerOffsetMs(new Date(data.serverNow).getTime() - Date.now());
      }
      setEndAtMs(data.endAt ? new Date(data.endAt).getTime() : null);
    } catch (err: any) {
      setLoadError(err.response?.data?.error?.message || 'Failed to load the live auction state.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchLiveState();

    const token = getActiveToken();
    const socket = io(SOCKET_URL, {
      auth: { token },
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketConnected(true);
      socket.emit('join', { auctionId: id });
      fetchLiveState();
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
    });

    socket.on('auction.timer.updated', (data: { endAt?: string; serverNow?: string }) => {
      if (data.serverNow) {
        setServerOffsetMs(new Date(data.serverNow).getTime() - Date.now());
      }
      if (data.endAt) {
        setEndAtMs(new Date(data.endAt).getTime());
      }
    });

    socket.on('bid.submitted', () => {
      fetchLiveState();
    });

    socket.on('auction.extended', (data: { extensionMins?: number; endAt?: string }) => {
      if (data.endAt) {
        setEndAtMs(new Date(data.endAt).getTime());
      }
      showToast(`Auction extended by ${data.extensionMins ?? '?'} minutes (anti-sniping protection).`);
      fetchLiveState();
    });

    socket.on('auction.closed', () => {
      showToast('Auction has completed and final rankings are locked.', 'error');
      fetchLiveState();
    });

    socket.on('auction.state.changed', () => {
      fetchLiveState();
    });

    socket.on('participant.rank.updated', () => {
      fetchLiveState();
    });

    const clockTicker = setInterval(() => setNowTick(Date.now()), 1000);

    return () => {
      socket.disconnect();
      clearInterval(clockTicker);
    };
  }, [id, fetchLiveState]);

  const apiAction = async (path: string, body?: any, successMsg?: string) => {
    setActing(true);
    try {
      await axios.post(`${API_URL}/auctions/${id}/${path}`, body || {});
      if (successMsg) showToast(successMsg);
      fetchLiveState();
    } catch (err: any) {
      showToast(err.response?.data?.error?.message || 'Action failed.', 'error');
    } finally {
      setActing(false);
    }
  };

  const handleExtendSubmit = async () => {
    const mins = Number(extendMinutes);
    if (!Number.isInteger(mins) || mins <= 0 || mins > 1440) {
      showToast('Enter a whole number of minutes between 1 and 1440.', 'error');
      return;
    }
    setShowExtendModal(false);
    await apiAction('extend', { durationMinutes: mins }, `Close time extended by ${mins} minutes.`);
  };

  const handleBlockVendor = async (vendorId: string, blocked: boolean) => {
    const endpoint = blocked ? 'unblock' : 'block';
    await apiAction(`participants/${vendorId}/${endpoint}`, {}, blocked ? 'Vendor unblocked.' : 'Vendor blocked.');
  };

  const serverNowMs = nowTick + serverOffsetMs;
  const remainingSeconds = endAtMs !== null ? Math.max(0, Math.floor((endAtMs - serverNowMs) / 1000)) : null;

  const formatCountdown = () => {
    if (remainingSeconds === null) return '--:--:--';
    const hrs = Math.floor(remainingSeconds / 3600);
    const mins = Math.floor((remainingSeconds % 3600) / 60);
    const secs = remainingSeconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const currency = currencySymbol(auction?.baseCurrency);

  if (loading) {
    return <div className="p-6 text-center text-xs text-neutral-400" role="status">Syncing live dashboard...</div>;
  }

  if (loadError && !auction) {
    return (
      <div className="p-8 text-center space-y-3 max-w-sm mx-auto mt-12 border border-dashed border-neutral-300 dark:border-slate-800 rounded-xl">
        <p className="text-sm font-bold text-neutral-800 dark:text-white">Unable to load the live console</p>
        <p className="text-xs text-neutral-500">{loadError}</p>
        <button
          onClick={() => {
            setLoading(true);
            fetchLiveState();
          }}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  // Recharts line formatting (oldest → newest); connectNulls bridges the gaps
  // between different vendors' bid points on the shared time axis.
  const chartData = [...bidHistory].reverse().map(b => ({
    time: formatTime(b.timestamp),
    [b.vendorName]: b.effectiveTotal,
  }));
  const chartVendors = [...new Set(bidHistory.map(b => b.vendorName))];

  const auctionEnded = auction?.state === 'COMPLETED' || auction?.state === 'CANCELLED';

  return (
    <div className="p-6 space-y-6 relative">
      {/* Top Header bar with status indicators & actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-neutral-200 dark:border-slate-800 p-6 rounded-2xl shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
              auction?.state === 'LIVE'
                ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                : auction?.state === 'OVERTIME'
                ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                : 'bg-neutral-500/10 text-neutral-600 border border-neutral-300/20'
            }`}>
              <Activity size={10} className={auction?.state === 'LIVE' ? 'animate-pulse' : ''} aria-hidden="true" />
              {auction?.state}{auction && !auction.enabled && !auctionEnded ? ' (PAUSED)' : ''}
            </span>
            <span className="flex items-center gap-1 text-[10px] text-neutral-400">
              <span className={`h-1.5 w-1.5 rounded-full ${socketConnected ? 'bg-emerald-500' : 'bg-red-500'}`} aria-hidden="true"></span>
              {socketConnected ? 'Real-time Linked' : 'Reconnecting…'}
            </span>
          </div>
          <h2 className="text-lg font-bold text-neutral-900 dark:text-white truncate max-w-md">
            {auction?.title}
          </h2>
        </div>

        {/* Sync countdown timer block */}
        <div className="flex items-center gap-4">
          <div className="bg-slate-50 dark:bg-slate-950/40 border border-neutral-200 dark:border-slate-800 px-4 py-2 rounded-2xl text-center shadow-inner min-w-[7.5rem]">
            <span className="block text-[9px] text-neutral-400 font-bold uppercase tracking-wider">Remaining Time</span>
            <span className="text-lg font-bold font-mono text-neutral-800 dark:text-white">
              {formatCountdown()}
            </span>
          </div>

          {/* Quick manual overrides */}
          {!auctionEnded && (
            <div className="flex items-center gap-1.5 border border-neutral-200 dark:border-slate-800 p-1 rounded-2xl bg-slate-50/50 dark:bg-slate-900/10">
              {auction?.enabled ? (
                <button
                  onClick={() => apiAction('pause', {}, 'Bidding paused.')}
                  disabled={acting}
                  title="Pause Bidding"
                  aria-label="Pause bidding"
                  className="p-2 bg-white hover:bg-neutral-100 text-amber-500 rounded-xl border border-neutral-200 shadow-sm cursor-pointer disabled:opacity-50"
                >
                  <Pause size={14} />
                </button>
              ) : (
                <button
                  onClick={() => apiAction('resume', {}, 'Bidding resumed.')}
                  disabled={acting}
                  title="Resume Bidding"
                  aria-label="Resume bidding"
                  className="p-2 bg-white hover:bg-neutral-100 text-emerald-500 rounded-xl border border-neutral-200 shadow-sm cursor-pointer disabled:opacity-50"
                >
                  <Play size={14} />
                </button>
              )}
              <button
                onClick={() => setShowExtendModal(true)}
                disabled={acting}
                title="Extend Bidding Time"
                aria-label="Extend bidding time"
                className="p-2 bg-white hover:bg-neutral-100 text-indigo-600 rounded-xl border border-neutral-200 shadow-sm cursor-pointer disabled:opacity-50"
              >
                <Clock size={14} />
              </button>
              <button
                onClick={() => setShowStopConfirm(true)}
                disabled={acting}
                title="Stop Bidding"
                aria-label="Stop bidding"
                className="p-2 bg-white hover:bg-neutral-100 text-red-500 rounded-xl border border-neutral-200 shadow-sm cursor-pointer disabled:opacity-50"
              >
                <Square size={14} className="fill-red-500" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Grid zones */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left zones: Leaderboards */}
        <div className="xl:col-span-2 space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-neutral-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="font-bold text-neutral-900 dark:text-white text-sm">Real-time Leaderboard Rankings</h3>

            <div className="border border-neutral-100 dark:border-slate-800 rounded-xl overflow-x-auto text-xs">
              <table className="w-full text-left border-collapse min-w-[560px]">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/60 font-bold border-b border-neutral-200 dark:border-slate-800 text-neutral-400">
                    <th className="p-3" scope="col">Rank</th>
                    <th className="p-3" scope="col">Vendor Name</th>
                    <th className="p-3" scope="col">Current Bid</th>
                    <th className="p-3" scope="col">Effective Total</th>
                    <th className="p-3 text-right" scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-slate-800">
                  {rankings.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-neutral-400 italic">No participants mapped to this auction.</td>
                    </tr>
                  ) : (
                    rankings.map((r, idx) => (
                      <tr key={r.vendorId} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                        <td className="p-3">
                          <span className={`h-5 w-5 rounded-full flex items-center justify-center font-bold text-[10px] ${
                            idx === 0 && r.effectiveTotal !== null ? 'bg-emerald-500 text-white' : 'bg-neutral-100 dark:bg-slate-800 text-neutral-500'
                          }`}>
                            {r.effectiveTotal !== null ? idx + 1 : '—'}
                          </span>
                        </td>
                        <td className="p-3 font-semibold">
                          {r.vendorName}
                          {r.blocked && <span className="ml-2 text-[9px] font-bold uppercase text-red-500">Blocked</span>}
                        </td>
                        <td className="p-3 font-mono">
                          {r.currentBid != null ? `${currency}${Number(r.currentBid).toLocaleString()}` : '--'}
                        </td>
                        <td className="p-3 font-bold font-mono">
                          {r.effectiveTotal != null ? `${currency}${Number(r.effectiveTotal).toLocaleString()}` : '--'}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => handleBlockVendor(r.vendorId, r.blocked)}
                            disabled={acting}
                            className={`px-2 py-1 rounded text-[10px] font-bold border transition cursor-pointer disabled:opacity-50 ${
                              r.blocked
                                ? 'bg-red-500/10 text-red-500 border-red-500/20'
                                : 'bg-indigo-50 text-indigo-600 border-indigo-200'
                            }`}
                          >
                            {r.blocked ? 'Unblock' : 'Block'}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Historical line chart */}
          <div className="bg-white dark:bg-slate-900 border border-neutral-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="font-bold text-neutral-900 dark:text-white text-sm flex items-center gap-1">
              <BarChart3 size={15} aria-hidden="true" />
              Bidding Trajectory Trend
            </h3>
            <div className="h-64">
              {chartData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-neutral-400 italic">
                  The trend chart will appear once bids are placed.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <XAxis dataKey="time" tick={{ fontSize: 9 }} />
                    <YAxis tick={{ fontSize: 9 }} domain={['auto', 'auto']} />
                    <Tooltip wrapperStyle={{ fontSize: 10 }} />
                    {chartVendors.map((name, i) => (
                      <Line
                        key={name}
                        type="monotone"
                        dataKey={name}
                        stroke={LINE_COLORS[i % LINE_COLORS.length]}
                        strokeWidth={2}
                        dot={{ r: 2 }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* Right zones: Bid History Logs */}
        <div className="space-y-6 text-xs">
          <div className="bg-white dark:bg-slate-900 border border-neutral-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4 max-h-[36rem] overflow-y-auto">
            <h3 className="font-bold text-neutral-900 dark:text-white text-sm">Chronological Bid Logs</h3>
            <div className="space-y-3">
              {bidHistory.length === 0 ? (
                <p className="text-neutral-400 italic text-center py-6">No bids placed yet.</p>
              ) : (
                bidHistory.map((b, idx) => (
                  <div key={b.id || idx} className="p-3 border border-neutral-100 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-950/20 space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="font-bold">
                        {b.vendorName}
                        {b.submittedAsSurrogate && <span className="ml-1.5 text-[9px] font-bold uppercase text-amber-600">Surrogate</span>}
                      </span>
                      <span className="text-[10px] text-neutral-400">
                        {formatTime(b.timestamp)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center pt-1 border-t border-dashed border-neutral-200 dark:border-slate-800">
                      <span className="text-neutral-500">Effective Total:</span>
                      <span className="font-mono font-bold text-indigo-600">
                        {currency}{Number(b.effectiveTotal).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Extend modal */}
      {showExtendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-label="Extend auction">
          <div className="bg-white dark:bg-slate-900 border border-neutral-200 dark:border-slate-800 rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-neutral-900 dark:text-white">Extend Close Time</h3>
            <div className="space-y-1.5">
              <label htmlFor="extend-mins" className="block text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                Extension duration (minutes)
              </label>
              <input
                id="extend-mins"
                type="number"
                min="1"
                max="1440"
                value={extendMinutes}
                onChange={(e) => setExtendMinutes(e.target.value)}
                className="w-full border border-neutral-200 dark:border-slate-800 rounded-xl p-3 text-xs bg-white dark:bg-slate-950 focus:outline-none focus:ring-1 focus:ring-indigo-600 text-neutral-800 dark:text-neutral-200"
              />
            </div>
            <div className="flex gap-2.5 justify-end pt-2">
              <button
                onClick={() => setShowExtendModal(false)}
                className="px-4 py-2 border border-neutral-200 dark:border-slate-800 rounded-xl text-xs font-semibold hover:bg-neutral-100 dark:hover:bg-slate-800 text-neutral-600 dark:text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleExtendSubmit}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold cursor-pointer"
              >
                Extend
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stop confirmation modal */}
      {showStopConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-label="Stop auction">
          <div className="bg-white dark:bg-slate-900 border border-neutral-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-full bg-red-500/10 text-red-500 border border-red-500/20">
                <AlertTriangle size={20} aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-neutral-900 dark:text-white">Stop Auction</h3>
                <p className="text-xs text-neutral-500 leading-relaxed">
                  This immediately closes bidding and locks the final rankings. This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-2.5 justify-end pt-2">
              <button
                onClick={() => setShowStopConfirm(false)}
                className="px-4 py-2 border border-neutral-200 dark:border-slate-800 rounded-xl text-xs font-semibold hover:bg-neutral-100 dark:hover:bg-slate-800 text-neutral-600 dark:text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowStopConfirm(false);
                  apiAction('stop', {}, 'Auction stopped. Final rankings locked.');
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold cursor-pointer"
              >
                Stop Auction
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
              <span className="text-xs font-semibold leading-relaxed">{toast.message}</span>
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

export default AdminLiveConsole;
