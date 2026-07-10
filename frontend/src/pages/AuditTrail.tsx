import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { History, Search, Filter, ShieldCheck } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

const AuditTrail: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAction, setSelectedAction] = useState('');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (searchQuery) params.search = searchQuery;
      if (selectedAction) params.action = selectedAction;

      const res = await axios.get(`${API_URL}/audit-logs`, { params });
      setLogs(res.data.data);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [searchQuery, selectedAction]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white flex items-center gap-2 font-sans">
          <History size={20} className="text-indigo-650" />
          System Audit Trail
        </h1>
        <p className="text-xs text-neutral-500 mt-1">
          Immutable history of all business changes, admin operations, and bid events.
        </p>
      </div>

      {/* Filter panel */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 border-b pb-4 text-xs font-semibold">
        <div className="flex items-center gap-2 w-full md:max-w-xs">
          <span className="text-neutral-400">
            <Search size={14} />
          </span>
          <input
            type="text"
            placeholder="Search by action or entity..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full border border-neutral-200 dark:border-slate-800 rounded-lg p-2 bg-white dark:bg-slate-950 text-xs focus:outline-none"
          />
        </div>

        <div>
          <select
            value={selectedAction}
            onChange={(e) => setSelectedAction(e.target.value)}
            className="border border-neutral-200 dark:border-slate-800 rounded-lg p-2 bg-white dark:bg-slate-950 text-xs focus:outline-none"
          >
            <option value="">All action filters...</option>
            <option value="AUCTION_CREATED">Created</option>
            <option value="AUCTION_UPDATED">Updated</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="PUBLISHED">Published</option>
            <option value="BID_SUBMITTED">Bid Placed</option>
            <option value="VENDOR_BLOCKED">Vendor Blocked</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Logs stack list */}
      {loading ? (
        <div className="text-center text-xs text-neutral-400 py-12">Loading audit trail logs...</div>
      ) : logs.length === 0 ? (
        <div className="text-center py-12 text-neutral-400 text-xs italic">No matching logs found.</div>
      ) : (
        <div className="space-y-3">
          {logs.map((log) => (
            <div 
              key={log.id} 
              className="bg-white dark:bg-slate-900 border border-neutral-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm text-xs space-y-2 flex justify-between items-start"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-indigo-650 dark:text-indigo-400 uppercase tracking-wide">
                    {log.action}
                  </span>
                  <span className="text-[10px] text-neutral-400">({log.entity})</span>
                </div>
                <p className="text-neutral-500">Affected ID: <span className="font-mono text-neutral-700 dark:text-neutral-350">{log.entityId}</span></p>
                
                {log.payload && (
                  <pre className="mt-1 bg-slate-50 dark:bg-slate-950 p-2 rounded text-[10px] text-neutral-500 overflow-x-auto max-w-xl">
                    {JSON.stringify(log.payload, null, 2)}
                  </pre>
                )}
              </div>

              <div className="text-right space-y-1">
                <span className="text-[10px] text-neutral-400 block">
                  {new Date(log.createdAt).toLocaleString()}
                </span>
                <span className="inline-flex px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] text-neutral-500">
                  IP: {log.ipAddress || '127.0.0.1'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AuditTrail;
