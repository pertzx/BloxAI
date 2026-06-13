const OpenAIProvider = require('./providers/openaiProvider');
const GeminiProvider = require('./providers/geminiProvider');
const KimiProvider = require('./providers/kimiProvider');
const CustomProvider = require('./providers/customProvider');

const PROVIDERS = {
  openai: OpenAIProvider,
  gemini: GeminiProvider,
  kimi: KimiProvider,
  custom: CustomProvider
};

class LLMService {
  constructor() {
    this.providers = {};
  }

  getProvider(providerName, userConfig = null) {
    const cacheKey = `${providerName}_${userConfig?.userId || 'default'}`;
    
    if (this.providers[cacheKey]) {
      return this.providers[cacheKey];
    }

    const ProviderClass = PROVIDERS[providerName];
    if (!ProviderClass) {
      throw new Error(`Provider ${providerName} não suportado`);
    }

    let provider;
    if (providerName === 'custom' && userConfig) {
      provider = new ProviderClass(userConfig);
    } else {
      provider = new ProviderClass(userConfig?.apiKey);
    }

    this.providers[cacheKey] = provider;
    return provider;
  }

  async generateCode(prompt, options = {}) {
    const {
      provider: providerName = 'openai',
      userConfig = null,
      model = null,
      temperature = 0.1
    } = options;

    // FALLBACK: Verifica se provider está configurado
    if (providerName !== 'blox') {
      const hasApiKey = userConfig?.apiKeys?.[providerName]?.key || 
                       (providerName === 'custom' && userConfig?.apiKeys?.custom?.baseURL);
      
      if (!hasApiKey) {
        return {
          explanation: `⚠️ **Provider ${providerName} não configurado**\n\n` +
            `Para usar este provider, você precisa configurar a API Key em **Configurações > Providers**.\n\n` +
            `Ou use o **Blox AI** (padrão) que não requer configuração adicional.`,
          code: `--[[
Provider: ${providerName}
Status: NÃO CONFIGURADO

Configure em: Dashboard > Settings > API Keys
--]]`,
          model: 'none',
          provider: providerName
        };
      }
    }

    const provider = this.getProvider(providerName, userConfig);
    
    const result = await provider.generateCode(prompt, {
      model,
      temperature
    });

    return {
      ...result,
      provider: providerName
    };
  }

  async validateApiKey(providerName, apiKey, extraConfig = {}) {
    try {
      const ProviderClass = PROVIDERS[providerName];
      if (!ProviderClass) {
        return { valid: false, error: 'Provider não suportado' };
      }

      if (providerName === 'custom') {
        const provider = new ProviderClass({ apiKey, ...extraConfig });
        return await provider.validateApiKey(apiKey, extraConfig.baseURL);
      }

      const provider = new ProviderClass(apiKey);
      return await provider.validateApiKey(apiKey);
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  getAvailableProviders() {
    return [
      { id: 'openai', name: 'OpenAI', models: ['gpt-4o', 'gpt-4o-mini'] },
      { id: 'gemini', name: 'Google Gemini', models: ['gemini-1.5-pro', 'gemini-1.5-flash'] },
      { id: 'kimi', name: 'Moonshot Kimi', models: ['kimi-k2.5'] },
      { id: 'custom', name: 'Custom API', models: ['custom'] }
    ];
  }

  clearCache() {
    this.providers = {};
  }
}

module.exports = new LLMService();
