import React, { useState } from 'react';
import { SystemConfigStatus } from '../types.js';
import { testCalleConnection } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.js';
import { useToast } from './Toast.js';
import {
  X,
  Radio,
  Database,
  ShieldCheck,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Key
} from 'lucide-react';

interface ConfigModalProps {
  status: SystemConfigStatus | null;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}

export const ConfigModal: React.FC<ConfigModalProps> = ({
  status,
  onClose
}) => {
  const { getToken } = useAuth();
  const { showToast } = useToast();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleTestCalle = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const token = await getToken();
      const res = await testCalleConnection(token);
      setTestResult(res);
      if (res.success) {
        showToast('success', 'CALL-E Connected', 'Successfully verified CALL-E API connection.');
      } else {
        showToast('warning', 'CALL-E Verification', res.message);
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message });
      showToast('error', 'CALL-E Connection Error', err.message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="relative w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Integration & Environment Status
              </h3>
              <p className="text-xs text-slate-500">
                Verify CALL-E voice engine, Neon PostgreSQL database, and JWT security.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Status List */}
        <div className="p-5 space-y-3.5">
          {/* CALL-E */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <Radio className={`w-5 h-5 mt-0.5 flex-shrink-0 ${status?.calleConfigured ? 'text-emerald-500' : 'text-amber-500'}`} />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    CALL-E Voice Telephony Engine (@call-e/calle)
                  </span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    status?.calleConfigured
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                  }`}>
                    {status?.calleConfigured ? 'Active & Ready' : 'Needs API Key'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Base URL: <code className="font-mono">{status?.calleBaseUrl || 'https://api.heycall-e.com'}</code>
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Configured via: <code className="bg-slate-200/80 dark:bg-slate-700 px-1 py-0.5 rounded font-mono">CALL_E_API_KEY</code>
                </p>
              </div>
            </div>

            <button
              onClick={handleTestCalle}
              disabled={testing}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {testing ? 'Testing...' : 'Test API'}
            </button>
          </div>

          {testResult && (
            <div className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
              testResult.success
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800'
                : 'bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800'
            }`}>
              {testResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-amber-600" />}
              <span>{testResult.message}</span>
            </div>
          )}

          {/* Neon PostgreSQL */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex items-start gap-3">
            <Database className={`w-5 h-5 mt-0.5 flex-shrink-0 ${status?.dbStatus === 'connected' ? 'text-emerald-500' : 'text-sky-500'}`} />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-900 dark:text-white">
                  Database & Storage (Neon PostgreSQL + Prisma)
                </span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  status?.dbStatus === 'connected'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300'
                }`}>
                  {status?.dbStatus === 'connected' ? 'Neon PostgreSQL Connected' : 'Local Fallback'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                All users, calls, transcripts, and analytics are persisted safely with Prisma ORM in Neon cloud PostgreSQL.
              </p>
            </div>
          </div>

          {/* JWT & Bcrypt Authentication */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 mt-0.5 flex-shrink-0 text-indigo-500" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-900 dark:text-white">
                  Self-Hosted JWT + Bcrypt Authentication
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  Active & Zero Firebase Dependency
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Passwords securely hashed with bcrypt (salt rounds: 10). Session tokens generated and verified via JSON Web Tokens (JWT).
              </p>
            </div>
          </div>
        </div>

        {/* Instructions strip */}
        <div className="bg-slate-50 dark:bg-slate-800/80 p-5 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 space-y-2">
          <p className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
            <Key className="w-3.5 h-3.5 text-indigo-500" />
            Environment Configuration:
          </p>
          <p>
            Required variables configured in <code className="bg-slate-200 dark:bg-slate-700 px-1 py-0.5 rounded font-mono">.env</code>:
          </p>
          <ul className="list-disc pl-5 space-y-0.5 font-mono text-[11px] text-slate-700 dark:text-slate-300">
            <li>DATABASE_URL="postgresql://neondb_owner:npg_..."</li>
            <li>JWT_SECRET="your-secure-jwt-secret-key"</li>
            <li>CALL_E_API_KEY="your_calle_api_key"</li>
            <li>GEMINI_API_KEY="your_gemini_api_key"</li>
          </ul>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-white rounded-xl transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
