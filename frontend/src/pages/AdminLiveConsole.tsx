import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { io } from 'socket.io-client';
import { 
  Play, Pause, Square, Clock, Users, BarChart3, 
  Activity, ShieldAlert, CheckCircle2, ShieldOff 
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { getActiveToken } from '../utils/tokenHelper';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000';

const AdminLiveConsole: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [auction, setAuction] = useState<any>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  
  // Rankings & bids history sync
  const [rankings, setRankings] = useState<any[]>([]);
  const [bidHistory, setBidHistory] = useState<any[]>([]);
  const [socketConnected, setSocketConnected] = useState(false);

  const socketRef = useRef<any>(null);

  const fetchLiveState = async () => {
    try {
      const res = await axios.get(`${API_URL}/auctions/${id}/live-state`);
      const data = res.data.data;
      setAuction(data);
      setRankings(data.rankings);
      setBidHistory(data.bidHistory);
    } catch (err) {
      console.error('Failed to load initial live state:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveState();

    // Connect to WebSocket namespace
    const token = getActiveToken();
    const socket = io(SOCKET_URL, {
      auth: { token },
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketConnected(true);
      // Join auction room
      socket.emit('join', { auctionId: id, role: 'SYSTEM_ADMIN' });
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
    });

    socket.on('auction.timer.updated', (data: { remainingSeconds: number }) => {
      setRemainingSeconds(data.remainingSeconds);
    });

    socket.on('bid.submitted', () => {
      // Reload rankings leaderboard and bid log upon new bid submissions
      fetchLiveState();
    });

    socket.on('auction.extended', (data: { extensionMins: number }) => {
      alert(`Auction auto-extended by ${data.extensionMins} minutes due to sniper bid protection.`);
      fetchLiveState();
    });

    socket.on('auction.closed', () => {
      alert('Auction has completed and final rankings are locked.');
      fetchLiveState();
    });

    socket.on('auction.state.changed', () => {
      fetchLiveState();
    });

    socket.on('participant.rank.updated', () => {
      fetchLiveState();
    });

    return () => {
      socket.disconnect();
    };
  }, [id]);

  const handlePause = async () => {
    try {
      await axios.post(`${API_URL}/auctions/${id}/pause`);
    } catch (err) {
      console.error('Failed to pause:', err);
    }
  };

  const handleResume = async () => {
    try {
      await axios.post(`${API_URL}/auctions/${id}/resume`);
    } catch (err) {
      console.error('Failed to resume:', err);
    }
  };

  const handleExtend = async () => {
    const mins = prompt('Enter extension duration in minutes:');
    if (!mins || isNaN(Number(mins))) return;
    try {
      await axios.post(`${API_URL}/auctions/${id}/extend`, { durationMinutes: Number(mins) });
    } catch (err) {
      console.error('Failed to manually extend:', err);
    }
  };

  const handleStop = async () => {
    if (!window.confirm('Are you sure you want to stop this auction? Bids will freeze.')) return;
    try {
      await axios.post(`${API_URL}/auctions/${id}/stop`);
    } catch (err) {
      console.error('Failed to terminate:', err);
    }
  };

  const handleBlockVendor = async (vendorId: string, blocked: boolean) => {
    try {
      const endpoint = blocked ? 'unblock' : 'block';
      await axios.post(`${API_URL}/auctions/${id}/participants/${vendorId}/${endpoint}`);
      fetchLiveState();
    } catch (err) {
      console.error('Failed to update vendor blocking state:', err);
    }
  };

  if (loading) {
    return <div className="p-6 text-center text-xs text-neutral-400">Syncing live dashboard...</div>;
  }

  // Format countdown string
  const formatCountdown = () => {
    if (remainingSeconds === null) return '--:--:--';
    const hrs = Math.floor(remainingSeconds / 3600);
    const mins = Math.floor((remainingSeconds % 3600) / 60);
    const secs = remainingSeconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Recharts line formatting
  const chartData = [...bidHistory].reverse().map(b => ({
    time: new Date(b.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    [b.vendorName]: b.effectiveTotal,
  }));

  return (
    <div className="p-6 space-y-6">
      {/* Top Header bar with status indicators & actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-neutral-200 dark:border-slate-800 p-6 rounded-2xl shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
              auction?.state === 'LIVE'
                ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                : auction?.state === 'OVERTIME'
                ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                : 'bg-neutral-500/10 text-neutral-600 border border-neutral-350/20'
            }`}>
              <Activity size={10} className={auction?.state === 'LIVE' ? 'animate-pulse' : ''} />
              {auction?.state}
            </span>
            <span className="flex items-center gap-1 text-[10px] text-neutral-400">
              <span className={`h-1.5 w-1.5 rounded-full ${socketConnected ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
              {socketConnected ? 'Real-time Linked' : 'Connecting Sockets...'}
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
            <span className="text-lg font-bold font-mono text-neutral-850 dark:text-white">
              {formatCountdown()}
            </span>
          </div>

          {/* Quick manual overrides */}
          {auction?.state !== 'COMPLETED' && (
            <div className="flex items-center gap-1.5 border border-neutral-200 dark:border-slate-800 p-1 rounded-2xl bg-slate-50/50 dark:bg-slate-900/10">
              {auction?.enabled ? (
                <button
                  onClick={handlePause}
                  title="Pause Bidding"
                  className="p-2 bg-white hover:bg-neutral-100 text-amber-500 rounded-xl border border-neutral-200 shadow-sm"
                >
                  <Pause size={14} />
                </button>
              ) : (
                <button
                  onClick={handleResume}
                  title="Resume Bidding"
                  className="p-2 bg-white hover:bg-neutral-100 text-emerald-500 rounded-xl border border-neutral-200 shadow-sm"
                >
                  <Play size={14} />
                </button>
              )}
              <button
                onClick={handleExtend}
                title="Extend Bidding Time"
                className="p-2 bg-white hover:bg-neutral-100 text-indigo-600 rounded-xl border border-neutral-200 shadow-sm"
              >
                <Clock size={14} />
              </button>
              <button
                onClick={handleStop}
                title="Stop Bidding"
                className="p-2 bg-white hover:bg-neutral-100 text-red-500 rounded-xl border border-neutral-200 shadow-sm"
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
            
            <div className="border border-neutral-100 dark:border-slate-800 rounded-xl overflow-hidden text-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/60 font-bold border-b border-neutral-200 dark:border-slate-800 text-neutral-400">
                    <th className="p-3">Rank</th>
                    <th className="p-3">Vendor Name</th>
                    <th className="p-3">Current Bid</th>
                    <th className="p-3">Effective Total</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-slate-800">
                  {rankings.map((r, idx) => (
                    <tr key={r.vendorId} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/40">
                      <td className="p-3">
                        <span className={`h-5 w-5 rounded-full flex items-center justify-center font-bold text-[10px] ${
                          idx === 0 ? 'bg-emerald-500 text-white' : 'bg-neutral-100 dark:bg-slate-800 text-neutral-500'
                        }`}>
                          {idx + 1}
                        </span>
                      </td>
                      <td className="p-3 font-semibold">{r.vendorName}</td>
                      <td className="p-3 font-mono">
                        {r.currentBid ? `${auction?.baseCurrency === 'USD' ? '$' : '₹'}${Number(r.currentBid).toLocaleString()}` : '--'}
                      </td>
                      <td className="p-3 font-bold font-mono">
                        {r.effectiveTotal ? `${auction?.baseCurrency === 'USD' ? '$' : '₹'}${Number(r.effectiveTotal).toLocaleString()}` : '--'}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => handleBlockVendor(r.vendorId, r.blocked)}
                          className={`px-2 py-1 rounded text-[10px] font-bold border transition ${
                            r.blocked
                              ? 'bg-red-500/10 text-red-500 border-red-500/20'
                              : 'bg-indigo-50 text-indigo-600 border-indigo-200'
                          }`}
                        >
                          {r.blocked ? 'Unblock' : 'Block'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Historical line charts */}
          <div className="bg-white dark:bg-slate-900 border border-neutral-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="font-bold text-neutral-900 dark:text-white text-sm flex items-center gap-1">
              <BarChart3 size={15} />
              Bidding Trajectory Trend
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <XAxis dataKey="time" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 9 }} />
                  <Tooltip wrapperStyle={{ fontSize: 10 }} />
                  {rankings.map((r, i) => (
                    <Line
                      key={r.vendorName}
                      type="monotone"
                      dataKey={r.vendorName}
                      stroke={i === 0 ? '#10B981' : i === 1 ? '#6366F1' : '#6B7280'}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
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
                  <div key={b.id || idx} className="p-3 border rounded-xl bg-slate-50/50 dark:bg-slate-950/20 space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="font-bold">{b.vendorName}</span>
                      <span className="text-[10px] text-neutral-400">
                        {new Date(b.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center pt-1 border-t border-dashed">
                      <span className="text-neutral-500">Effective Total:</span>
                      <span className="font-mono font-bold text-indigo-650">
                        {auction?.baseCurrency === 'USD' ? '$' : '₹'}{Number(b.effectiveTotal).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminLiveConsole;
