import React, { useState } from 'react';
import { CallRecord } from '../types.js';
import { StatusBadge } from './StatusBadge.js';
import {
  X,
  Phone,
  Calendar,
  Clock,
  CheckCircle2,
  RefreshCw,
  Trash2,
  Copy,
  Check,
  AlertCircle,
  MessageSquare,
  Sparkles,
  DollarSign,
  Tag,
  Share2,
  ListOrdered
} from 'lucide-react';

interface CallDetailModalProps {
  call: CallRecord | null;
  onClose: () => void;
  onSync: (id: string) => Promise<void>;
  onRetry: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  syncing: boolean;
  retrying: boolean;
}

export const CallDetailModal: React.FC<CallDetailModalProps> = ({
  call,
  onClose,
  onSync,
  onRetry,
  onDelete,
  syncing,
  retrying
}) => {
  const [activeTab, setActiveTab] = useState<'structured' | 'transcript' | 'raw' | 'overview'>('structured');
  const [copied, setCopied] = useState(false);

  if (!call) return null;

  const copyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(call, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const turns = Array.isArray(call.transcript) ? call.transcript : [];
  const structured = call.structuredResult;

  const formatDuration = (sec?: number | null) => {
    if (!sec && sec !== 0) return '—';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s}s`;
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div
        id={`call-detail-modal-${call.id}`}
        className="relative w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-lg font-bold font-mono tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                <Phone className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                {call.phoneNumber}
              </span>
              <StatusBadge status={call.status} size="md" />
              {call.calleTaskId && (
                <span className="text-xs font-mono text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                  TASK: {call.calleTaskId.slice(0, 12)}...
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-3">
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {new Date(call.createdAt).toLocaleString()}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                Duration: {formatDuration(call.duration)}
              </span>
              {call.attemptsCount && call.attemptsCount > 1 && (
                <span className="bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 px-1.5 py-0.2 rounded text-[10px]">
                  Attempt #{call.attemptsCount}
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="call-sync-button"
              onClick={() => onSync(call.id)}
              disabled={syncing}
              title="Sync latest status from CALL-E"
              className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin text-indigo-600' : ''}`} />
            </button>
            <button
              id="call-modal-close-button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Objective & Goal strip */}
        <div className="bg-indigo-50/70 dark:bg-indigo-950/40 px-5 py-3 border-b border-indigo-100/80 dark:border-indigo-900/30">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <p className="text-xs font-semibold text-indigo-900 dark:text-indigo-200 uppercase tracking-wider">
              Objective
            </p>
            {call.callerName && (
              <span className="text-[11px] font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-100/80 dark:bg-indigo-900/50 px-2 py-0.5 rounded-md">
                Name: {call.callerName}
              </span>
            )}
          </div>
          <p className="text-sm text-indigo-950 dark:text-indigo-100 font-medium leading-relaxed">
            {call.objective}
          </p>
        </div>

        {/* Error alert if failed */}
        {call.error && (
          <div className="bg-rose-50 dark:bg-rose-950/40 px-5 py-2.5 border-b border-rose-100 dark:border-rose-900/40 flex items-center gap-2 text-rose-800 dark:text-rose-200 text-xs">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-500" />
            <span>Failure Diagnostic: {call.error}</span>
          </div>
        )}

        {/* Tabs Bar */}
        <div className="flex items-center gap-2 px-5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <button
            onClick={() => setActiveTab('structured')}
            className={`py-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'structured'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Structured Result
          </button>
          <button
            onClick={() => setActiveTab('transcript')}
            className={`py-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'transcript'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Transcript ({turns.length})
          </button>
          <button
            onClick={() => setActiveTab('raw')}
            className={`py-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'raw'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            Raw JSON
          </button>
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'overview'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <ListOrdered className="w-3.5 h-3.5" />
            Call Setup & Questions
          </button>
        </div>

        {/* Modal Body Content */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {/* TAB: STRUCTURED RESULT */}
          {activeTab === 'structured' && (
            <div className="space-y-4">
              {/* Summary Card */}
              {call.summary && (
                <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
                  <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    AI Conversation Summary
                  </h4>
                  <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                    {call.summary}
                  </p>
                </div>
              )}

              {/* Key Result Highlights Grid */}
              {structured ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/50 p-3.5 rounded-xl">
                    <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider block mb-1">
                      Main Conclusion
                    </span>
                    <p className="text-sm font-bold text-emerald-950 dark:text-emerald-100">
                      {structured.result || structured.outcome || 'Information Gathered'}
                    </p>
                  </div>

                  <div className="bg-sky-50 dark:bg-sky-950/30 border border-sky-200/80 dark:border-sky-800/50 p-3.5 rounded-xl">
                    <span className="text-[11px] font-semibold text-sky-700 dark:text-sky-300 uppercase tracking-wider block mb-1">
                      Earliest Availability
                    </span>
                    <p className="text-sm font-bold text-sky-950 dark:text-sky-100">
                      {structured.earliest_slot || structured.availability || 'Not specified'}
                    </p>
                  </div>

                  <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200/80 dark:border-purple-800/50 p-3.5 rounded-xl">
                    <span className="text-[11px] font-semibold text-purple-700 dark:text-purple-300 uppercase tracking-wider block mb-1">
                      Price / Quote
                    </span>
                    <p className="text-sm font-bold text-purple-950 dark:text-purple-100">
                      {structured.price || 'Not mentioned'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                  <Clock className="w-8 h-8 mx-auto text-slate-400 mb-2 animate-pulse" />
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {call.status === 'active' || call.status === 'initiating'
                      ? 'CALL-E is currently conducting the real phone call. Results will stream in once finalized.'
                      : 'No structured result recorded for this call.'}
                  </p>
                  <button
                    onClick={() => onSync(call.id)}
                    className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 dark:bg-indigo-950 dark:text-indigo-400 rounded-lg hover:bg-indigo-100"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Poll CALL-E Server Now
                  </button>
                </div>
              )}

              {/* Answers to User Questions */}
              {structured?.answers && Array.isArray(structured.answers) && structured.answers.length > 0 && (
                <div className="space-y-2.5">
                  <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                    Extracted Answers to Required Questions
                  </h4>
                  <div className="space-y-2">
                    {structured.answers.map((ans, idx) => (
                      <div
                        key={idx}
                        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-xl"
                      >
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                          Q{idx + 1}: {ans.question}
                        </p>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white mt-1">
                          {ans.answer || 'No direct answer provided by recipient'}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Additional Notes */}
              {structured?.notes && (
                <div className="bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-900/30 p-3.5 rounded-xl">
                  <span className="text-xs font-semibold text-amber-800 dark:text-amber-300 uppercase tracking-wider block mb-1">
                    Caller Observations & Notes
                  </span>
                  <p className="text-xs text-amber-950 dark:text-amber-100 leading-relaxed">
                    {structured.notes}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB: TRANSCRIPT */}
          {activeTab === 'transcript' && (
            <div className="space-y-3">
              {turns.length > 0 ? (
                turns.map((turn, i) => {
                  const isAgent = turn.speaker === 'agent';
                  return (
                    <div
                      key={i}
                      className={`flex flex-col ${isAgent ? 'items-start' : 'items-end'}`}
                    >
                      <div className="flex items-center gap-1.5 mb-1 px-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          {isAgent ? 'CALL-E AI Agent' : 'Recipient Phone'}
                        </span>
                      </div>
                      <div
                        className={`max-w-[85%] p-3.5 rounded-2xl text-sm leading-relaxed ${
                          isAgent
                            ? 'bg-indigo-600 text-white rounded-tl-sm'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-tr-sm'
                        }`}
                      >
                        {turn.text}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-10 bg-slate-50 dark:bg-slate-800/40 rounded-xl">
                  <MessageSquare className="w-8 h-8 mx-auto text-slate-400 mb-2" />
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {call.status === 'active' || call.status === 'initiating'
                      ? 'Live audio call in progress. Telephony transcript will be synchronized when completed.'
                      : 'No transcript recorded for this call.'}
                  </p>
                  <button
                    onClick={() => onSync(call.id)}
                    className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 dark:bg-indigo-950 rounded-lg hover:bg-indigo-100"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Check CALL-E Status
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB: RAW JSON */}
          {activeTab === 'raw' && (
            <div className="relative">
              <button
                onClick={copyJson}
                className="absolute top-3 right-3 px-2.5 py-1 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md flex items-center gap-1 shadow"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy JSON'}
              </button>
              <pre className="bg-slate-950 text-slate-200 text-xs p-4 rounded-xl overflow-x-auto font-mono max-h-96">
                {JSON.stringify(call, null, 2)}
              </pre>
            </div>
          )}

          {/* TAB: OVERVIEW & PROMPT */}
          {activeTab === 'overview' && (
            <div className="space-y-4 text-xs">
              <div>
                <span className="font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                  Questions Configured
                </span>
                <ul className="list-disc pl-5 space-y-1 text-slate-700 dark:text-slate-300">
                  {call.questions.map((q, idx) => (
                    <li key={idx}>{q}</li>
                  ))}
                </ul>
              </div>

              {call.notes && (
                <div>
                  <span className="font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                    Caller Context & Notes
                  </span>
                  <p className="text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg">
                    {call.notes}
                  </p>
                </div>
              )}

              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 gap-2 text-[11px] text-slate-500">
                <div>
                  <span className="font-bold text-slate-700 dark:text-slate-300">Record ID:</span> {call.id}
                </div>
                <div>
                  <span className="font-bold text-slate-700 dark:text-slate-300">CALL-E Task ID:</span> {call.calleTaskId || 'Pending'}
                </div>
                <div>
                  <span className="font-bold text-slate-700 dark:text-slate-300">Idempotency Key:</span> {call.idempotencyKey || '—'}
                </div>
                <div>
                  <span className="font-bold text-slate-700 dark:text-slate-300">User ID:</span> {call.userId || (call as any).firebaseUid}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 flex items-center justify-between gap-3">
          <button
            id="call-modal-delete-button"
            onClick={() => onDelete(call.id)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete Call</span>
          </button>

          <div className="flex items-center gap-2">
            {(call.status === 'failed' || call.status === 'canceled' || call.status === 'completed') && (
              <button
                id="call-modal-retry-button"
                onClick={() => onRetry(call.id)}
                disabled={retrying}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${retrying ? 'animate-spin' : ''}`} />
                <span>Retry Real Call</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
