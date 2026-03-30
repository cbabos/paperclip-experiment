const state = {
  user: null,
  isRunning: false
};

const elements = {
  signupForm: document.getElementById('signup-form'),
  loginForm: document.getElementById('login-form'),
  logoutButton: document.getElementById('logout-button'),
  sessionState: document.getElementById('session-state'),
  workflowForm: document.getElementById('workflow-form'),
  workflowPrompt: document.getElementById('workflow-prompt'),
  workflowSubmit: document.getElementById('workflow-submit'),
  workflowStatus: document.getElementById('workflow-status'),
  workflowOutput: document.getElementById('workflow-output')
};

function setStatus(message, kind = 'neutral') {
  elements.workflowStatus.textContent = message;
  elements.workflowStatus.className = 'status';
  if (kind === 'error') {
    elements.workflowStatus.classList.add('error');
  }
  if (kind === 'success') {
    elements.workflowStatus.classList.add('success');
  }
}

function setOutput(view) {
  elements.workflowOutput.textContent = JSON.stringify(view, null, 2);
}

function setSessionState(message) {
  elements.sessionState.textContent = message;
}

function syncUi() {
  const isAuthed = Boolean(state.user);
  elements.workflowSubmit.disabled = !isAuthed || state.isRunning;
  elements.workflowPrompt.disabled = !isAuthed || state.isRunning;
  elements.logoutButton.disabled = !isAuthed;
}

function toDeterministicView(payload) {
  return {
    status: payload.request?.status ?? null,
    requestId: payload.request?.id ?? null,
    provider: payload.request?.provider ?? null,
    model: payload.request?.model ?? null,
    outputType: payload.output?.type ?? null,
    outputText: payload.output?.text ?? null,
    error: payload.error ?? null
  };
}

async function postJson(path, body) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch (_err) {
    payload = { error: 'invalid_json_response' };
  }

  return { response, payload };
}

async function refreshSession() {
  const response = await fetch('/auth/me');
  if (!response.ok) {
    state.user = null;
    setSessionState('Not authenticated');
    syncUi();
    return;
  }

  const payload = await response.json();
  state.user = payload.user;
  setSessionState(`Authenticated as ${payload.user.email}`);
  syncUi();
}

async function handleSignup(event) {
  event.preventDefault();
  const email = document.getElementById('signup-email').value;
  const password = document.getElementById('signup-password').value;

  const { response, payload } = await postJson('/auth/signup', { email, password });
  if (!response.ok) {
    setStatus(`Sign up failed: ${payload.error || 'unknown_error'}`, 'error');
    return;
  }

  setStatus('Sign up complete. You can now log in.');
}

async function handleLogin(event) {
  event.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  const { response, payload } = await postJson('/auth/login', { email, password });
  if (!response.ok) {
    setStatus(`Log in failed: ${payload.error || 'unknown_error'}`, 'error');
    return;
  }

  state.user = payload.user;
  setSessionState(`Authenticated as ${payload.user.email}`);
  syncUi();
  setStatus('Authenticated. Workflow execution is enabled.', 'success');
}

async function handleLogout() {
  await postJson('/auth/logout', {});
  state.user = null;
  setSessionState('Not authenticated');
  syncUi();
  setStatus('Logged out.');
}

async function handleWorkflowRun(event) {
  event.preventDefault();

  if (!state.user) {
    setStatus('Please authenticate before running a workflow.', 'error');
    return;
  }

  state.isRunning = true;
  syncUi();
  setStatus('Running workflow…');
  setOutput({
    status: 'running',
    requestId: null,
    provider: null,
    model: null,
    outputType: null,
    outputText: null,
    error: null
  });

  const prompt = elements.workflowPrompt.value;
  const { response, payload } = await postJson('/ai/workflows/run', { prompt });

  state.isRunning = false;
  syncUi();

  if (!response.ok) {
    setStatus(`Workflow failed: ${payload.error || 'unknown_error'}`, 'error');
    setOutput(toDeterministicView(payload));
    return;
  }

  setStatus('Workflow completed successfully.', 'success');
  setOutput(toDeterministicView(payload));
}

function init() {
  elements.signupForm.addEventListener('submit', (event) => {
    void handleSignup(event);
  });
  elements.loginForm.addEventListener('submit', (event) => {
    void handleLogin(event);
  });
  elements.logoutButton.addEventListener('click', () => {
    void handleLogout();
  });
  elements.workflowForm.addEventListener('submit', (event) => {
    void handleWorkflowRun(event);
  });

  setOutput({
    status: null,
    requestId: null,
    provider: null,
    model: null,
    outputType: null,
    outputText: null,
    error: null
  });
  syncUi();
  void refreshSession();
}

init();
