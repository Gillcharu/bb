import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';
import { CheckCircle2, Download, Sun, Moon } from 'lucide-react';
import { getActiveToken } from '../utils/tokenHelper';
import { formatDateTime, formatTime, formatDate, currencySymbol } from '../utils/format';
import { getAuctionDisplayId } from '../utils/auctionHelper';
import BlackBoxLogo from '../components/BlackBoxLogo';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000';

const VendorLobby: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [auction, setAuction] = useState<any>(null);
  const [socketConnected, setSocketConnected] = useState(false);

  // Theme (shared global `.dark` class, persisted like the rest of the app)
  const [isLightTheme, setIsLightTheme] = useState(() => localStorage.getItem('theme') === 'light');
  useEffect(() => {
    if (isLightTheme) {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    } else {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    }
  }, [isLightTheme]);

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
    const socket = io(SOCKET_URL, { auth: { token } });
    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketConnected(true);
      socket.emit('join', { auctionId: id });
      fetchLobbyState();
    });
    socket.on('disconnect', () => setSocketConnected(false));
    socket.on('auction.timer.updated', (data: { serverNow?: string }) => {
      if (data.serverNow) setServerOffsetMs(new Date(data.serverNow).getTime() - Date.now());
    });
    socket.on('auction.started', () => setIsLiveStarted(true));
    socket.on('auction.state.changed', (data: { state: string }) => {
      if (['LIVE', 'OVERTIME'].includes(data.state)) setIsLiveStarted(true);
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
    if (docType === 'RULES') setRulesReviewed(true);
  };

  const currency = currencySymbol(auction?.baseCurrency);
  const rules = auction?.rules;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] dark:bg-[#070708] flex items-center justify-center text-xs text-[#6B7280] dark:text-slate-400" role="status">
        Loading Pre-Auction Lobby...
      </div>
    );
  }

  if (loadError && !auction) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] dark:bg-[#070708] flex flex-col items-center justify-center gap-3 p-6 text-center text-[#0F172A] dark:text-slate-200">
        <p className="text-sm font-semibold">Unable to load the lobby</p>
        <p className="text-xs text-[#6B7280] dark:text-slate-500 max-w-sm">{loadError}</p>
        <button
          onClick={() => { setLoading(true); fetchLobbyState(); }}
          className="mt-2 px-4 py-2 bg-[#2563EB] text-white rounded-xl text-xs font-bold uppercase tracking-widest cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  const card = 'bg-white dark:bg-slate-900 border border-[#E4E7EC] dark:border-slate-800';
  const heading = 'text-xs font-bold uppercase tracking-wider text-[#0F172A] dark:text-white border-b border-[#E4E7EC] dark:border-slate-800 pb-2';
  const label = 'text-[#6B7280] dark:text-slate-400';
  const value = 'text-[#0F172A] dark:text-white font-semibold';

  return (
    <div className="min-h-screen bg-[#F5F7FA] dark:bg-[#070708] text-[#0F172A] dark:text-slate-200 font-sans p-6 flex flex-col justify-between">

      {/* Top Header */}
      <header className="max-w-7xl w-full mx-auto flex flex-wrap items-center justify-between gap-3 border-b border-[#E4E7EC] dark:border-slate-900 pb-4">
        <div className="flex items-center gap-3">
          <BlackBoxLogo className="h-9 w-9" color={isLightTheme ? '#0F172A' : 'white'} />
          <div>
            <span className="font-bold text-sm tracking-tight text-[#0F172A] dark:text-white">Black Box</span>
            <p className="text-[9px] text-[#6B7280] dark:text-slate-500 font-semibold tracking-wider uppercase mt-0.5">Pre-Auction Lobby</p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <button
            type="button"
            onClick={() => setIsLightTheme(!isLightTheme)}
            title={isLightTheme ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
            aria-label={isLightTheme ? 'Switch to dark mode' : 'Switch to light mode'}
            className="p-2 rounded-lg border border-[#E4E7EC] dark:border-slate-800 text-[#6B7280] dark:text-slate-400 hover:bg-[#F5F7FA] dark:hover:bg-slate-800 cursor-pointer"
          >
            {isLightTheme ? <Moon size={14} /> : <Sun size={14} />}
          </button>
          <span className="text-[10px] text-[#6B7280] dark:text-slate-500 border border-[#E4E7EC] dark:border-slate-800 px-2 py-0.5 rounded-full hidden sm:inline">
            ✓ Session scoped to this auction only
          </span>
          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
            socketConnected ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-500' : 'bg-red-500/10 text-red-600 dark:text-red-500'
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${socketConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} aria-hidden="true"></span>
            {socketConnected ? 'Lobby Active' : 'Disconnected'}
          </span>
        </div>
      </header>

      {/* Main Grid */}
      <main className="max-w-6xl w-full mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6 my-8 items-start">

        {/* Left / Middle */}
        <div className="lg:col-span-2 space-y-6">

          {/* Headline */}
          <div className={`${card} rounded-3xl p-6 relative overflow-hidden`}>
            <div className="absolute top-0 right-0 p-4">
              <span className="text-[10px] uppercase font-bold tracking-widest bg-[#2563EB]/10 text-[#2563EB] dark:text-indigo-400 py-1 px-2.5 rounded-full border border-[#2563EB]/20">
                Lobby
              </span>
            </div>
            <span className={`block text-[10px] font-bold uppercase tracking-wider ${label}`}>Target Project Scope</span>
            <h1 className="text-xl font-bold text-[#0F172A] dark:text-white mt-1.5">{auction?.title}</h1>
            <p className={`text-xs mt-2.5 leading-relaxed ${label}`}>{auction?.description || 'No scope description provided.'}</p>
          </div>

          {/* Countdown */}
          <div className={`${card} rounded-3xl p-6 text-center shadow-sm space-y-4`}>
            <span className="text-[10px] font-bold text-[#2563EB] dark:text-indigo-400 uppercase tracking-widest block">
              {isLiveStarted ? 'Auction Is Live' : 'Auction Starts In'}
            </span>
            <div className="text-4xl font-extrabold text-[#0F172A] dark:text-white font-mono tracking-wide py-2" role="timer" aria-live="off">
              {formatCountdown()}
            </div>
            <div className={`flex justify-center items-center gap-6 text-[10px] font-bold uppercase ${label}`} aria-hidden="true">
              <span>Hours</span>
              <span>Minutes</span>
              <span>Seconds</span>
            </div>
          </div>

          {/* Specs + Schedule */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className={`${card} rounded-3xl p-5 space-y-4`}>
              <h3 className={heading}>Auction Specifications</h3>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center">
                  <span className={label}>Auction ID:</span>
                  <span className={`font-mono ${value}`}>{getAuctionDisplayId(auction?.id).id}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className={label}>Auction Type:</span>
                  <span className={value}>{rules?.auctionType === 'FORWARD' ? 'Forward Auction' : 'Reverse Auction'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className={label}>Base Currency:</span>
                  <span className={`font-mono ${value}`}>{auction?.baseCurrency || 'INR'}</span>
                </div>
                <div className="flex justify-between items-center pt-1.5 border-t border-[#E4E7EC] dark:border-slate-800">
                  <span className={label}>{rules?.auctionType === 'FORWARD' ? 'Min Increment:' : 'Min Decrement:'}</span>
                  <span className={`font-mono ${value}`}>
                    {rules?.minDecrement != null ? `${currency}${Number(rules.minDecrement).toLocaleString()}` : '—'}
                  </span>
                </div>
              </div>
            </div>

            <div className={`${card} rounded-3xl p-5 space-y-4`}>
              <h3 className={heading}>Auction Schedule (your local time)</h3>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center gap-2">
                  <span className={label}>Starts:</span>
                  <span className={`text-right ${value}`}>{formatDateTime(auction?.startAt)}</span>
                </div>
                <div className="flex justify-between items-center gap-2">
                  <span className={label}>Ends:</span>
                  <span className={`text-right ${value}`}>{formatDateTime(auction?.endAt)}</span>
                </div>
                <div className="flex justify-between items-center pt-1.5 border-t border-[#E4E7EC] dark:border-slate-800">
                  <span className={label}>Overtime:</span>
                  <span className={`font-semibold ${rules?.overtimeEnabled ? 'text-emerald-600 dark:text-emerald-400' : label}`}>
                    {rules?.overtimeEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Documents */}
          <div className={`${card} rounded-3xl p-5 space-y-4`}>
            <h3 className={heading}>Compliance Documentation</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[10px] font-bold">
              {[
                { type: 'TERMS', label: 'Terms & Conditions' },
                { type: 'RULES', label: 'Auction Rules' },
                { type: 'DISCLOSURE', label: 'Conflict Disclosures' },
              ].map(d => (
                <button
                  key={d.type}
                  onClick={() => handleDownload(d.type, d.label)}
                  className="flex items-center gap-1.5 p-2.5 border border-[#E4E7EC] dark:border-slate-800 rounded-xl bg-[#F5F7FA] dark:bg-slate-900/60 hover:bg-[#E4E7EC]/50 dark:hover:bg-slate-800 text-[#0F172A] dark:text-slate-300 transition text-left cursor-pointer"
                >
                  <Download size={12} className="text-[#2563EB] dark:text-indigo-400" aria-hidden="true" />
                  <span>{d.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Server time & notices */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className={`${card} p-5 rounded-3xl text-center space-y-2`}>
              <span className={`block text-[9px] font-bold uppercase tracking-wider ${label}`}>Synchronized Server Time</span>
              <span className={`text-[10px] font-mono block ${label}`}>{formatDate(new Date(serverNowMs))}</span>
              <span className="text-xl font-bold font-mono text-[#2563EB] dark:text-indigo-400 mt-1 block">{formatTime(new Date(serverNowMs))}</span>
            </div>

            <div className={`md:col-span-2 ${card} p-5 rounded-3xl space-y-2.5 text-[11px] leading-relaxed ${label}`}>
              <h4 className="font-bold text-[#0F172A] dark:text-white text-xs">Pre-bidding Guidelines</h4>
              <ul className="list-disc list-inside space-y-1.5 pl-1">
                <li>Refreshing your browser will not log you out or affect your session parameters.</li>
                <li>All bid amounts are checked against decrement rules on submission.</li>
                <li>The countdown is synchronized to the server clock automatically.</li>
              </ul>
            </div>
          </div>

          <div className={`text-center text-[10px] border-t border-[#E4E7EC] dark:border-slate-900/50 pt-4 ${label}`}>
            All bid timestamps are recorded by the server — your connection speed does not affect bid validity.
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">

          <div className={`${card} rounded-3xl p-5 space-y-4`}>
            <h3 className={heading}>Your Participation Details</h3>
            <div className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-2 border-b border-[#E4E7EC] dark:border-slate-900 pb-2.5">
                <span className={`font-bold text-[9px] uppercase ${label}`}>Vendor Name</span>
                <span className="font-bold text-[#0F172A] dark:text-white text-right truncate">{vendorName || '—'}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 border-b border-[#E4E7EC] dark:border-slate-900 pb-2.5">
                <span className={`font-bold text-[9px] uppercase ${label}`}>Vendor ID</span>
                <span className="font-mono text-[#0F172A] dark:text-white text-right font-semibold">{vendorCode || '—'}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 border-b border-[#E4E7EC] dark:border-slate-900 pb-2.5">
                <span className={`font-bold text-[9px] uppercase ${label}`}>Access Scope</span>
                <span className={`text-right ${label}`}>Auction Specific</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <span className={`font-bold text-[9px] uppercase ${label}`}>Role</span>
                <span className={`text-right ${label}`}>Vendor</span>
              </div>
            </div>
          </div>

          <div className={`${card} rounded-3xl p-5 space-y-3`}>
            <h3 className={heading}>Invitation Status</h3>
            <div className="space-y-2 text-xs">
              <div className="p-3 bg-[#2563EB]/5 dark:bg-indigo-950/20 border border-[#2563EB]/20 dark:border-indigo-900/20 rounded-xl space-y-1">
                <span className="block text-[10px] font-bold text-[#2563EB] dark:text-indigo-400 uppercase">Temporary Credentials</span>
                <span className={`text-[10px] ${label}`}>Expire after auction completion</span>
              </div>
              <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-500 text-[11px] font-semibold pl-1 pt-1">
                <CheckCircle2 size={13} aria-hidden="true" /> Invitation Verified
              </div>
            </div>
          </div>

          <div className={`${card} rounded-3xl p-5 space-y-4`}>
            <h3 className={heading}>Readiness Checklist</h3>
            <div className="space-y-3 text-[11px]">
              {[
                { label: 'Login Authentication', val: 'Verified', checked: true },
                { label: 'Terms & Conditions', val: auction?.you?.acceptedTerms ? 'Accepted' : 'Pending', checked: !!auction?.you?.acceptedTerms },
                { label: 'Auction Rules Review', val: rulesReviewed ? 'Reviewed' : 'Review Recommended', checked: rulesReviewed },
                { label: 'Real-time Connection', val: socketConnected ? 'Connected' : 'Connecting...', checked: socketConnected },
              ].map((c, idx) => (
                <div key={idx} className="flex justify-between items-center">
                  <span className={label}>{c.label}</span>
                  <span className={`flex items-center gap-1 font-semibold ${c.checked ? 'text-emerald-600 dark:text-emerald-400' : label}`}>
                    <CheckCircle2 size={13} aria-hidden="true" />
                    {c.val}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => navigate(`/vendor/auctions/${id}/live`)}
            disabled={!isLiveStarted}
            className={`w-full py-4 rounded-2xl text-xs font-bold uppercase tracking-widest transition duration-300 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] ${
              isLiveStarted
                ? 'bg-[#2563EB] text-white hover:bg-blue-700 cursor-pointer'
                : 'bg-[#F5F7FA] dark:bg-slate-900 border border-[#E4E7EC] dark:border-slate-800 text-[#6B7280] dark:text-slate-600 cursor-not-allowed'
            }`}
          >
            {isLiveStarted
              ? `ENTER LIVE AUCTION${redirectCountdown > 0 ? ` (Redirecting in ${redirectCountdown}...)` : ''}`
              : 'Waiting For Auction Start...'}
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className={`max-w-7xl w-full mx-auto border-t border-[#E4E7EC] dark:border-slate-900 pt-4 text-center text-[10px] uppercase tracking-widest ${label}`}>
        © 2026 Black Box Limited • Confidential Compliance Gateway
      </footer>
    </div>
  );
};

export default VendorLobby;
