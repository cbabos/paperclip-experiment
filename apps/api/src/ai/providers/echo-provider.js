class EchoProvider {
  constructor({ model = 'echo-v1' } = {}) {
    this.name = 'echo';
    this.model = model;
  }

  async generateText({ prompt }) {
    return {
      provider: this.name,
      model: this.model,
      text: String(prompt || '')
    };
  }
}

module.exports = {
  EchoProvider
};
