const http = require('node:http');
const { AuthStore } = require('./auth-store');
const { assertProvider } = require('./ai/provider-contract');
const { createProviderFromEnv } = require('./ai/provider-factory');
const { InMemoryWorkflowStore } = require('./workflow-store');
const { createQueueFromEnv, WorkflowWorker } = require('./workflow-queue');

const DEFAULT_WORKFLOW_TIMEOUT_MS = 15_000;
const DEFAULT_WORKFLOW_MAX_ATTEMPTS = 3;

function json(res, statusCode, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    ...extraHeaders
  });
  res.end(payload);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 100) {
        reject(new Error('payload_too_large'));
      }
    });
    req.on('error', reject);
    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (_err) {
        reject(new Error('invalid_json'));
      }
    });
  });
}

function parseCookie(headerValue) {
  if (!headerValue) {
    return {};
  }

  const entries = headerValue.split(';').map((part) => part.trim()).filter(Boolean);
  const out = {};
  for (const entry of entries) {
    const idx = entry.indexOf('=');
    if (idx < 0) {
      continue;
    }

    const key = entry.slice(0, idx);
    const val = entry.slice(idx + 1);
    out[key] = decodeURIComponent(val);
  }

  return out;
}

function normalizePrompt(prompt) {
  if (typeof prompt !== 'string') {
    return null;
  }

  const normalized = prompt.trim();
  if (!normalized) {
    return null;
  }

  if (normalized.length > 10_000) {
    throw new Error('prompt_too_long');
  }

  return normalized;
}

function buildJobPayload({ request, output }) {
  return {
    request: {
      id: request.id,
      status: request.status,
      provider: request.provider,
      model: request.providerModel,
      attempts: request.attemptCount,
      maxAttempts: request.maxAttempts,
      createdAt: request.createdAt,
      queuedAt: request.queuedAt || null,
      startedAt: request.startedAt,
      completedAt: request.completedAt,
      deadLetteredAt: request.deadLetteredAt || null,
      error: request.errorMessage || null
    },
    output: output
      ? {
          id: output.id,
          type: output.outputType,
          text: output.contentText,
          createdAt: output.createdAt
        }
      : null
  };
}

function createApp({
  sessionTtlMs,
  aiProvider,
  workflowStore,
  workflowTimeoutMs,
  workflowQueue,
  workflowPollIntervalMs,
  workflowRetryBaseDelayMs,
  workflowMaxAttempts
} = {}) {
  const store = new AuthStore({ sessionTtlMs });
  const provider = aiProvider ? assertProvider(aiProvider) : createProviderFromEnv(process.env);
  const workflows = workflowStore || new InMemoryWorkflowStore();
  const queue = workflowQueue || createQueueFromEnv(process.env);
  const timeoutMs = Number.isFinite(workflowTimeoutMs)
    ? Math.max(1, Math.floor(workflowTimeoutMs))
    : DEFAULT_WORKFLOW_TIMEOUT_MS;
  const maxAttempts = Number.isFinite(workflowMaxAttempts)
    ? Math.max(1, Math.floor(workflowMaxAttempts))
    : DEFAULT_WORKFLOW_MAX_ATTEMPTS;
  const worker = new WorkflowWorker({
    workflowStore: workflows,
    queue,
    provider,
    timeoutMs,
    pollIntervalMs: workflowPollIntervalMs,
    retryBaseDelayMs: workflowRetryBaseDelayMs,
    maxAttempts
  });
  worker.start();

  async function handler(req, res) {
    try {
      const method = req.method || 'GET';
      const url = new URL(req.url || '/', 'http://localhost');

      if (method === 'POST' && url.pathname === '/auth/signup') {
        const { email, password } = await readJson(req);
        if (!email || !password) {
          json(res, 400, { error: 'email_and_password_required' });
          return;
        }

        try {
          const user = await store.createUser({ email, password });
          json(res, 201, { user });
          return;
        } catch (err) {
          if (err instanceof Error && err.message === 'email_exists') {
            json(res, 409, { error: 'email_already_exists' });
            return;
          }
          throw err;
        }
      }

      if (method === 'POST' && url.pathname === '/auth/login') {
        const { email, password } = await readJson(req);
        if (!email || !password) {
          json(res, 400, { error: 'email_and_password_required' });
          return;
        }

        const user = await store.verifyUser({ email, password });
        if (!user) {
          json(res, 401, { error: 'invalid_credentials' });
          return;
        }

        const session = store.createSession({ userId: user.id });
        json(
          res,
          200,
          { user, session: { expiresAt: session.expiresAt } },
          {
            'set-cookie': `session_token=${encodeURIComponent(session.token)}; Path=/; HttpOnly; SameSite=Lax`
          }
        );
        return;
      }

      if (method === 'POST' && url.pathname === '/auth/logout') {
        const cookies = parseCookie(req.headers.cookie);
        const token = cookies.session_token;
        if (token) {
          store.revokeSession(token);
        }

        json(
          res,
          200,
          { ok: true },
          {
            'set-cookie': 'session_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
          }
        );
        return;
      }

      if (method === 'GET' && url.pathname === '/auth/me') {
        const cookies = parseCookie(req.headers.cookie);
        const token = cookies.session_token;
        const session = store.getSession(token);
        if (!session) {
          json(res, 401, { error: 'unauthorized' });
          return;
        }

        json(res, 200, { user: session.user, session: { expiresAt: session.expiresAt } });
        return;
      }

      if (method === 'POST' && url.pathname === '/ai/workflows/run') {
        const cookies = parseCookie(req.headers.cookie);
        const token = cookies.session_token;
        const session = store.getSession(token);
        if (!session) {
          json(res, 401, { error: 'unauthorized' });
          return;
        }

        const { prompt } = await readJson(req);

        let normalizedPrompt;
        try {
          normalizedPrompt = normalizePrompt(prompt);
        } catch (err) {
          if (err instanceof Error && err.message === 'prompt_too_long') {
            json(res, 400, { error: 'prompt_too_long', maxLength: 10000 });
            return;
          }
          throw err;
        }

        if (!normalizedPrompt) {
          json(res, 400, { error: 'prompt_required' });
          return;
        }

        const requestRecord = await workflows.createRequest({
          inputPrompt: normalizedPrompt,
          maxAttempts
        });
        await queue.enqueue(requestRecord.id);

        json(res, 202, buildJobPayload({ request: requestRecord, output: null }));
        return;
      }

      if (method === 'GET' && /^\/ai\/workflows\/jobs\/[a-f0-9-]{36}$/i.test(url.pathname)) {
        const cookies = parseCookie(req.headers.cookie);
        const token = cookies.session_token;
        const session = store.getSession(token);
        if (!session) {
          json(res, 401, { error: 'unauthorized' });
          return;
        }

        const requestId = url.pathname.split('/').pop();
        const requestRecord = await workflows.getRequestById(requestId);
        if (!requestRecord) {
          json(res, 404, { error: 'job_not_found' });
          return;
        }
        const outputRecord = await workflows.getOutputByRequestId(requestId);
        json(res, 200, buildJobPayload({ request: requestRecord, output: outputRecord }));
        return;
      }

      json(res, 404, { error: 'not_found' });
    } catch (err) {
      if (err instanceof Error && err.message === 'invalid_json') {
        json(res, 400, { error: 'invalid_json' });
        return;
      }

      if (err instanceof Error && err.message === 'payload_too_large') {
        json(res, 413, { error: 'payload_too_large' });
        return;
      }

      json(res, 500, { error: 'internal_error' });
    }
  }

  const server = http.createServer((req, res) => {
    void handler(req, res);
  });

  server.on('close', () => {
    worker.stop();
  });

  return {
    server,
    store
  };
}

module.exports = {
  createApp
};
