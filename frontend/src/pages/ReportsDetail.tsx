import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, Printer, Users, BarChart3,
  History
} from 'lucide-react';
import { formatDateTime, currencySymbol } from '../utils/format';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

const ReportsDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'funnel' | 'rankings' | 'bids' | 'audit'>('rankings');

  useEffect(() => {
    const fetchReport = async () => {
      try {
        const res = await axios.get(`${API_URL}/reports/auctions/${id}`);
        setReport(res.data.data);
      } catch {
        // Handled by the error state below.
      } finally {
        setLoading(false);
      }
    };
    fetchReport();
  }, [id]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return <div className="p-6 text-center text-xs text-neutral-400">Compiling report analytics...</div>;
  }

  if (!report) {
    return <div className="p-6 text-center text-red-500 text-xs">Report could not be compiled.</div>;
  }

  const { summary, participationFunnel, rankings, bidHistory, auditTrail } = report;
  const currency = currencySymbol(summary?.baseCurrency);

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto print:p-0 print:bg-white print:text-black">
      {/* Header (hidden in print, prints special title block instead) */}
      <div className="flex justify-between items-center print:hidden bg-white dark:bg-slate-900 border border-neutral-200 dark:border-slate-800 p-6 rounded-2xl shadow-sm">
        <div className="space-y-1">
          <button 
            onClick={() => navigate('/reports')}
            className="flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-700 dark:hover:text-white mb-1"
          >
            <ArrowLeft size={12} /> Back to reports
          </button>
          <h2 className="text-lg font-bold text-neutral-900 dark:text-white">
            {summary.title} - Analytical Summary
          </h2>
        </div>

        <button
          onClick={handlePrint}
          className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold py-2 px-3.5 rounded-xl shadow transition"
        >
          <Printer size={13} />
          Print / PDF Export
        </button>
      </div>

      {/* PRINT HEADINGS ONLY */}
      <div className="hidden print:block border-b-2 border-black pb-4 mb-6">
        <h1 className="text-xl font-bold uppercase">BLACK BOX LIMITED PROCUREMENT</h1>
        <h2 className="text-md font-bold mt-1">E-AUCTION REPORT: {summary.title}</h2>
        <p className="text-[10px] text-neutral-500 mt-0.5">
          Generated on: {formatDateTime(new Date())} | Auction ID: {summary.id}
        </p>
      </div>

      {/* Funnel summary widget (Always visible) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Invited Suppliers', value: participationFunnel.invited },
          { label: 'Logged In', value: participationFunnel.loggedIn },
          { label: 'Accepted Terms', value: participationFunnel.termsAccepted },
          { label: 'Bids Submitted', value: participationFunnel.bidsSubmitted },
        ].map((f, idx) => (
          <div key={idx} className="bg-white dark:bg-slate-900 border border-neutral-200 dark:border-slate-800 p-4 rounded-xl text-center">
            <span className="block text-[9px] text-neutral-400 font-bold uppercase tracking-wider">{f.label}</span>
            <span className="text-lg font-bold text-neutral-800 dark:text-white font-mono mt-1 block">{f.value}</span>
          </div>
        ))}
      </div>

      {/* Sheet Tabs navigation */}
      <div className="flex border-b border-neutral-200 dark:border-slate-800 gap-4 text-xs font-semibold print:hidden">
        {[
          { id: 'rankings', label: 'Comparative Statements', icon: BarChart3 },
          { id: 'bids', label: 'Historical Bid logs', icon: Users },
          { id: 'audit', label: 'Action Audit trails', icon: History },
        ].map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`pb-2 px-1 flex items-center gap-1.5 transition border-b-2 ${
                activeTab === tab.id
                  ? 'border-b-2 border-indigo-600 text-indigo-600 font-bold'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-white'
              }`}
            >
              <Icon size={13} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Sheets Content panes */}
      <div className="bg-white dark:bg-slate-900 border border-neutral-200 dark:border-slate-800 p-6 rounded-2xl shadow-sm text-xs print:border-none print:p-0">
        
        {/* RANKINGS comparative sheet */}
        {activeTab === 'rankings' && (
          <div className="space-y-4">
            <h3 className="font-bold text-neutral-900 dark:text-white text-sm print:text-xs">Final Comparative Rankings</h3>
            <div className="border border-neutral-100 dark:border-slate-800 rounded-xl overflow-hidden print:border-black">
              <table className="w-full text-left border-collapse text-[11px]">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/60 font-bold border-b border-neutral-200 dark:border-slate-800 text-neutral-400 print:bg-neutral-100 print:text-black">
                    <th className="p-3">Rank</th>
                    <th className="p-3">Vendor Name</th>
                    <th className="p-3">Initial Bid</th>
                    <th className="p-3">Initial Effective</th>
                    <th className="p-3">Final Bid</th>
                    <th className="p-3">Final Effective</th>
                    <th className="p-3 text-right">Improvement %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-slate-800">
                  {rankings.map((r: any) => (
                    <tr key={r.email} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="p-3 font-bold">{r.rank || '--'}</td>
                      <td className="p-3 font-semibold">{r.vendorName}</td>
                      <td className="p-3 font-mono">{r.initialBid != null ? `${currency}${Number(r.initialBid).toLocaleString()}` : '--'}</td>
                      <td className="p-3 font-mono">{r.initialEffective != null ? `${currency}${Number(r.initialEffective).toLocaleString()}` : '--'}</td>
                      <td className="p-3 font-mono font-bold">{r.finalBid != null ? `${currency}${Number(r.finalBid).toLocaleString()}` : '--'}</td>
                      <td className="p-3 font-mono font-bold text-indigo-600 print:text-black">
                        {r.finalEffective != null ? `${currency}${Number(r.finalEffective).toLocaleString()}` : '--'}
                      </td>
                      <td className="p-3 text-right font-bold text-emerald-600 font-mono">
                        {r.improvementPercent}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* BIDS historical sheet */}
        {activeTab === 'bids' && (
          <div className="space-y-4 print:block">
            <h3 className="font-bold text-neutral-900 dark:text-white text-sm">Chronological Bid Logs</h3>
            <div className="border border-neutral-100 dark:border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-left border-collapse text-[11px]">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/60 font-bold border-b border-neutral-200 dark:border-slate-800 text-neutral-400">
                    <th className="p-3">Seq #</th>
                    <th className="p-3">Vendor Name</th>
                    <th className="p-3">Bid Amount</th>
                    <th className="p-3">Effective Total</th>
                    <th className="p-3">Timestamp</th>
                    <th className="p-3 text-right">Surrogate Bid</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-slate-800">
                  {bidHistory.map((b: any) => (
                    <tr key={b.sequenceNumber} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="p-3 font-mono font-bold">#{b.sequenceNumber}</td>
                      <td className="p-3 font-semibold">{b.vendorName}</td>
                      <td className="p-3 font-mono">{currency}{Number(b.amount).toLocaleString()}</td>
                      <td className="p-3 font-mono font-bold">{currency}{Number(b.effectiveTotal).toLocaleString()}</td>
                      <td className="p-3 text-neutral-500">{formatDateTime(b.timestamp)}</td>
                      <td className="p-3 text-right font-bold text-neutral-600">
                        {b.submittedAsSurrogate ? 'Yes' : 'No'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* AUDIT trail logs */}
        {activeTab === 'audit' && (
          <div className="space-y-4 print:hidden">
            <h3 className="font-bold text-neutral-900 dark:text-white text-sm">Audit Trails</h3>
            <div className="space-y-2.5 max-h-[30rem] overflow-y-auto pr-2">
              {auditTrail.map((log: any) => (
                <div key={log.id} className="p-3 border dark:border-slate-800 rounded-xl bg-slate-50/20 text-[11px] leading-relaxed">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-indigo-600 dark:text-indigo-400 uppercase">{log.action}</span>
                    <span className="text-[10px] text-neutral-400">{formatDateTime(log.createdAt)}</span>
                  </div>
                  <p className="text-neutral-600 dark:text-neutral-400 mt-1">
                    Affected entity: <span className="font-semibold">{log.entity}</span>
                  </p>
                  {log.payload && (
                    <pre className="mt-1.5 bg-slate-50 dark:bg-slate-950 p-2 rounded text-[10px] text-neutral-500 overflow-x-auto">
                      {JSON.stringify(log.payload, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default ReportsDetail;
