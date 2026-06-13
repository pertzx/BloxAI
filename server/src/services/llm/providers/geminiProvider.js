const { GoogleGenerativeAI } = require('@google/generative-ai');

class GeminiProvider {
  constructor(apiKey = null) {
    this.client = new GoogleGenerativeAI(apiKey || process.env.GEMINI_API_KEY);
    this.name = 'gemini';
    this.models = {
      fast: 'gemini-1.5-flash',
      balanced: 'gemini-1.5-pro',
      powerful: 'gemini-1.5-pro'
    };
  }

  async generateCode(prompt, options = {}) {
    const modelName = options.model || this.models.balanced;
    const temperature = options.temperature || 0.1;
    
    try {
      const model = this.client.getGenerativeModel({ 
        model: modelName,
        generationConfig: {
          temperature,
          responseMimeType: 'application/json'
        }
      });

      const systemPrompt = `Você é o Blox AI, um agente sênior de desenvolvimento Roblox.
Retorne SEMPRE em JSON válido com: { "actions": [...], "explanation": "..." }
Responda em português (pt-BR).`;

      const result = await model.generateContent(systemPrompt + '\n\n' + prompt);
      const response = await result.response;
      
      return {
        content: response.text(),
        usage: {
          prompt_tokens: result.usageMetadata?.promptTokenCount || 0,
          completion_tokens: result.usageMetadata?.candidatesTokenCount || 0,
          total_tokens: result.usageMetadata?.totalTokenCount || 0
        },
        model: modelName
      };
    } catch (error) {
      throw new Error('Gemini Error: ' + error.message);
    }
  }

  async validateApiKey(apiKey) {
    try {
      const client = new GoogleGenerativeAI(apiKey);
      const model = client.getGenerativeModel({ model: 'gemini-1.5-flash' });
      await model.generateContent('test');
      return { valid: true };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }
}

module.exports = GeminiProvider;
