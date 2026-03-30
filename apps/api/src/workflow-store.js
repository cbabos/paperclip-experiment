const crypto = require('node:crypto');

class InMemoryWorkflowStore {
  constructor() {
    this.requestsById = new Map();
    this.outputsByRequestId = new Map();
  }

  async createRequest({ inputPrompt, maxAttempts = 3 }) {
    const now = new Date().toISOString();
    const request = {
      id: crypto.randomUUID(),
      inputPrompt,
      status: 'queued',
      provider: null,
      providerModel: null,
      errorMessage: null,
      attemptCount: 0,
      maxAttempts,
      createdAt: now,
      queuedAt: now,
      startedAt: null,
      completedAt: null,
      deadLetteredAt: null
    };
    this.requestsById.set(request.id, request);
    return { ...request };
  }

  async markRequestQueued({ requestId }) {
    const request = this.requestsById.get(requestId);
    if (!request) {
      throw new Error('unknown_request');
    }

    request.status = 'queued';
    request.queuedAt = new Date().toISOString();
    return { ...request };
  }

  async markRequestRunning({ requestId, provider, providerModel, attemptCount }) {
    const request = this.requestsById.get(requestId);
    if (!request) {
      throw new Error('unknown_request');
    }

    request.status = 'running';
    request.provider = provider;
    request.providerModel = providerModel;
    request.attemptCount = attemptCount;
    request.startedAt = new Date().toISOString();
    return { ...request };
  }

  async recordTextOutput({ requestId, contentText }) {
    if (!this.requestsById.has(requestId)) {
      throw new Error('unknown_request');
    }

    const output = {
      id: crypto.randomUUID(),
      requestId,
      outputType: 'text',
      contentText,
      tokenCount: null,
      createdAt: new Date().toISOString()
    };

    this.outputsByRequestId.set(requestId, output);
    return { ...output };
  }

  async markRequestSucceeded({ requestId }) {
    const request = this.requestsById.get(requestId);
    if (!request) {
      throw new Error('unknown_request');
    }

    request.status = 'succeeded';
    request.completedAt = new Date().toISOString();
    return { ...request };
  }

  async markRequestFailed({ requestId, errorMessage }) {
    const request = this.requestsById.get(requestId);
    if (!request) {
      throw new Error('unknown_request');
    }

    request.status = 'failed';
    request.errorMessage = errorMessage;
    request.completedAt = new Date().toISOString();
    return { ...request };
  }

  async markRequestDeadLettered({ requestId }) {
    const request = this.requestsById.get(requestId);
    if (!request) {
      throw new Error('unknown_request');
    }

    request.deadLetteredAt = new Date().toISOString();
    return { ...request };
  }

  async getRequestById(requestId) {
    const request = this.requestsById.get(requestId);
    return request ? { ...request } : null;
  }

  async getOutputByRequestId(requestId) {
    const output = this.outputsByRequestId.get(requestId);
    return output ? { ...output } : null;
  }
}

module.exports = {
  InMemoryWorkflowStore
};
