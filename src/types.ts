export type CallStatus = 'queued' | 'initiating' | 'active' | 'completed' | 'failed' | 'canceled';

export interface TranscriptTurn {
  speaker: 'agent' | 'user' | 'system';
  text: string;
  timestamp?: string | number;
}

export interface StructuredResult {
  outcome?: string;
  result?: string;
  availability?: string;
  earliest_slot?: string;
  price?: string;
  notes?: string;
  answers?: Array<{
    question: string;
    answer: string;
  }>;
  [key: string]: unknown;
}

export interface CallRecord {
  id: string;
  userId: string;
  phoneNumber: string;
  objective: string;
  questions: string[];
  notes?: string;
  calleTaskId?: string | null;
  idempotencyKey?: string;
  status: CallStatus;
  transcript?: TranscriptTurn[] | string;
  summary?: string | null;
  structuredResult?: StructuredResult | null;
  outcome?: string | null;
  duration?: number | null; // in seconds
  error?: string | null;
  createdAt: string;
  completedAt?: string | null;
  attemptsCount?: number;
  lastSyncedAt?: string;
  callerName?: string;
}

export interface CreateCallPayload {
  phoneNumber: string;
  objective: string;
  questions: string[];
  notes?: string;
  callerName?: string;
  idempotencyKey?: string;
}

export interface DashboardStats {
  total: number;
  successful: number;
  failed: number;
  active: number;
  successRate: number; // 0 to 100
}

export interface SystemConfigStatus {
  calleConfigured: boolean;
  calleBaseUrl: string;
  dbConfigured: boolean;
  dbType: 'neon_postgres' | 'postgres' | 'local_fallback';
  dbStatus: 'connected' | 'local_fallback' | 'error';
  authType: 'jwt_bcrypt';
  jwtConfigured: boolean;
}

export interface UserProfile {
  id: string;
  email: string;
  name?: string | null;
}

export interface AuthResponse {
  token: string;
  user: UserProfile;
}
