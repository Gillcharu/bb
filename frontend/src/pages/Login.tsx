import React, { useState } from 'react';
import { useAuth } from '../providers/AuthProvider';
import { useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, User as UserIcon, Lock as LockIcon, HelpCircle, ShieldCheck } from 'lucide-react';

const Login: React.FC = () => {
  const { login } = useAuth();
  const [searchParams] = useSearchParams();
  
  // Extract mock or real url parameters for vendor invitation landing
  const auctionId = searchParams.get('auctionId') || searchParams.get('id');
  const auctionName = searchParams.get('auctionName') || 'Raw Copper Supply Q3';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      await login(email, password);
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || 'Invalid email or password.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-screen w-screen bg-[#070708] text-[#f4f4f5] flex flex-col justify-between relative font-sans overflow-hidden select-none">
      {/* Background rich modern gradient flows & glowing circles */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(20,30,55,0.45)_0%,rgba(9,9,11,1)_75%)] pointer-events-none"></div>
      <div className="absolute top-[10%] left-[-10%] w-[45%] h-[45%] bg-indigo-600/10 rounded-full blur-[140px] pointer-events-none"></div>
      <div className="absolute bottom-[10%] right-[-10%] w-[45%] h-[45%] bg-purple-600/5 rounded-full blur-[140px] pointer-events-none"></div>

      {/* Navigation Header */}
      <header className="w-full max-w-7xl mx-auto px-6 lg:px-16 h-20 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold tracking-tight text-white font-sans bg-gradient-to-r from-white via-zinc-100 to-zinc-400 bg-clip-text text-transparent">
            Black Box<span className="text-primary-600">.</span>
          </span>
        </div>
        <nav className="flex items-center gap-8 text-[11px] font-semibold uppercase tracking-[0.25em] text-zinc-400">
          <a href="#contact" className="hover:text-white transition-colors duration-300">Contact</a>
          <a href="#help" className="hover:text-white transition-colors duration-300 flex items-center gap-1">
            <HelpCircle size={14} />
            Need help?
          </a>
        </nav>
      </header>

      {/* Main Login Card Container */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 relative z-10">
        <div className="w-full max-w-[960px] flex rounded-2xl overflow-hidden shadow-[0_35px_80px_-15px_rgba(0,0,0,0.95)] bg-[#121215] border border-zinc-800/60 relative">
          {/* Glowing edge outline */}
          <div className="absolute inset-px rounded-2xl pointer-events-none border border-white/[0.03] z-20"></div>

          {/* Left Panel: Glowing Wireframe Graphic */}
          <div className="hidden md:flex md:w-1/2 bg-[#09090b] p-10 flex-col justify-center items-center relative overflow-hidden select-none border-r border-zinc-800/40">
            {/* Mesh background grid */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f293708_1px,transparent_1px),linear-gradient(to_bottom,#1f293708_1px,transparent_1px)] bg-[size:24px_24px]"></div>
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#09090b] to-[#09090b] z-10"></div>
            
            {/* Ambient blue highlight glow */}
            <div className="absolute w-72 h-72 bg-indigo-500/10 rounded-full blur-[80px] pointer-events-none"></div>

            {/* Wireframe cubes SVG */}
            <svg 
              className="w-full h-full text-white/90 stroke-[2.2] relative z-20" 
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
                {/* Column 1 (Leftmost tall structure) */}
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
                
                {/* Column 2 (Second structure) */}
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

                {/* Column 3 (Middle structure) */}
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

                {/* Column 4 (Right-middle structure) */}
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

                {/* Column 5 (Rightmost structure) */}
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

          {/* Right Panel: White Form Card Panel */}
          <div className="w-full md:w-1/2 bg-[#121215] text-[#f4f4f5] px-8 py-10 sm:px-14 sm:py-12 flex flex-col justify-center relative">
            
            {/* Center Logo on top of form */}
            <div className="flex flex-col items-center justify-center mb-6">
              <img src="/logo.png" alt="Black Box Logo" className="h-14 w-14 bg-white p-1 rounded-full shadow-md object-contain border border-zinc-800" />
            </div>

            {/* Dynamic Auction Context Badge for Vendor Invitation Flows */}
            {auctionId && (
              <div className="bg-indigo-950/40 border border-indigo-800/40 rounded-xl p-3.5 mb-6 text-xs text-zinc-300 flex items-start gap-2.5">
                <ShieldCheck size={16} className="text-indigo-400 shrink-0 mt-0.5" />
                <div>
                  <span className="text-indigo-400 font-bold block mb-0.5 text-[10px] uppercase tracking-wider">Verified Auction Link</span>
                  Bidding session for <strong className="text-white">{auctionName}</strong> (ID: <code className="text-indigo-200">{auctionId}</code>)
                </div>
              </div>
            )}

            {error && (
              <div className="mb-6 p-3.5 bg-danger/10 text-danger border border-danger/20 rounded-lg text-sm font-medium">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">

              {/* Username Input with icon and bottom border animation */}
              <div className="relative group">
                <div className="flex items-center gap-4 border-b border-zinc-700 group-focus-within:border-indigo-500 py-2 transition-colors duration-300">
                  <UserIcon size={18} className="text-zinc-500 group-focus-within:text-indigo-400 transition-colors duration-300" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Username"
                    required
                    className="w-full bg-transparent text-sm text-white placeholder:text-zinc-500 focus:outline-none py-0.5"
                  />
                </div>
              </div>

              {/* Password Input with eye toggle and bottom border animation */}
              <div className="relative group">
                <div className="flex items-center gap-4 border-b border-zinc-700 group-focus-within:border-indigo-500 py-2 transition-colors duration-300">
                  <LockIcon size={18} className="text-zinc-500 group-focus-within:text-indigo-400 transition-colors duration-300" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    required
                    className="w-full bg-transparent text-sm text-white placeholder:text-zinc-500 focus:outline-none py-0.5 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-1 text-zinc-500 hover:text-white transition-colors duration-200"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Premium button - Rounded to match card outline corners (16px / rounded-2xl) */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-2xl bg-white text-zinc-950 font-bold py-3.5 px-4 text-xs uppercase tracking-widest transition-all duration-300 hover:bg-zinc-100 hover:shadow-[0_0_25px_rgba(99,102,241,0.25)]"
              >
                {submitting ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-950 border-t-transparent"></div>
                    Signing in...
                  </div>
                ) : (
                  'Log in'
                )}
              </button>
            </form>
          </div>

        </div>
      </main>

      {/* Copyright Footer - Configurable and compliant text */}
      <footer className="w-full text-center py-6 text-zinc-600 text-[10px] uppercase tracking-[0.25em] relative z-10 border-t border-zinc-900/50 bg-black/10">
        © 2026 Vendor Auction Hub | Secure Enterprise Procurement Platform
      </footer>
    </div>
  );
};

export default Login;
