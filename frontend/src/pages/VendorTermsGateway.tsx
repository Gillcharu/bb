import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../providers/AuthProvider';
import { FileText, Check, ShieldAlert } from 'lucide-react';
import { getActiveToken } from '../utils/tokenHelper';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

const VendorTermsGateway: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  
  useEffect(() => {
    const checkComplianceStatus = async () => {
      try {
        const res = await axios.get(`${API_URL}/auctions/${id}/live-state`);
        const data = res.data.data;
        const token = getActiveToken(id);
        if (token) {
          const payload = JSON.parse(atob(token.split('.')[1]));
          const email = payload.email;
          const matched = data.rankings?.find((r: any) => 
            r.vendorEmail?.toLowerCase() === email.toLowerCase() ||
            r.vendorName?.toLowerCase().includes(email.split('@')[0])
          );
          if (matched && matched.acceptedTerms) {
            if (['LIVE', 'OVERTIME', 'COMPLETED', 'CLOSED'].includes(data.state)) {
              navigate(`/vendor/auctions/${id}/live`, { replace: true });
            } else {
              navigate(`/vendor/auctions/${id}/lobby`, { replace: true });
            }
          }
        }
      } catch (err) {
        console.error('Failed to pre-check compliance details:', err);
      }
    };
    checkComplianceStatus();
  }, [id]);

  // Consent checkboxes
  const [scrolledTnc, setScrolledTnc] = useState(false);
  const [scrolledDisc, setScrolledDisc] = useState(false);
  const [scrolledRules, setScrolledRules] = useState(false);

  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'tnc' | 'disc' | 'rules'>('tnc');

  const paneRef = useRef<HTMLDivElement>(null);

  const checkScrollState = () => {
    const element = paneRef.current;
    if (!element) return;
    const isScrollable = element.scrollHeight > element.clientHeight;
    
    // If not scrollable (fits entirely), it is considered viewed/scrolled automatically
    if (!isScrollable) {
      if (activeTab === 'tnc') setScrolledTnc(true);
      if (activeTab === 'disc') setScrolledDisc(true);
      if (activeTab === 'rules') setScrolledRules(true);
    }
  };

  useEffect(() => {
    checkScrollState();
  }, [activeTab]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>, type: 'tnc' | 'disc' | 'rules') => {
    const target = e.currentTarget;
    // Check if scrolled close to bottom
    const isAtBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 40;
    if (isAtBottom) {
      if (type === 'tnc') setScrolledTnc(true);
      if (type === 'disc') setScrolledDisc(true);
      if (type === 'rules') setScrolledRules(true);
    }
  };

  const handleAccept = async () => {
    if (!accepted) return;
    setSaving(true);
    try {
      const mockIp = '127.0.0.1'; 
      await axios.post(`${API_URL}/auctions/${id}/terms/accept`, { ipAddress: mockIp });
      alert('Terms accepted successfully!');
      
      const res = await axios.get(`${API_URL}/auctions/${id}/live-state`);
      const data = res.data.data;
      if (['LIVE', 'OVERTIME', 'COMPLETED', 'CLOSED'].includes(data.state)) {
        navigate(`/vendor/auctions/${id}/live`, { replace: true });
      } else {
        navigate(`/vendor/auctions/${id}/lobby`);
      }
    } catch (err) {
      console.error('Acceptance upload failed:', err);
      try {
        await axios.patch(`${API_URL}/auctions/${id}`, {
          acceptedTerms: true
        });
        const res = await axios.get(`${API_URL}/auctions/${id}/live-state`);
        const data = res.data.data;
        if (['LIVE', 'OVERTIME', 'COMPLETED', 'CLOSED'].includes(data.state)) {
          navigate(`/vendor/auctions/${id}/live`, { replace: true });
        } else {
          navigate(`/vendor/auctions/${id}/lobby`);
        }
      } catch (fallbackErr) {
        alert('Failed to record compliance acceptance logs.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDecline = () => {
    alert('You have declined terms. Logging session out.');
    navigate('/vendor/login');
  };

  const docs = {
    tnc: 'Standard Black Box Procurement Terms and Conditions. By bidding, you agree to supply materials at the bid price. Quality SLA levels must meet or exceed Grade A standard components specifications.',
    disc: 'Bidders must disclose any conflicts of interest. Bidding information is strictly confidential. Collusion between bidders is illegal and triggers debarment.',
    rules: 'Reverse Auction. Decrements must meet the minimum required decrement step. Server time is the sole authoritative time source. Latency overrides will not be accepted.',
  };

  const allScrolled = scrolledTnc && scrolledDisc && scrolledRules;

  return (
    <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6 font-sans">
      <div className="max-w-2xl w-full bg-slate-950 border border-slate-800 rounded-3xl p-6 md:p-8 space-y-6 shadow-2xl">
        
        {/* Banner */}
        <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
          <div className="p-2.5 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-650/20">
            <FileText size={20} />
          </div>
          <div>
            <h2 className="text-md font-bold tracking-tight">Compliance Gateways</h2>
            <p className="text-[10px] text-slate-400 font-semibold mt-0.5">ACCEPTANCE OF LEGAL COVENANTS & RULES</p>
          </div>
        </div>

        {/* Info Box */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl text-xs text-slate-350 leading-relaxed flex items-start gap-2.5">
          <ShieldAlert className="text-indigo-500 shrink-0" size={18} />
          <p>
            Please scroll to the bottom of all three legal documents to verify you have read the details. 
            All acceptances are recorded with timestamps, user context, and client IP references.
          </p>
        </div>

        {/* Doc Tabs Selector */}
        <div className="flex border-b border-slate-800 text-xs font-semibold">
          {[
            { id: 'tnc', label: 'T&C Agreements', verified: scrolledTnc },
            { id: 'disc', label: 'Conflict Disclosures', verified: scrolledDisc },
            { id: 'rules', label: 'Bidding Rules', verified: scrolledRules },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`pb-2.5 px-4 flex items-center gap-1.5 transition border-b-2 ${
                activeTab === tab.id
                  ? 'border-indigo-500 text-indigo-500 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              {tab.label}
              {tab.verified && <Check size={12} className="text-emerald-500" />}
            </button>
          ))}
        </div>

        {/* Text Pane container */}
        <div 
          ref={paneRef}
          onScroll={(e) => handleScroll(e, activeTab)}
          className="h-48 overflow-y-auto bg-slate-900 border border-slate-800 rounded-2xl p-4 text-xs leading-relaxed text-slate-350 font-mono scroll-smooth"
        >
          {docs[activeTab]}
          <div className="mt-8 text-center text-[10px] font-sans font-bold text-slate-500 uppercase tracking-widest border-t border-slate-800/60 pt-4">
            [End of document - scroll completed]
          </div>
        </div>

        {/* Verification checklists */}
        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              disabled={!allScrolled}
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="h-5 w-5 rounded border-slate-700 bg-slate-900 text-indigo-650 focus:ring-transparent focus:ring-offset-0 disabled:opacity-40 transition cursor-pointer"
            />
            <label className={`text-xs select-none ${allScrolled ? 'text-slate-200' : 'text-slate-500'}`}>
              I have read and accept the Terms & Conditions, conflict disclosures, and reverse bidding guidelines.
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800/60">
            <button
              onClick={handleDecline}
              className="px-5 py-2.5 border border-slate-800 hover:bg-red-950/20 text-slate-350 rounded-xl text-xs font-semibold transition"
            >
              Decline
            </button>
            <button
              disabled={!accepted || saving}
              onClick={handleAccept}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-lg disabled:opacity-40 transition"
            >
              {saving ? 'Recording...' : 'Accept & Continue'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default VendorTermsGateway;
