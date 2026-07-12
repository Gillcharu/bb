import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';
import { Download } from 'lucide-react';
import BlackBoxLogo from '../components/BlackBoxLogo';
import { getActiveToken } from '../utils/tokenHelper';
import { formatTime, formatDate, currencySymbol } from '../utils/format';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000';

interface Toast {
  id: string;
  type: 'success' | 'error';
  message: string;
  subtext?: string;
}

const VendorLiveConsole: React.FC = () => {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [auction, setAuction] = useState<any>(null);

  // Real-time states
  const [socketConnected, setSocketConnected] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);

  // Server-anchored clock: offsetMs = serverNow - clientNow. The countdown and
  // the server clock display never trust the local clock alone.
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [endAtMs, setEndAtMs] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());

  // Bidding and rank parameters
  const [bidAmount, setBidAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitDisabled, setSubmitDisabled] = useState(false);
  const [ownRank, setOwnRank] = useState<number | null>(null);
  const [ownLeadingValue, setOwnLeadingValue] = useState<number | null>(null);
  const [personalHistory, setPersonalHistory] = useState<any[]>([]);
  const [leadingEffectiveTotal, setLeadingEffectiveTotal] = useState<number | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Overtime states
  const [extensionCount, setExtensionCount] = useState<number>(0);
  const [maxExtensions, setMaxExtensions] = useState<number | null>(null);

  // Vendor details
  const [vendorName, setVendorName] = useState('');
  const [vendorCode, setVendorCode] = useState('');

  const socketRef = useRef<Socket | null>(null);

  // Browser navigation lock during a live auction (BR-18): the back button is
  // trapped, and closing/refreshing the tab asks for confirmation while live.
  useEffect(() => {
    const handlePopState = () => {
      window.history.pushState(null, '', window.location.href);
    };
    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const auctionStateRef = useRef<string | undefined>(undefined);
  auctionStateRef.current = auction?.state;
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (auctionStateRef.current === 'LIVE' || auctionStateRef.current === 'OVERTIME') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const addToast = (type: 'success' | 'error', message: string, subtext?: string) => {
    const newToast: Toast = {
      id: Math.random().toString(36).substring(2, 9),
      type,
      message,
      subtext,
    };
    setToasts(prev => [...prev, newToast]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== newToast.id));
    }, 5000);
  };

  const fetchLiveState = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/auctions/${id}/live-state`);
      const data = res.data.data;
      setAuction(data);
      setLoadError(null);

      if (data.serverNow) {
        setServerOffsetMs(new Date(data.serverNow).getTime() - Date.now());
      }
      setEndAtMs(data.endAt ? new Date(data.endAt).getTime() : null);
      setExtensionCount(data.extensionCount ?? 0);
      setMaxExtensions(data.rules?.maxExtensions ?? null);
      setLeadingEffectiveTotal(data.leadingEffectiveTotal ?? null);

      if (data.you) {
        setVendorName(data.you.vendorName || '');
        setVendorCode(data.you.vendorId ? `VEN-${data.you.vendorId.split('-')[0].toUpperCase()}` : '');
        setOwnRank(data.you.rank ?? null);
        setOwnLeadingValue(data.you.effectiveTotal ?? null);
        setBlocked(!!data.you.blocked);
      }
      setPersonalHistory((data.myBids || []).slice(0, 10));
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || 'Unable to load the live auction state.';
      setLoadError(msg);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchLiveState();

    const token = getActiveToken(id);
    const socket = io(SOCKET_URL, {
      auth: { token },
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketConnected(true);
      socket.emit('join', { auctionId: id });
      // Reconnect flow: always re-sync the authoritative state after (re)joining.
      fetchLiveState();
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
    });

    socket.on('session.expired', () => {
      addToast('error', 'Session expired', 'Your bidding session has expired. Please log in again.');
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

    socket.on('auction.extended', (data: { endAt?: string; extensionsUsed?: number; maxExtensions?: number | null }) => {
      if (data.endAt) {
        setEndAtMs(new Date(data.endAt).getTime());
      }
      if (typeof data.extensionsUsed === 'number') {
        setExtensionCount(data.extensionsUsed);
      }
      if (data.maxExtensions !== undefined) {
        setMaxExtensions(data.maxExtensions);
      }
      addToast('success', 'Auction Extended', 'Extension triggered due to late bidding activity.');
      fetchLiveState();
    });

    socket.on('auction.closed', () => {
      addToast('error', 'Bidding Closed', 'The bidding phase is officially closed.');
      fetchLiveState();
    });

    socket.on('auction.state.changed', () => {
      fetchLiveState();
    });

    socket.on('participant.blocked', (data: { blocked: boolean }) => {
      setBlocked(data.blocked);
      if (data.blocked) {
        addToast('error', 'Access Restricted', 'Your account has been restricted from bidding.');
      } else {
        addToast('success', 'Access Restored', 'Your bidding access has been restored.');
      }
    });

    const pingTicker = setInterval(() => {
      if (socket.connected) {
        const start = performance.now();
        socket.emit('ping_measure', () => {
          const end = performance.now();
          setLatency(Math.round(end - start));
        });
      }
    }, 5000);

    // Local 1s tick drives the countdown between server pulses, anchored to the
    // server clock offset — accurate even if the client clock is wrong.
    const clockTicker = setInterval(() => setNowTick(Date.now()), 1000);

    return () => {
      socket.disconnect();
      clearInterval(pingTicker);
      clearInterval(clockTicker);
    };
  }, [id, fetchLiveState]);

  const rules = auction?.rules;
  const currency = currencySymbol(auction?.baseCurrency);
  const isReverse = rules?.auctionType !== 'FORWARD';
  const minStep = Number(rules?.minDecrement ?? 0) || 0;

  const serverNowMs = nowTick + serverOffsetMs;
  const remainingSeconds = endAtMs !== null ? Math.max(0, Math.floor((endAtMs - serverNowMs) / 1000)) : null;

  const currentBestPrice = leadingEffectiveTotal;
  const validBidLimit =
    currentBestPrice !== null ? (isReverse ? currentBestPrice - minStep : currentBestPrice + minStep) : null;

  // Live client-side effective-total preview using the same formula as the
  // server: (amount × conversionRate) + fixedLoading + (amount × loading% / 100)
  const getCalculations = () => {
    const base = Number(bidAmount);
    if (!bidAmount || isNaN(base) || base <= 0) return { base: 0, loading: 0, conversion: 0, total: 0 };
    const rate = Number(rules?.conversionRate ?? 1);
    const loadingPercent = Number(rules?.loadingPercent ?? 0);
    const fixedLoading = Number(rules?.fixedLoading ?? 0);
    const converted = base * rate;
    const loadingVal = (base * loadingPercent) / 100;
    const total = converted + fixedLoading + loadingVal;
    return { base, loading: loadingVal, conversion: converted - base + fixedLoading, total };
  };

  const preview = getCalculations();
  const loadingPercentLabel = Number(rules?.loadingPercent ?? 0);

  const formatCountdown = () => {
    if (remainingSeconds === null) return '--:--:--';
    const hrs = Math.floor(remainingSeconds / 3600);
    const mins = Math.floor((remainingSeconds % 3600) / 60);
    const secs = remainingSeconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSubmitBid = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmount = Number(bidAmount);
    if (!bidAmount || isNaN(numericAmount) || numericAmount <= 0) {
      addToast('error', 'Validation Error', 'Enter a positive bid amount.');
      return;
    }

    // Local pre-validation mirrors the server's decrement rule for fast feedback;
    // the server remains authoritative.
    if (validBidLimit !== null) {
      const previewTotal = getCalculations().total;
      if (isReverse && previewTotal > validBidLimit) {
        addToast('error', 'Validation Error', `Effective total must be ≤ ${currency}${validBidLimit.toLocaleString()}`);
        return;
      }
      if (!isReverse && previewTotal < validBidLimit) {
        addToast('error', 'Validation Error', `Effective total must be ≥ ${currency}${validBidLimit.toLocaleString()}`);
        return;
      }
    }

    setIsSubmitting(true);
    setSubmitDisabled(true);

    try {
      await axios.post(`${API_URL}/auctions/${id}/bids`, { amount: numericAmount });
      addToast('success', `Bid submitted — ${currency}${numericAmount.toLocaleString()}`, 'Your position is being recalculated.');
      setBidAmount('');
      fetchLiveState();
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || 'Error executing submission.';
      addToast('error', 'Submission Rejected', msg);
    } finally {
      setIsSubmitting(false);
      // Disable button briefly after each submission to prevent duplicate clicks
      setTimeout(() => {
        setSubmitDisabled(false);
      }, 3000);
    }
  };

  const handleDownloadSummary = () => {
    let content = `E-AUCTION BID SUMMARY\n`;
    content += `==================================\n`;
    content += `Auction: ${auction?.title || ''}\n`;
    content += `Auction ID: ${id || 'N/A'}\n`;
    content += `Vendor Name: ${vendorName || 'N/A'}\n`;
    content += `Vendor ID: ${vendorCode || 'N/A'}\n`;
    content += `Final Rank: ${ownRank !== null ? ownRank : 'N/A'}\n`;
    content += `Final Effective Total: ${ownLeadingValue !== null ? `${currency}${Number(ownLeadingValue).toLocaleString()}` : 'N/A'}\n\n`;
    content += `BIDDING HISTORY LOG:\n`;
    content += `----------------------------------\n`;
    content += `Timestamp\tBid Amount\tEffective Total\n`;
    personalHistory.forEach(b => {
      content += `${formatTime(b.timestamp)}\t${currency}${Number(b.amount).toLocaleString()}\t${currency}${Number(b.effectiveTotal).toLocaleString()}\n`;
    });

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Bid_Summary_${id?.split('-')[0].toUpperCase()}.txt`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center text-xs text-[#6B7280] font-body tracking-wider" role="status">
        Initializing live bidding console...
      </div>
    );
  }

  if (loadError && !auction) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm font-semibold text-[#0F172A]">Unable to load the bidding console</p>
        <p className="text-xs text-[#6B7280] max-w-sm">{loadError}</p>
        <button
          onClick={() => {
            setLoading(true);
            fetchLiveState();
          }}
          className="mt-2 px-4 py-2 bg-[#2563EB] text-white rounded-[6px] text-xs font-bold uppercase tracking-widest cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  const isAuctionClosed =
    auction?.state === 'COMPLETED' ||
    auction?.state === 'CANCELLED' ||
    (remainingSeconds !== null && remainingSeconds <= 0 && auction?.state !== 'LIVE' && auction?.state !== 'OVERTIME');

  const isOvertime = auction?.state === 'OVERTIME';

  return (
    <div className="min-h-screen bg-[#F5F7FA] text-[#0F172A] font-body flex flex-col justify-between relative z-10">

      {/* Toast Notification Container */}
      <div className="fixed bottom-6 right-6 space-y-3 z-50 max-w-sm w-full" aria-live="polite">
        {toasts.map(t => (
          <div
            key={t.id}
            role="alert"
            className={`p-4 rounded-lg border text-xs shadow-md flex items-start gap-2.5 transition-all duration-300 bg-white ${
              t.type === 'success'
                ? 'border-emerald-200 text-emerald-800'
                : 'border-red-200 text-red-800'
            }`}
          >
            <span className="font-bold text-sm leading-none" aria-hidden="true">{t.type === 'success' ? '✓' : '✗'}</span>
            <div>
              <span className="font-bold block">{t.message}</span>
              {t.subtext && <span className="text-[#6B7280] mt-0.5 block">{t.subtext}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Top Header */}
      <header className="max-w-7xl w-full mx-auto flex flex-wrap items-center justify-between gap-3 border-b border-[#E4E7EC] pb-4 px-6 pt-4">
        <div className="flex items-center gap-3 min-w-0">
          <BlackBoxLogo className="h-7 w-7" color="#0F172A" />
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-display font-semibold text-sm tracking-tight text-[#0F172A]">Black Box</span>
            <span className="text-zinc-300" aria-hidden="true">|</span>
            <span className="text-[11px] text-[#6B7280] font-display font-semibold truncate max-w-[160px] sm:max-w-md">{auction?.title}</span>
            <span className="text-zinc-300 hidden sm:inline" aria-hidden="true">|</span>
            <span className="text-[9px] text-[#6B7280] font-display uppercase tracking-wider mt-0.5 hidden sm:inline">Live Auction</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-[10px] text-[#6B7280] font-medium font-body hidden md:inline">
            ✓ Session scoped to this auction only
          </span>
          {isOvertime && !isAuctionClosed ? (
            <div className="bg-[#D97706] text-white px-3 py-1 rounded-[6px] flex items-center gap-3 text-xs shadow-sm font-display">
              {maxExtensions !== null && extensionCount >= maxExtensions ? (
                <span>Final extension — no further overtime</span>
              ) : (
                <span>⚡ OVERTIME{maxExtensions !== null ? ` — Extension ${extensionCount} of ${maxExtensions}` : ` — Extension ${extensionCount}`}</span>
              )}
              <span className="font-mono-numbers font-bold bg-black/20 px-2 py-0.5 rounded text-[11px]">{formatCountdown()}</span>
            </div>
          ) : !isAuctionClosed ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-[#059669] text-xs font-bold font-display">
                <span className="h-2 w-2 rounded-full bg-[#059669] animate-pulse" aria-hidden="true" /> LIVE
              </div>
              <span className="text-xs text-[#6B7280] font-body">Closes in</span>
              <span className="font-mono-numbers font-bold text-xs text-[#0F172A] bg-zinc-200/50 px-2 py-0.5 rounded">{formatCountdown()}</span>
            </div>
          ) : (
            <span className="text-xs text-red-600 font-bold uppercase tracking-wider">Closed</span>
          )}
        </div>
      </header>

      {/* Main Grid Content */}
      <main className="max-w-7xl w-full mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6 my-8 px-6 items-start">

        {/* Left Panel */}
        <div className="lg:col-span-2 space-y-6">

          {isAuctionClosed ? (
            /* Closed State View */
            <div className="bg-white border border-[#E4E7EC] rounded-lg p-8 space-y-6 shadow-sm">
              <div className="flex items-center gap-2 border-b border-[#F1F3F7] pb-3">
                <span className="h-2.5 w-2.5 rounded-full bg-[#E4E7EC]" aria-hidden="true" />
                <h2 className="text-lg font-display font-bold text-[#0F172A] uppercase tracking-wider">Auction Closed</h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-[#F5F7FA] border border-[#E4E7EC] rounded-[6px] p-4 text-center">
                  <span className="block font-display text-[11px] text-[#6B7280] uppercase tracking-wider">Your final rank</span>
                  <span className="text-3xl font-mono-numbers font-bold text-[#0F172A] block mt-2">{ownRank !== null ? `#${ownRank}` : '—'}</span>
                </div>
                <div className="bg-[#F5F7FA] border border-[#E4E7EC] rounded-[6px] p-4 text-center">
                  <span className="block font-display text-[11px] text-[#6B7280] uppercase tracking-wider">Your final bid</span>
                  <span className="text-lg font-mono-numbers font-semibold text-[#0F172A] block mt-3">
                    {personalHistory[0] ? `${currency}${Number(personalHistory[0].amount).toLocaleString()}` : '—'}
                  </span>
                </div>
                <div className="bg-[#F5F7FA] border border-[#E4E7EC] rounded-[6px] p-4 text-center">
                  <span className="block font-display text-[11px] text-[#6B7280] uppercase tracking-wider">Effective total</span>
                  <span className="text-lg font-mono-numbers font-semibold text-[#2563EB] block mt-3">
                    {ownLeadingValue !== null ? `${currency}${Number(ownLeadingValue).toLocaleString()}` : '—'}
                  </span>
                </div>
              </div>

              <div className="bg-[#F5F7FA] border border-[#E4E7EC] rounded-[6px] p-4 text-sm text-[#6B7280] leading-relaxed">
                Thank you for participating. Results will be communicated by your Auction Administrator.
              </div>

              <button
                onClick={handleDownloadSummary}
                className="w-full py-3.5 bg-white border border-[#E4E7EC] hover:bg-[#F5F7FA] text-[#0F172A] rounded-[6px] text-xs font-bold uppercase tracking-widest transition duration-300 font-body flex items-center justify-center gap-2 cursor-pointer shadow-sm"
              >
                <Download size={13} className="text-[#2563EB]" aria-hidden="true" />
                Download Bid Summary
              </button>
            </div>
          ) : (
            /* Active Live Bidding View */
            <div className="space-y-6">

              {isOvertime && (
                <div className="bg-[#D97706]/10 border border-[#D97706]/20 text-[#D97706] rounded-lg p-3 text-xs font-display flex items-center gap-2" role="status">
                  <span aria-hidden="true">⚡</span>
                  <span>
                    <strong>Auction in Overtime:</strong>{' '}
                    {maxExtensions !== null
                      ? `Extension ${extensionCount} of ${maxExtensions} is active.`
                      : `Extension ${extensionCount} is active.`}{' '}
                    Qualifying bids inside the trigger window extend the close time.
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 1. Current best price card */}
                <div className="bg-white border border-[#E4E7EC] rounded-lg p-5 flex flex-col justify-between min-h-[120px] shadow-sm">
                  <span className="block font-display text-[11px] text-[#6B7280] tracking-wider uppercase font-semibold">
                    {isReverse ? 'Current Lowest (L1) — Effective' : 'Current Highest (H1) — Effective'}
                  </span>
                  <div className="text-3xl font-bold font-mono-numbers text-[#0F172A] tracking-wider mt-2">
                    {currentBestPrice !== null ? `${currency} ${currentBestPrice.toLocaleString()}` : 'No bids yet'}
                  </div>
                </div>

                {/* 2. Your Position details */}
                <div className="bg-white border border-[#E4E7EC] rounded-lg p-5 flex flex-col justify-between min-h-[120px] shadow-sm">
                  <span className="block font-display text-[11px] text-[#6B7280] tracking-wider uppercase font-semibold">
                    Your Position
                  </span>
                  <div className="grid grid-cols-3 gap-2 items-center text-xs font-body mt-2">
                    <div>
                      <span className="text-[#6B7280] text-[9px] uppercase font-bold block leading-none">Rank</span>
                      <span className="text-2xl font-bold text-[#0F172A] font-mono-numbers mt-1.5 block">
                        {ownRank !== null ? ownRank : '--'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#6B7280] text-[9px] uppercase font-bold block leading-none">Your Effective</span>
                      <span className="text-xs font-semibold text-[#0F172A] font-mono-numbers mt-2 block">
                        {ownLeadingValue !== null ? `${currency}${ownLeadingValue.toLocaleString()}` : '--'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#6B7280] text-[9px] uppercase font-bold block leading-none">
                        {isReverse ? 'Gap from L1' : 'Gap from H1'}
                      </span>
                      <span className="text-xs font-semibold text-[#2563EB] font-mono-numbers mt-2 block">
                        {ownLeadingValue !== null && currentBestPrice !== null
                          ? `${currency}${Math.max(0, isReverse ? ownLeadingValue - currentBestPrice : currentBestPrice - ownLeadingValue).toLocaleString()}`
                          : '--'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. Bid Form */}
              <div className="bg-white border border-[#E4E7EC] rounded-lg p-6 space-y-4 shadow-sm">
                <h3 className="font-display text-[11px] text-[#6B7280] tracking-wider font-normal border-b border-[#F1F3F7] pb-2">
                  Place your bid
                </h3>

                <form onSubmit={handleSubmitBid} className="space-y-4">
                  <div>
                    <label htmlFor="bid-amount" className="sr-only">Bid amount</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-[#6B7280] font-mono-numbers font-medium text-sm" aria-hidden="true">
                        {currency}
                      </span>
                      <input
                        id="bid-amount"
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="any"
                        placeholder="Enter bid amount..."
                        value={bidAmount}
                        onChange={(e) => setBidAmount(e.target.value)}
                        disabled={blocked}
                        aria-describedby="bid-hint"
                        className="w-full pl-9 pr-4 py-3.5 border border-[#E4E7EC] rounded-[6px] text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] font-mono-numbers font-medium bg-white disabled:bg-[#F5F7FA]"
                      />
                    </div>
                    <span id="bid-hint" className="text-[10px] text-[#6B7280] block mt-1.5 pl-0.5">
                      {validBidLimit !== null
                        ? isReverse
                          ? `Effective total must be ≤ ${currency}${validBidLimit.toLocaleString()} (min decrement ${currency}${minStep.toLocaleString()} from current best)`
                          : `Effective total must be ≥ ${currency}${validBidLimit.toLocaleString()} (min increment ${currency}${minStep.toLocaleString()} from current best)`
                        : 'You are placing the opening bid for this auction.'}
                    </span>
                  </div>

                  {/* Calculations Live Preview */}
                  <div className="border border-[#E4E7EC] rounded-[6px] p-4 space-y-2.5 bg-[#F5F7FA]">
                    <span className="font-display text-[10px] text-[#6B7280] tracking-wider block font-bold border-b border-[#E4E7EC] pb-1.5 uppercase">
                      Effective total preview
                    </span>
                    <div className="space-y-2 text-xs font-body">
                      <div className="flex justify-between items-center text-[#6B7280]">
                        <span>Base Bid</span>
                        <span className="font-mono-numbers text-[#0F172A]">{currency}{preview.base.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center text-[#6B7280]">
                        <span>Loading ({loadingPercentLabel}%)</span>
                        <span className="font-mono-numbers text-[#0F172A]">{currency}{preview.loading.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center text-[#6B7280]">
                        <span>Conversion & Fixed Loading</span>
                        <span className="font-mono-numbers text-[#0F172A]">{currency}{preview.conversion.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-[#E4E7EC] font-bold text-[#0F172A]">
                        <span>Effective Total</span>
                        <span className="font-mono-numbers text-[#2563EB]">{currency}{preview.total.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={blocked || isSubmitting || submitDisabled}
                    className={`w-full py-3.5 rounded-[6px] text-xs font-bold uppercase tracking-widest transition duration-300 font-body flex items-center justify-center gap-2 border focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#2563EB] ${
                      blocked || isSubmitting || submitDisabled
                        ? 'bg-[#E4E7EC] border-[#E4E7EC] text-[#6B7280] cursor-not-allowed'
                        : 'bg-[#2563EB] text-white hover:bg-blue-700 cursor-pointer shadow-sm border-[#2563EB]'
                    }`}
                  >
                    {isSubmitting || submitDisabled ? (
                      <span className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full border-2 border-white border-t-transparent animate-spin" aria-hidden="true"></span>
                        <span>Processing Bid...</span>
                      </span>
                    ) : blocked ? (
                      'Bidding Restricted'
                    ) : (
                      'Submit Bid'
                    )}
                  </button>
                </form>
              </div>

            </div>
          )}

        </div>

        {/* Right Panel */}
        <div className="space-y-6">

          {/* A. Your Bid History */}
          <div className="bg-white border border-[#E4E7EC] rounded-lg p-5 space-y-4 shadow-sm">
            <h3 className="font-display text-[11px] text-[#6B7280] tracking-wider font-normal border-b border-[#F1F3F7] pb-2">
              Your bid history
            </h3>

            <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
              {personalHistory.length === 0 ? (
                <p className="text-[#6B7280] italic text-xs text-center py-6 font-body">No bids submitted yet.</p>
              ) : (
                personalHistory.map((b, idx) => (
                  <div key={b.id || idx} className="flex justify-between items-center text-xs py-2 border-b border-[#F1F3F7] last:border-b-0 gap-2">
                    <span className="font-mono-numbers text-[#6B7280] whitespace-nowrap">{formatTime(b.timestamp)}</span>
                    <span className="font-mono-numbers font-semibold text-[#0F172A]">
                      {currency}{Number(b.amount).toLocaleString()}
                    </span>
                    <span className="font-mono-numbers text-[10px] text-[#6B7280]">
                      → {currency}{Number(b.effectiveTotal).toLocaleString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* B. Network Status */}
          <div className="bg-white border border-[#E4E7EC] rounded-lg p-5 space-y-4 shadow-sm">
            <h3 className="font-display text-[11px] text-[#6B7280] tracking-wider font-normal border-b border-[#F1F3F7] pb-2">
              Network status
            </h3>
            <div className="space-y-3.5 text-xs font-body">
              <div className="flex justify-between items-center">
                <span className="text-[#6B7280]">Latency</span>
                <div className="flex items-center gap-2 font-mono-numbers">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      latency === null ? 'bg-[#E4E7EC]' : latency < 100 ? 'bg-[#059669]' : latency <= 300 ? 'bg-[#D97706]' : 'bg-[#DC2626]'
                    }`}
                    aria-hidden="true"
                  />
                  <span className="font-semibold text-[#0F172A]">{latency !== null ? `${latency} ms` : '—'}</span>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#6B7280]">WebSocket</span>
                <span className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${socketConnected ? 'bg-[#059669]' : 'bg-[#DC2626]'}`} aria-hidden="true" />
                  <span className="text-[10px] font-semibold text-[#0F172A]">{socketConnected ? 'Connected' : 'Reconnecting…'}</span>
                </span>
              </div>
            </div>
          </div>

          {/* C. Server Time */}
          <div className="bg-white border border-[#E4E7EC] rounded-lg p-5 space-y-2.5 shadow-sm">
            <h3 className="font-display text-[11px] text-[#6B7280] tracking-wider font-normal border-b border-[#F1F3F7] pb-2">
              Server time (shown in your local timezone)
            </h3>
            <div className="text-center py-2">
              <span className="text-2xl font-bold font-mono-numbers text-[#2563EB] tracking-wider block">{formatTime(new Date(serverNowMs))}</span>
              <span className="text-xs text-[#6B7280] font-mono-numbers block mt-1">{formatDate(new Date(serverNowMs))}</span>
            </div>
          </div>

        </div>

      </main>

      {/* Footer copyright */}
      <footer className="max-w-7xl w-full mx-auto border-t border-[#E4E7EC] pt-4 pb-4 text-center text-[10px] text-[#6B7280] uppercase tracking-widest relative z-10">
        © 2026 Black Box Limited • Secure Bidding Console
      </footer>

    </div>
  );
};

export default VendorLiveConsole;
