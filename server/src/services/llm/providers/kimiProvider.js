class KimiProvider {
  constructor(apiKey = null) {
    this.apiKey = apiKey || process.env.KIMI_API_KEY;
    this.baseURL = 'https://api.moonshot.cn/v1';
    this.name = 'kimi';
    this.models = {
      fast: 'kimi-k2.5',
      balanced: 'kimi-k2.5',
      powerful: 'kimi-k2.5'
    };
  }

  async generateCode(prompt, options = {}) {
    const model = options.model || this.models.balanced;
    const temperature = options.temperature || 0.1;
    
    try {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model,
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
        model: data.model
      };
    } catch (error) {
      throw new Error('Kimi Error: ' + error.message);
    }
  }

  async validateApiKey(apiKey) {
    try {
      const response = await fetch(`${this.baseURL}/models`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      return { valid: response.ok };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }
}

module.exports = KimiProvider;
