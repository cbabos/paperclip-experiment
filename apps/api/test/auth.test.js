const assert = require('node:assert/strict');
const test = require('node:test');

const { createApp } = require('../src/server');

async function startTestServer({
  sessionTtlMs,
  aiProvider,
  workflowStore,
  workflowTimeoutMs,
  workflowQueue,
  workflowPollIntervalMs,
  workflowRetryBaseDelayMs,
  workflowMaxAttempts
} = {}) {
  const { server } = createApp({
    sessionTtlMs,
    aiProvider,
    workflowStore,
    workflowTimeoutMs,
    workflowQueue,
    workflowPollIntervalMs,
    workflowRetryBaseDelayMs,
    workflowMaxAttempts
  });
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    baseUrl,
    close: () => new Promise((resolve, reject) => {
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    })
  };
}

function extractSessionCookie(setCookieHeader) {
  const [cookie] = String(setCookieHeader || '').split(';');
  return cookie;
}

async function signupAndLogin({ app, email, password }) {
  const signupRes = await fetch(`${app.baseUrl}/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  assert.equal(signupRes.status, 201);

  const loginRes = await fetch(`${app.baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  assert.equal(loginRes.status, 200);

  const sessionCookie = extractSessionCookie(loginRes.headers.get('set-cookie'));
  assert.match(sessionCookie, /^session_token=/);
  return sessionCookie;
}

async function waitForJob({ app, sessionCookie, jobId, timeoutMs = 3000 }) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const jobRes = await fetch(`${app.baseUrl}/ai/workflows/jobs/${jobId}`, {
      headers: { cookie: sessionCookie }
    });
    assert.equal(jobRes.status, 200);

    const payload = await jobRes.json();
    if (payload.request.status === 'succeeded') {
      return payload;
    }

    if (payload.request.status === 'failed' && payload.request.deadLetteredAt) {
      return payload;
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error(`job_timeout:${jobId}`);
}

test('signup, login, fetch current user, logout', async (t) => {
  const app = await startTestServer();
  t.after(async () => {
    await app.close();
  });

  const signupRes = await fetch(`${app.baseUrl}/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'founder@example.com', password: 'secret-123' })
  });
  assert.equal(signupRes.status, 201);

  const loginRes = await fetch(`${app.baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'founder@example.com', password: 'secret-123' })
  });
  assert.equal(loginRes.status, 200);

  const sessionCookie = extractSessionCookie(loginRes.headers.get('set-cookie'));
  assert.match(sessionCookie, /^session_token=/);

  const meRes = await fetch(`${app.baseUrl}/auth/me`, {
    headers: { cookie: sessionCookie }
  });
  assert.equal(meRes.status, 200);
  const mePayload = await meRes.json();
  assert.equal(mePayload.user.email, 'founder@example.com');

  const logoutRes = await fetch(`${app.baseUrl}/auth/logout`, {
    method: 'POST',
    headers: { cookie: sessionCookie }
  });
  assert.equal(logoutRes.status, 200);

  const meAfterLogout = await fetch(`${app.baseUrl}/auth/me`, {
    headers: { cookie: sessionCookie }
  });
  assert.equal(meAfterLogout.status, 401);
});

test('session expiry is enforced', async (t) => {
  const app = await startTestServer({ sessionTtlMs: 25 });
  t.after(async () => {
    await app.close();
  });

  await fetch(`${app.baseUrl}/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'expiry@example.com', password: 'secret-123' })
  });

  const loginRes = await fetch(`${app.baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'expiry@example.com', password: 'secret-123' })
  });
  assert.equal(loginRes.status, 200);

  const sessionCookie = extractSessionCookie(loginRes.headers.get('set-cookie'));

  await new Promise((resolve) => setTimeout(resolve, 35));

  const meRes = await fetch(`${app.baseUrl}/auth/me`, {
    headers: { cookie: sessionCookie }
  });

  assert.equal(meRes.status, 401);
});

test('workflow API enqueues jobs and exposes polling status until success', async (t) => {
  let capturedPrompt = null;
  const aiProvider = {
    name: 'fake',
    model: 'fake-v1',
    async generateText({ prompt }) {
      capturedPrompt = prompt;
      return {
        provider: 'fake',
        model: 'fake-v1',
        text: `processed:${prompt}`
      };
    }
  };

  const app = await startTestServer({ aiProvider, workflowPollIntervalMs: 5 });
  t.after(async () => {
    await app.close();
  });

  const sessionCookie = await signupAndLogin({
    app,
    email: 'workflow-auth@example.com',
    password: 'secret-123'
  });

  const runRes = await fetch(`${app.baseUrl}/ai/workflows/run`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: sessionCookie },
    body: JSON.stringify({ prompt: 'hello' })
  });

  assert.equal(runRes.status, 202);
  const queued = await runRes.json();
  assert.equal(queued.request.status, 'queued');
  assert.match(queued.request.id, /^[a-f0-9-]{36}$/);

  const completed = await waitForJob({
    app,
    sessionCookie,
    jobId: queued.request.id
  });

  assert.equal(capturedPrompt, 'hello');
  assert.equal(completed.request.status, 'succeeded');
  assert.equal(completed.request.provider, 'fake');
  assert.equal(completed.request.model, 'fake-v1');
  assert.equal(completed.request.attempts, 1);
  assert.equal(completed.output.type, 'text');
  assert.equal(completed.output.text, 'processed:hello');
});

test('workflow retries timeout failures and dead-letters after max attempts', async (t) => {
  const aiProvider = {
    name: 'slow-fake',
    model: 'slow-v1',
    async generateText() {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return {
        provider: 'slow-fake',
        model: 'slow-v1',
        text: 'late'
      };
    }
  };

  const app = await startTestServer({
    aiProvider,
    workflowTimeoutMs: 10,
    workflowPollIntervalMs: 5,
    workflowRetryBaseDelayMs: 5,
    workflowMaxAttempts: 2
  });
  t.after(async () => {
    await app.close();
  });

  const sessionCookie = await signupAndLogin({
    app,
    email: 'workflow-timeout@example.com',
    password: 'secret-123'
  });

  const runRes = await fetch(`${app.baseUrl}/ai/workflows/run`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: sessionCookie },
    body: JSON.stringify({ prompt: 'hello' })
  });

  assert.equal(runRes.status, 202);
  const queued = await runRes.json();

  const done = await waitForJob({
    app,
    sessionCookie,
    jobId: queued.request.id,
    timeoutMs: 5000
  });

  assert.equal(done.request.status, 'failed');
  assert.equal(done.request.error, 'provider_timeout');
  assert.equal(done.request.attempts, 2);
  assert.ok(done.request.deadLetteredAt);
  assert.equal(done.output, null);
});

test('workflow retries transient provider errors and succeeds on a later attempt', async (t) => {
  let attempts = 0;
  const aiProvider = {
    name: 'flaky-fake',
    model: 'flaky-v1',
    async generateText({ prompt }) {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('boom');
      }
      return {
        provider: 'flaky-fake',
        model: 'flaky-v1',
        text: `ok:${prompt}`
      };
    }
  };

  const app = await startTestServer({
    aiProvider,
    workflowPollIntervalMs: 5,
    workflowRetryBaseDelayMs: 5,
    workflowMaxAttempts: 3
  });
  t.after(async () => {
    await app.close();
  });

  const sessionCookie = await signupAndLogin({
    app,
    email: 'workflow-retry-success@example.com',
    password: 'secret-123'
  });

  const runRes = await fetch(`${app.baseUrl}/ai/workflows/run`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: sessionCookie },
    body: JSON.stringify({ prompt: 'hello' })
  });

  assert.equal(runRes.status, 202);
  const queued = await runRes.json();

  const done = await waitForJob({
    app,
    sessionCookie,
    jobId: queued.request.id
  });

  assert.equal(done.request.status, 'succeeded');
  assert.equal(done.request.attempts, 2);
  assert.equal(done.output.text, 'ok:hello');
});

test('workflow API requires an authenticated session', async (t) => {
  const app = await startTestServer();
  t.after(async () => {
    await app.close();
  });

  const runRes = await fetch(`${app.baseUrl}/ai/workflows/run`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'hello' })
  });

  assert.equal(runRes.status, 401);
  const payload = await runRes.json();
  assert.equal(payload.error, 'unauthorized');

  const statusRes = await fetch(`${app.baseUrl}/ai/workflows/jobs/00000000-0000-0000-0000-000000000000`);
  assert.equal(statusRes.status, 401);
});
