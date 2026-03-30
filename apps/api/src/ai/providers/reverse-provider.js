class ReverseProvider {
  constructor({ model = 'reverse-v1' } = {}) {
    this.name = 'reverse';
    this.model = model;
  }

  async generateText({ prompt }) {
    const text = String(prompt || '');
    return {
      provider: this.name,
      model: this.model,
      text: text.split('').reverse().join('')
    };
  }
}

module.exports = {
  ReverseProvider
};
