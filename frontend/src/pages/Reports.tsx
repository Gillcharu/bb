import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { BarChart3, Clock, CheckCircle2, ArrowRight } from 'lucide-react';
import { getAuctionDisplayId } from '../utils/auctionHelper';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

const Reports: React.FC = () => {
  const navigate = useNavigate();
  const [auctions, setAuctions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCompleted = async () => {
      try {
        const res = await axios.get(`${API_URL}/auctions`);
        // Filter completed/cancelled auctions for reporting
        const completed = res.data.data.filter((a: any) => ['COMPLETED', 'CANCELLED', 'LIVE'].includes(a.state));
        setAuctions(completed);
      } catch (err) {
        console.error('Error fetching completed auctions:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchCompleted();
  }, []);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white flex items-center gap-2">
          <BarChart3 size={20} className="text-indigo-650" />
          Reporting Center
        </h1>
        <p className="text-xs text-neutral-500 mt-1">
          Access post-auction performance summaries and comparative statement worksheets.
        </p>
      </div>

      {loading ? (
        <div className="text-center text-xs text-neutral-400 py-12">Loading reports...</div>
      ) : auctions.length === 0 ? (
        <div className="text-center py-12 border border-dashed rounded-xl text-neutral-400 text-xs">
          No completed auctions found to compile reports.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {auctions.map((auc) => (
            <div 
              key={auc.id} 
              className="bg-white dark:bg-slate-900 border border-neutral-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm space-y-4 hover:shadow-md transition duration-200"
            >
              <div className="flex justify-between items-start">
                <span className="inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-neutral-100 text-neutral-600 border border-neutral-200">
                  {auc.state}
                </span>
                <span className="text-[10px] font-mono text-neutral-400">#{getAuctionDisplayId(auc.id, auc.title).id}</span>
              </div>

              <div>
                <h4 className="font-bold text-neutral-900 dark:text-white text-sm line-clamp-1">{auc.title}</h4>
                <p className="text-xs text-neutral-500 mt-1">
                  Ended on: {auc.endAt ? new Date(auc.endAt).toLocaleDateString() : 'N/A'}
                </p>
              </div>

              <div className="border-t pt-3 flex justify-between items-center text-xs font-semibold text-neutral-600 dark:text-slate-400">
                <span>{auc.participants?.length || 0} suppliers invited</span>
                <button
                  onClick={() => navigate(`/reports/${auc.id}`)}
                  className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:underline font-bold"
                >
                  View Report bundle
                  <ArrowRight size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Reports;
