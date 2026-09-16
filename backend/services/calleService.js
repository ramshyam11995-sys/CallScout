/**
 * CALL-E Voice Agent Integration Service
 * Uses the official @call-e/calle SDK to execute real goal-driven outbound phone calls.
 */

// Lazy-loaded SDK reference to accommodate dynamic ESM/CJS bundling
let calleSdk = null;

async function getSdk() {
  if (!calleSdk) {
    try {
      calleSdk = await import('@call-e/calle');
    } catch (err) {
      console.error('[calleService] Failed to import @call-e/calle SDK:', err);
      throw new Error(`Failed to load @call-e/calle SDK: ${err.message}`);
    }
  }
  return calleSdk;
}

/**
 * Check if CALL-E API key is present
 */
export function isCalleConfigured() {
  return Boolean(process.env.CALL_E_API_KEY && process.env.CALL_E_API_KEY.trim() !== '');
}

/**
 * Get configured CalleClient instance
 */
export async function getClient() {
  const { CalleClient } = await getSdk();
  const apiKey = process.env.CALL_E_API_KEY;

  if (!apiKey || apiKey.trim() === '') {
    throw new Error(
      'CALL_E_API_KEY is not configured in environment variables. ' +
      'Please obtain your API key from the CALL-E dashboard (https://heycall-e.com) and set CALL_E_API_KEY in .env.'
    );
  }

  const baseUrl = process.env.CALL_E_BASE_URL || 'https://api.heycall-e.com';

  return new CalleClient({
    apiKey: apiKey.trim(),
    baseUrl: baseUrl.trim()
  });
}

/**
 * Build structured result JSON Schema for CALL-E to extract data
 */
export function buildResultSchema(questions = []) {
  return {
    type: 'object',
    properties: {
      outcome: {
        type: 'string',
        description: 'High-level outcome of the call, e.g. "Appointment scheduled", "Price quoted", "No answer", "Left voicemail"'
      },
      result: {
        type: 'string',
        description: 'Key conclusion or status message answering the primary objective'
      },
      availability: {
        type: 'string',
        description: 'Earliest availability, appointment slots, or operational hours mentioned'
      },
      earliest_slot: {
        type: 'string',
        description: 'Specific earliest time slot if applicable (e.g. "Tomorrow at 10:00 AM")'
      },
      price: {
        type: 'string',
        description: 'Estimated cost, quote, or price mentioned (e.g. "$80")'
      },
      answers: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            question: { type: 'string' },
            answer: { type: 'string' }
          },
          required: ['question', 'answer']
        },
        description: 'Answers obtained to each specified user question during the conversation'
      },
      notes: {
        type: 'string',
        description: 'Important contextual notes, follow-up instructions, or observations'
      }
    },
    required: ['result']
  };
}

/**
 * Assemble the prompt describing the goal-driven calling task, ensuring single canonical naming
 * and resolving any conflicting names (e.g. Alex Morgan vs vivek singh) to prevent 422 rejections.
 */
export function buildTaskPrompt({ phoneNumber, objective, questions = [], notes = '', callerName = '' }) {
  let prompt = `Make an outbound phone call to ${phoneNumber}.\n\n`;

  let cleanObjective = (objective || '').trim();
  let cleanNotes = (notes || '').trim();
  let cleanCallerName = (callerName || '').trim();

  // 1. Detect if the objective or notes explicitly specify a reservation or booking name
  const namePatterns = [
    /under the name\s+([A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*)+)/i,
    /reservation\s+(?:is\s+)?under\s+([A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*)+)/i,
    /reservation for\s+([A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*)+)/i,
    /table for \d+(?:\s+people|\s+guests)?\s+for\s+([A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*)+)/i,
    /party of \d+(?:\s+people|\s+guests)?\s+for\s+([A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*)+)/i,
    /on behalf of (?:patient |client |customer )?([A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*)+)/i,
    /patient\s+([A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*)+)/i,
    /customer\s+([A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*)+)/i,
    /name is\s+([A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*)+)/i
  ];

  let detectedNameInText = null;
  for (const pattern of namePatterns) {
    const match = cleanObjective.match(pattern) || cleanNotes.match(pattern);
    if (match && match[1]) {
      const candidate = match[1].trim();
      const lowerCand = candidate.toLowerCase();
      // Ignore common non-name words
      if (!['this friday', 'this saturday', 'this evening', 'tomorrow', 'next week', 'a party', 'the restaurant', 'a routine', 'an appointment'].includes(lowerCand)) {
        detectedNameInText = candidate;
        break;
      }
    }
  }

  // 2. Determine single canonical contact name to prevent dual-name conflicts (e.g. Alex Morgan vs vivek singh)
  let contactName = '';
  if (cleanCallerName && cleanCallerName.toLowerCase() !== 'alex morgan') {
    // User explicitly gave a custom name (e.g. "vivek singh")
    contactName = cleanCallerName;
  } else if (detectedNameInText && detectedNameInText.toLowerCase() !== 'alex morgan') {
    // User wrote a name in objective/notes (e.g. "vivek singh")
    contactName = detectedNameInText;
  } else if (cleanCallerName) {
    contactName = cleanCallerName;
  } else if (detectedNameInText) {
    contactName = detectedNameInText;
  }

  // 3. Purge conflicting legacy placeholder "Alex Morgan" from objective and notes if contactName differs
  if (contactName && contactName.toLowerCase() !== 'alex morgan') {
    cleanObjective = cleanObjective.replace(/alex morgan/gi, contactName);
    cleanNotes = cleanNotes.replace(/alex morgan/gi, contactName);
  }

  // 4. If a different name was detected in text than contactName, normalize it to eliminate dual-name conflict
  if (contactName && detectedNameInText && detectedNameInText.toLowerCase() !== contactName.toLowerCase()) {
    try {
      const escaped = detectedNameInText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      cleanObjective = cleanObjective.replace(new RegExp(escaped, 'gi'), contactName);
      cleanNotes = cleanNotes.replace(new RegExp(escaped, 'gi'), contactName);
    } catch {
      // Fallback
    }
  }

  // 5. If the objective is a booking and no name is in the text yet, add it cleanly
  const lowerObj = cleanObjective.toLowerCase();
  const isBookingIntent = lowerObj.includes('reserv') || lowerObj.includes('book') || lowerObj.includes('table') || lowerObj.includes('appointment');
  const hasNameMention = lowerObj.includes('name') || lowerObj.includes('under') || lowerObj.includes('for ');

  if (isBookingIntent && !hasNameMention && contactName) {
    cleanObjective += ` under the name ${contactName}`;
  }

  prompt += `Primary Objective:\n${cleanObjective}\n\n`;

  if (contactName) {
    prompt += `Caller & Booking Details:\n`;
    prompt += `- Caller / Client Name: ${contactName}\n`;
    prompt += `- Contact / Callback Phone: ${phoneNumber}\n`;
    prompt += `- If placing a reservation, booking an appointment, or asked who the call or party is for, always use the name "${contactName}".\n\n`;
  } else {
    prompt += `Caller Details:\n`;
    prompt += `- Contact / Callback Phone: ${phoneNumber}\n\n`;
  }

  if (questions && questions.length > 0) {
    prompt += `Required Information To Obtain:\n`;
    questions.forEach((q, idx) => {
      prompt += `${idx + 1}. ${q}\n`;
    });
    prompt += `\n`;
  }

  if (cleanNotes && cleanNotes.length > 0) {
    prompt += `Additional Context & Instructions:\n${cleanNotes}\n\n`;
  }

  prompt += `Conversation Guidelines:\n`;
  prompt += `- Speak in a natural, polite, and professional tone.\n`;
  prompt += `- Clearly explain the purpose of your call upon greeting the recipient.\n`;
  prompt += `- Listen actively, answer questions politely, and do not sound robotic.\n`;
  prompt += `- Confirm key details (e.g., date, time, party size, prices, spelling) if applicable.\n`;
  prompt += `- Politely conclude the call once all information is gathered or if recipient is unavailable.\n`;

  return prompt;
}

/**
 * Normalizes transcript turns from CALL-E response attempts
 */
export function extractTranscript(calleCall) {
  if (!calleCall) return [];

  const turns = [];

  if (Array.isArray(calleCall.recipients)) {
    for (const recipient of calleCall.recipients) {
      if (Array.isArray(recipient.attempts)) {
        for (const attempt of recipient.attempts) {
          if (Array.isArray(attempt.transcriptTurns)) {
            for (const t of attempt.transcriptTurns) {
              turns.push({
                speaker: t.speaker || t.role || 'system',
                text: t.text || t.message || t.content || '',
                timestamp: t.timestamp || t.time || null
              });
            }
          }
        }
      }
    }
  }

  return turns;
}

/**
 * Normalizes duration in seconds from call response
 */
export function extractDuration(calleCall) {
  if (!calleCall) return null;

  if (calleCall.createdAt && calleCall.completedAt) {
    const start = new Date(calleCall.createdAt).getTime();
    const end = new Date(calleCall.completedAt).getTime();
    if (!isNaN(start) && !isNaN(end) && end >= start) {
      return Math.round((end - start) / 1000);
    }
  }

  // Check attempt duration if present
  if (Array.isArray(calleCall.recipients)) {
    for (const recipient of calleCall.recipients) {
      if (Array.isArray(recipient.attempts)) {
        for (const attempt of recipient.attempts) {
          if (attempt.startedAt && attempt.completedAt) {
            const s = new Date(attempt.startedAt).getTime();
            const e = new Date(attempt.completedAt).getTime();
            if (!isNaN(s) && !isNaN(e) && e >= s) {
              return Math.round((e - s) / 1000);
            }
          }
        }
      }
    }
  }

  return null;
}

/**
 * Executes an operation with exponential backoff on HTTP 429 / CalleRateLimitError
 */
export async function withExponentialBackoff(
  fn,
  {
    maxRetries = 3,
    initialDelayMs = 2000,
    factor = 2,
    maxDelayMs = 12000,
    operationName = 'CALL-E operation'
  } = {}
) {
  const sdk = await getSdk();
  let attempt = 0;
  let delay = initialDelayMs;

  while (true) {
    try {
      return await fn();
    } catch (err) {
      const isRateLimit =
        (sdk && err instanceof sdk.CalleRateLimitError) ||
        err?.status === 429 ||
        err?.code === 'rate_limit_exceeded' ||
        (typeof err?.message === 'string' && err.message.toLowerCase().includes('rate limit'));

      if (isRateLimit && attempt < maxRetries) {
        attempt++;
        const jitter = Math.floor(Math.random() * 600);
        const sleepMs = Math.min(maxDelayMs, delay + jitter);
        console.warn(
          `[calleService] Rate limit (429) during ${operationName}. Backing off for ${sleepMs}ms (attempt ${attempt}/${maxRetries})...`
        );
        await new Promise(resolve => setTimeout(resolve, sleepMs));
        delay *= factor;
        continue;
      }

      if (isRateLimit) {
        const rateLimitErr = new Error(
          'CALL-E Rate Limit Exceeded: Too many concurrent calls or requests. Please wait a moment before trying again.'
        );
        rateLimitErr.status = 429;
        rateLimitErr.code = 'rate_limit_exceeded';
        rateLimitErr.retryAfter = Math.round(delay / 1000);
        throw rateLimitErr;
      }

      throw err;
    }
  }
}

/**
 * Create and initiate a real phone call task using official CALL-E SDK
 */
export async function createCallTask({
  phoneNumber,
  objective,
  questions = [],
  notes = '',
  callId = undefined,
  userId = undefined,
  callerName = undefined,
  firebaseUid = undefined,
  idempotencyKey = undefined,
  webhookUrl = undefined
}) {
  const client = await getClient();
  const sdk = await getSdk();

  const task = buildTaskPrompt({ phoneNumber, objective, questions, notes, callerName });
  const resultSchema = buildResultSchema(questions);

  const key = idempotencyKey || `callscout-${callId || Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  const createInput = {
    task,
    recipient: {
      phone: phoneNumber,
      locale: process.env.CALL_E_DEFAULT_LOCALE || 'en-US'
    },
    resultSchema,
    metadata: {
      source: 'CallScout-AI',
      app: 'CallScout AI',
      callId: callId || '',
      userId: userId || firebaseUid || '',
      callerName: callerName || '',
      objective: objective.substring(0, 120),
      createdAt: new Date().toISOString()
    },
    ...(webhookUrl ? { webhookUrl } : {})
  };

  try {
    console.log(`[calleService] Initiating real CALL-E call to ${phoneNumber} with idempotency key: ${key}`);
    const callTask = await withExponentialBackoff(
      () => client.calls.create(createInput, { idempotencyKey: key }),
      { operationName: `client.calls.create(${phoneNumber})` }
    );
    console.log(`[calleService] CALL-E call task created successfully. Task ID: ${callTask.id}, Status: ${callTask.status}`);
    return callTask;
  } catch (err) {
    console.error('[calleService] Error creating call task with CALL-E:', err);

    if (err instanceof sdk.CalleAuthenticationError) {
      throw new Error('CALL-E Authentication Failed: Invalid API key. Please check CALL_E_API_KEY in settings.');
    }
    if (err instanceof sdk.CalleRateLimitError || err.status === 429) {
      const rateLimitErr = new Error('CALL-E Rate Limit Exceeded: Too many concurrent calls or requests. Please try again in a few moments.');
      rateLimitErr.status = 429;
      throw rateLimitErr;
    }
    if (err instanceof sdk.CalleConnectionError) {
      throw new Error('CALL-E Network Connection Error: Unable to reach CALL-E API servers.');
    }
    if (err instanceof sdk.CalleAPIError) {
      const apiErr = new Error(`CALL-E API Error (${err.status || 500}): ${err.message || 'Call task creation failed'}`);
      apiErr.status = err.status || 500;
      apiErr.details = err.details || {};
      apiErr.isClarificationNeeded = err.status === 422;

      let questions = Array.isArray(err.details?.questions) ? err.details.questions : [];
      if (questions.length === 0 && err.message) {
        const rawMsg = err.message
          .replace(/CALL-E API Error \(\d+\):\s*/i, '')
          .replace(/Call task creation was rejected:\s*/i, '')
          .trim();
        if (rawMsg) {
          questions = [rawMsg];
        }
      }
      apiErr.clarificationQuestions = questions;
      throw apiErr;
    }

    throw err;
  }
}

/**
 * Fetch current status and full details of a CALL-E task
 */
export async function getCallStatus(taskId) {
  if (!taskId) throw new Error('Task ID is required to fetch CALL-E status');

  const client = await getClient();
  const sdk = await getSdk();

  try {
    const callTask = await withExponentialBackoff(
      () => client.calls.get(taskId),
      { maxRetries: 2, initialDelayMs: 2000, operationName: `client.calls.get(${taskId})` }
    );
    return callTask;
  } catch (err) {
    console.error(`[calleService] Error fetching status for task ${taskId}:`, err);
    if (err instanceof sdk.CalleAPIError && err.status === 404) {
      throw new Error(`CALL-E task with ID ${taskId} was not found on the server.`);
    }
    throw err;
  }
}

/**
 * Wait for a call to reach terminal state (completed, failed, canceled) with reasonable 5-10s interval
 */
export async function waitForCallResult(taskId, options = {}) {
  if (!taskId) throw new Error('Task ID is required to wait for call result');

  // Enforce reasonable polling interval between 5 and 10 seconds (default 7 seconds)
  const intervalMs = Math.max(5000, Math.min(10000, options.intervalMs || 7000));
  const timeoutMs = options.timeoutMs ?? 180000; // 3 minutes
  const deadline = Date.now() + timeoutMs;

  console.log(`[calleService] Monitoring CALL-E task ${taskId} (interval: ${intervalMs}ms, timeout: ${timeoutMs}ms)...`);

  while (Date.now() <= deadline) {
    try {
      const callTask = await getCallStatus(taskId);
      if (callTask) {
        if (
          callTask.status === 'completed' ||
          callTask.status === 'failed' ||
          callTask.status === 'canceled'
        ) {
          return callTask;
        }
      }
    } catch (err) {
      console.warn(`[calleService] Non-fatal error while monitoring task ${taskId}:`, err.message);
    }

    if (Date.now() + intervalMs > deadline) {
      break;
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  console.warn(`[calleService] Polling reached deadline waiting for CALL-E task ${taskId}`);
  return await getCallStatus(taskId).catch(() => null);
}

/**
 * List events timeline for a call task
 */
export async function listCallEvents(taskId, options = {}) {
  const client = await getClient();
  return await client.calls.listEvents(taskId, options);
}

/**
 * Verify CALL-E API connection and credentials
 */
export async function testConnection() {
  if (!isCalleConfigured()) {
    return {
      success: false,
      configured: false,
      message: 'CALL_E_API_KEY is not configured in .env'
    };
  }

  try {
    const client = await getClient();
    // Test client by listing or pinging API
    return {
      success: true,
      configured: true,
      baseUrl: process.env.CALL_E_BASE_URL || 'https://api.heycall-e.com',
      message: 'Connected to CALL-E API successfully.'
    };
  } catch (err) {
    return {
      success: false,
      configured: true,
      message: err.message
    };
  }
}
