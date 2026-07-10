import React, { useState, useEffect } from 'react';
import { useAuth } from '../providers/AuthProvider';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, User as UserIcon, Lock as LockIcon, HelpCircle, ShieldCheck, ShieldAlert, Clock, X, Mail, Sun, Moon } from 'lucide-react';
import axios from 'axios';
import BlackBoxLogo from '../components/BlackBoxLogo';
import { getAuctionDisplayId } from '../utils/auctionHelper';
import { getActiveToken } from '../utils/tokenHelper';

interface AuctionContext {
  id: string;
  title: string;
  state: 'DRAFT' | 'PUBLISHED' | 'LIVE' | 'COMPLETED';
  startAt: string | null;
  endAt: string | null;
}

const VendorLogin: React.FC = () => {
  const { user, logout, vendorLogin } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  // Extract real url parameter for invitation landing (stored in state for manual load fallback)
  const initialAuctionId = searchParams.get('auctionId') || searchParams.get('id');
  const [activeAuctionId, setActiveAuctionId] = useState<string | null>(initialAuctionId);
  const [sessionInput, setSessionInput] = useState('');

  useEffect(() => {
    if (user) {
      if (user.role !== 'VENDOR') {
        logout();
      } else if (activeAuctionId) {
        const token = getActiveToken(activeAuctionId || undefined);
        if (token) {
          try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            if (payload.auctionId && payload.auctionId !== activeAuctionId) {
              logout();
            } else {
              navigate(`/vendor/auctions/${activeAuctionId}/terms`);
            }
          } catch (e) {
            console.error(e);
          }
        }
      }
    }
  }, [user, activeAuctionId, navigate]);

  const [isLightTheme, setIsLightTheme] = useState(() => {
    return searchParams.get('theme') === 'light';
  });

  useEffect(() => {
    if (isLightTheme) {
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
    }
  }, [isLightTheme]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Dynamic Auction Context States
  const [context, setContext] = useState<AuctionContext | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  // Modals States
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);

  const handleLoadSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionInput) return;
    
    let extractedId = sessionInput.trim();
    try {
      if (extractedId.includes('?id=')) {
        extractedId = extractedId.split('?id=')[1].split('&')[0];
      } else if (extractedId.includes('?auctionId=')) {
        extractedId = extractedId.split('?auctionId=')[1].split('&')[0];
      } else if (extractedId.includes('/vendor/login/')) {
        extractedId = extractedId.split('/vendor/login/')[1].split('?')[0];
      }
    } catch (e) {
      console.error(e);
    }
    
    setActiveAuctionId(extractedId);
  };

  useEffect(() => {
    if (!activeAuctionId) {
      setLookupError('No bidding invitation code found. Please paste your secure invitation link or session ID.');
      return;
    }

    const fetchAuctionContext = async () => {
      setLoadingContext(true);
      setLookupError(null);
      setError(null);
      try {
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
        const res = await axios.get(`${API_URL}/auctions/public/${activeAuctionId}`);
        setContext(res.data.data);
      } catch (err: any) {
        setLookupError('This invitation link is invalid or has expired. Contact your auction administrator.');
        setContext(null);
      } finally {
        setLoadingContext(false);
      }
    };

    fetchAuctionContext();
  }, [activeAuctionId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }

    // Block logins if context is invalid or completed
    if (lookupError || (context && context.state === 'COMPLETED')) {
      setError('Bidding session closed. You cannot log in.');
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      await vendorLogin(email, password, context?.id || activeAuctionId || undefined);
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || 'Invalid username or password.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Determine bidding states
  const isUpcoming = context?.state === 'PUBLISHED' && context.startAt && new Date(context.startAt) > new Date();
  const isLive = context?.state === 'LIVE';
  const isBiddingClosed = context?.state === 'COMPLETED';
  
  // Disable form inputs only for Completed or Invalid code status
  const disableFormFields = !!lookupError || isBiddingClosed || loadingContext;

  return (
    <div className={`h-screen w-screen flex flex-col justify-between relative font-sans overflow-hidden select-none transition-colors duration-500 ${
      isLightTheme ? 'bg-[#ebedf0] text-[#1a1a1a]' : 'bg-[#070708] text-[#f4f4f5]'
    }`}>
      {/* Background rich modern gradient flows & glowing circles */}
      <div className={`absolute inset-0 transition-opacity duration-500 pointer-events-none ${
        isLightTheme 
          ? 'bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.08)_0%,rgba(248,249,250,1)_75%)]' 
          : 'bg-[radial-gradient(ellipse_at_top,rgba(20,30,55,0.45)_0%,rgba(9,9,11,1)_75%)]'
      }`}></div>
      <div className={`absolute top-[10%] left-[-10%] w-[45%] h-[45%] rounded-full blur-[140px] pointer-events-none transition-colors duration-500 ${
        isLightTheme ? 'bg-indigo-600/5' : 'bg-indigo-600/10'
      }`}></div>
      <div className={`absolute bottom-[10%] right-[-10%] w-[45%] h-[45%] rounded-full blur-[140px] pointer-events-none transition-colors duration-500 ${
        isLightTheme ? 'bg-purple-600/5' : 'bg-purple-600/5'
      }`}></div>

      {/* Navigation Header */}
      <header className="w-full max-w-7xl mx-auto px-6 lg:px-16 h-20 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-3">
          <span className={`text-xl font-bold tracking-tight font-sans bg-clip-text text-transparent bg-gradient-to-r transition-all duration-500 ${
            isLightTheme ? 'from-zinc-900 via-zinc-800 to-zinc-650' : 'from-white via-zinc-100 to-zinc-400'
          }`}>
            Black Box<span className="text-primary-600">.</span>
          </span>
        </div>
        <nav className={`flex items-center gap-8 text-[11px] font-semibold uppercase tracking-[0.25em] transition-colors duration-500 ${
          isLightTheme ? 'text-zinc-600' : 'text-zinc-400'
        }`}>
          <button 
            type="button" 
            onClick={() => setIsLightTheme(!isLightTheme)} 
            className={`transition-colors duration-300 flex items-center gap-1 focus:outline-none cursor-pointer ${
              isLightTheme ? 'hover:text-zinc-900' : 'hover:text-white'
            }`}
            title={isLightTheme ? "Switch to Dark Mode" : "Switch to Light Mode"}
          >
            {isLightTheme ? <Moon size={14} /> : <Sun size={14} />}
            {isLightTheme ? "Dark Theme" : "Light Theme"}
          </button>
          <button 
            type="button" 
            onClick={() => setShowContactModal(true)} 
            className={`transition-colors duration-300 flex items-center gap-1 focus:outline-none cursor-pointer ${
              isLightTheme ? 'hover:text-zinc-900' : 'hover:text-white'
            }`}
          >
            <Mail size={14} />
            Contact
          </button>
          <button 
            type="button" 
            onClick={() => setShowHelpModal(true)} 
            className={`transition-colors duration-300 flex items-center gap-1 focus:outline-none cursor-pointer ${
              isLightTheme ? 'hover:text-zinc-900' : 'hover:text-white'
            }`}
          >
            <HelpCircle size={14} />
            Need help?
          </button>
        </nav>
      </header>

      {/* Main Login Card Container */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 relative z-10">
        <div className={`w-full max-w-[960px] flex rounded-2xl overflow-hidden transition-all duration-500 relative ${
          isLightTheme 
            ? 'bg-[#ffffff] border border-zinc-300 shadow-[0_30px_70px_-10px_rgba(0,0,0,0.15),0_0_50px_rgba(0,0,0,0.02)]' 
            : 'bg-[#121215] border border-zinc-800/60 shadow-[0_35px_80px_-15px_rgba(0,0,0,0.95)]'
        }`}>
          <div className={`absolute inset-px rounded-2xl pointer-events-none border z-20 transition-colors duration-500 ${
            isLightTheme ? 'border-white/40' : 'border-white/[0.03]'
          }`}></div>

          {/* Left Panel: Glowing Wireframe Graphic */}
          <div className={`hidden md:flex md:w-1/2 p-10 flex-col justify-center items-center relative overflow-hidden select-none border-r transition-colors duration-500 ${
            isLightTheme ? 'bg-[#f5f6f8] border-zinc-300' : 'bg-[#09090b] border-zinc-800/40'
          }`}>
            <div className={`absolute inset-0 bg-[size:24px_24px] ${
              isLightTheme 
                ? 'bg-[linear-gradient(to_right,#e5e7eb80_1px,transparent_1px),linear-gradient(to_bottom,#e5e7eb80_1px,transparent_1px)]' 
                : 'bg-[linear-gradient(to_right,#1f293708_1px,transparent_1px),linear-gradient(to_bottom,#1f293708_1px,transparent_1px)]'
            }`}></div>
            <div className={`absolute inset-0 bg-gradient-to-b from-transparent z-10 transition-colors duration-500 ${
              isLightTheme ? 'via-[#fcfdfe] to-[#fcfdfe]' : 'via-[#09090b] to-[#09090b]'
            }`}></div>
            <div className={`absolute w-72 h-72 rounded-full blur-[80px] pointer-events-none transition-colors duration-500 ${
              isLightTheme ? 'bg-indigo-500/5' : 'bg-indigo-500/10'
            }`}></div>

            {/* Wireframe cubes SVG */}
            <svg 
              className={`w-full h-full stroke-[2.2] relative z-20 transition-colors duration-500 ${
                isLightTheme ? 'text-zinc-800/90' : 'text-white/90'
              }`} 
              viewBox="0 0 400 300" 
              fill="none" 
              stroke="currentColor"
            >
              <defs>
                <linearGradient id="bottom-fade" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="white" stopOpacity="1" />
                  <stop offset="65%" stopColor="white" stopOpacity="1" />
                  <stop offset="100%" stopColor="white" stopOpacity="0" />
                </linearGradient>
                <mask id="fade-mask">
                  <rect x="0" y="0" width="400" height="300" fill="url(#bottom-fade)" />
                </mask>
              </defs>

              <g mask="url(#fade-mask)">
                <path d="M 40 130 L 75 110 L 110 130 L 75 150 Z" />
                <path d="M 40 130 L 40 180 L 75 200 L 75 150 Z" />
                <path d="M 110 130 L 110 180 L 75 200 L 75 150 Z" />
                <path d="M 40 80 L 75 60 L 110 80 L 75 100 Z" />
                <path d="M 40 80 L 40 130" />
                <path d="M 75 100 L 75 150" />
                <path d="M 110 80 L 110 130" />
                <line x1="40" y1="180" x2="40" y2="300" />
                <line x1="75" y1="200" x2="75" y2="300" />
                <line x1="110" y1="180" x2="110" y2="300" />
                
                <path d="M 110 150 L 145 130 L 180 150 L 145 170 Z" />
                <path d="M 110 150 L 110 200 L 145 220 L 145 170 Z" />
                <path d="M 180 150 L 180 200 L 145 220 L 145 170 Z" />
                <path d="M 110 100 L 145 80 L 180 100 L 145 120 Z" />
                <path d="M 110 100 L 110 150" />
                <path d="M 145 120 L 145 170" />
                <path d="M 180 100 L 180 150" />
                <line x1="110" y1="200" x2="110" y2="300" />
                <line x1="145" y1="220" x2="145" y2="300" />
                <line x1="180" y1="200" x2="180" y2="300" />

                <path d="M 180 170 L 215 150 L 250 170 L 215 190 Z" />
                <path d="M 180 170 L 180 220 L 215 240 L 215 190 Z" />
                <path d="M 250 170 L 250 220 L 215 240 L 215 190 Z" />
                <path d="M 180 120 L 215 100 L 250 120 L 215 140 Z" />
                <path d="M 180 120 L 180 170" />
                <path d="M 215 140 L 215 190" />
                <path d="M 250 120 L 250 170" />
                <line x1="180" y1="220" x2="180" y2="300" />
                <line x1="215" y1="240" x2="215" y2="300" />
                <line x1="250" y1="220" x2="250" y2="300" />

                <path d="M 250 140 L 285 120 L 320 140 L 285 160 Z" />
                <path d="M 250 140 L 250 190 L 285 210 L 285 160 Z" />
                <path d="M 320 140 L 320 190 L 285 210 L 285 160 Z" />
                <path d="M 250 90 L 285 70 L 320 90 L 285 110 Z" />
                <path d="M 250 90 L 250 140" />
                <path d="M 285 110 L 285 160" />
                <path d="M 320 90 L 320 140" />
                <line x1="250" y1="190" x2="250" y2="300" />
                <line x1="285" y1="210" x2="285" y2="300" />
                <line x1="320" y1="190" x2="320" y2="300" />

                <path d="M 320 160 L 355 140 L 390 160 L 355 180 Z" />
                <path d="M 320 160 L 320 210 L 355 230 L 355 180 Z" />
                <path d="M 390 160 L 390 210 L 355 230 L 355 180 Z" />
                <path d="M 320 110 L 355 90 L 390 110 L 355 130 Z" />
                <path d="M 320 110 L 320 160" />
                <path d="M 355 130 L 355 180" />
                <path d="M 390 110 L 390 160" />
                <line x1="320" y1="210" x2="320" y2="300" />
                <line x1="355" y1="230" x2="355" y2="300" />
                <line x1="390" y1="210" x2="390" y2="300" />
              </g>
            </svg>
          </div>

          {/* Right Panel: Vendor OTP Form */}
          <div className={`w-full md:w-1/2 px-8 py-10 sm:px-14 sm:py-16 flex flex-col justify-center relative font-sans transition-colors duration-500 ${
            isLightTheme ? 'bg-[#ffffff] text-[#1a1a1a]' : 'bg-[#121215] text-[#f4f4f5]'
          }`}>
            <div className="flex flex-col items-center justify-center mb-6">
              <BlackBoxLogo className="h-14 w-14" color={isLightTheme ? "#0F172A" : "white"} />
            </div>

            <div className="mb-6 text-center md:text-left">
              <h2 className={`text-3xl font-extrabold tracking-tight font-sans transition-colors duration-500 ${
                isLightTheme ? 'text-zinc-900' : 'text-white'
              }`}>Vendor Access</h2>
              <p className="text-xs text-zinc-500 mt-1">Reverse E-Auction Bidding Portal</p>
            </div>

            {/* 4 Secure Status Indicator Banners (No information leak) */}
            {loadingContext && (
              <div className={`border rounded-xl p-3.5 mb-6 text-xs flex items-center gap-2.5 animate-pulse transition-all duration-500 ${
                isLightTheme ? 'bg-zinc-100/50 border-zinc-200/80 text-zinc-650' : 'bg-zinc-800/10 border-zinc-800/40 text-zinc-400'
              }`}>
                <Clock size={16} className="text-zinc-500 shrink-0 animate-spin" />
                <span>Verifying secure bidding session context...</span>
              </div>
            )}

            {!loadingContext && context && (
              <>
                {/* Completed Banner */}
                {isBiddingClosed && (
                  <div className={`border rounded-xl p-3.5 mb-6 text-xs flex items-start gap-2.5 transition-all duration-500 ${
                    isLightTheme ? 'bg-red-50/70 border-red-200/60 text-red-700' : 'bg-danger/10 border-danger/20 text-danger'
                  }`}>
                    <ShieldAlert size={16} className={`${isLightTheme ? 'text-red-600' : 'text-danger'} shrink-0 mt-0.5`} />
                    <div>
                      <span className={`${isLightTheme ? 'text-red-700' : 'text-red-650'} font-bold block mb-0.5 text-[10px] uppercase tracking-wider`}>Bidding Session Closed</span>
                      This bidding session has completed. Credentials are no longer valid.
                    </div>
                  </div>
                )}

                {/* Upcoming / Live Banner */}
                {!isBiddingClosed && (
                  <div className={`border rounded-xl p-3.5 mb-6 text-xs transition-all duration-500 ${
                    isLightTheme 
                      ? 'bg-indigo-50/70 border-indigo-200/60 text-zinc-700' 
                      : 'bg-indigo-950/45 border border-indigo-800/40 text-zinc-300'
                  }`}>
                    <div className="flex items-start gap-2.5">
                      {isLive ? (
                        <ShieldCheck size={16} className={`${isLightTheme ? 'text-indigo-600' : 'text-indigo-400'} shrink-0 mt-0.5`} />
                      ) : (
                        <Clock size={16} className={`${isLightTheme ? 'text-amber-600' : 'text-amber-400'} shrink-0 mt-0.5`} />
                      )}
                      <div>
                        {isLive && (
                          <>
                            <span className={`${isLightTheme ? 'text-indigo-700' : 'text-indigo-400'} font-bold block text-[10px] uppercase tracking-wider`}>Verified Bidding Link</span>
                            Secure connection established. Bidding is now active.
                          </>
                        )}
                        {!isLive && (
                          <>
                            <span className={`${isLightTheme ? 'text-amber-700' : 'text-amber-400'} font-bold block text-[10px] uppercase tracking-wider`}>
                              {isUpcoming ? 'Upcoming Session' : 'Scheduled Session'}
                            </span>
                            Bidding session is upcoming. You can log in early and wait.
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Auction Details panel (Added per request 9) */}
                <div className={`border rounded-xl p-4 mb-6 text-xs transition-all duration-500 space-y-3 ${
                  isLightTheme 
                    ? 'bg-white border-zinc-200 text-zinc-800' 
                    : 'bg-[#121215] border-zinc-800 text-zinc-350'
                }`}>
                  <h4 className="font-bold text-[10px] uppercase tracking-wider text-indigo-500 border-b pb-1.5 border-dashed border-zinc-800/40">
                    Auction Session Details
                  </h4>
                  <div className="grid grid-cols-2 gap-y-2.5 gap-x-4 text-[11px]">
                    <div>
                      <span className="text-zinc-500 block text-[9px] uppercase font-bold">Auction Name</span>
                      <span className={`font-bold ${isLightTheme ? 'text-zinc-900' : 'text-neutral-100'}`}>{context.title}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-[9px] uppercase font-bold">Auction ID</span>
                      <span className={`font-mono font-semibold ${isLightTheme ? 'text-zinc-900' : 'text-neutral-100'}`}>{getAuctionDisplayId(context.id, context.title).id}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-[9px] uppercase font-bold">Start Time</span>
                      <span className={isLightTheme ? 'text-zinc-700' : 'text-zinc-300'}>{context.startAt ? new Date(context.startAt).toLocaleString() : 'Immediate'}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-[9px] uppercase font-bold">Scheduled Expiry</span>
                      <span className={isLightTheme ? 'text-zinc-700' : 'text-zinc-300'}>{context.endAt ? new Date(context.endAt).toLocaleString() : 'On Close'}</span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {!activeAuctionId ? (
              <form onSubmit={handleLoadSession} className="space-y-6">
                <div className="mb-4 text-center md:text-left">
                  <h4 className="font-bold text-neutral-900 dark:text-white text-xs uppercase tracking-wider">Access Bidding Session</h4>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                    Paste your secure invitation link or session ID sent in your official invitation to continue.
                  </p>
                </div>

                <div className="relative group">
                  <div className={`flex items-center gap-4 border-b py-2.5 transition-colors duration-300 ${
                    isLightTheme 
                      ? 'border-zinc-200 group-focus-within:border-indigo-650' 
                      : 'border-zinc-700 group-focus-within:border-indigo-500'
                  }`}>
                    <Mail size={18} className="text-zinc-500" />
                    <input
                      type="text"
                      value={sessionInput}
                      onChange={(e) => setSessionInput(e.target.value)}
                      placeholder="Session ID or Invitation URL"
                      required
                      className={`w-full bg-transparent text-sm focus:outline-none py-0.5 transition-colors duration-500 ${
                        isLightTheme ? 'text-zinc-900 placeholder:text-zinc-400' : 'text-white placeholder:text-zinc-500'
                      }`}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className={`w-full rounded-2xl font-bold py-3.5 px-4 text-xs uppercase tracking-widest transition-all duration-300 cursor-pointer ${
                    isLightTheme 
                      ? 'bg-zinc-900 text-white hover:bg-zinc-800 hover:shadow-[0_0_25px_rgba(99,102,241,0.15)]' 
                      : 'bg-white text-zinc-950 hover:bg-zinc-100 hover:shadow-[0_0_25px_rgba(99,102,241,0.25)]'
                  }`}
                >
                  Load Session
                </button>
              </form>
            ) : (
              <>
                {!loadingContext && lookupError && (
                  <div className={`border rounded-xl p-3.5 mb-6 text-xs flex items-start gap-2.5 transition-all duration-500 ${
                    isLightTheme ? 'bg-red-50/70 border-red-200/60 text-red-700' : 'bg-danger/10 border-danger/20 text-danger'
                  }`}>
                    <ShieldAlert size={16} className={`${isLightTheme ? 'text-red-600' : 'text-danger'} shrink-0 mt-0.5`} />
                    <div>
                      <span className={`${isLightTheme ? 'text-red-700' : 'text-red-650'} font-bold block mb-0.5 text-[10px] uppercase tracking-wider`}>Secure Access Error</span>
                      {lookupError}
                      {/* Sub-hint to guide the user back to the links */}
                      <p className="mt-2 text-[10px] text-zinc-400">
                        Or go back to <a href="/vendor/login" className="underline font-semibold text-indigo-550">General Login</a> to view direct links.
                      </p>
                    </div>
                  </div>
                )}
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Vendor Username Input */}
                  <div className="relative group">
                    <div className={`flex items-center gap-4 border-b py-2.5 transition-colors duration-300 ${
                      isLightTheme 
                        ? 'border-zinc-200 group-focus-within:border-indigo-650' 
                        : 'border-zinc-700 group-focus-within:border-indigo-500'
                    }`}>
                      <Mail size={18} className={`transition-colors duration-300 ${
                        isLightTheme 
                          ? 'text-zinc-400 group-focus-within:text-indigo-600' 
                          : 'text-zinc-500 group-focus-within:text-indigo-400'
                      }`} />
                      <input
                        type="email"
                        value={email}
                        disabled={disableFormFields}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Email Address"
                        required
                        className={`w-full bg-transparent text-sm focus:outline-none py-0.5 disabled:opacity-40 transition-colors duration-500 ${
                          isLightTheme ? 'text-zinc-900 placeholder:text-zinc-400' : 'text-white placeholder:text-zinc-500'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Password Input */}
                  <div className="relative group">
                    <div className={`flex items-center gap-4 border-b py-2.5 transition-colors duration-300 ${
                      isLightTheme 
                        ? 'border-zinc-200 group-focus-within:border-indigo-650' 
                        : 'border-zinc-700 group-focus-within:border-indigo-500'
                    }`}>
                      <LockIcon size={18} className={`transition-colors duration-300 ${
                        isLightTheme 
                          ? 'text-zinc-400 group-focus-within:text-indigo-600' 
                          : 'text-zinc-500 group-focus-within:text-indigo-400'
                      }`} />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        disabled={disableFormFields}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Password"
                        required
                        className={`w-full bg-transparent text-sm focus:outline-none py-0.5 pr-10 disabled:opacity-40 transition-colors duration-500 ${
                          isLightTheme ? 'text-zinc-900 placeholder:text-zinc-400' : 'text-white placeholder:text-zinc-500'
                        }`}
                      />
                      <button
                        type="button"
                        disabled={disableFormFields}
                        onClick={() => setShowPassword(!showPassword)}
                        className={`absolute right-1 transition-colors duration-200 disabled:opacity-40 ${
                          isLightTheme ? 'text-zinc-400 hover:text-zinc-950' : 'text-zinc-500 hover:text-white'
                        }`}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Security info note */}
                  <p className="text-[10px] text-zinc-500 leading-relaxed italic">
                    * Bidding session credentials are per-auction and expire automatically upon auction completion. Please check your official email invitation link for your username and password.
                  </p>

                  <button
                    type="submit"
                    disabled={submitting || disableFormFields || !email || !password}
                    className={`w-full rounded-2xl font-bold py-3.5 px-4 text-xs uppercase tracking-widest transition-all duration-300 disabled:opacity-45 cursor-pointer ${
                      isLightTheme 
                        ? 'bg-zinc-900 text-white hover:bg-zinc-800 hover:shadow-[0_0_25px_rgba(99,102,241,0.15)] disabled:hover:bg-zinc-900 disabled:hover:shadow-none' 
                        : 'bg-white text-zinc-950 hover:bg-zinc-100 hover:shadow-[0_0_25px_rgba(99,102,241,0.25)] disabled:hover:bg-white disabled:hover:shadow-none'
                    }`}
                  >
                    {submitting ? 'Connecting...' : 'Continue to Auction'}
                  </button>
                </form>
              </>
            )}
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className={`w-full text-center py-6 text-[10px] uppercase tracking-[0.25em] relative z-10 border-t transition-all duration-500 ${
        isLightTheme ? 'border-zinc-200/50 bg-zinc-50/50 text-zinc-500' : 'border-zinc-900/50 bg-black/10 text-zinc-650'
      }`}>
        © 2026 Vendor Auction Hub | Secure Enterprise Procurement Platform
      </footer>



      {/* Need Help? Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className={`rounded-2xl w-full max-w-lg p-6 relative shadow-2xl border transition-all duration-500 ${
            isLightTheme ? 'bg-[#ffffff] border-zinc-200/80 text-zinc-800' : 'bg-[#121215] border-zinc-800 text-zinc-300'
          }`}>
            <button 
              type="button"
              onClick={() => setShowHelpModal(false)}
              className={`absolute top-4 right-4 transition-colors ${
                isLightTheme ? 'text-zinc-400 hover:text-zinc-800' : 'text-zinc-500 hover:text-white'
              }`}
            >
              <X size={18} />
            </button>
            <h3 className={`text-lg font-bold mb-4 transition-colors ${
              isLightTheme ? 'text-zinc-900' : 'text-white'
            }`}>Bidding Portal Help</h3>
            <div className="space-y-4 text-sm">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold block mb-1">Didn't receive your credentials?</span>
                <ul className="list-disc pl-4 space-y-1 mt-1 text-xs">
                  <li>Check your spam/junk folder for emails from <code className={`px-1 py-0.5 rounded transition-colors ${
                    isLightTheme ? 'text-zinc-800 bg-zinc-100' : 'text-zinc-250 bg-zinc-900'
                  }`}>noreply@blackbox.com</code>.</li>
                  <li>Ensure the invitation email was sent to your registered vendor inbox.</li>
                  <li>Contact the Auction Administrator to request a credentials resend.</li>
                </ul>
              </div>
              <div className={`border-t pt-3 transition-colors ${
                isLightTheme ? 'border-zinc-200/80' : 'border-zinc-800/80'
              }`}>
                <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold block mb-1">Credentials not working?</span>
                <ul className="list-disc pl-4 space-y-1 mt-1 text-xs">
                  <li>Make sure you use the exact **Username** and **Password** supplied inside the official invitation email.</li>
                  <li>Verify that you clicked the correct link matching the target auction session.</li>
                  <li>Bidding credentials expire automatically upon completion of the auction.</li>
                </ul>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowHelpModal(false)}
              className={`mt-6 w-full rounded-xl font-semibold py-2.5 text-xs transition border ${
                isLightTheme 
                  ? 'bg-zinc-100 hover:bg-zinc-200 border-zinc-200 text-zinc-850' 
                  : 'bg-zinc-850 hover:bg-zinc-800 border-zinc-700/60 text-white'
              }`}
            >
              Close Help
            </button>
          </div>
        </div>
      )}

      {/* Contact Modal */}
      {showContactModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in">
          <div className={`rounded-2xl w-full max-w-md p-6 relative shadow-2xl border transition-all duration-500 ${
            isLightTheme ? 'bg-[#ffffff] border-zinc-200/80 text-zinc-800' : 'bg-[#121215] border-zinc-800 text-zinc-300'
          }`}>
            <button 
              type="button"
              onClick={() => setShowContactModal(false)}
              className={`absolute top-4 right-4 transition-colors ${
                isLightTheme ? 'text-zinc-400 hover:text-zinc-850' : 'text-zinc-500 hover:text-white'
              }`}
            >
              <X size={18} />
            </button>
            <h3 className={`text-lg font-bold mb-4 transition-colors ${
              isLightTheme ? 'text-zinc-900' : 'text-white'
            }`}>Contact Platform Support</h3>
            <div className="space-y-4 text-sm">
              <p className="text-xs text-zinc-400">
                For inquiries regarding ongoing e-auctions, credential issues, or technical difficulties, please reach out to our administration team.
              </p>
              <div className={`rounded-xl p-3.5 space-y-2.5 font-mono text-xs border transition-all duration-500 ${
                isLightTheme ? 'bg-zinc-50/80 border-zinc-200/80' : 'bg-black/20 border-zinc-800/60'
              }`}>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500">Support Email</span>
                  <a href="mailto:support@blackbox.com" className="text-indigo-650 hover:underline">support@blackbox.com</a>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-zinc-500">Hours</span>
                  <span className={isLightTheme ? 'text-zinc-800' : 'text-zinc-300'}>24/7 during Live Auctions</span>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowContactModal(false)}
              className={`mt-6 w-full rounded-xl font-semibold py-2.5 text-xs transition border ${
                isLightTheme 
                  ? 'bg-zinc-100 hover:bg-zinc-200 border-zinc-200 text-zinc-850' 
                  : 'bg-zinc-850 hover:bg-zinc-800 border-zinc-700/60 text-white'
              }`}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default VendorLogin;
