const { assertProvider } = require('./provider-contract');
const { EchoProvider } = require('./providers/echo-provider');
const { ReverseProvider } = require('./providers/reverse-provider');

function createProvider({ provider, model } = {}) {
  const selected = String(provider || 'echo').trim().toLowerCase();

  if (selected === 'echo') {
    return assertProvider(new EchoProvider({ model }));
  }

  if (selected === 'reverse') {
    return assertProvider(new ReverseProvider({ model }));
  }

  throw new Error('unsupported_provider');
}

function createProviderFromEnv(env = process.env) {
  return createProvider({
    provider: env.AI_PROVIDER,
    model: env.AI_MODEL
  });
}

module.exports = {
  createProvider,
  createProviderFromEnv
};
