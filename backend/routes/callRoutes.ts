import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  requireAuth,
  AuthenticatedRequest
} from '../middleware/authMiddleware.js';
import * as calleService from '../services/calleService.js';
import * as dbService from '../services/dbService.js';
import { CallRecord, CreateCallPayload } from '../../src/types.js';

const router = Router();

// E.164 phone number regular expression (+[country code][number], 7 to 15 digits total)
const E164_REGEX = /^\+[1-9]\d{6,14}$/;

// In-memory set to prevent duplicate background watchers on the same CALL-E task
const activeMonitors = new Set<string>();

// In-flight map to deduplicate concurrent requests with the same idempotency key or user
const inFlightCreations = new Map<string, Promise<any>>();

/**
 * Background worker to monitor active call completion with reasonable 5-10s interval
 */
async function monitorCallTask(callId: string, taskId: string, userId: string) {
  if (!taskId) return;
  if (activeMonitors.has(taskId)) {
    console.log(`[callMonitor] Monitor already running for task ${taskId}; skipping duplicate watcher.`);
    return;
  }

  activeMonitors.add(taskId);
  try {
    console.log(`[callMonitor] Started background monitoring for call ${callId} (task: ${taskId})`);

    // Poll or wait for result with safe 7s interval (requirement 6: 5-10 seconds)
    const result = await calleService.waitForCallResult(taskId, {
      intervalMs: 7000,
      timeoutMs: 180000 // 3 minutes
    });

    if (result) {
      console.log(`[callMonitor] Task ${taskId} updated with status: ${result.status}`);

      const transcript = calleService.extractTranscript(result);
      const duration = calleService.extractDuration(result);
      const structuredResult = result.structuredResult || null;
      const summary = result.summary || (result.recipients?.[0]?.summary) || null;
      const outcome = (structuredResult as any)?.outcome || (structuredResult as any)?.result || (result.taskCompleted ? 'Completed Successfully' : result.status);

      let mappedStatus: CallRecord['status'] = 'completed';
      if (result.status === 'failed') mappedStatus = 'failed';
      else if (result.status === 'canceled') mappedStatus = 'canceled';
      else if (result.status === 'in_progress' || result.status === 'running') mappedStatus = 'active';

      await dbService.updateCallRecord(
        callId,
        {
          status: mappedStatus,
          transcript,
          summary,
          structuredResult,
          outcome,
          duration,
          completedAt: result.completedAt || (mappedStatus === 'completed' ? new Date().toISOString() : null),
          error: result.failureMessage || result.failureCode || null
        },
        userId
      );
    }
  } catch (err: any) {
    console.error(`[callMonitor] Error in background monitoring for task ${taskId}:`, err.message);
  } finally {
    activeMonitors.delete(taskId);
  }
}

/**
 * GET /api/config-status
 * System status for dashboard header & configuration assistant
 */
router.get('/config-status', async (_req, res) => {
  const dbStatus = dbService.getDbStatus();
  const isCalleOk = calleService.isCalleConfigured();

  res.json({
    calleConfigured: isCalleOk,
    calleBaseUrl: process.env.CALL_E_BASE_URL || 'https://api.heycall-e.com',
    dbConfigured: dbStatus.configured,
    dbType: 'neon_postgres',
    dbStatus: dbStatus.isPostgresConnected ? 'connected' : 'local_fallback',
    authType: 'jwt_bcrypt',
    jwtConfigured: Boolean(process.env.JWT_SECRET && process.env.JWT_SECRET.trim().length >= 16)
  });
});

/**
 * POST /api/test-calle
 * Test CALL-E API connection with current credentials
 */
router.post('/test-calle', requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const testRes = await calleService.testConnection();
    res.json(testRes);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/stats
 * Aggregated statistics for the authenticated user
 */
router.get('/stats', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const stats = await dbService.getUserStats(req.user!.id);
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: `Failed to fetch stats: ${err.message}` });
  }
});

/**
 * GET /api/calls
 * List all calls for the authenticated user with search and status filtering
 */
router.get('/calls', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { search, status, limit, offset } = req.query;

    const result = await dbService.getCallsByUser(req.user!.id, {
      search: typeof search === 'string' ? search : undefined,
      status: typeof status === 'string' ? status : undefined,
      limit: limit ? parseInt(limit as string, 10) : 50,
      offset: offset ? parseInt(offset as string, 10) : 0
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: `Failed to fetch calls: ${err.message}` });
  }
});

/**
 * POST /api/calls
 * Create and initiate a real phone call task with CALL-E
 */
router.post('/calls', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { phoneNumber, objective, questions, notes } = req.body as CreateCallPayload;

  // 1. Validation
  if (!phoneNumber || typeof phoneNumber !== 'string') {
    res.status(400).json({ error: 'Phone number is required.' });
    return;
  }

  const cleanPhone = phoneNumber.trim();
  if (!E164_REGEX.test(cleanPhone)) {
    res.status(400).json({
      error: `Invalid phone number format: "${cleanPhone}". CALL-E requires valid E.164 format (e.g. +14155552671).`
    });
    return;
  }

  if (!objective || typeof objective !== 'string' || objective.trim().length === 0) {
    res.status(400).json({ error: 'Call objective is required.' });
    return;
  }

  if (!questions || !Array.isArray(questions) || questions.length === 0) {
    res.status(400).json({ error: 'At least one specific question to ask the recipient is required.' });
    return;
  }

  const cleanQuestions = questions
    .map(q => (typeof q === 'string' ? q.trim() : ''))
    .filter(q => q.length > 0);

  if (cleanQuestions.length === 0) {
    res.status(400).json({ error: 'Questions list cannot be empty.' });
    return;
  }

  // 2. Check CALL-E configuration
  if (!calleService.isCalleConfigured()) {
    res.status(503).json({
      error: 'CALL_E_API_KEY is not configured in the server environment. ' +
             'Please configure your CALL-E API key in settings or .env to make real phone calls.'
    });
    return;
  }

  // 3. Idempotency Key Handling (Requirement 4)
  const clientKey = (req.headers['idempotency-key'] as string) || (req.body as any).idempotencyKey;
  const idempotencyKey = clientKey || `callscout-${uuidv4().replace(/-/g, '').slice(0, 16)}`;

  // If a call with this idempotency key already exists for this user, deduplicate and return existing record!
  if (clientKey) {
    const existingCall = await dbService.getCallByIdempotencyKey(clientKey, req.user!.id);
    if (existingCall) {
      console.log(`[callRoutes] Deduplicated call creation with existing idempotency key: ${clientKey}`);
      res.status(200).json(existingCall);
      return;
    }
  }

  // 4. Concurrency Guard (Requirement 7: "Do not create a new CALL-E call while the previous call is still queued or in_progress.")
  const activeCall = await dbService.hasActiveCallForUser(req.user!.id);
  if (activeCall) {
    console.warn(`[callRoutes] User ${req.user!.id} attempted concurrent call while call ${activeCall.id} is active/queued.`);
    res.status(429).json({
      error: 'A call is already in progress or queued. CALL-E allows one concurrent call at a time. Please wait for the current call to complete before starting a new one.',
      activeCallId: activeCall.id,
      retryAfter: 10
    });
    return;
  }

  // Deduplicate in-flight creations for this idempotency key
  const lockKey = `${req.user!.id}:${idempotencyKey}`;
  if (inFlightCreations.has(lockKey)) {
    try {
      const existingResult = await inFlightCreations.get(lockKey);
      res.status(200).json(existingResult);
      return;
    } catch (e: any) {
      // In-flight failed, proceed below
    }
  }

  const callCreationPromise = (async () => {
    const callId = `call_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();
    const callerName = (req.body.callerName && req.body.callerName.trim()) || (req.user?.name && req.user.name.trim()) || '';

    // Initial database record
    const initialRecord: CallRecord = {
      id: callId,
      userId: req.user!.id,
      phoneNumber: cleanPhone,
      objective: objective.trim(),
      questions: cleanQuestions,
      notes: notes ? notes.trim() : '',
      callerName,
      calleTaskId: null,
      idempotencyKey,
      status: 'initiating',
      transcript: [],
      summary: null,
      structuredResult: null,
      outcome: null,
      duration: null,
      error: null,
      createdAt: now,
      attemptsCount: 1
    };

    await dbService.createCallRecord(initialRecord);

    try {
      const calleTask = await calleService.createCallTask({
        phoneNumber: cleanPhone,
        objective: objective.trim(),
        questions: cleanQuestions,
        notes: notes ? notes.trim() : '',
        callId,
        userId: req.user!.id,
        callerName,
        idempotencyKey
      });

      const updatedRecord = await dbService.updateCallRecord(
        callId,
        {
          calleTaskId: calleTask.id,
          status: 'active'
        },
        req.user!.id
      );

      // Kick off background watcher with safe interval
      monitorCallTask(callId, calleTask.id, req.user!.id).catch(err => {
        console.error('[callRoutes] monitorCallTask error:', err);
      });

      return updatedRecord || initialRecord;
    } catch (err: any) {
      await dbService.updateCallRecord(
        callId,
        {
          status: 'failed',
          error: err.message || 'Failed to dispatch call to CALL-E telephony API'
        },
        req.user!.id
      );
      throw err;
    }
  })();

  inFlightCreations.set(lockKey, callCreationPromise);

  try {
    const resultRecord = await callCreationPromise;
    res.status(201).json(resultRecord);
  } catch (err: any) {
    console.error('[callRoutes] CALL-E call dispatch error:', err.message);

    if (err.status === 429 || err.code === 'rate_limit_exceeded') {
      res.status(429).json({
        error: 'CALL-E Rate Limit Exceeded: Too many concurrent calls or requests. Please wait a moment before trying again.',
        retryAfter: err.retryAfter || 10
      });
      return;
    }

    if (err.isClarificationNeeded || err.status === 422) {
      let questions = err.clarificationQuestions || (err.details?.questions || []);
      if (!Array.isArray(questions) || questions.length === 0) {
        if (err.message) {
          const raw = err.message
            .replace(/CALL-E API Error \(\d+\):\s*/i, '')
            .replace(/Call task creation was rejected:\s*/i, '')
            .trim();
          if (raw) {
            questions = [raw];
          }
        }
      }
      res.status(422).json({
        error: err.message,
        isClarificationNeeded: true,
        clarificationQuestions: questions
      });
      return;
    }

    res.status(err.status || 500).json({
      error: `Failed to initiate call via CALL-E: ${err.message}`
    });
  } finally {
    inFlightCreations.delete(lockKey);
  }
});

/**
 * GET /api/calls/stats
 * Alias for /api/stats
 */
router.get('/calls/stats', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const stats = await dbService.getUserStats(req.user!.id);
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: `Failed to fetch stats: ${err.message}` });
  }
});

/**
 * GET /api/calls/:id
 * Retrieve a single call record with ownership check
 */
router.get('/calls/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const call = await dbService.getCallById(req.params.id, req.user!.id);

    if (!call) {
      res.status(404).json({ error: 'Call not found or unauthorized.' });
      return;
    }

    // Throttle inline sync to avoid concurrent polling spam (sync at most once per 6 seconds)
    const now = Date.now();
    const lastSyncTime = call.lastSyncedAt ? new Date(call.lastSyncedAt).getTime() : 0;
    const isRecentlySynced = (now - lastSyncTime) < 6000;

    // If call is active or initiating, perform an inline sync with CALL-E only if not recently synced
    if ((call.status === 'active' || call.status === 'initiating') && call.calleTaskId && !isRecentlySynced) {
      try {
        const freshTask = await calleService.getCallStatus(call.calleTaskId);
        if (freshTask) {
          const transcript = calleService.extractTranscript(freshTask);
          const duration = calleService.extractDuration(freshTask);
          const structuredResult = freshTask.structuredResult || null;
          const summary = freshTask.summary || freshTask.recipients?.[0]?.summary || null;

          let mappedStatus: CallRecord['status'] = call.status;
          if (freshTask.status === 'completed') mappedStatus = 'completed';
          else if (freshTask.status === 'failed') mappedStatus = 'failed';
          else if (freshTask.status === 'canceled') mappedStatus = 'canceled';
          else if (freshTask.status === 'in_progress' || freshTask.status === 'running') mappedStatus = 'active';

          const updated = await dbService.updateCallRecord(
            call.id,
            {
              status: mappedStatus,
              transcript: transcript.length > 0 ? transcript : call.transcript,
              summary: summary || call.summary,
              structuredResult: structuredResult || call.structuredResult,
              outcome: (structuredResult as any)?.outcome || (structuredResult as any)?.result || call.outcome,
              duration: duration || call.duration,
              completedAt: freshTask.completedAt || (mappedStatus === 'completed' ? new Date().toISOString() : call.completedAt),
              error: freshTask.failureMessage || freshTask.failureCode || call.error
            },
            req.user!.id
          );

          if (updated) {
            res.json(updated);
            return;
          }
        }
      } catch (syncErr: any) {
        console.warn(`[callRoutes] Inline sync failed for task ${call.calleTaskId}:`, syncErr.message);
      }
    }

    res.json(call);
  } catch (err: any) {
    res.status(500).json({ error: `Failed to retrieve call: ${err.message}` });
  }
});

/**
 * POST /api/calls/:id/sync
 * Manually trigger status and transcript sync from CALL-E
 */
router.post('/calls/:id/sync', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const call = await dbService.getCallById(req.params.id, req.user!.id);

    if (!call) {
      res.status(404).json({ error: 'Call not found or unauthorized.' });
      return;
    }

    if (!call.calleTaskId) {
      res.status(400).json({ error: 'This call record does not have an associated CALL-E task ID.' });
      return;
    }

    const task = await calleService.getCallStatus(call.calleTaskId);
    const transcript = calleService.extractTranscript(task);
    const duration = calleService.extractDuration(task);
    const structuredResult = task.structuredResult || null;
    const summary = task.summary || task.recipients?.[0]?.summary || null;

    let mappedStatus: CallRecord['status'] = call.status;
    if (task.status === 'completed') mappedStatus = 'completed';
    else if (task.status === 'failed') mappedStatus = 'failed';
    else if (task.status === 'canceled') mappedStatus = 'canceled';
    else if (task.status === 'in_progress' || task.status === 'running') mappedStatus = 'active';

    const updated = await dbService.updateCallRecord(
      call.id,
      {
        status: mappedStatus,
        transcript,
        summary,
        structuredResult,
        outcome: (structuredResult as any)?.outcome || (structuredResult as any)?.result || task.taskCompleted ? 'Completed' : task.status,
        duration,
        completedAt: task.completedAt || (mappedStatus === 'completed' ? new Date().toISOString() : call.completedAt),
        error: task.failureMessage || task.failureCode || null
      },
      req.user!.id
    );

    res.json({
      success: true,
      call: updated || call,
      rawStatus: task.status
    });
  } catch (err: any) {
    res.status(500).json({ error: `Sync failed: ${err.message}` });
  }
});

/**
 * POST /api/calls/:id/retry
 * Retry a failed or incomplete call
 */
router.post('/calls/:id/retry', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const call = await dbService.getCallById(req.params.id, req.user!.id);

    if (!call) {
      res.status(404).json({ error: 'Call not found or unauthorized.' });
      return;
    }

    if (!calleService.isCalleConfigured()) {
      res.status(503).json({
        error: 'CALL_E_API_KEY is not configured in the environment. Please add it in settings or .env.'
      });
      return;
    }

    // Concurrency Check (Requirement 7): Do not retry if a call is already active or queued
    const activeCall = await dbService.hasActiveCallForUser(req.user!.id);
    if (activeCall && activeCall.id !== call.id) {
      res.status(429).json({
        error: 'Cannot retry: Another call is currently active or queued. Please wait for it to complete.',
        activeCallId: activeCall.id,
        retryAfter: 10
      });
      return;
    }
    if (call.status === 'active' || call.status === 'initiating' || call.status === 'queued') {
      res.status(409).json({
        error: 'This call is already in progress or queued.',
        call
      });
      return;
    }

    const newIdempotencyKey = `callscout-${call.id}-retry-${(call.attemptsCount || 1) + 1}`;
    const newAttemptsCount = (call.attemptsCount || 1) + 1;

    // Reset status to initiating
    await dbService.updateCallRecord(
      call.id,
      {
        status: 'initiating',
        error: null,
        attemptsCount: newAttemptsCount
      },
      req.user!.id
    );

    // Create new task with CALL-E
    const newTask = await calleService.createCallTask({
      phoneNumber: call.phoneNumber,
      objective: call.objective,
      questions: call.questions,
      notes: call.notes,
      callId: call.id,
      userId: req.user!.id,
      callerName: (call as any).callerName || (req.user?.name && req.user.name.trim()) || '',
      idempotencyKey: newIdempotencyKey
    });

    const updated = await dbService.updateCallRecord(
      call.id,
      {
        calleTaskId: newTask.id,
        status: 'active',
        idempotencyKey: newIdempotencyKey
      },
      req.user!.id
    );

    monitorCallTask(call.id, newTask.id, req.user!.id).catch(err => {
      console.error('[callRoutes] Retry monitor error:', err);
    });

    res.json({
      success: true,
      message: 'Call retry successfully dispatched with CALL-E.',
      call: updated
    });
  } catch (err: any) {
    await dbService.updateCallRecord(
      req.params.id,
      {
        status: 'failed',
        error: `Retry failed: ${err.message}`
      },
      req.user!.id
    );

    if (err.status === 429 || err.code === 'rate_limit_exceeded') {
      res.status(429).json({
        error: 'CALL-E Rate Limit Exceeded: Too many concurrent calls or requests. Please wait a moment before retrying.',
        retryAfter: 10
      });
      return;
    }

    res.status(500).json({ error: `Retry failed: ${err.message}` });
  }
});

/**
 * DELETE /api/calls/:id
 * Delete a call record with user ownership verification
 */
router.delete('/calls/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const deleted = await dbService.deleteCallRecord(req.params.id, req.user!.id);

    if (!deleted) {
      res.status(404).json({ error: 'Call record not found or unauthorized.' });
      return;
    }

    res.json({ success: true, message: 'Call record deleted successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to delete call: ${err.message}` });
  }
});

export default router;
