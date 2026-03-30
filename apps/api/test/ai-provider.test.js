const assert = require('node:assert/strict');
const test = require('node:test');

const { createProvider } = require('../src/ai/provider-factory');
const { assertProvider } = require('../src/ai/provider-contract');

test('provider factory supports config-driven selection', async () => {
  const echo = createProvider({ provider: 'echo', model: 'echo-test' });
  const reverse = createProvider({ provider: 'reverse', model: 'reverse-test' });

  const echoResult = await echo.generateText({ prompt: 'paperclip' });
  const reverseResult = await reverse.generateText({ prompt: 'paperclip' });

  assert.equal(echoResult.provider, 'echo');
  assert.equal(echoResult.model, 'echo-test');
  assert.equal(echoResult.text, 'paperclip');

  assert.equal(reverseResult.provider, 'reverse');
  assert.equal(reverseResult.model, 'reverse-test');
  assert.equal(reverseResult.text, 'pilcrepap');
});

test('adapter contract validation rejects invalid implementations', () => {
  assert.throws(() => assertProvider(null), /invalid_provider/);
  assert.throws(() => assertProvider({ name: '', generateText: async () => ({}) }), /invalid_provider_name/);
  assert.throws(() => assertProvider({ name: 'bad' }), /invalid_provider_generate_text/);
});

test('unsupported providers are rejected', () => {
  assert.throws(() => createProvider({ provider: 'unknown' }), /unsupported_provider/);
});
