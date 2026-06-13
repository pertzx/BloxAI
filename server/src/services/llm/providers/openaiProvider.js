const OpenAI = require('openai');

class OpenAIProvider {
  constructor(apiKey = null) {
    this.client = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY
    });
    this.name = 'openai';
    this.models = {
      fast: 'gpt-4o-mini',
      balanced: 'gpt-4o',
      powerful: 'gpt-4o'
    };
  }

  async generateCode(prompt, options = {}) {
    const model = options.model || this.models.balanced;
    const temperature = options.temperature || 0.1;
    
    try {
      const response = await this.client.chat.completions.create({
        model,
        temperature,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `Você é o Blox AI, um agente sênior de desenvolvimento Roblox.
Retorne SEMPRE em JSON válido com: { "actions": [...], "explanation": "..." }

TIPOS DE AÇÃO SUPORTADOS:
- CREATE_SCRIPT: { type, targetPath, scriptType, name, source }
- EDIT_SCRIPT: { type, targetPath, operation, position, source }
- CREATE_INSTANCE: { type, targetPath, className, name, properties, children }
- SET_PROPERTY: { type, targetPath, property, value }

Responda em português (pt-BR).`
          },
          { role: 'user', content: prompt }
        ]
      });

      return {
        content: response.choices[0].message.content,
        usage: response.usage,
        model: response.model
      };
    } catch (error) {
      throw new Error('OpenAI Error: ' + error.message);
    }
  }

  async validateApiKey(apiKey) {
    try {
      const client = new OpenAI({ apiKey });
      await client.models.list();
      return { valid: true };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }
}

module.exports = OpenAIProvider;
