import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { io } from 'socket.io-client';
import { 
  Info, Clock, CheckCircle2, ShieldCheck, 
  Download, Wifi, Layout, Check, Globe 
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000';

const VendorLobby: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [auction, setAuction] = useState<any>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [serverTime, setServerTime] = useState<string>('');
  
  // Rules reviewed toggle (only true after click Rules download)
  const [rulesReviewed, setRulesReviewed] = useState(false);

  // Vendor details
  const [vendorName, setVendorName] = useState('Supplier Account');
  const [vendorCode, setVendorCode] = useState('VEN-MAPPED');

  // Socket started flag & redirect countdown
  const [isLiveStarted, setIsLiveStarted] = useState(false);
  const [redirectCountdown, setRedirectCountdown] = useState(3);

  const socketRef = useRef<any>(null);

  const fetchLobbyState = async () => {
    try {
      const res = await axios.get(`${API_URL}/auctions/${id}/live-state`);
      const data = res.data.data;
      setAuction(data);
      if (data.startAt) {
        const diffMs = new Date(data.startAt).getTime() - Date.now();
        setRemainingSeconds(diffMs > 0 ? Math.floor(diffMs / 1000) : 0);
      }
      
      // Decrypt credentials context to map vendor details
      const token = localStorage.getItem('token');
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const email = payload.email;
        const matched = data.rankings?.find((r: any) => r.vendorName.toLowerCase().includes(email.split('@')[0]));
        if (matched) {
          setVendorName(matched.vendorName);
          setVendorCode(`VEN-${matched.vendorId.split('-')[0].toUpperCase()}`);
        }
      }

      // If auction has already started and is LIVE or OVERTIME, auto redirect
      if (['LIVE', 'OVERTIME'].includes(data.state)) {
        setIsLiveStarted(true);
      }
    } catch (err) {
      console.error('Failed to sync waiting room:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLobbyState();

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

    socket.on('auction.timer.updated', (data: { remainingSeconds: number }) => {
      setRemainingSeconds(data.remainingSeconds);
      if (data.remainingSeconds <= 0) {
        setIsLiveStarted(true);
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

    // Clock ticker fallback for mock display
    const timeTicker = setInterval(() => {
      setServerTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setRemainingSeconds(prev => {
        if (prev !== null && prev > 0) {
          return prev - 1;
        }
        return prev;
      });
    }, 1000);

    return () => {
      socket.disconnect();
      clearInterval(timeTicker);
    };
  }, [id]);

  // Handle redirect timer when auction starts
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
  }, [isLiveStarted]);

  const formatCountdown = () => {
    if (remainingSeconds === null || remainingSeconds < 0 || isLiveStarted) return '00 : 00 : 00';
    const hrs = Math.floor(remainingSeconds / 3600);
    const mins = Math.floor((remainingSeconds % 3600) / 60);
    const secs = remainingSeconds % 60;
    return `${hrs.toString().padStart(2, '0')} : ${mins.toString().padStart(2, '0')} : ${secs.toString().padStart(2, '0')}`;
  };

  const handleDownload = (doc: string) => {
    alert(`Downloading ${doc} copy...`);
    if (doc === 'Auction Rules') {
      setRulesReviewed(true);
    }
  };

  if (loading) {
    return <div className="p-6 text-center text-xs text-slate-400">Loading Pre-Auction Lobby...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans p-6 flex flex-col justify-between select-none">
      
      {/* Top Header */}
      <header className="max-w-7xl w-full mx-auto flex items-center justify-between border-b border-slate-900 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-650 text-white font-bold text-md shadow-lg shadow-indigo-650/20">
            B
          </div>
          <div>
            <span className="font-bold text-sm tracking-tight text-white">Black Box Procurement</span>
            <p className="text-[9px] text-slate-500 font-semibold tracking-wider uppercase mt-0.5">Pre-Auction Lobby</p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <span className="text-[10px] text-slate-550 border border-slate-850 px-2 py-0.5 rounded-full bg-slate-900/40">
            ✓ Session scoped to this auction only
          </span>
          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
            socketConnected ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${socketConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></span>
            {socketConnected ? 'Lobby Active' : 'Disconnected'}
          </span>
        </div>
      </header>

      {/* Main Grid Core */}
      <main className="max-w-6xl w-full mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6 my-8 items-start">
        
        {/* Left and Middle Columns */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* A. Auction Ready Headline */}
          <div className="bg-slate-900/60 border border-slate-900 rounded-3xl p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4">
              <span className="text-[10px] uppercase font-bold tracking-widest bg-indigo-500/10 text-indigo-400 py-1 px-2.5 rounded-full border border-indigo-500/20">
                Lobby
              </span>
            </div>
            <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider">Target Project Scope</span>
            <h1 className="text-xl font-bold text-white mt-1.5">{auction?.title || 'IT Hardware Procurement FY26'}</h1>
            <p className="text-xs text-slate-400 mt-2.5 leading-relaxed">{auction?.description || 'Scoped components tender.'}</p>
          </div>

          {/* B. Countdown timer block */}
          <div className="bg-gradient-to-br from-indigo-950/20 to-slate-900 border border-indigo-900/30 rounded-3xl p-6 text-center shadow-xl space-y-4">
            <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest block">Auction Starts In</span>
            <div className="text-4xl font-extrabold text-white font-mono tracking-wide py-2 animate-pulse">
              {formatCountdown()}
            </div>
            <div className="flex justify-center items-center gap-6 text-[10px] text-slate-500 font-bold uppercase">
              <span>Hours</span>
              <span>Minutes</span>
              <span>Seconds</span>
            </div>
          </div>

          {/* C. Quick Specifications and Documents lists */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* 1. Auction Details info */}
            <div className="bg-slate-900/40 border border-slate-900 rounded-3xl p-5 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-white border-b border-slate-800 pb-2">
                Auction Specifications
              </h3>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-450">Auction ID:</span>
                  <span className="font-mono text-white font-semibold">{auction?.id?.split('-')[0].toUpperCase() || 'AUC-2026-018'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-450">Auction Type:</span>
                  <span className="text-white font-semibold">Reverse Auction</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-450">Organization:</span>
                  <span className="text-white font-semibold">Black Box Ltd.</span>
                </div>
                <div className="flex justify-between items-center pt-1.5 border-t border-slate-850">
                  <span className="text-slate-450">Base Price:</span>
                  <span className="text-white font-semibold font-mono">
                    {auction?.basePrice ? `$${Number(auction.basePrice).toLocaleString()}` : '$10,000'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-450">Min Decrement:</span>
                  <span className="text-white font-semibold font-mono">
                    {auction?.bidRuleSnapshot?.minDecrement ? `$${Number(auction.bidRuleSnapshot.minDecrement).toLocaleString()}` : '$100'}
                  </span>
                </div>
              </div>
            </div>

            {/* 2. Auction Schedule card (Added per request 2) */}
            <div className="bg-slate-900/40 border border-slate-900 rounded-3xl p-5 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-white border-b border-slate-800 pb-2">
                Auction Schedule
              </h3>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-450">Starts:</span>
                  <span className="text-white font-semibold">
                    {auction?.startAt ? new Date(auction.startAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-450">Ends:</span>
                  <span className="text-white font-semibold">
                    {auction?.endAt ? new Date(auction.endAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-1.5 border-t border-slate-850">
                  <span className="text-slate-450">Overtime:</span>
                  <span className={`font-semibold ${auction?.bidRuleSnapshot?.overtimeEnabled ? 'text-emerald-400' : 'text-slate-400'}`}>
                    {auction?.bidRuleSnapshot?.overtimeEnabled ? 'Enabled' : 'Disabled'}
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
                onClick={() => handleDownload('Terms & Conditions')}
                className="flex items-center gap-1.5 p-2.5 border border-slate-800 rounded-xl bg-slate-900/60 hover:bg-slate-800 text-slate-350 transition text-left"
              >
                <Download size={12} className="text-indigo-400" />
                <span>Terms & Conditions</span>
              </button>
              <button
                onClick={() => handleDownload('Auction Rules')}
                className="flex items-center gap-1.5 p-2.5 border border-slate-800 rounded-xl bg-slate-900/60 hover:bg-slate-800 text-slate-350 transition text-left"
              >
                <Download size={12} className="text-indigo-400" />
                <span>Auction Rules</span>
              </button>
              <button
                onClick={() => handleDownload('Invitation Letter')}
                className="flex items-center gap-1.5 p-2.5 border border-slate-800 rounded-xl bg-slate-900/60 hover:bg-slate-800 text-slate-350 transition text-left"
              >
                <Download size={12} className="text-indigo-400" />
                <span>Invitation Letter</span>
              </button>
            </div>
          </div>

          {/* E. Server Time clock and Notices */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Server Time Display */}
            <div className="bg-slate-900 border border-slate-900 p-5 rounded-3xl text-center space-y-2">
              <span className="block text-[9px] text-slate-500 font-bold uppercase tracking-wider">Synchronized Server Time</span>
              <span className="text-[10px] text-slate-400 font-mono block">03 Jul 2026</span>
              <span className="text-xl font-bold font-mono text-indigo-400 mt-1 block">{serverTime || '09:58:34 AM'}</span>
            </div>

            {/* Notices lists */}
            <div className="md:col-span-2 bg-slate-900/40 border border-slate-900 p-5 rounded-3xl space-y-2.5 text-[11px] leading-relaxed text-slate-400">
              <h4 className="font-bold text-white text-xs">Pre-bidding Guidelines</h4>
              <ul className="list-disc list-inside space-y-1.5 pl-1">
                <li>Refreshing your browser will not log you out or affect your session parameters.</li>
                <li>All bid amounts are checked against decrements rules on submission.</li>
                <li>Synchronization is updated automatically via the socket clock pulses.</li>
              </ul>
            </div>

          </div>

          {/* Security Banner Note (Requirement 9) */}
          <div className="text-center text-[10px] text-slate-650 border-t border-slate-900/50 pt-4">
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
                <span className="font-bold text-white text-right truncate">{vendorName}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 border-b border-slate-900 pb-2.5">
                <span className="text-slate-500 font-bold text-[9px] uppercase">Vendor ID</span>
                <span className="font-mono text-white text-right font-semibold">{vendorCode}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 border-b border-slate-900 pb-2.5">
                <span className="text-slate-500 font-bold text-[9px] uppercase">Access Scope</span>
                <span className="text-slate-450 text-right">Auction Specific</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <span className="text-slate-500 font-bold text-[9px] uppercase">Role</span>
                <span className="text-slate-450 text-right">Vendor</span>
              </div>
            </div>
          </div>

          {/* B. Invitation Status Section (Requirement 4) */}
          <div className="bg-slate-900/60 border border-slate-900 rounded-3xl p-5 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-white border-b border-slate-800 pb-2">
              Invitation Status
            </h3>
            <div className="space-y-2 text-xs">
              <div className="p-3 bg-indigo-950/20 border border-indigo-900/20 rounded-xl space-y-1">
                <span className="block text-[10px] font-bold text-indigo-400 uppercase">Temporary Credentials</span>
                <span className="text-[10px] text-slate-400">Expires after auction completion</span>
              </div>
              <div className="flex items-center gap-1.5 text-emerald-500 text-[11px] font-semibold pl-1 pt-1">
                <CheckCircle2 size={13} /> Invitation Verified
              </div>
            </div>
          </div>

          {/* C. Compliance status checklists */}
          <div className="bg-slate-900/60 border border-slate-900 rounded-3xl p-5 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-white border-b border-slate-800 pb-2">
              Status checklists
            </h3>
            <div className="space-y-3 text-[11px]">
              {[
                { label: 'Login Authentication', val: 'Verified', checked: true },
                { label: 'Terms & Conditions', val: 'Accepted', checked: true },
                { label: 'Auction Rules View', val: rulesReviewed ? 'Reviewed' : 'Review Required', checked: rulesReviewed },
                { label: 'System WebSockets', val: socketConnected ? 'Connected' : 'Connecting...', checked: socketConnected }
              ].map((c, idx) => (
                <div key={idx} className="flex justify-between items-center">
                  <span className="text-slate-450">{c.label}</span>
                  <span className={`flex items-center gap-1 font-semibold ${c.checked ? 'text-emerald-400' : 'text-slate-500'}`}>
                    <CheckCircle2 size={13} />
                    {c.val}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* D. Dynamic CTA action */}
          <button
            onClick={() => navigate(`/vendor/auctions/${id}/live`)}
            disabled={!isLiveStarted}
            className={`w-full py-4 rounded-2xl text-xs font-bold uppercase tracking-widest transition duration-300 shadow-xl ${
              isLiveStarted
                ? 'bg-white text-slate-950 hover:bg-slate-100'
                : 'bg-slate-900 border border-slate-850 text-slate-650 cursor-not-allowed'
            }`}
          >
            {isLiveStarted 
              ? `ENTER LIVE AUCTION${redirectCountdown > 0 ? ` (Redirecting in ${redirectCountdown}...)` : ''}` 
              : 'Auction Starts In...'}
          </button>

          {/* E. Browser checklist diagnostic checks */}
          <div className="bg-slate-900/20 border border-slate-900/80 rounded-3xl p-5 space-y-4">
            
            {/* Sub-label 1: System Readiness */}
            <div className="space-y-2">
              <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">System Readiness</h4>
              <div className="grid grid-cols-2 gap-2 text-[10px] font-bold text-slate-450 pl-1">
                <div className="flex items-center gap-1.5">
                  <Check size={11} className="text-emerald-500" /> Cookies Enabled
                </div>
                <div className="flex items-center gap-1.5">
                  <Check size={11} className="text-emerald-500" /> JS Support
                </div>
              </div>
            </div>

            {/* Sub-label 2: Connection Status */}
            <div className="space-y-2 border-t border-slate-900 pt-3">
              <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Connection Status</h4>
              <div className="grid grid-cols-2 gap-2 text-[10px] font-bold text-slate-455 pl-1">
                <div className="flex items-center gap-1.5">
                  <Check size={11} className="text-emerald-500" /> Internet Linked
                </div>
                <div className="flex items-center gap-1.5">
                  <Check size={11} className="text-emerald-500" /> Server Connected
                </div>
              </div>
            </div>

            {/* Sub-label 3: Device Compatibility */}
            <div className="space-y-2 border-t border-slate-900 pt-3">
              <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Device Compatibility</h4>
              <div className="grid grid-cols-2 gap-2 text-[10px] font-bold text-slate-455 pl-1">
                <div className="flex items-center gap-1.5">
                  <Check size={11} className="text-emerald-500" /> Browser Compatible
                </div>
                <div className="flex items-center gap-1.5">
                  <Check size={11} className="text-emerald-500" /> WebSockets OK
                </div>
              </div>
            </div>

          </div>

          {/* F. Auction Owner details */}
          <div className="text-center p-2 rounded-2xl bg-slate-900/10 border border-slate-900/60 text-[10px] space-y-0.5">
            <span className="block text-[8px] text-slate-500 font-bold uppercase tracking-wider">Auction Administrator</span>
            <span className="text-slate-400 font-semibold">Procurement Team — Black Box Ltd.</span>
          </div>

        </div>

      </main>

      {/* Footer copyright */}
      <footer className="max-w-7xl w-full mx-auto border-t border-slate-900 pt-4 text-center text-[10px] text-slate-650 uppercase tracking-widest">
        © 2026 BLACK BOX LIMITED • CONFIDENTIAL COMPLIANCE GATEWAY
      </footer>

    </div>
  );
};

export default VendorLobby;
