import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { ThemeProvider } from './context/ThemeContext.js';
import { ToastProvider, useToast } from './components/Toast.js';
import { Navbar } from './components/Navbar.js';
import { DashboardView } from './components/DashboardView.js';
import { NewCallView } from './components/NewCallView.js';
import { CallHistoryView } from './components/CallHistoryView.js';
import { CallDetailModal } from './components/CallDetailModal.js';
import { ConfigModal } from './components/ConfigModal.js';
import { AuthModal } from './components/AuthModal.js';
import { ProtectedRoute } from './components/ProtectedRoute.js';
import {
  CallRecord,
  DashboardStats,
  SystemConfigStatus,
  CreateCallPayload
} from './types.js';
import {
  fetchStats,
  fetchCalls,
  fetchSystemConfig,
  createCall,
  syncCall,
  retryCall,
  deleteCall
} from './lib/api.js';

function MainApp() {
  const { user, loading: authLoading, getToken } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'dashboard' | 'new-call' | 'history'>('dashboard');
  const [stats, setStats] = useState<DashboardStats>({
    total: 0,
    successful: 0,
    failed: 0,
    active: 0,
    successRate: 0
  });
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [configStatus, setConfigStatus] = useState<SystemConfigStatus | null>(null);

  const [selectedCall, setSelectedCall] = useState<CallRecord | null>(null);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [loadingCalls, setLoadingCalls] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isSubmittingCall, setIsSubmittingCall] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  // Synchronous submission locks to prevent duplicate calls from double clicks or re-renders
  const isSubmittingCallRef = useRef(false);
  const isRetryingRef = useRef(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Load configuration status once
  const loadConfig = useCallback(async () => {
    try {
      const cfg = await fetchSystemConfig();
      setConfigStatus(cfg);
    } catch (err) {
      console.warn('[app] Failed to fetch config status:', err);
    }
  }, []);

  // Load stats and calls
  const loadData = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent) setLoadingCalls(true);

    try {
      const token = await getToken();
      const [statsData, callsData] = await Promise.all([
        fetchStats(token).catch(() => ({
          total: 0,
          successful: 0,
          failed: 0,
          active: 0,
          successRate: 0
        })),
        fetchCalls(token, { limit: 100 }).catch(() => ({ calls: [], total: 0 }))
      ]);

      setStats(statsData);
      setCalls(callsData.calls);

      // If selectedCall is open, update it with freshest instance via functional setter to avoid re-triggering loadData
      setSelectedCall(prev => {
        if (!prev) return null;
        const fresh = callsData.calls.find(c => c.id === prev.id);
        return fresh || prev;
      });
    } catch (err: any) {
      console.error('[app] Error loading data:', err);
    } finally {
      if (!silent) setLoadingCalls(false);
    }
  }, [user, getToken]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, loadData]);

  // Check if any call is currently queued or in_progress (initiating, active, queued)
  const hasActiveCalls = calls.some(
    c => c.status === 'active' || c.status === 'initiating' || c.status === 'queued'
  );
  const activeCall = calls.find(
    c => c.status === 'active' || c.status === 'initiating' || c.status === 'queued'
  );

  // Active call polling: check every 7 seconds (requirement 6: 5-10s interval) only when an active call exists
  useEffect(() => {
    if (hasActiveCalls) {
      pollingRef.current = setInterval(() => {
        loadData(true);
      }, 7000);
    } else if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [hasActiveCalls, loadData]);

  const handleRefreshAll = async () => {
    setRefreshing(true);
    await Promise.all([loadConfig(), loadData(true)]);
    setRefreshing(false);
    showToast('info', 'Refreshed', 'Telemetry and call records updated.');
  };

  const handleCreateCall = async (payload: CreateCallPayload) => {
    // 1. Synchronous Guard: prevent duplicate submissions from rapid clicks or concurrent events
    if (isSubmittingCallRef.current || isSubmittingCall) {
      console.warn('[app] Call submission already in flight; ignoring duplicate request.');
      return;
    }

    // 2. Active Call Guard (Requirement 7: Do not create a new call while previous call is still queued or in_progress)
    if (hasActiveCalls) {
      showToast(
        'warning',
        'Call Already In Progress',
        'CALL-E allows one active telephone call at a time. Please wait for the current call to complete before dispatching a new one.'
      );
      return;
    }

    isSubmittingCallRef.current = true;
    setIsSubmittingCall(true);
    try {
      const token = await getToken();
      const newRecord = await createCall(payload, token);
      showToast('success', 'Phone Call Dispatched', `Task ${newRecord.calleTaskId || newRecord.id} initiated with CALL-E.`);
      
      // Update local state immediately
      setCalls(prev => [newRecord, ...prev.filter(c => c.id !== newRecord.id)]);
      setStats(prev => ({
        ...prev,
        total: prev.total + 1,
        active: prev.active + 1
      }));

      // Open detail modal to show live call progress
      setSelectedCall(newRecord);
      setActiveTab('dashboard');
    } catch (err: any) {
      console.error('[app] Create call error:', err);
      if (err.isRateLimited) {
        showToast(
          'warning',
          'Rate Limit Exceeded',
          err.message || 'CALL-E rate limit reached. Please wait a few moments before trying again.'
        );
      } else if (err.isClarificationNeeded) {
        showToast('warning', 'Clarification Required', err.message);
      } else {
        showToast('error', 'Call Dispatch Failed', err.message);
      }
      throw err;
    } finally {
      isSubmittingCallRef.current = false;
      setIsSubmittingCall(false);
    }
  };

  const handleSyncCall = async (id: string) => {
    setSyncingId(id);
    try {
      const token = await getToken();
      const result = await syncCall(id, token);
      if (result.call) {
        setCalls(prev => prev.map(c => (c.id === id ? result.call : c)));
        if (selectedCall?.id === id) {
          setSelectedCall(result.call);
        }
        showToast('success', 'Synchronized', `Status: ${result.call.status}. Telemetry updated from CALL-E.`);
      }
    } catch (err: any) {
      console.error('[app] Sync call error:', err);
      showToast('error', 'Sync Failed', err.message);
    } finally {
      setSyncingId(null);
    }
  };

  const handleRetryCall = async (id: string) => {
    if (isRetryingRef.current || retryingId) {
      console.warn('[app] Call retry already in progress; ignoring duplicate request.');
      return;
    }

    if (hasActiveCalls) {
      showToast(
        'warning',
        'Call Already In Progress',
        'Another call is currently active or queued. Please wait for it to complete before retrying.'
      );
      return;
    }

    isRetryingRef.current = true;
    setRetryingId(id);
    try {
      const token = await getToken();
      const result = await retryCall(id, token);
      if (result.call) {
        setCalls(prev => prev.map(c => (c.id === id ? result.call : c)));
        if (selectedCall?.id === id) {
          setSelectedCall(result.call);
        }
        showToast('success', 'Call Retried', 'New call task dispatched to CALL-E.');
      }
    } catch (err: any) {
      console.error('[app] Retry call error:', err);
      if (err.isRateLimited) {
        showToast('warning', 'Rate Limit Exceeded', err.message);
      } else {
        showToast('error', 'Retry Failed', err.message);
      }
    } finally {
      isRetryingRef.current = false;
      setRetryingId(null);
    }
  };

  const handleDeleteCall = async (id: string) => {
    if (!window.confirm('Are you sure you want to permanently delete this call record and transcript?')) {
      return;
    }

    try {
      const token = await getToken();
      await deleteCall(id, token);
      setCalls(prev => prev.filter(c => c.id !== id));
      if (selectedCall?.id === id) {
        setSelectedCall(null);
      }
      showToast('info', 'Deleted', 'Call record deleted successfully.');
      loadData(true);
    } catch (err: any) {
      console.error('[app] Delete call error:', err);
      showToast('error', 'Delete Failed', err.message);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-semibold tracking-wider uppercase">Loading CallScout AI...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/60 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans selection:bg-indigo-500/20 selection:text-indigo-600">
      
      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        configStatus={configStatus}
        onOpenConfig={() => setConfigModalOpen(true)}
        onOpenAuth={() => setAuthModalOpen(true)}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
      />

      {/* Main View Container */}
      <main className="flex-1 pb-16 pt-4">
        {activeTab === 'dashboard' && (
          <DashboardView
            stats={stats}
            recentCalls={calls}
            configStatus={configStatus}
            onNewCallClick={() => setActiveTab('new-call')}
            onSelectCall={call => setSelectedCall(call)}
            onSyncCall={handleSyncCall}
            onRefreshAll={handleRefreshAll}
            onOpenConfig={() => setConfigModalOpen(true)}
            refreshing={refreshing}
            syncingId={syncingId}
          />
        )}

        {activeTab === 'new-call' && (
          <NewCallView
            onSubmit={handleCreateCall}
            isSubmitting={isSubmittingCall}
            hasActiveCall={hasActiveCalls}
            activeCall={activeCall}
            onViewActiveCall={() => {
              if (activeCall) {
                setSelectedCall(activeCall);
                setActiveTab('dashboard');
              }
            }}
            configStatus={configStatus}
            onOpenConfig={() => setConfigModalOpen(true)}
          />
        )}

        {activeTab === 'history' && (
          <CallHistoryView
            calls={calls}
            loading={loadingCalls}
            onSelectCall={call => setSelectedCall(call)}
            onSyncCall={handleSyncCall}
            onRetryCall={handleRetryCall}
            onDeleteCall={handleDeleteCall}
            onNewCallClick={() => setActiveTab('new-call')}
            syncingId={syncingId}
          />
        )}
      </main>

      {/* Call Detail Drawer / Modal */}
      {selectedCall && (
        <CallDetailModal
          call={selectedCall}
          onClose={() => setSelectedCall(null)}
          onSync={handleSyncCall}
          onRetry={handleRetryCall}
          onDelete={handleDeleteCall}
          syncing={syncingId === selectedCall.id}
          retrying={retryingId === selectedCall.id}
        />
      )}

      {/* Configuration Inspector Modal */}
      {configModalOpen && (
        <ConfigModal
          status={configStatus}
          onClose={() => setConfigModalOpen(false)}
          onRefresh={loadConfig}
        />
      )}

      {/* Authentication Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <ProtectedRoute>
            <MainApp />
          </ProtectedRoute>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
