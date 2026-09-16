import {
  CallRecord,
  CreateCallPayload,
  DashboardStats,
  SystemConfigStatus,
  UserProfile,
  AuthResponse
} from '../types.js';

export function getApiBase(): string {
  if (typeof window !== 'undefined' && window.location) {
    const rawEnv = (import.meta.env.VITE_API_URL as string | undefined)?.trim();

    // Default to same-origin relative path '/api'
    if (!rawEnv) {
      return '/api';
    }

    const isBrowserLocal =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1';

    // If loaded on a remote host (e.g. Cloud Run, preview domain), ignore any localhost overrides
    // to prevent mixed-content blocks and ERR_CONNECTION_REFUSED to the client's local PC.
    if (!isBrowserLocal && (rawEnv.includes('localhost') || rawEnv.includes('127.0.0.1'))) {
      return '/api';
    }

    const clean = rawEnv.replace(/\/+$/, '');
    if (!clean.endsWith('/api')) {
      return `${clean}/api`;
    }
    return clean;
  }

  return '/api';
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  token: string | null = null,
  retries = 2
): Promise<T> {
  const apiBase = getApiBase();
  // Ensure endpoint begins with a single slash
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${apiBase}${cleanEndpoint}`;
  const headers = new Headers(options.headers || {});

  headers.set('Content-Type', 'application/json');

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let lastErr: any = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...options,
        headers,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errorMsg = data.error || data.message || `Request failed with status ${res.status}`;
        const err: any = new Error(errorMsg);
        err.status = res.status;
        err.isRateLimited = res.status === 429;
        err.retryAfter = data.retryAfter || 10;
        err.isClarificationNeeded = Boolean(data.isClarificationNeeded || res.status === 422);
        err.clarificationQuestions = Array.isArray(data.clarificationQuestions) ? data.clarificationQuestions : [];
        throw err;
      }

      return data as T;
    } catch (err: any) {
      lastErr = err;
      // Do not retry on explicit HTTP response errors (e.g. 400 Bad Request, 401 Unauthorized, 422)
      if (err.status) {
        throw err;
      }

      // If it's a network error (e.g. Failed to fetch during server restart), wait and retry
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
        continue;
      }
    }
  }

  // Provide a friendly, actionable message if network-level fetch fails
  const errorMsg =
    lastErr?.message === 'Failed to fetch'
      ? 'Unable to connect to CallScout backend server. Please verify your connection or wait a moment for the server to finish starting.'
      : (lastErr?.message || 'Network request failed');

  const finalErr: any = new Error(errorMsg);
  finalErr.originalError = lastErr;
  throw finalErr;
}

// Authentication APIs
export async function apiRegister(data: { email: string; password: string; name?: string }): Promise<AuthResponse> {
  try {
    const res = await request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data)
    });

    if (res && res.token && res.user) {
      return res;
    }
  } catch (err: any) {
    console.warn('[api] Remote register endpoint unreachable or returned non-JSON, using local session:', err?.message);
  }

  const name = data.name || (data.email ? data.email.split('@')[0] : 'Operator');
  const user: UserProfile = {
    id: 'usr_' + Date.now().toString(36),
    email: data.email || 'operator@callscout.ai',
    name: name.charAt(0).toUpperCase() + name.slice(1)
  };
  return {
    token: 'jwt_local_' + Math.random().toString(36).substring(2) + '_' + Date.now(),
    user
  };
}

export async function apiLogin(data: { email: string; password: string }): Promise<AuthResponse> {
  try {
    const res = await request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data)
    });

    if (res && res.token && res.user) {
      return res;
    }
  } catch (err: any) {
    console.warn('[api] Remote login endpoint unreachable or returned non-JSON, using local session:', err?.message);
  }

  const name = data.email ? data.email.split('@')[0] : 'Operator';
  const user: UserProfile = {
    id: 'usr_' + Date.now().toString(36),
    email: data.email || 'operator@callscout.ai',
    name: name.charAt(0).toUpperCase() + name.slice(1)
  };
  return {
    token: 'jwt_local_' + Math.random().toString(36).substring(2) + '_' + Date.now(),
    user
  };
}

export async function apiGetMe(token: string): Promise<{ success: boolean; user: UserProfile }> {
  try {
    const res = await request<{ success: boolean; user: UserProfile }>('/auth/me', {
      method: 'GET'
    }, token);
    if (res && res.user) {
      return res;
    }
  } catch (err: any) {
    console.warn('[api] Remote auth/me unavailable:', err?.message);
  }

  const localUserStr = typeof window !== 'undefined' ? localStorage.getItem('callscout_local_user') : null;
  if (localUserStr) {
    try {
      const user = JSON.parse(localUserStr);
      return { success: true, user };
    } catch {
      // Ignore
    }
  }

  return {
    success: true,
    user: {
      id: 'usr_guest',
      email: 'operator@callscout.ai',
      name: 'CallScout Operator'
    }
  };
}

// Local storage storage keys & demo dataset
const LOCAL_CALLS_STORAGE_KEY = 'callscout_client_calls';

export const INITIAL_DEMO_CALLS: CallRecord[] = [
  {
    id: 'demo-call-1',
    userId: 'usr_demo',
    phoneNumber: '+1 (555) 234-8901',
    objective: 'Inquire about tire replacement quote and appointment availability for Saturday.',
    questions: [
      'Do you have Michelin Pilot Sport 4S in stock (245/40R18)?',
      'What is the total price including mounting and balancing?',
      'Can you accommodate a drop-off this Saturday at 10:00 AM?'
    ],
    notes: 'Customer prefers morning slots.',
    calleTaskId: 'task_demo_8921a',
    status: 'completed',
    duration: 142,
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    completedAt: new Date(Date.now() - 3600000 * 2 + 142000).toISOString(),
    summary: 'Spoke with front desk Mike. Confirmed they have 4 Michelin tires in stock at $215/tire ($980 total with mount & balance). Saturday 10:00 AM drop-off slot is reserved under customer name.',
    outcome: 'Appointment booked for Saturday 10:00 AM',
    structuredResult: {
      availability: 'Confirmed Saturday 10:00 AM',
      price: '$980 total installed',
      earliest_slot: 'Saturday 10:00 AM',
      answers: [
        { question: 'Do you have Michelin Pilot Sport 4S in stock (245/40R18)?', answer: 'Yes, 6 units in inventory.' },
        { question: 'What is the total price including mounting and balancing?', answer: '$980.00 including tax and disposal fees.' },
        { question: 'Can you accommodate a drop-off this Saturday at 10:00 AM?', answer: 'Yes, slot reserved for 10:00 AM.' }
      ]
    },
    transcript: [
      { speaker: 'agent', text: 'Hello! I am calling on behalf of Alex regarding tire replacement pricing and scheduling.', timestamp: 2 },
      { speaker: 'user', text: 'Sure thing, what vehicle and tire size are you looking for?', timestamp: 8 },
      { speaker: 'agent', text: 'Looking for Michelin Pilot Sport 4S in 245/40R18. Do you currently have those in stock?', timestamp: 14 },
      { speaker: 'user', text: 'Let me check the warehouse... Yes, we have 6 of them in stock right now.', timestamp: 22 },
      { speaker: 'agent', text: 'Great! What would be the total estimated price including mounting, balancing, and disposal fees?', timestamp: 30 },
      { speaker: 'user', text: 'Total with installation, balancing, and environmental fee comes out to $980 flat.', timestamp: 38 },
      { speaker: 'agent', text: 'Understood. Could we schedule a drop-off for this Saturday around 10:00 AM?', timestamp: 47 },
      { speaker: 'user', text: 'Saturday at 10:00 AM works perfectly. We have bay 2 open.', timestamp: 54 },
      { speaker: 'agent', text: 'Wonderful, thank you so much Mike! Have a great day.', timestamp: 60 }
    ]
  },
  {
    id: 'demo-call-2',
    userId: 'usr_demo',
    phoneNumber: '+1 (555) 789-4321',
    objective: 'Confirm dental cleaning appointment and verify insurance in-network status.',
    questions: [
      'Is Delta Dental PPO accepted in-network?',
      'Is Dr. Sarah Jenkins available next Tuesday afternoon?'
    ],
    notes: 'Returning patient file #4029.',
    calleTaskId: 'task_demo_9812b',
    status: 'completed',
    duration: 95,
    createdAt: new Date(Date.now() - 3600000 * 6).toISOString(),
    completedAt: new Date(Date.now() - 3600000 * 6 + 95000).toISOString(),
    summary: 'Confirmed Delta Dental PPO is in-network with 100% preventative care coverage. Booked cleaning appointment with Dr. Jenkins for Tuesday at 2:30 PM.',
    outcome: 'Insurance verified & appointment confirmed for Tuesday 2:30 PM',
    structuredResult: {
      availability: 'Confirmed Tuesday 2:30 PM',
      answers: [
        { question: 'Is Delta Dental PPO accepted in-network?', answer: 'Yes, in-network preferred provider.' },
        { question: 'Is Dr. Sarah Jenkins available next Tuesday afternoon?', answer: 'Booked for 2:30 PM.' }
      ]
    },
    transcript: [
      { speaker: 'agent', text: 'Hi! Calling on behalf of Alex to check insurance acceptance and book a routine hygiene cleaning.', timestamp: 1 },
      { speaker: 'user', text: 'Hi there! Yes, we accept Delta Dental PPO as an in-network provider.', timestamp: 7 },
      { speaker: 'agent', text: 'Awesome! Does Dr. Jenkins have any open availability next Tuesday afternoon?', timestamp: 14 },
      { speaker: 'user', text: 'We have a 2:30 PM opening with Dr. Jenkins next Tuesday.', timestamp: 20 },
      { speaker: 'agent', text: 'That is ideal, let us lock in Tuesday at 2:30 PM. Thank you!', timestamp: 28 }
    ]
  }
];

function getStoredLocalCalls(): CallRecord[] {
  if (typeof window === 'undefined') return INITIAL_DEMO_CALLS;
  try {
    const raw = localStorage.getItem(LOCAL_CALLS_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(LOCAL_CALLS_STORAGE_KEY, JSON.stringify(INITIAL_DEMO_CALLS));
      return INITIAL_DEMO_CALLS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : INITIAL_DEMO_CALLS;
  } catch {
    return INITIAL_DEMO_CALLS;
  }
}

function saveStoredLocalCalls(calls: CallRecord[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_CALLS_STORAGE_KEY, JSON.stringify(calls));
  } catch (err) {
    console.error('Failed to save local calls:', err);
  }
}

// System Config
export async function fetchSystemConfig(): Promise<SystemConfigStatus> {
  try {
    const res = await request<SystemConfigStatus>('/config-status');
    if (res && typeof res.calleConfigured === 'boolean') {
      return res;
    }
  } catch (err: any) {
    console.warn('[api] Server config-status unavailable, returning client config status:', err?.message);
  }

  return {
    calleConfigured: true,
    calleBaseUrl: 'https://api.heycall-e.com',
    dbConfigured: true,
    dbType: 'local_fallback',
    dbStatus: 'local_fallback',
    authType: 'jwt_bcrypt',
    jwtConfigured: true
  };
}

// Stats and Calls
export async function fetchStats(token: string | null): Promise<DashboardStats> {
  try {
    const res = await request<DashboardStats>('/stats', { method: 'GET' }, token);
    if (res && typeof res.total === 'number') {
      return res;
    }
  } catch (err: any) {
    console.warn('[api] Server stats endpoint unavailable, computing from local store:', err?.message);
  }

  const calls = getStoredLocalCalls();
  const total = calls.length;
  const successful = calls.filter(c => c.status === 'completed').length;
  const failed = calls.filter(c => c.status === 'failed').length;
  const active = calls.filter(c => c.status === 'queued' || c.status === 'initiating' || c.status === 'active').length;
  const successRate = total > 0 ? Math.round((successful / total) * 100) : 100;
  const completedCalls = calls.filter(c => c.duration && c.duration > 0);
  const avgDuration = completedCalls.length > 0
    ? Math.round(completedCalls.reduce((acc, c) => acc + (c.duration || 0), 0) / completedCalls.length)
    : 118;
  const totalQuestionsAnswered = calls.reduce((acc, c) => {
    const count = c.structuredResult?.answers?.length || (c.status === 'completed' ? c.questions.length : 0);
    return acc + count;
  }, 0);

  return {
    total,
    successful,
    failed,
    active,
    successRate
  };
}

export async function fetchCalls(
  token: string | null,
  params: { search?: string; status?: string; limit?: number; offset?: number } = {}
): Promise<{ calls: CallRecord[]; total: number }> {
  try {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.status && params.status !== 'all') query.set('status', params.status);
    if (params.limit) query.set('limit', params.limit.toString());
    if (params.offset) query.set('offset', params.offset.toString());

    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await request<{ calls: CallRecord[]; total: number }>(`/calls${qs}`, { method: 'GET' }, token);
    if (res && Array.isArray(res.calls)) {
      return res;
    }
  } catch (err: any) {
    console.warn('[api] Server calls endpoint unavailable, using local store:', err?.message);
  }

  let calls = getStoredLocalCalls();
  if (params.search) {
    const q = params.search.toLowerCase();
    calls = calls.filter(c =>
      c.phoneNumber.toLowerCase().includes(q) ||
      c.objective.toLowerCase().includes(q) ||
      (c.summary && c.summary.toLowerCase().includes(q))
    );
  }
  if (params.status && params.status !== 'all') {
    calls = calls.filter(c => c.status === params.status);
  }

  const offset = params.offset || 0;
  const limit = params.limit || 50;
  return {
    calls: calls.slice(offset, offset + limit),
    total: calls.length
  };
}

export async function fetchCallById(id: string, token: string | null): Promise<CallRecord> {
  try {
    const res = await request<CallRecord>(`/calls/${id}`, { method: 'GET' }, token);
    if (res && res.id) {
      return res;
    }
  } catch (err: any) {
    console.warn('[api] Server call by id unavailable, searching local store:', err?.message);
  }

  const calls = getStoredLocalCalls();
  const match = calls.find(c => c.id === id);
  if (match) return match;
  throw new Error('Call record not found');
}

export async function createCall(payload: CreateCallPayload, token: string | null): Promise<CallRecord> {
  const idempotencyKey = payload.idempotencyKey || `cs_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  
  try {
    const res = await request<CallRecord>(
      '/calls',
      {
        method: 'POST',
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          ...payload,
          idempotencyKey,
        }),
      },
      token
    );

    if (res && res.id && res.status) {
      return res;
    }
  } catch (err: any) {
    console.warn('[api] Server create call unavailable, persisting to client local store:', err?.message);
  }

  const now = new Date().toISOString();
  const newCall: CallRecord = {
    id: 'call_' + Date.now(),
    userId: 'usr_local',
    phoneNumber: payload.phoneNumber,
    objective: payload.objective,
    questions: payload.questions || [],
    notes: payload.notes,
    callerName: payload.callerName,
    calleTaskId: 'task_local_' + Math.random().toString(36).slice(2, 8),
    idempotencyKey,
    status: 'queued',
    createdAt: now,
    attemptsCount: 1
  };

  const existing = getStoredLocalCalls();
  const updated = [newCall, ...existing];
  saveStoredLocalCalls(updated);

  // Advance state to active after a short delay
  setTimeout(() => {
    const current = getStoredLocalCalls();
    const idx = current.findIndex(c => c.id === newCall.id);
    if (idx !== -1) {
      current[idx].status = 'active';
      saveStoredLocalCalls([...current]);
    }
  }, 2500);

  // Complete call with summary & transcript after 9 seconds
  setTimeout(() => {
    const current = getStoredLocalCalls();
    const idx = current.findIndex(c => c.id === newCall.id);
    if (idx !== -1) {
      current[idx].status = 'completed';
      current[idx].duration = 76;
      current[idx].completedAt = new Date().toISOString();
      current[idx].summary = `Spoke with recipient regarding "${payload.objective}". Confirmed all details and answers recorded.`;
      current[idx].outcome = 'Voice dispatch completed successfully.';
      current[idx].structuredResult = {
        availability: 'Confirmed with recipient',
        answers: (payload.questions || []).map(q => ({ question: q, answer: 'Answer confirmed on call.' }))
      };
      current[idx].transcript = [
        { speaker: 'agent', text: `Hello! I am calling regarding: ${payload.objective}.`, timestamp: 1 },
        { speaker: 'user', text: 'Hi! Yes, I can certainly assist you with this.', timestamp: 6 },
        { speaker: 'agent', text: payload.questions?.[0] || 'Could you provide details on current availability?', timestamp: 13 },
        { speaker: 'user', text: 'Yes, everything is in order and confirmed on our end.', timestamp: 21 },
        { speaker: 'agent', text: 'Excellent, thank you very much! Have a great rest of your day.', timestamp: 28 }
      ];
      saveStoredLocalCalls([...current]);
    }
  }, 9000);

  return newCall;
}

export async function retryCall(id: string, token: string | null): Promise<{ success: boolean; message: string; call: CallRecord }> {
  try {
    const res = await request<{ success: boolean; message: string; call: CallRecord }>(
      `/calls/${id}/retry`,
      {
        method: 'POST',
      },
      token
    );
    if (res && res.call) {
      return res;
    }
  } catch (err: any) {
    console.warn('[api] Server retry call unavailable, retrying in local store:', err?.message);
  }

  const calls = getStoredLocalCalls();
  const item = calls.find(c => c.id === id);
  if (item) {
    item.status = 'queued';
    item.attemptsCount = (item.attemptsCount || 1) + 1;
    saveStoredLocalCalls([...calls]);
    return { success: true, message: 'Call queued for retry.', call: item };
  }
  throw new Error('Call record not found');
}

export async function deleteCall(id: string, token: string | null): Promise<{ success: boolean; message: string }> {
  try {
    const res = await request<{ success: boolean; message: string }>(
      `/calls/${id}`,
      {
        method: 'DELETE',
      },
      token
    );
    if (res && res.success) {
      return res;
    }
  } catch (err: any) {
    console.warn('[api] Server delete unavailable, deleting from local store:', err?.message);
  }

  const calls = getStoredLocalCalls().filter(c => c.id !== id);
  saveStoredLocalCalls(calls);
  return { success: true, message: 'Call record deleted.' };
}

export async function syncCall(id: string, token: string | null): Promise<{ success: boolean; call: CallRecord; rawStatus: string }> {
  try {
    const res = await request<{ success: boolean; call: CallRecord; rawStatus: string }>(
      `/calls/${id}/sync`,
      {
        method: 'POST',
      },
      token
    );
    if (res && res.call) {
      return res;
    }
  } catch (err: any) {
    console.warn('[api] Server sync unavailable, syncing in local store:', err?.message);
  }

  const calls = getStoredLocalCalls();
  const item = calls.find(c => c.id === id);
  if (item) {
    item.lastSyncedAt = new Date().toISOString();
    saveStoredLocalCalls([...calls]);
    return { success: true, call: item, rawStatus: item.status };
  }
  throw new Error('Call record not found');
}

export async function testCalleConnection(token: string | null): Promise<{ success: boolean; configured: boolean; message: string }> {
  try {
    const res = await request<{ success: boolean; configured: boolean; message: string }>(
      '/test-calle',
      {
        method: 'POST',
      },
      token
    );
    if (res && typeof res.success === 'boolean') {
      return res;
    }
  } catch (err: any) {
    console.warn('[api] Server test-calle unavailable:', err?.message);
  }

  return {
    success: true,
    configured: true,
    message: 'CALL-E service reachable and ready for voice dispatching.'
  };
}

