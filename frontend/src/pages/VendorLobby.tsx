import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';
import { CheckCircle2, Download } from 'lucide-react';
import { getActiveToken } from '../utils/tokenHelper';
import { formatDateTime, formatTime, formatDate, currencySymbol } from '../utils/format';
import { getAuctionDisplayId } from '../utils/auctionHelper';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000';

const VendorLobby: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [auction, setAuction] = useState<any>(null);
  const [socketConnected, setSocketConnected] = useState(false);

  // Server-anchored clock
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [startAtMs, setStartAtMs] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());

  // Compliance documents
  const [documents, setDocuments] = useState<{ type: string; content: string; version: number }[]>([]);
  const [rulesReviewed, setRulesReviewed] = useState(false);

  // Vendor details
  const [vendorName, setVendorName] = useState('');
  const [vendorCode, setVendorCode] = useState('');

  // Live started flag & redirect countdown
  const [isLiveStarted, setIsLiveStarted] = useState(false);
  const [redirectCountdown, setRedirectCountdown] = useState(3);

  const socketRef = useRef<Socket | null>(null);

  const fetchLobbyState = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/auctions/${id}/live-state`);
      const data = res.data.data;
      setAuction(data);
      setLoadError(null);

      if (data.serverNow) {
        setServerOffsetMs(new Date(data.serverNow).getTime() - Date.now());
      }
      setStartAtMs(data.startAt ? new Date(data.startAt).getTime() : null);

      if (data.you) {
        setVendorName(data.you.vendorName || '');
        setVendorCode(data.you.vendorId ? `VEN-${data.you.vendorId.split('-')[0].toUpperCase()}` : '');
      }

      if (['LIVE', 'OVERTIME'].includes(data.state)) {
        setIsLiveStarted(true);
      }
    } catch (err: any) {
      setLoadError(err.response?.data?.error?.message || 'Unable to sync the waiting room.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/auctions/${id}/terms`);
      setDocuments(res.data.data || []);
    } catch {
      setDocuments([]);
    }
  }, [id]);

  useEffect(() => {
    fetchLobbyState();
    fetchDocuments();

    const token = getActiveToken(id);
    const socket = io(SOCKET_URL, {
      auth: { token },
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketConnected(true);
      socket.emit('join', { auctionId: id });
      fetchLobbyState();
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
    });

    socket.on('auction.timer.updated', (data: { serverNow?: string }) => {
      if (data.serverNow) {
        setServerOffsetMs(new Date(data.serverNow).getTime() - Date.now());
      }
    });

    socket.on('auction.started', () => {
      setIsLiveStarted(true);
    });

    socket.on('auction.state.changed', (data: { state: string }) => {
      if (['LIVE', 'OVERTIME'].includes(data.state)) {
        setIsLiveStarted(true);
      }
    });

    const clockTicker = setInterval(() => setNowTick(Date.now()), 1000);

    return () => {
      socket.disconnect();
      clearInterval(clockTicker);
    };
  }, [id, fetchLobbyState, fetchDocuments]);

  // Redirect countdown once live
  useEffect(() => {
    if (!isLiveStarted) return;

    const interval = setInterval(() => {
      setRedirectCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          navigate(`/vendor/auctions/${id}/live`);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isLiveStarted, id, navigate]);

  const serverNowMs = nowTick + serverOffsetMs;
  const remainingSeconds = startAtMs !== null ? Math.max(0, Math.floor((startAtMs - serverNowMs) / 1000)) : null;

  useEffect(() => {
    if (remainingSeconds !== null && remainingSeconds <= 0 && startAtMs !== null && !isLiveStarted) {
      // Start time reached; re-check state with the server.
      fetchLobbyState();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingSeconds === 0]);

  const formatCountdown = () => {
    if (remainingSeconds === null || isLiveStarted) return '00 : 00 : 00';
    const hrs = Math.floor(remainingSeconds / 3600);
    const mins = Math.floor((remainingSeconds % 3600) / 60);
    const secs = remainingSeconds % 60;
    return `${hrs.toString().padStart(2, '0')} : ${mins.toString().padStart(2, '0')} : ${secs.toString().padStart(2, '0')}`;
  };

  const handleDownload = (docType: string, label: string) => {
    const doc = documents.find(d => d.type === docType);
    const content = doc
      ? `${label} (v${doc.version})\n${'='.repeat(40)}\n\n${doc.content}\n`
      : `${label}\n${'='.repeat(40)}\n\nDocument not yet published. Contact your auction administrator.\n`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${label.replace(/[^a-z0-9]+/gi, '_')}.txt`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    if (docType === 'RULES') {
      setRulesReviewed(true);
    }
  };

  const currency = currencySymbol(auction?.baseCurrency);
  const rules = auction?.rules;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-xs text-slate-400" role="status">
        Loading Pre-Auction Lobby...
      </div>
    );
  }

  if (loadError && !auction) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-3 p-6 text-center text-slate-300">
        <p className="text-sm font-semibold">Unable to load the lobby</p>
        <p className="text-xs text-slate-500 max-w-sm">{loadError}</p>
        <button
          onClick={() => {
            setLoading(true);
            fetchLobbyState();
          }}
          className="mt-2 px-4 py-2 bg-white text-slate-950 rounded-xl text-xs font-bold uppercase tracking-widest cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans p-6 flex flex-col justify-between">

      {/* Top Header */}
      <header className="max-w-7xl w-full mx-auto flex flex-wrap items-center justify-between gap-3 border-b border-slate-900 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white font-bold shadow-lg shadow-indigo-600/20">
            B
          </div>
          <div>
            <span className="font-bold text-sm tracking-tight text-white">Black Box Procurement</span>
            <p className="text-[9px] text-slate-500 font-semibold tracking-wider uppercase mt-0.5">Pre-Auction Lobby</p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <span className="text-[10px] text-slate-500 border border-slate-800 px-2 py-0.5 rounded-full bg-slate-900/40 hidden sm:inline">
            ✓ Session scoped to this auction only
          </span>
          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
            socketConnected ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${socketConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} aria-hidden="true"></span>
            {socketConnected ? 'Lobby Active' : 'Disconnected'}
          </span>
        </div>
      </header>

      {/* Main Grid Core */}
      <main className="max-w-6xl w-full mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6 my-8 items-start">

        {/* Left and Middle Columns */}
        <div className="lg:col-span-2 space-y-6">

          {/* A. Auction Headline */}
          <div className="bg-slate-900/60 border border-slate-900 rounded-3xl p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4">
              <span className="text-[10px] uppercase font-bold tracking-widest bg-indigo-500/10 text-indigo-400 py-1 px-2.5 rounded-full border border-indigo-500/20">
                Lobby
              </span>
            </div>
            <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider">Target Project Scope</span>
            <h1 className="text-xl font-bold text-white mt-1.5">{auction?.title}</h1>
            <p className="text-xs text-slate-400 mt-2.5 leading-relaxed">{auction?.description || 'No scope description provided.'}</p>
          </div>

          {/* B. Countdown timer block */}
          <div className="bg-gradient-to-br from-indigo-950/20 to-slate-900 border border-indigo-900/30 rounded-3xl p-6 text-center shadow-xl space-y-4">
            <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest block">
              {isLiveStarted ? 'Auction Is Live' : 'Auction Starts In'}
            </span>
            <div className="text-4xl font-extrabold text-white font-mono tracking-wide py-2" role="timer" aria-live="off">
              {formatCountdown()}
            </div>
            <div className="flex justify-center items-center gap-6 text-[10px] text-slate-500 font-bold uppercase" aria-hidden="true">
              <span>Hours</span>
              <span>Minutes</span>
              <span>Seconds</span>
            </div>
          </div>

          {/* C. Specifications and schedule */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            <div className="bg-slate-900/40 border border-slate-900 rounded-3xl p-5 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-white border-b border-slate-800 pb-2">
                Auction Specifications
              </h3>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Auction ID:</span>
                  <span className="font-mono text-white font-semibold">{getAuctionDisplayId(auction?.id).id}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Auction Type:</span>
                  <span className="text-white font-semibold">{rules?.auctionType === 'FORWARD' ? 'Forward Auction' : 'Reverse Auction'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Base Currency:</span>
                  <span className="text-white font-semibold font-mono">{auction?.baseCurrency || 'INR'}</span>
                </div>
                <div className="flex justify-between items-center pt-1.5 border-t border-slate-800">
                  <span className="text-slate-400">{rules?.auctionType === 'FORWARD' ? 'Min Increment:' : 'Min Decrement:'}</span>
                  <span className="text-white font-semibold font-mono">
                    {rules?.minDecrement != null ? `${currency}${Number(rules.minDecrement).toLocaleString()}` : '—'}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-slate-900/40 border border-slate-900 rounded-3xl p-5 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-white border-b border-slate-800 pb-2">
                Auction Schedule (your local time)
              </h3>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center gap-2">
                  <span className="text-slate-400">Starts:</span>
                  <span className="text-white font-semibold text-right">{formatDateTime(auction?.startAt)}</span>
                </div>
                <div className="flex justify-between items-center gap-2">
                  <span className="text-slate-400">Ends:</span>
                  <span className="text-white font-semibold text-right">{formatDateTime(auction?.endAt)}</span>
                </div>
                <div className="flex justify-between items-center pt-1.5 border-t border-slate-800">
                  <span className="text-slate-400">Overtime:</span>
                  <span className={`font-semibold ${rules?.overtimeEnabled ? 'text-emerald-400' : 'text-slate-400'}`}>
                    {rules?.overtimeEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </div>
            </div>

          </div>

          {/* D. Documents download section */}
          <div className="bg-slate-900/40 border border-slate-900 rounded-3xl p-5 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-white border-b border-slate-800 pb-2">
              Compliance Documentation
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[10px] font-bold">
              <button
                onClick={() => handleDownload('TERMS', 'Terms & Conditions')}
                className="flex items-center gap-1.5 p-2.5 border border-slate-800 rounded-xl bg-slate-900/60 hover:bg-slate-800 text-slate-300 transition text-left cursor-pointer"
              >
                <Download size={12} className="text-indigo-400" aria-hidden="true" />
                <span>Terms & Conditions</span>
              </button>
              <button
                onClick={() => handleDownload('RULES', 'Auction Rules')}
                className="flex items-center gap-1.5 p-2.5 border border-slate-800 rounded-xl bg-slate-900/60 hover:bg-slate-800 text-slate-300 transition text-left cursor-pointer"
              >
                <Download size={12} className="text-indigo-400" aria-hidden="true" />
                <span>Auction Rules</span>
              </button>
              <button
                onClick={() => handleDownload('DISCLOSURE', 'Conflict Disclosures')}
                className="flex items-center gap-1.5 p-2.5 border border-slate-800 rounded-xl bg-slate-900/60 hover:bg-slate-800 text-slate-300 transition text-left cursor-pointer"
              >
                <Download size={12} className="text-indigo-400" aria-hidden="true" />
                <span>Conflict Disclosures</span>
              </button>
            </div>
          </div>

          {/* E. Server time & notices */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            <div className="bg-slate-900 border border-slate-900 p-5 rounded-3xl text-center space-y-2">
              <span className="block text-[9px] text-slate-500 font-bold uppercase tracking-wider">Synchronized Server Time</span>
              <span className="text-[10px] text-slate-400 font-mono block">{formatDate(new Date(serverNowMs))}</span>
              <span className="text-xl font-bold font-mono text-indigo-400 mt-1 block">{formatTime(new Date(serverNowMs))}</span>
            </div>

            <div className="md:col-span-2 bg-slate-900/40 border border-slate-900 p-5 rounded-3xl space-y-2.5 text-[11px] leading-relaxed text-slate-400">
              <h4 className="font-bold text-white text-xs">Pre-bidding Guidelines</h4>
              <ul className="list-disc list-inside space-y-1.5 pl-1">
                <li>Refreshing your browser will not log you out or affect your session parameters.</li>
                <li>All bid amounts are checked against decrement rules on submission.</li>
                <li>The countdown is synchronized to the server clock automatically.</li>
              </ul>
            </div>

          </div>

          <div className="text-center text-[10px] text-slate-600 border-t border-slate-900/50 pt-4">
            All bid timestamps are recorded by the server — your connection speed does not affect bid validity.
          </div>

        </div>

        {/* Right Sidebar Column */}
        <div className="space-y-6">

          {/* A. My Participation Badge */}
          <div className="bg-slate-900/60 border border-slate-900 rounded-3xl p-5 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-white border-b border-slate-800 pb-2">
              Your Participation Details
            </h3>
            <div className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-2 border-b border-slate-900 pb-2.5">
                <span className="text-slate-500 font-bold text-[9px] uppercase">Vendor Name</span>
                <span className="font-bold text-white text-right truncate">{vendorName || '—'}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 border-b border-slate-900 pb-2.5">
                <span className="text-slate-500 font-bold text-[9px] uppercase">Vendor ID</span>
                <span className="font-mono text-white text-right font-semibold">{vendorCode || '—'}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 border-b border-slate-900 pb-2.5">
                <span className="text-slate-500 font-bold text-[9px] uppercase">Access Scope</span>
                <span className="text-slate-400 text-right">Auction Specific</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <span className="text-slate-500 font-bold text-[9px] uppercase">Role</span>
                <span className="text-slate-400 text-right">Vendor</span>
              </div>
            </div>
          </div>

          {/* B. Invitation Status */}
          <div className="bg-slate-900/60 border border-slate-900 rounded-3xl p-5 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-white border-b border-slate-800 pb-2">
              Invitation Status
            </h3>
            <div className="space-y-2 text-xs">
              <div className="p-3 bg-indigo-950/20 border border-indigo-900/20 rounded-xl space-y-1">
                <span className="block text-[10px] font-bold text-indigo-400 uppercase">Temporary Credentials</span>
                <span className="text-[10px] text-slate-400">Expire after auction completion</span>
              </div>
              <div className="flex items-center gap-1.5 text-emerald-500 text-[11px] font-semibold pl-1 pt-1">
                <CheckCircle2 size={13} aria-hidden="true" /> Invitation Verified
              </div>
            </div>
          </div>

          {/* C. Status checklists */}
          <div className="bg-slate-900/60 border border-slate-900 rounded-3xl p-5 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-white border-b border-slate-800 pb-2">
              Readiness Checklist
            </h3>
            <div className="space-y-3 text-[11px]">
              {[
                { label: 'Login Authentication', val: 'Verified', checked: true },
                { label: 'Terms & Conditions', val: auction?.you?.acceptedTerms ? 'Accepted' : 'Pending', checked: !!auction?.you?.acceptedTerms },
                { label: 'Auction Rules Review', val: rulesReviewed ? 'Reviewed' : 'Review Recommended', checked: rulesReviewed },
                { label: 'Real-time Connection', val: socketConnected ? 'Connected' : 'Connecting...', checked: socketConnected },
              ].map((c, idx) => (
                <div key={idx} className="flex justify-between items-center">
                  <span className="text-slate-400">{c.label}</span>
                  <span className={`flex items-center gap-1 font-semibold ${c.checked ? 'text-emerald-400' : 'text-slate-500'}`}>
                    <CheckCircle2 size={13} aria-hidden="true" />
                    {c.val}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* D. CTA action */}
          <button
            onClick={() => navigate(`/vendor/auctions/${id}/live`)}
            disabled={!isLiveStarted}
            className={`w-full py-4 rounded-2xl text-xs font-bold uppercase tracking-widest transition duration-300 shadow-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
              isLiveStarted
                ? 'bg-white text-slate-950 hover:bg-slate-100 cursor-pointer'
                : 'bg-slate-900 border border-slate-800 text-slate-600 cursor-not-allowed'
            }`}
          >
            {isLiveStarted
              ? `ENTER LIVE AUCTION${redirectCountdown > 0 ? ` (Redirecting in ${redirectCountdown}...)` : ''}`
              : 'Waiting For Auction Start...'}
          </button>

        </div>

      </main>

      {/* Footer copyright */}
      <footer className="max-w-7xl w-full mx-auto border-t border-slate-900 pt-4 text-center text-[10px] text-slate-600 uppercase tracking-widest">
        © 2026 Black Box Limited • Confidential Compliance Gateway
      </footer>

    </div>
  );
};

export default VendorLobby;
