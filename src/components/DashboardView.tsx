import React, { useState } from 'react';
import {
  CallRecord,
  DashboardStats,
  SystemConfigStatus
} from '../types.js';
import { StatusBadge } from './StatusBadge.js';
import {
  PhoneCall,
  CheckCircle2,
  AlertCircle,
  Activity,
  TrendingUp,
  ArrowUpRight,
  Plus,
  RefreshCw,
  Clock,
  Phone,
  Eye,
  Search,
  Sliders,
  Sparkles,
  Zap,
  ExternalLink
} from 'lucide-react';

interface DashboardViewProps {
  stats: DashboardStats;
  recentCalls: CallRecord[];
  configStatus: SystemConfigStatus | null;
  onNewCallClick: () => void;
  onSelectCall: (call: CallRecord) => void;
  onSyncCall: (id: string) => Promise<void>;
  onRefreshAll: () => Promise<void>;
  onOpenConfig: () => void;
  refreshing: boolean;
  syncingId: string | null;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  stats,
  recentCalls,
  configStatus,
  onNewCallClick,
  onSelectCall,
  onSyncCall,
  onRefreshAll,
  onOpenConfig,
  refreshing,
  syncingId
}) => {
  const [filterSearch, setFilterSearch] = useState('');

  const activeCalls = recentCalls.filter(
    c => c.status === 'active' || c.status === 'initiating' || c.status === 'queued'
  );

  const filteredRecent = recentCalls.filter(c => {
    if (!filterSearch.trim()) return true;
    const q = filterSearch.toLowerCase();
    return (
      c.phoneNumber.toLowerCase().includes(q) ||
      c.objective.toLowerCase().includes(q) ||
      (c.structuredResult?.result && String(c.structuredResult.result).toLowerCase().includes(q))
    );
  });

  const formatDuration = (sec?: number | null) => {
    if (!sec && sec !== 0) return '—';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s}s`;
  };

  return (
    <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8 space-y-6">
      
      {/* Banner if CALL-E API key is missing */}
      {configStatus && !configStatus.calleConfigured && (
        <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30 p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                CALL-E Real Telephony Key Needed
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                To dispatch natural voice phone calls to real phone numbers, add your CALL_E_API_KEY in settings or .env.
              </p>
            </div>
          </div>
          <button
            onClick={onOpenConfig}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white transition-colors"
          >
            Configure Key
          </button>
        </div>
      )}

      {/* Hero Welcome & Quick Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Telemetry & Voice Operations
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Real-time monitoring for goal-driven phone calls powered by CALL-E.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="refresh-dashboard-btn"
            onClick={onRefreshAll}
            disabled={refreshing}
            className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 transition-colors disabled:opacity-50"
            title="Refresh statistics and active calls"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-indigo-600' : ''}`} />
          </button>

          <button
            id="dashboard-new-call-btn"
            onClick={onNewCallClick}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>New Phone Call</span>
          </button>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        
        {/* Total Calls */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total Calls</span>
            <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300">
              <PhoneCall className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white mt-2">
            {stats.total}
          </p>
          <span className="text-[11px] text-slate-400">Lifetime dispatches</span>
        </div>

        {/* Active Calls */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm relative overflow-hidden">
          {stats.active > 0 && (
            <div className="absolute top-0 right-0 w-16 h-16 bg-indigo-500/10 rounded-full blur-xl pointer-events-none" />
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Active Calling</span>
            <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Activity className={`w-3.5 h-3.5 ${stats.active > 0 ? 'animate-pulse' : ''}`} />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight text-indigo-600 dark:text-indigo-400 mt-2">
            {stats.active}
          </p>
          <span className="text-[11px] text-indigo-500/80 dark:text-indigo-400/80 font-medium">
            {stats.active > 0 ? 'Live in network' : 'Idle'}
          </span>
        </div>

        {/* Successful Calls */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Successful</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 mt-2">
            {stats.successful}
          </p>
          <span className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 font-medium">
            Completed tasks
          </span>
        </div>

        {/* Failed Calls */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Failed / Canceled</span>
            <div className="w-7 h-7 rounded-lg bg-rose-50 dark:bg-rose-950/60 flex items-center justify-center text-rose-600 dark:text-rose-400">
              <AlertCircle className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400 mt-2">
            {stats.failed}
          </p>
          <span className="text-[11px] text-slate-400">Unanswered or aborted</span>
        </div>

        {/* Success Rate */}
        <div className="col-span-2 lg:col-span-1 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Success Rate</span>
            <div className="w-7 h-7 rounded-lg bg-sky-50 dark:bg-sky-950/60 flex items-center justify-center text-sky-600 dark:text-sky-400">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white mt-2">
            {stats.successRate}%
          </p>
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full mt-1.5 overflow-hidden">
            <div
              className="bg-indigo-600 h-full rounded-full transition-all duration-500"
              style={{ width: `${stats.successRate}%` }}
            />
          </div>
        </div>
      </div>

      {/* Active Calls Live Tracker Banner */}
      {activeCalls.length > 0 && (
        <div className="bg-indigo-950 text-indigo-100 p-4 sm:p-5 rounded-2xl border border-indigo-800/80 shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              <h3 className="text-sm font-bold text-white tracking-tight">
                Live Active Calls ({activeCalls.length})
              </h3>
            </div>
            <span className="text-[11px] text-indigo-300 font-mono">
              CALL-E Polling Engine Active
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {activeCalls.map(c => (
              <div
                key={c.id}
                onClick={() => onSelectCall(c)}
                className="bg-indigo-900/60 hover:bg-indigo-900 p-3 rounded-xl border border-indigo-700/60 cursor-pointer transition-all flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-white">
                      {c.phoneNumber}
                    </span>
                    <StatusBadge status={c.status} size="sm" />
                  </div>
                  <p className="text-xs text-indigo-200 truncate mt-0.5">
                    {c.objective}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSyncCall(c.id);
                  }}
                  className="p-1.5 text-indigo-300 hover:text-white rounded-lg hover:bg-indigo-800"
                  title="Force Sync"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncingId === c.id ? 'animate-spin' : ''}`} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Call History Section */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Recent Call Activity
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Latest tasks dispatched and structured conclusions extracted.
            </p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={filterSearch}
              onChange={e => setFilterSearch(e.target.value)}
              placeholder="Filter recent calls..."
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {filteredRecent.length === 0 ? (
          <div className="py-12 text-center">
            <Phone className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700 mb-2" />
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
              {recentCalls.length === 0 ? 'No calls initiated yet.' : 'No calls matched filter.'}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Launch a new phone call using the "New Phone Call" button above.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {filteredRecent.slice(0, 8).map(call => (
              <div
                key={call.id}
                onClick={() => onSelectCall(call)}
                className="py-3 sm:py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 px-2 rounded-xl cursor-pointer transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-mono text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Phone className="w-3 h-3 text-indigo-500" />
                      {call.phoneNumber}
                    </span>
                    <StatusBadge status={call.status} size="sm" />
                    <span className="text-[11px] text-slate-400">
                      {new Date(call.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {call.duration !== null && (
                      <span className="text-[11px] text-slate-400">
                        • {formatDuration(call.duration)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 truncate">
                    {call.objective}
                  </p>
                  {call.structuredResult?.result && (
                    <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium truncate mt-0.5 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 flex-shrink-0" />
                      Outcome: {call.structuredResult.result}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSyncCall(call.id);
                    }}
                    title="Sync with CALL-E"
                    className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${syncingId === call.id ? 'animate-spin text-indigo-600' : ''}`} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectCall(call);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/70 rounded-lg hover:bg-indigo-100"
                  >
                    <Eye className="w-3 h-3" />
                    <span>View</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
