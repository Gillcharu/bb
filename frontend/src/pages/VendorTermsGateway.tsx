import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { FileText, Check, ShieldAlert } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

type DocTab = 'TERMS' | 'DISCLOSURE' | 'RULES';

const TAB_LABELS: Record<DocTab, string> = {
  TERMS: 'T&C Agreements',
  DISCLOSURE: 'Conflict Disclosures',
  RULES: 'Bidding Rules',
};

const VendorTermsGateway: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [docs, setDocs] = useState<Record<DocTab, string>>({
    TERMS: '',
    DISCLOSURE: '',
    RULES: '',
  });
  const [docsLoading, setDocsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Scroll-through verification per tab
  const [scrolled, setScrolled] = useState<Record<DocTab, boolean>>({
    TERMS: false,
    DISCLOSURE: false,
    RULES: false,
  });

  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<DocTab>('TERMS');

  const paneRef = useRef<HTMLDivElement>(null);

  const routeAfterAcceptance = useCallback(async () => {
    const res = await axios.get(`${API_URL}/auctions/${id}/live-state`);
    const data = res.data.data;
    if (['LIVE', 'OVERTIME', 'COMPLETED', 'CANCELLED'].includes(data.state)) {
      navigate(`/vendor/auctions/${id}/live`, { replace: true });
    } else {
      navigate(`/vendor/auctions/${id}/lobby`, { replace: true });
    }
  }, [id, navigate]);

  // Skip the gateway entirely if this vendor already accepted.
  useEffect(() => {
    const checkComplianceStatus = async () => {
      try {
        const res = await axios.get(`${API_URL}/auctions/${id}/live-state`);
        const data = res.data.data;
        if (data.you?.acceptedTerms) {
          if (['LIVE', 'OVERTIME', 'COMPLETED', 'CANCELLED'].includes(data.state)) {
            navigate(`/vendor/auctions/${id}/live`, { replace: true });
          } else {
            navigate(`/vendor/auctions/${id}/lobby`, { replace: true });
          }
        }
      } catch {
        // Not fatal: the vendor can still read and accept below.
      }
    };
    checkComplianceStatus();
  }, [id, navigate]);

  // Load the real compliance documents from the server.
  useEffect(() => {
    const fetchDocs = async () => {
      setDocsLoading(true);
      try {
        const res = await axios.get(`${API_URL}/auctions/${id}/terms`);
        const byType: Record<DocTab, string> = { TERMS: '', DISCLOSURE: '', RULES: '' };
        for (const doc of res.data.data || []) {
          if (doc.type in byType) {
            byType[doc.type as DocTab] = doc.content;
          }
        }
        setDocs(byType);
      } catch (err: any) {
        setError(err.response?.data?.error?.message || 'Unable to load the compliance documents.');
      } finally {
        setDocsLoading(false);
      }
    };
    fetchDocs();
  }, [id]);

  const markScrolled = useCallback((tab: DocTab) => {
    setScrolled(prev => (prev[tab] ? prev : { ...prev, [tab]: true }));
  }, []);

  // If a document fits without scrolling, it counts as read.
  useEffect(() => {
    const element = paneRef.current;
    if (!element || docsLoading) return;
    if (element.scrollHeight <= element.clientHeight + 4) {
      markScrolled(activeTab);
    }
  }, [activeTab, docsLoading, docs, markScrolled]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const isAtBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 40;
    if (isAtBottom) {
      markScrolled(activeTab);
    }
  };

  const handleAccept = async () => {
    if (!accepted) return;
    setSaving(true);
    setError(null);
    try {
      await axios.post(`${API_URL}/auctions/${id}/terms/accept`, {});
      await routeAfterAcceptance();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to record your acceptance. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDecline = () => {
    navigate('/vendor/login', { replace: true });
  };

  const allScrolled = scrolled.TERMS && scrolled.DISCLOSURE && scrolled.RULES;

  return (
    <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6 font-sans">
      <div className="max-w-2xl w-full bg-slate-950 border border-slate-800 rounded-3xl p-6 md:p-8 space-y-6 shadow-2xl">

        {/* Banner */}
        <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
          <div className="p-2.5 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-600/20">
            <FileText size={20} aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-bold tracking-tight">Compliance Gateway</h2>
            <p className="text-[10px] text-slate-400 font-semibold mt-0.5">ACCEPTANCE OF LEGAL COVENANTS & RULES</p>
          </div>
        </div>

        {/* Info Box */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl text-xs text-slate-300 leading-relaxed flex items-start gap-2.5">
          <ShieldAlert className="text-indigo-500 shrink-0" size={18} aria-hidden="true" />
          <p>
            Please scroll to the bottom of all three legal documents to verify you have read the details.
            All acceptances are recorded with timestamps, user context, and connection IP references.
          </p>
        </div>

        {error && (
          <div className="bg-red-950/30 border border-red-900/50 text-red-400 p-3 rounded-xl text-xs" role="alert">
            {error}
          </div>
        )}

        {/* Doc Tabs Selector */}
        <div className="flex border-b border-slate-800 text-xs font-semibold" role="tablist">
          {(Object.keys(TAB_LABELS) as DocTab[]).map(tab => (
            <button
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-2.5 px-4 flex items-center gap-1.5 transition border-b-2 cursor-pointer ${
                activeTab === tab
                  ? 'border-indigo-500 text-indigo-500 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              {TAB_LABELS[tab]}
              {scrolled[tab] && <Check size={12} className="text-emerald-500" aria-label="Read" />}
            </button>
          ))}
        </div>

        {/* Text Pane container */}
        <div
          ref={paneRef}
          onScroll={handleScroll}
          tabIndex={0}
          role="tabpanel"
          aria-label={TAB_LABELS[activeTab]}
          className="h-48 overflow-y-auto bg-slate-900 border border-slate-800 rounded-2xl p-4 text-xs leading-relaxed text-slate-300 font-mono scroll-smooth focus:outline-none focus:ring-1 focus:ring-indigo-500 whitespace-pre-wrap"
        >
          {docsLoading ? (
            <span className="text-slate-500 italic">Loading document…</span>
          ) : docs[activeTab] ? (
            docs[activeTab]
          ) : (
            <span className="text-slate-500 italic">
              This document has not been published yet. Contact your auction administrator before accepting.
            </span>
          )}
          {!docsLoading && (
            <div className="mt-8 text-center text-[10px] font-sans font-bold text-slate-500 uppercase tracking-widest border-t border-slate-800/60 pt-4">
              [End of document]
            </div>
          )}
        </div>

        {/* Verification checklists */}
        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-3">
            <input
              id="accept-terms"
              type="checkbox"
              disabled={!allScrolled || docsLoading}
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="h-5 w-5 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0 disabled:opacity-40 transition cursor-pointer"
            />
            <label htmlFor="accept-terms" className={`text-xs select-none cursor-pointer ${allScrolled ? 'text-slate-200' : 'text-slate-500'}`}>
              I have read and accept the Terms & Conditions, conflict disclosures, and bidding rules.
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800/60">
            <button
              onClick={handleDecline}
              className="px-5 py-2.5 border border-slate-800 hover:bg-red-950/20 text-slate-300 rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              Decline & Exit
            </button>
            <button
              disabled={!accepted || saving}
              onClick={handleAccept}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-lg disabled:opacity-40 transition cursor-pointer"
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
