import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { CallRecord, DashboardStats } from '../../src/types.js';

let prisma: PrismaClient | null = null;
let isPostgresConnected = false;
let dbMode: 'postgres' | 'local_fallback' = 'local_fallback';
let initError: string | null = null;

// Local fallback store file path
const LOCAL_DATA_DIR = path.resolve(process.cwd(), '.data');
const LOCAL_DATA_FILE = path.resolve(LOCAL_DATA_DIR, 'calls.json');

function ensureLocalDataDir() {
  if (!fs.existsSync(LOCAL_DATA_DIR)) {
    fs.mkdirSync(LOCAL_DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(LOCAL_DATA_FILE)) {
    fs.writeFileSync(LOCAL_DATA_FILE, JSON.stringify([], null, 2), 'utf-8');
  }
}

function readLocalCalls(): CallRecord[] {
  try {
    ensureLocalDataDir();
    const content = fs.readFileSync(LOCAL_DATA_FILE, 'utf-8');
    return JSON.parse(content || '[]');
  } catch (err) {
    console.error('[dbService] Error reading local calls data:', err);
    return [];
  }
}

function writeLocalCalls(calls: CallRecord[]): void {
  try {
    ensureLocalDataDir();
    fs.writeFileSync(LOCAL_DATA_FILE, JSON.stringify(calls, null, 2), 'utf-8');
  } catch (err) {
    console.error('[dbService] Error writing local calls data:', err);
  }
}

export function getPrismaClient(): PrismaClient | null {
  return prisma;
}

/**
 * Map Prisma Call model record to CallRecord interface
 */
function mapPrismaToCallRecord(doc: any): CallRecord {
  let parsedQuestions: string[] = [];
  if (Array.isArray(doc.questions)) {
    parsedQuestions = doc.questions;
  } else if (typeof doc.questions === 'string') {
    try {
      parsedQuestions = JSON.parse(doc.questions);
    } catch {
      parsedQuestions = [doc.questions];
    }
  }

  return {
    id: doc.id,
    userId: doc.userId,
    phoneNumber: doc.phoneNumber,
    objective: doc.objective,
    questions: parsedQuestions,
    notes: doc.notes || '',
    calleTaskId: doc.calleTaskId || null,
    idempotencyKey: doc.idempotencyKey || undefined,
    status: (doc.status as CallRecord['status']) || 'queued',
    transcript: doc.transcript || [],
    summary: doc.summary || null,
    structuredResult: doc.structuredResult || null,
    outcome: doc.outcome || null,
    duration: doc.duration ?? null,
    error: doc.error || null,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : String(doc.createdAt),
    completedAt: doc.completedAt instanceof Date ? doc.completedAt.toISOString() : (doc.completedAt || null),
    attemptsCount: doc.attemptsCount || 1,
    lastSyncedAt: doc.lastSyncedAt instanceof Date ? doc.lastSyncedAt.toISOString() : (doc.lastSyncedAt || undefined)
  };
}

/**
 * Clean and normalize DATABASE_URL if surrounded by quotes, assignment prefix, or whitespace
 */
export function normalizeDatabaseUrl(raw?: string | null): string | null {
  if (!raw) return null;
  let val = raw.trim();
  if (!val) return null;

  // Extract valid postgres connection string if embedded (e.g. DATABASE_URL='postgresql://...')
  const match = val.match(/postgres(?:ql)?:\/\/[^\s'"]+/i);
  if (match) {
    return match[0].trim();
  }

  // Strip leading variable assignment e.g. DATABASE_URL= or DATABASE_URL:
  val = val.replace(/^DATABASE_URL\s*[:=]\s*/i, '').trim();
  // Strip surrounding single or double quotes
  val = val.replace(/^['"]+|['"]+$/g, '').trim();

  if (val.startsWith('postgresql://') || val.startsWith('postgres://')) {
    return val;
  }

  return null;
}

/**
 * Initialize Neon PostgreSQL connection via Prisma ORM
 */
export async function initDb(): Promise<void> {
  const rawUrl = process.env.DATABASE_URL;
  const cleanUrl = normalizeDatabaseUrl(rawUrl);

  if (!cleanUrl) {
    if (rawUrl && rawUrl.trim() !== '') {
      console.warn('[dbService] Provided DATABASE_URL is not a valid postgresql:// or postgres:// URL. Running in persistent local store mode (.data/calls.json).');
      initError = 'DATABASE_URL does not start with postgresql:// or postgres://';
    } else {
      console.log('[dbService] No DATABASE_URL provided. Running in persistent local store mode (.data/calls.json).');
    }
    dbMode = 'local_fallback';
    isPostgresConnected = false;
    ensureLocalDataDir();
    return;
  }

  // Ensure process.env.DATABASE_URL has the clean URL for Prisma internals
  process.env.DATABASE_URL = cleanUrl;

  try {
    console.log('[dbService] Connecting to Neon PostgreSQL via Prisma...');
    const client = new PrismaClient({
      datasources: {
        db: { url: cleanUrl }
      }
    });

    await client.$connect();
    prisma = client;
    isPostgresConnected = true;
    dbMode = 'postgres';
    initError = null;
    console.log('[dbService] Successfully connected to Neon PostgreSQL database.');
  } catch (err: any) {
    prisma = null;
    console.warn('[dbService] Failed to connect to Neon PostgreSQL:', err.message);
    console.warn('[dbService] Falling back to local persistent store so the application remains fully functional.');
    initError = err.message;
    dbMode = 'local_fallback';
    isPostgresConnected = false;
    ensureLocalDataDir();
  }
}

export function getDbStatus() {
  const cleanUrl = normalizeDatabaseUrl(process.env.DATABASE_URL);
  return {
    mode: dbMode,
    isPostgresConnected,
    configured: Boolean(cleanUrl),
    databaseType: 'neon_postgres',
    databaseName: 'neondb',
    error: initError
  };
}

/**
 * Insert a new call record into Neon PostgreSQL / local store
 */
export async function createCallRecord(call: CallRecord): Promise<CallRecord> {
  if (dbMode === 'postgres' && prisma && isPostgresConnected) {
    const created = await prisma.call.create({
      data: {
        id: call.id,
        userId: call.userId,
        phoneNumber: call.phoneNumber,
        objective: call.objective,
        questions: call.questions || [],
        notes: call.notes || null,
        calleTaskId: call.calleTaskId || null,
        idempotencyKey: call.idempotencyKey || null,
        status: call.status || 'queued',
        transcript: (call.transcript as any) || null,
        summary: call.summary || null,
        structuredResult: (call.structuredResult as any) || null,
        outcome: call.outcome || null,
        duration: call.duration !== undefined ? call.duration : null,
        error: call.error || null,
        createdAt: call.createdAt ? new Date(call.createdAt) : new Date(),
        completedAt: call.completedAt ? new Date(call.completedAt) : null,
        attemptsCount: call.attemptsCount || 1,
        lastSyncedAt: call.lastSyncedAt ? new Date(call.lastSyncedAt) : null
      }
    });
    return mapPrismaToCallRecord(created);
  } else {
    const calls = readLocalCalls();
    calls.unshift(call);
    writeLocalCalls(calls);
    return call;
  }
}

/**
 * Get calls for a specific user with filtering and searching
 */
export async function getCallsByUser(
  userId: string,
  options: { search?: string; status?: string; limit?: number; offset?: number } = {}
): Promise<{ calls: CallRecord[]; total: number }> {
  const { search, status, limit = 50, offset = 0 } = options;

  if (dbMode === 'postgres' && prisma && isPostgresConnected) {
    const where: any = { userId };

    if (status && status !== 'all') {
      where.status = status;
    }

    if (search && search.trim() !== '') {
      const term = search.trim();
      where.OR = [
        { phoneNumber: { contains: term, mode: 'insensitive' } },
        { objective: { contains: term, mode: 'insensitive' } },
        { summary: { contains: term, mode: 'insensitive' } },
        { outcome: { contains: term, mode: 'insensitive' } }
      ];
    }

    const [total, docs] = await Promise.all([
      prisma.call.count({ where }),
      prisma.call.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit
      })
    ]);

    const calls = docs.map(mapPrismaToCallRecord);
    return { calls, total };
  } else {
    let calls = readLocalCalls().filter(c => c.userId === userId);

    if (status && status !== 'all') {
      calls = calls.filter(c => c.status === status);
    }

    if (search && search.trim() !== '') {
      const q = search.trim().toLowerCase();
      calls = calls.filter(c =>
        c.phoneNumber.toLowerCase().includes(q) ||
        c.objective.toLowerCase().includes(q) ||
        (c.summary && c.summary.toLowerCase().includes(q)) ||
        (c.structuredResult?.result && String(c.structuredResult.result).toLowerCase().includes(q))
      );
    }

    const total = calls.length;
    const paginated = calls.slice(offset, offset + limit);
    return { calls: paginated, total };
  }
}

/**
 * Get a single call by ID and verify user ownership
 */
export async function getCallById(id: string, userId?: string): Promise<CallRecord | null> {
  if (dbMode === 'postgres' && prisma && isPostgresConnected) {
    const where: any = { id };
    if (userId) {
      where.userId = userId;
    }
    const doc = await prisma.call.findFirst({ where });
    if (!doc) return null;
    return mapPrismaToCallRecord(doc);
  } else {
    const calls = readLocalCalls();
    const found = calls.find(c => c.id === id && (!userId || c.userId === userId));
    return found || null;
  }
}

/**
 * Check if a call with this idempotencyKey already exists (for deduplication)
 */
export async function getCallByIdempotencyKey(key: string, userId?: string): Promise<CallRecord | null> {
  if (!key) return null;

  if (dbMode === 'postgres' && prisma && isPostgresConnected) {
    const where: any = { idempotencyKey: key };
    if (userId) {
      where.userId = userId;
    }
    const doc = await prisma.call.findFirst({ where });
    if (!doc) return null;
    return mapPrismaToCallRecord(doc);
  } else {
    const calls = readLocalCalls();
    const found = calls.find(c => c.idempotencyKey === key && (!userId || c.userId === userId));
    return found || null;
  }
}

/**
 * Check if the user currently has an active, initiating, or queued call.
 * CALL-E restricts concurrent calls; this ensures one active call at a time.
 */
export async function hasActiveCallForUser(userId: string): Promise<CallRecord | null> {
  if (!userId) return null;

  const activeStatuses = ['initiating', 'active', 'queued'];

  if (dbMode === 'postgres' && prisma && isPostgresConnected) {
    const doc = await prisma.call.findFirst({
      where: {
        userId,
        status: { in: activeStatuses }
      },
      orderBy: { createdAt: 'desc' }
    });
    if (!doc) return null;
    return mapPrismaToCallRecord(doc);
  } else {
    const calls = readLocalCalls();
    const found = calls.find(c => c.userId === userId && activeStatuses.includes(c.status));
    return found || null;
  }
}

/**
 * Update call record
 */
export async function updateCallRecord(
  id: string,
  update: Partial<CallRecord>,
  userId?: string
): Promise<CallRecord | null> {
  const lastSyncedAt = new Date();

  if (dbMode === 'postgres' && prisma && isPostgresConnected) {
    const data: any = {
      lastSyncedAt
    };

    if (update.status !== undefined) data.status = update.status;
    if (update.calleTaskId !== undefined) data.calleTaskId = update.calleTaskId;
    if (update.transcript !== undefined) data.transcript = update.transcript;
    if (update.summary !== undefined) data.summary = update.summary;
    if (update.structuredResult !== undefined) data.structuredResult = update.structuredResult;
    if (update.outcome !== undefined) data.outcome = update.outcome;
    if (update.duration !== undefined) data.duration = update.duration;
    if (update.error !== undefined) data.error = update.error;
    if (update.completedAt !== undefined) {
      data.completedAt = update.completedAt ? new Date(update.completedAt) : null;
    }
    if (update.attemptsCount !== undefined) data.attemptsCount = update.attemptsCount;
    if (update.notes !== undefined) data.notes = update.notes;
    if (update.objective !== undefined) data.objective = update.objective;
    if (update.questions !== undefined) data.questions = update.questions;

    if (userId) {
      await prisma.call.updateMany({
        where: { id, userId },
        data
      });
    } else {
      await prisma.call.update({
        where: { id },
        data
      });
    }

    return await getCallById(id, userId);
  } else {
    const calls = readLocalCalls();
    const index = calls.findIndex(c => c.id === id && (!userId || c.userId === userId));
    if (index === -1) return null;

    calls[index] = {
      ...calls[index],
      ...update,
      lastSyncedAt: lastSyncedAt.toISOString()
    };
    writeLocalCalls(calls);
    return calls[index];
  }
}

/**
 * Delete a call record
 */
export async function deleteCallRecord(id: string, userId: string): Promise<boolean> {
  if (dbMode === 'postgres' && prisma && isPostgresConnected) {
    const res = await prisma.call.deleteMany({
      where: { id, userId }
    });
    return res.count > 0;
  } else {
    const calls = readLocalCalls();
    const initialLen = calls.length;
    const remaining = calls.filter(c => !(c.id === id && c.userId === userId));
    if (remaining.length !== initialLen) {
      writeLocalCalls(remaining);
      return true;
    }
    return false;
  }
}

/**
 * Aggregate stats for user dashboard
 */
export async function getUserStats(userId: string): Promise<DashboardStats> {
  if (dbMode === 'postgres' && prisma && isPostgresConnected) {
    const [total, successful, failed, active] = await Promise.all([
      prisma.call.count({ where: { userId } }),
      prisma.call.count({ where: { userId, status: 'completed' } }),
      prisma.call.count({ where: { userId, status: { in: ['failed', 'canceled'] } } }),
      prisma.call.count({ where: { userId, status: { in: ['active', 'initiating', 'queued'] } } })
    ]);

    const successRate = total > 0 ? Math.round((successful / total) * 100) : 0;

    return {
      total,
      successful,
      failed,
      active,
      successRate
    };
  } else {
    const { calls } = await getCallsByUser(userId, { limit: 1000 });

    const total = calls.length;
    const successful = calls.filter(c => c.status === 'completed').length;
    const failed = calls.filter(c => c.status === 'failed' || c.status === 'canceled').length;
    const active = calls.filter(c => c.status === 'active' || c.status === 'initiating' || c.status === 'queued').length;
    const successRate = total > 0 ? Math.round((successful / total) * 100) : 0;

    return {
      total,
      successful,
      failed,
      active,
      successRate
    };
  }
}

/**
 * Get all currently active or queued calls across users (for background sync)
 */
export async function getPendingCalls(): Promise<CallRecord[]> {
  if (dbMode === 'postgres' && prisma && isPostgresConnected) {
    const docs = await prisma.call.findMany({
      where: {
        status: { in: ['active', 'initiating', 'queued'] },
        calleTaskId: { not: null }
      }
    });

    return docs.map(mapPrismaToCallRecord);
  } else {
    const calls = readLocalCalls();
    return calls.filter(
      c => (c.status === 'active' || c.status === 'initiating' || c.status === 'queued') && c.calleTaskId
    );
  }
}
