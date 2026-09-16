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
  return request<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

export async function apiLogin(data: { email: string; password: string }): Promise<AuthResponse> {
  return request<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

export async function apiGetMe(token: string): Promise<{ success: boolean; user: UserProfile }> {
  return request<{ success: boolean; user: UserProfile }>('/auth/me', {
    method: 'GET'
  }, token);
}

// System Config
export async function fetchSystemConfig(): Promise<SystemConfigStatus> {
  return request<SystemConfigStatus>('/config-status');
}

// Stats and Calls
export async function fetchStats(token: string | null): Promise<DashboardStats> {
  return request<DashboardStats>('/stats', { method: 'GET' }, token);
}

export async function fetchCalls(
  token: string | null,
  params: { search?: string; status?: string; limit?: number; offset?: number } = {}
): Promise<{ calls: CallRecord[]; total: number }> {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.status && params.status !== 'all') query.set('status', params.status);
  if (params.limit) query.set('limit', params.limit.toString());
  if (params.offset) query.set('offset', params.offset.toString());

  const qs = query.toString() ? `?${query.toString()}` : '';
  return request<{ calls: CallRecord[]; total: number }>(`/calls${qs}`, { method: 'GET' }, token);
}

export async function fetchCallById(id: string, token: string | null): Promise<CallRecord> {
  return request<CallRecord>(`/calls/${id}`, { method: 'GET' }, token);
}

export async function createCall(payload: CreateCallPayload, token: string | null): Promise<CallRecord> {
  const idempotencyKey = payload.idempotencyKey || `cs_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return request<CallRecord>(
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
}

export async function retryCall(id: string, token: string | null): Promise<{ success: boolean; message: string; call: CallRecord }> {
  return request<{ success: boolean; message: string; call: CallRecord }>(
    `/calls/${id}/retry`,
    {
      method: 'POST',
    },
    token
  );
}

export async function deleteCall(id: string, token: string | null): Promise<{ success: boolean; message: string }> {
  return request<{ success: boolean; message: string }>(
    `/calls/${id}`,
    {
      method: 'DELETE',
    },
    token
  );
}

export async function syncCall(id: string, token: string | null): Promise<{ success: boolean; call: CallRecord; rawStatus: string }> {
  return request<{ success: boolean; call: CallRecord; rawStatus: string }>(
    `/calls/${id}/sync`,
    {
      method: 'POST',
    },
    token
  );
}

export async function testCalleConnection(token: string | null): Promise<{ success: boolean; configured: boolean; message: string }> {
  return request<{ success: boolean; configured: boolean; message: string }>(
    '/test-calle',
    {
      method: 'POST',
    },
    token
  );
}
