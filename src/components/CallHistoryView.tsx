import React, { useState } from 'react';
import { CallRecord, CallStatus } from '../types.js';
import { StatusBadge } from './StatusBadge.js';
import {
  Search,
  Filter,
  Phone,
  Clock,
  Calendar,
  Eye,
  RefreshCw,
  Trash2,
  AlertCircle,
  FileText,
  Sparkles,
  PhoneForwarded
} from 'lucide-react';

interface CallHistoryViewProps {
  calls: CallRecord[];
  loading: boolean;
  onSelectCall: (call: CallRecord) => void;
  onSyncCall: (id: string) => Promise<void>;
  onRetryCall: (id: string) => Promise<void>;
  onDeleteCall: (id: string) => Promise<void>;
  onNewCallClick: () => void;
  syncingId: string | null;
}

export const CallHistoryView: React.FC<CallHistoryViewProps> = ({
  calls,
  loading,
  onSelectCall,
  onSyncCall,
  onRetryCall,
  onDeleteCall,
  onNewCallClick,
  syncingId
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filteredCalls = calls.filter(call => {
    if (statusFilter !== 'all' && call.status !== statusFilter) {
      return false;
    }
    if (searchTerm.trim() !== '') {
      const q = searchTerm.toLowerCase();
      const matchPhone = call.phoneNumber.toLowerCase().includes(q);
      const matchObj = call.objective.toLowerCase().includes(q);
      const matchSummary = (call.summary || '').toLowerCase().includes(q);
      const matchResult = (call.structuredResult?.result || '').toLowerCase().includes(q);
      return matchPhone || matchObj || matchSummary || matchResult;
    }
    return true;
  });

  const formatDuration = (sec?: number | null) => {
    if (!sec && sec !== 0) return '—';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s}s`;
  };

  return (
    <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <FileText className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            Call History & Transcripts
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Manage your past and active outbound calls, inspect structured outcomes, and retry failed tasks.
          </p>
        </div>

        <button
          id="history-new-call-btn"
          onClick={onNewCallClick}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition-colors"
        >
          <PhoneForwarded className="w-3.5 h-3.5" />
          <span>New Call</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm mb-6 flex flex-col md:flex-row items-center gap-3">
        {/* Search Input */}
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
          <input
            id="call-search-input"
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search by phone number, objective, keywords, or answers..."
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
          {[
            { id: 'all', label: 'All Status' },
            { id: 'active', label: 'Active' },
            { id: 'completed', label: 'Completed' },
            { id: 'failed', label: 'Failed' },
          ].map(f => (
            <button
              key={f.id}
              id={`filter-${f.id}`}
              onClick={() => setStatusFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                statusFilter === f.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Call List */}
      {loading ? (
        <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
          <RefreshCw className="w-8 h-8 mx-auto text-indigo-600 animate-spin mb-3" />
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Loading call history...</p>
        </div>
      ) : filteredCalls.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800">
          <Phone className="w-10 h-10 mx-auto text-slate-400 mb-3 opacity-60" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">No calls found</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
            {searchTerm || statusFilter !== 'all'
              ? 'No records match your filter criteria. Try adjusting your search query.'
              : 'You have not initiated any phone calls yet. Start your first call to see the results here!'}
          </p>
          <button
            onClick={onNewCallClick}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition-colors"
          >
            <PhoneForwarded className="w-3.5 h-3.5" />
            <span>Launch First Call</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredCalls.map(call => {
            const isSyncing = syncingId === call.id;
            return (
              <div
                key={call.id}
                id={`call-card-${call.id}`}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 sm:p-5 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4 group"
              >
                {/* Left info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap mb-1.5">
                    <span className="font-mono text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      {call.phoneNumber}
                    </span>
                    <StatusBadge status={call.status} size="sm" />
                    {call.duration !== null && (
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDuration(call.duration)}
                      </span>
                    )}
                    <span className="text-[11px] text-slate-400 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(call.createdAt).toLocaleDateString()} at {new Date(call.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <p className="text-xs text-slate-700 dark:text-slate-300 font-medium line-clamp-2 leading-relaxed">
                    {call.objective}
                  </p>

                  {/* Outcome Pill if present */}
                  {call.structuredResult?.result && (
                    <div className="mt-2 flex items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[11px] font-medium">
                        <Sparkles className="w-3 h-3 text-emerald-500" />
                        Result: {call.structuredResult.result}
                      </span>
                      {call.structuredResult.earliest_slot && (
                        <span className="text-[11px] text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                          Slot: {call.structuredResult.earliest_slot}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Failure snippet if error */}
                  {call.error && (
                    <p className="mt-1.5 text-[11px] text-rose-600 dark:text-rose-400 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{call.error}</span>
                    </p>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 w-full md:w-auto justify-end border-t md:border-t-0 pt-2 md:pt-0 border-slate-100 dark:border-slate-800">
                  <button
                    id={`view-call-${call.id}`}
                    onClick={() => onSelectCall(call)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 rounded-xl transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Inspect</span>
                  </button>

                  <button
                    id={`sync-call-${call.id}`}
                    onClick={() => onSyncCall(call.id)}
                    disabled={isSyncing}
                    title="Sync latest status from CALL-E"
                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-indigo-600' : ''}`} />
                  </button>

                  {(call.status === 'failed' || call.status === 'canceled') && (
                    <button
                      id={`retry-call-${call.id}`}
                      onClick={() => onRetryCall(call.id)}
                      title="Retry Real Call"
                      className="p-1.5 text-amber-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/50 rounded-lg transition-colors"
                    >
                      <PhoneForwarded className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <button
                    id={`delete-call-${call.id}`}
                    onClick={() => onDeleteCall(call.id)}
                    title="Delete Call Record"
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
