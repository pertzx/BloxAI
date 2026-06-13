class CustomProvider {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL;
    this.model = config.model;
    this.name = 'custom';
    this.models = {
      fast: config.model,
      balanced: config.model,
      powerful: config.model
    };
  }

  async generateCode(prompt, options = {}) {
    const temperature = options.temperature || 0.1;
    
    try {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          temperature,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: `Você é o Blox AI, um agente sênior de desenvolvimento Roblox.
Retorne SEMPRE em JSON válido com: { "actions": [...], "explanation": "..." }
Responda em português (pt-BR).`
            },
            { role: 'user', content: prompt }
          ]
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }

      const data = await response.json();
      
      return {
        content: data.choices[0].message.content,
        usage: data.usage,
        model: this.model
      };
    } catch (error) {
      throw new Error('Custom API Error: ' + error.message);
    }
  }

  async validateApiKey(apiKey, baseURL) {
    try {
      const response = await fetch(`${baseURL}/models`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      return { valid: response.ok };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }
}

module.exports = CustomProvider;
