import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { io } from 'socket.io-client';
import { Download } from 'lucide-react';
import BlackBoxLogo from '../components/BlackBoxLogo';

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
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [auction, setAuction] = useState<any>(null);
  
  // Real-time states
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [latency, setLatency] = useState<number>(12);
  const [serverTime, setServerTime] = useState<string>('11:00:00 AM');
  const [serverDate, setServerDate] = useState<string>('03 Jul 2026');

  // Bidding and rank parameters
  const [bidAmount, setBidAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitDisabled, setSubmitDisabled] = useState(false);
  const [ownRank, setOwnRank] = useState<number | null>(null);
  const [ownLeadingValue, setOwnLeadingValue] = useState<number | null>(null);
  const [personalHistory, setPersonalHistory] = useState<any[]>([]);
  const [currentBestPrice, setCurrentBestPrice] = useState<number>(0);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Overtime states
  const [extensionCount, setExtensionCount] = useState<number>(0);
  const [maxExtensions, setMaxExtensions] = useState<number>(3);

  // Vendor details
  const [vendorName, setVendorName] = useState('Supplier Account');
  const [vendorCode, setVendorCode] = useState('VEN-MAPPED');

  const socketRef = useRef<any>(null);

  // Browser Lock (BR-18)
  useEffect(() => {
    const handlePopState = () => {
      window.history.pushState(null, '', window.location.href);
    };
    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const addToast = (type: 'success' | 'error', message: string, subtext?: string) => {
    const newToast: Toast = {
      id: Math.random().toString(36).substring(2, 9),
      type,
      message,
      subtext
    };
    setToasts(prev => [...prev, newToast]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== newToast.id));
    }, 5000);
  };

  const fetchLiveState = async () => {
    try {
      const res = await axios.get(`${API_URL}/auctions/${id}/live-state`);
      const data = res.data.data;
      setAuction(data);

      // Extract details from current rankings
      const currentBest = data.state === 'LIVE' || data.state === 'OVERTIME'
        ? Number(data.currentBid || data.basePrice)
        : Number(data.basePrice);
      setCurrentBestPrice(currentBest);

      // Determine overtime max settings
      if (data.bidRuleSnapshot) {
        setMaxExtensions(data.bidRuleSnapshot.overtimeMaxExtensions || 3);
      }

      const token = localStorage.getItem('token');
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const email = payload.email;

        // Identify vendor's active ranking details
        const matched = data.rankings?.find((r: any) => r.vendorName.toLowerCase().includes(email.split('@')[0]));
        const activeRankObj = matched || data.rankings?.[0];
        
        if (activeRankObj) {
          setVendorName(activeRankObj.vendorName);
          setVendorCode(`VEN-${activeRankObj.vendorId.split('-')[0].toUpperCase()}`);
          setOwnRank(data.rankings.indexOf(activeRankObj) + 1);
          setOwnLeadingValue(activeRankObj.effectiveTotal);
          setBlocked(activeRankObj.blocked);
          
          const personalBids = data.bidHistory
            ?.filter((b: any) => b.vendorName === activeRankObj.vendorName)
            .map((b: any) => ({
              id: b.id,
              timestamp: b.createdAt,
              amount: b.amount,
              rank: b.rank
            })) || [];
          setPersonalHistory(personalBids.slice(0, 10)); // Max show 10 entries
        }
      }
    } catch (err) {
      console.error('Failed to retrieve live stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveState();

    const token = localStorage.getItem('token');
    const socket = io(SOCKET_URL, {
      auth: { token },
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketConnected(true);
      const payload = JSON.parse(atob(token!.split('.')[1]));
      socket.emit('join', { auctionId: id, role: 'VENDOR', vendorId: payload.id });
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
    });

    socket.on('auction.timer.updated', (data: { remainingSeconds: number; serverTime?: string; serverDate?: string }) => {
      setRemainingSeconds(data.remainingSeconds);
      if (data.serverTime) {
        setServerTime(data.serverTime);
      }
      if (data.serverDate) {
        setServerDate(data.serverDate);
      }
    });

    socket.on('bid.submitted', (data: any) => {
      fetchLiveState();
    });

    socket.on('participant.rank.updated', (data: { rank: number; leadingValue?: number }) => {
      setOwnRank(data.rank);
      if (data.leadingValue) {
        setOwnLeadingValue(data.leadingValue);
      }
    });

    socket.on('bid.rejected', (data: { code: string; message?: string }) => {
      const code = data.code;
      const currency = getCurrency();
      const minDec = auction?.bidRuleSnapshot?.minDecrement || 100;
      const minInc = auction?.bidRuleSnapshot?.minIncrement || 100;

      let mappedMessage = "Bid could not be validated by server.";
      if (code === 'INVALID_DECREMENT') {
        mappedMessage = `Bid must be lower by at least ${currency}${minDec.toLocaleString()}`;
      } else if (code === 'INVALID_INCREMENT') {
        mappedMessage = `Bid must be higher by at least ${currency}${minInc.toLocaleString()}`;
      } else if (code === 'DUPLICATE') {
        mappedMessage = "This bid amount was already submitted";
      } else if (code === 'CLOSED') {
        mappedMessage = "Auction has closed, no further bids accepted";
      } else if (code === 'BLOCKED') {
        mappedMessage = "Your account has been restricted from bidding";
      } else if (code === 'OVERTIME_CAP_REACHED') {
        mappedMessage = "Auction overtime limit reached, bidding is closing";
      } else if (data.message) {
        mappedMessage = data.message;
      }
      
      addToast('error', 'Bid rejected', mappedMessage);
    });

    socket.on('auction.extended', (data: { remainingSeconds: number; extensionCount: number }) => {
      setRemainingSeconds(data.remainingSeconds);
      setExtensionCount(data.extensionCount);
      addToast('success', 'Auction Extended', `Extension triggered due to late bidding activity.`);
      fetchLiveState();
    });

    socket.on('auction.closed', () => {
      addToast('error', 'Bidding Closed', 'The bidding phase is officially closed.');
      fetchLiveState();
    });

    socket.on('participant.blocked', (data: { blocked: boolean }) => {
      setBlocked(data.blocked);
      if (data.blocked) {
        addToast('error', 'Access Restricted', 'Your account has been restricted from bidding.');
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

    return () => {
      socket.disconnect();
      clearInterval(pingTicker);
    };
  }, [id, auction?.bidRuleSnapshot]);

  const getCurrency = () => {
    return auction?.baseCurrency === 'USD' ? '$' : auction?.baseCurrency === 'INR' ? '₹' : (auction?.baseCurrency || '₹');
  };

  const isReverse = auction?.type === 'reverse' || !auction?.type;

  // Compute boundaries for valid bid submissions
  const minDecrement = auction?.bidRuleSnapshot?.minDecrement || 100;
  const minIncrement = auction?.bidRuleSnapshot?.minIncrement || 100;
  
  const validBidLimit = isReverse 
    ? currentBestPrice - minDecrement
    : currentBestPrice + minIncrement;

  // Live client-side Calculations Preview (Base + Loading (5%) + Conversion (0))
  const getCalculations = () => {
    const base = Number(bidAmount);
    if (!bidAmount || isNaN(base) || base <= 0) return { base: 0, loading: 0, conversion: 0, total: 0 };
    const loadingPercent = auction?.rules?.loadingPercent || 5;
    const loadingVal = base * (loadingPercent / 100);
    const conversionVal = 0;
    const total = base + loadingVal + conversionVal;
    return { base, loading: loadingVal, conversion: conversionVal, total };
  };

  const preview = getCalculations();

  const formatCountdown = () => {
    if (remainingSeconds === null || remainingSeconds < 0) return '00:00:00';
    const hrs = Math.floor(remainingSeconds / 3600);
    const mins = Math.floor((remainingSeconds % 3600) / 60);
    const secs = remainingSeconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSubmitBid = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmount = Number(bidAmount);
    if (!bidAmount || isNaN(numericAmount) || numericAmount <= 0) return;

    // Direct local validation to help user experience
    if (isReverse && numericAmount > validBidLimit) {
      addToast('error', 'Validation Error', `Bid must be less than or equal to ${getCurrency()}${validBidLimit.toLocaleString()}`);
      return;
    }
    if (!isReverse && numericAmount < validBidLimit) {
      addToast('error', 'Validation Error', `Bid must be greater than or equal to ${getCurrency()}${validBidLimit.toLocaleString()}`);
      return;
    }

    setIsSubmitting(true);
    setSubmitDisabled(true);

    try {
      await axios.post(`${API_URL}/auctions/${id}/bids`, { amount: numericAmount });
      addToast('success', `Bid submitted — ${getCurrency()}${numericAmount.toLocaleString()}`, `You are currently Rank ${ownRank || 'N/A'}`);
      setBidAmount('');
      fetchLiveState();
    } catch (err: any) {
      console.error(err);
      const code = err.response?.data?.code || 'VALIDATION_FAILED';
      const msg = err.response?.data?.message || 'Error executing submission.';
      addToast('error', 'Submission Rejected', msg);
    } finally {
      setIsSubmitting(false);
      // Fulfilling: Disable button for 3 seconds after each submission to prevent duplicate clicks
      setTimeout(() => {
        setSubmitDisabled(false);
      }, 3000);
    }
  };

  const handleDownloadSummary = () => {
    let content = `BLACK BOX E-AUCTION BID SUMMARY\n`;
    content += `==================================\n`;
    content += `Auction: ${auction?.title || 'Hardware tender'}\n`;
    content += `Auction ID: ${id || 'N/A'}\n`;
    content += `Vendor Name: ${vendorName}\n`;
    content += `Vendor ID: ${vendorCode}\n`;
    content += `Final Rank: ${ownRank !== null ? ownRank : 'N/A'}\n`;
    content += `Final Bid: ${getCurrency()}${Number(ownLeadingValue || 0).toLocaleString()}\n\n`;
    content += `BIDDING HISTORY LOG:\n`;
    content += `----------------------------------\n`;
    content += `Timestamp\t\tBid Amount\t\tStanding\n`;
    personalHistory.forEach(b => {
      content += `${new Date(b.timestamp).toLocaleTimeString()}\t\t${getCurrency()}${Number(b.amount).toLocaleString()}\t\tRank ${b.rank || 'N/A'}\n`;
    });
    
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `BlackBox_Bid_Summary_${id?.split('-')[0].toUpperCase()}.txt`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center text-xs text-[#6B7280] font-body tracking-wider">
        Initializing live bidding console...
      </div>
    );
  }

  const isAuctionClosed = auction?.state === 'COMPLETED' || auction?.state === 'CLOSED' || (remainingSeconds !== null && remainingSeconds <= 0 && extensionCount === 0);

  return (
    <div className="min-h-screen bg-[#F5F7FA] text-[#0F172A] font-body flex flex-col justify-between select-none relative z-10">
      
      {/* Toast Notification Container */}
      <div className="fixed bottom-6 right-6 space-y-3 z-50 max-w-sm w-full">
        {toasts.map(t => (
          <div 
            key={t.id} 
            className={`p-4 rounded-lg border text-xs shadow-md flex items-start gap-2.5 transition-all duration-300 bg-white ${
              t.type === 'success' 
                ? 'border-emerald-200 text-emerald-800' 
                : 'border-red-200 text-red-800'
            }`}
          >
            <span className="font-bold text-sm leading-none">{t.type === 'success' ? '✓' : '✗'}</span>
            <div>
              <span className="font-bold block">{t.message}</span>
              {t.subtext && <span className="text-[#6B7280] mt-0.5 block">{t.subtext}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Top Header */}
      <header className="max-w-7xl w-full mx-auto flex items-center justify-between border-b border-[#E4E7EC] pb-4 px-6 pt-4">
        <div className="flex items-center gap-3">
          <BlackBoxLogo className="h-7 w-7" color="#0F172A" />
          <div className="flex items-center gap-2">
            <span className="font-display font-semibold text-sm tracking-tight text-[#0F172A]">Black Box</span>
            <span className="text-zinc-300">|</span>
            <span className="text-[11px] text-[#6B7280] font-display font-semibold truncate max-w-[200px] sm:max-w-md">{auction?.title}</span>
            <span className="text-zinc-300">|</span>
            <span className="text-[9px] text-[#6B7280] font-display uppercase tracking-wider mt-0.5">Live Auction</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-[10px] text-[#6B7280] font-medium font-body hidden md:inline">
            ✓ Session scoped to this auction only
          </span>
          {/* Overtime Banner - replaces top status bar when overtime triggers */}
          {extensionCount > 0 && !isAuctionClosed ? (
            <div className="bg-[#D97706] text-white px-3 py-1 rounded-[6px] flex items-center gap-3 text-xs shadow-sm font-display">
              {extensionCount === maxExtensions ? (
                <span>Final extension — closes at {serverTime}</span>
              ) : (
                <span>⚡ OVERTIME — Extension {extensionCount} of {maxExtensions}</span>
              )}
              <span className="font-mono-numbers font-bold bg-black/20 px-2 py-0.5 rounded text-[11px]">{formatCountdown()}</span>
            </div>
          ) : !isAuctionClosed ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-[#059669] text-xs font-bold font-display">
                <span className="h-2 w-2 rounded-full bg-[#059669] animate-pulse" /> LIVE
              </div>
              <span className="text-xs text-[#6B7280] font-body">Closes in</span>
              <span className="font-mono-numbers font-bold text-xs text-[#0F172A] bg-zinc-200/50 px-2 py-0.5 rounded">{formatCountdown()}</span>
            </div>
          ) : (
            <span className="text-xs text-red-650 font-bold uppercase tracking-wider">Closed</span>
          )}
        </div>
      </header>

      {/* Main Grid Content */}
      <main className="max-w-7xl w-full mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6 my-8 px-6 items-start">
        
        {/* Left Panel: 65% width */}
        <div className="lg:col-span-2 space-y-6">
          
          {isAuctionClosed ? (
            /* Closed State View */
            <div className="bg-white border border-[#E4E7EC] rounded-lg p-8 space-y-6 shadow-sm">
              <div className="flex items-center gap-2 border-b border-[#F1F3F7] pb-3">
                <span className="h-2.5 w-2.5 rounded-full bg-[#E4E7EC]" />
                <h2 className="text-lg font-display font-bold text-[#0F172A] uppercase tracking-wider">Auction Closed</h2>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-[#F5F7FA] border border-[#E4E7EC] rounded-[6px] p-4 text-center">
                  <span className="block font-display text-[11px] text-[#6B7280] uppercase tracking-wider">Your final rank</span>
                  <span className="text-3xl font-mono-numbers font-bold text-[#0F172A] block mt-2">#{ownRank || '--'}</span>
                </div>
                <div className="bg-[#F5F7FA] border border-[#E4E7EC] rounded-[6px] p-4 text-center">
                  <span className="block font-display text-[11px] text-[#6B7280] uppercase tracking-wider">Your final bid</span>
                  <span className="text-lg font-mono-numbers font-semibold text-[#0F172A] block mt-3">
                    {getCurrency()}{Number(ownLeadingValue || 0).toLocaleString()}
                  </span>
                </div>
                <div className="bg-[#F5F7FA] border border-[#E4E7EC] rounded-[6px] p-4 text-center">
                  <span className="block font-display text-[11px] text-[#6B7280] uppercase tracking-wider">Effective total</span>
                  <span className="text-lg font-mono-numbers font-semibold text-[#2563EB] block mt-3">
                    {getCurrency()}{Number(ownLeadingValue || 0).toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="bg-[#F5F7FA] border border-[#E4E7EC] rounded-[6px] p-4 text-sm text-[#6B7280] leading-relaxed">
                Thank you for participating. Results will be communicated by your Auction Administrator.
              </div>

              <button
                onClick={handleDownloadSummary}
                className="w-full py-3.5 bg-white border border-[#E4E7EC] hover:bg-[#F5F7FA] text-[#0F172A] rounded-[6px] text-xs font-bold uppercase tracking-widest transition duration-300 font-body font-medium flex items-center justify-center gap-2 cursor-pointer shadow-sm"
              >
                <Download size={13} className="text-[#2563EB]" />
                Download Bid Summary
              </button>
            </div>
          ) : (
            /* Active Live Bidding View */
            <div className="space-y-6">
              
              {/* Overtime full width warning banner */}
              {extensionCount > 0 && (
                <div className="bg-[#D97706]/10 border border-[#D97706]/20 text-[#D97706] rounded-lg p-3 text-xs font-display flex items-center gap-2">
                  <span>⚡</span>
                  <span><strong>Auction in Overtime:</strong> Extension {extensionCount} of {maxExtensions} is currently active. Every bid submitted within the deadline extends the window.</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 1. Current best price card */}
                <div className="bg-white border border-[#E4E7EC] rounded-lg p-5 flex flex-col justify-between h-[120px] shadow-sm">
                  <span className="block font-display text-[11px] text-[#6B7280] tracking-wider uppercase font-semibold">
                    {isReverse ? 'Current Lowest (L1)' : 'Current Highest (H1)'}
                  </span>
                  <div className="text-3xl font-bold font-mono-numbers text-[#0F172A] tracking-wider mt-2">
                    {getCurrency()} {currentBestPrice.toLocaleString()}
                  </div>
                </div>

                {/* 2. Your Position details */}
                <div className="bg-white border border-[#E4E7EC] rounded-lg p-5 flex flex-col justify-between h-[120px] shadow-sm">
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
                      <span className="text-[#6B7280] text-[9px] uppercase font-bold block leading-none">Your Last Bid</span>
                      <span className="text-xs font-semibold text-[#0F172A] font-mono-numbers mt-2 block">
                        {ownLeadingValue ? `${getCurrency()}${ownLeadingValue.toLocaleString()}` : '--'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#6B7280] text-[9px] uppercase font-bold block leading-none">
                        {isReverse ? 'Gap from L1' : 'Gap from H1'}
                      </span>
                      <span className="text-xs font-semibold text-[#2563EB] font-mono-numbers mt-2 block">
                        {ownLeadingValue ? `${getCurrency()}${Math.max(0, isReverse ? ownLeadingValue - currentBestPrice : currentBestPrice - ownLeadingValue).toLocaleString()}` : '--'}
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
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-[#6B7280] font-mono-numbers font-medium text-sm">
                        {getCurrency()}
                      </span>
                      <input
                        type="number"
                        placeholder="Enter bid amount..."
                        value={bidAmount}
                        onChange={(e) => setBidAmount(e.target.value)}
                        disabled={blocked}
                        className="w-full pl-9 pr-4 py-3.5 border border-[#E4E7EC] rounded-[6px] text-sm focus:outline-none focus:ring-1 focus:ring-[#2563EB] font-mono-numbers font-medium bg-white"
                      />
                    </div>
                    <span className="text-[10px] text-[#6B7280] block mt-1.5 pl-0.5">
                      {isReverse 
                        ? `Bid must be ≤ ${getCurrency()}${validBidLimit.toLocaleString()} (Min decrement ${getCurrency()}${minDecrement.toLocaleString()} from current best)` 
                        : `Bid must be ≥ ${getCurrency()}${validBidLimit.toLocaleString()} (Min increment ${getCurrency()}${minIncrement.toLocaleString()} from current best)`
                      }
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
                        <span className="font-mono-numbers text-[#0F172A]">{getCurrency()}{preview.base.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center text-[#6B7280]">
                        <span>Loading (5%)</span>
                        <span className="font-mono-numbers text-[#0F172A]">{getCurrency()}{preview.loading.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center text-[#6B7280]">
                        <span>Conversion</span>
                        <span className="font-mono-numbers text-[#0F172A]">{getCurrency()}{preview.conversion.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-[#E4E7EC] font-bold text-[#0F172A]">
                        <span>Effective Total</span>
                        <span className="font-mono-numbers text-[#2563EB]">{getCurrency()}{preview.total.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={blocked || isSubmitting || submitDisabled}
                    className={`w-full py-3.5 rounded-[6px] text-xs font-bold uppercase tracking-widest transition duration-300 font-body font-medium flex items-center justify-center gap-2 border ${
                      blocked || isSubmitting || submitDisabled
                        ? 'bg-[#E4E7EC] border-[#E4E7EC] text-[#6B7280] cursor-not-allowed'
                        : 'bg-[#2563EB] text-white hover:bg-blue-700 cursor-pointer shadow-sm border-[#2563EB]'
                    }`}
                  >
                    {isSubmitting || submitDisabled ? (
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full border-2 border-white border-t-transparent animate-spin"></span>
                        <span>Processing Bid...</span>
                      </div>
                    ) : (
                      'Submit Bid'
                    )}
                  </button>
                </form>
              </div>

            </div>
          )}

        </div>

        {/* Right Panel: 35% width */}
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
                  <div key={b.id || idx} className="flex justify-between items-center text-xs py-2 border-b border-[#F1F3F7] last:border-b-0">
                    <span className="font-mono-numbers text-[#6B7280]">{new Date(b.timestamp).toLocaleTimeString()}</span>
                    <span className="font-mono-numbers font-semibold text-[#0F172A]">
                      {getCurrency()}{Number(b.amount).toLocaleString()}
                    </span>
                    <span className="font-display text-[10px] text-[#6B7280] font-bold bg-[#F5F7FA] border border-[#E4E7EC] px-2 py-0.5 rounded-[4px]">
                      Rank {b.rank || 'N/A'}
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
                  <span className={`h-2 w-2 rounded-full ${
                    latency < 100 ? 'bg-[#059669]' : latency <= 300 ? 'bg-[#D97706]' : 'bg-[#DC2626]'
                  }`} />
                  <span className="font-semibold text-[#0F172A]">{latency} ms</span>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#6B7280]">WebSocket</span>
                <span className="h-2 w-2 rounded-full bg-[#059669]" />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#6B7280]">Server sync</span>
                <span className="h-2 w-2 rounded-full bg-[#059669]" />
              </div>
            </div>
          </div>

          {/* C. Server Time */}
          <div className="bg-white border border-[#E4E7EC] rounded-lg p-5 space-y-2.5 shadow-sm">
            <h3 className="font-display text-[11px] text-[#6B7280] tracking-wider font-normal border-b border-[#F1F3F7] pb-2">
              Server time
            </h3>
            <div className="text-center py-2">
              <span className="text-2xl font-bold font-mono-numbers text-[#2563EB] tracking-wider block">{serverTime}</span>
              <span className="text-xs text-[#6B7280] font-mono-numbers block mt-1">{serverDate}</span>
            </div>
          </div>

        </div>

      </main>

      {/* Footer copyright */}
      <footer className="max-w-7xl w-full mx-auto border-t border-[#E4E7EC] pt-4 text-center text-[10px] text-[#6B7280] uppercase tracking-widest relative z-10">
        © 2026 BLACK BOX LIMITED • SECURE BIDDING CONSOLE
      </footer>

    </div>
  );
};

export default VendorLiveConsole;
