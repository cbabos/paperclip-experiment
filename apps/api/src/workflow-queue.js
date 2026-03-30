const { createClient } = require('redis');
const { InMemoryWorkflowStore } = require('./workflow-store');

function isTimeoutError(err) {
  return err instanceof Error && err.message === 'provider_timeout';
}

function withTimeout(promise, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('provider_timeout'));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (err) => {
        clearTimeout(timeout);
        reject(err);
      }
    );
  });
}

class InMemoryWorkflowQueue {
  constructor() {
    this.pending = [];
    this.delayed = [];
    this.deadLetter = [];
  }

  async enqueue(requestId, delayMs = 0) {
    if (delayMs > 0) {
      this.delayed.push({ requestId, runAt: Date.now() + delayMs });
      return;
    }
    this.pending.push(requestId);
  }

  async claimNext() {
    const now = Date.now();
    if (this.delayed.length > 0) {
      const stillDelayed = [];
      for (const entry of this.delayed) {
        if (entry.runAt <= now) {
          this.pending.push(entry.requestId);
        } else {
          stillDelayed.push(entry);
        }
      }
      this.delayed = stillDelayed;
    }

    return this.pending.shift() || null;
  }

  async moveToDeadLetter(requestId) {
    this.deadLetter.push(requestId);
  }
}

class RedisWorkflowQueue {
  constructor({ redisUrl, queueKey = 'workflow:queue', delayedKey = 'workflow:delayed', deadLetterKey = 'workflow:dead-letter' }) {
    this.client = createClient({ url: redisUrl });
    this.connectPromise = null;
    this.queueKey = queueKey;
    this.delayedKey = delayedKey;
    this.deadLetterKey = deadLetterKey;
  }

  async ensureConnected() {
    if (!this.connectPromise) {
      this.connectPromise = this.client.connect();
    }
    await this.connectPromise;
  }

  async enqueue(requestId, delayMs = 0) {
    await this.ensureConnected();
    if (delayMs > 0) {
      await this.client.zAdd(this.delayedKey, [{ score: Date.now() + delayMs, value: requestId }]);
      return;
    }
    await this.client.rPush(this.queueKey, requestId);
  }

  async claimNext() {
    await this.ensureConnected();
    const now = Date.now();
    const ready = await this.client.zRangeByScore(this.delayedKey, 0, now);
    if (ready.length > 0) {
      const tx = this.client.multi();
      for (const requestId of ready) {
        tx.zRem(this.delayedKey, requestId);
        tx.rPush(this.queueKey, requestId);
      }
      await tx.exec();
    }
    return this.client.lPop(this.queueKey);
  }

  async moveToDeadLetter(requestId) {
    await this.ensureConnected();
    await this.client.rPush(this.deadLetterKey, requestId);
  }
}

function createQueueFromEnv(env) {
  const redisUrl = env.REDIS_URL;
  if (!redisUrl) {
    return new InMemoryWorkflowQueue();
  }
  return new RedisWorkflowQueue({ redisUrl });
}

class WorkflowWorker {
  constructor({
    workflowStore = new InMemoryWorkflowStore(),
    queue,
    provider,
    timeoutMs,
    pollIntervalMs = 100,
    maxAttempts = 3,
    retryBaseDelayMs = 250
  }) {
    this.workflowStore = workflowStore;
    this.queue = queue;
    this.provider = provider;
    this.timeoutMs = timeoutMs;
    this.pollIntervalMs = Math.max(10, pollIntervalMs);
    this.maxAttempts = Math.max(1, maxAttempts);
    this.retryBaseDelayMs = Math.max(10, retryBaseDelayMs);
    this.running = false;
    this.timer = null;
  }

  start() {
    if (this.running) {
      return;
    }
    this.running = true;
    this.schedule(0);
  }

  stop() {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  schedule(delayMs) {
    if (!this.running) {
      return;
    }
    this.timer = setTimeout(() => {
      void this.tick();
    }, delayMs);
    if (typeof this.timer.unref === 'function') {
      this.timer.unref();
    }
  }

  async tick() {
    if (!this.running) {
      return;
    }

    try {
      const requestId = await this.queue.claimNext();
      if (!requestId) {
        this.schedule(this.pollIntervalMs);
        return;
      }

      const request = await this.workflowStore.getRequestById(requestId);
      if (!request) {
        this.schedule(0);
        return;
      }

      const attemptCount = request.attemptCount + 1;
      await this.workflowStore.markRequestRunning({
        requestId,
        provider: this.provider.name,
        providerModel: this.provider.model || 'unknown',
        attemptCount
      });

      try {
        const result = await withTimeout(
          this.provider.generateText({ prompt: request.inputPrompt }),
          this.timeoutMs
        );

        await this.workflowStore.recordTextOutput({
          requestId,
          contentText: result.text
        });
        await this.workflowStore.markRequestSucceeded({ requestId });
      } catch (err) {
        const isTimeout = isTimeoutError(err);
        const errorCode = isTimeout ? 'provider_timeout' : 'provider_error';
        await this.workflowStore.markRequestFailed({
          requestId,
          errorMessage: errorCode
        });

        if (attemptCount < Math.min(this.maxAttempts, request.maxAttempts)) {
          const delayMs = this.retryBaseDelayMs * attemptCount;
          await this.workflowStore.markRequestQueued({ requestId });
          await this.queue.enqueue(requestId, delayMs);
        } else {
          await this.queue.moveToDeadLetter(requestId);
          await this.workflowStore.markRequestDeadLettered({ requestId });
        }
      }

      this.schedule(0);
      return;
    } catch (_err) {
      this.schedule(this.pollIntervalMs);
    }
  }
}

module.exports = {
  createQueueFromEnv,
  WorkflowWorker
};
