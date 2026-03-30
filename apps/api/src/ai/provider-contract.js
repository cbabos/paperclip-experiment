function assertProvider(provider) {
  if (!provider || typeof provider !== 'object') {
    throw new Error('invalid_provider');
  }

  if (typeof provider.name !== 'string' || provider.name.length === 0) {
    throw new Error('invalid_provider_name');
  }

  if (typeof provider.generateText !== 'function') {
    throw new Error('invalid_provider_generate_text');
  }

  return provider;
}

module.exports = {
  assertProvider
};
