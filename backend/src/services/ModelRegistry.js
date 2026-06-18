import { AiModel } from '../models/AiModel.js';

/**
 * Provedores suportados. Cada um tem uma arquitetura de request diferente:
 *  - openai/deepseek: API estilo OpenAI (/chat/completions, Bearer).
 *  - anthropic: API Messages (/v1/messages, x-api-key, anthropic-version).
 * `kind` diz ao ModelRouter qual caminho usar. `envKey` é a chave no .env.
 */
const PROVIDERS = {
  openai: {
    name: 'OpenAI',
    kind: 'openai-compatible',
    envKey: 'OPENAI_API_KEY',
    baseUrl: 'https://api.openai.com/v1/chat/completions',
  },
  deepseek: {
    name: 'DeepSeek',
    kind: 'openai-compatible',
    envKey: 'DEEPSEEK_API_KEY',
    baseUrl: 'https://api.deepseek.com/v1/chat/completions',
  },
  anthropic: {
    name: 'Anthropic (Claude)',
    kind: 'anthropic',
    envKey: 'ANTHROPIC_API_KEY',
    baseUrl: 'https://api.anthropic.com/v1/messages',
  },
};

export class ModelRegistry {
  static _cache = [];

  static providers() {
    return PROVIDERS;
  }

  static isProviderConfigured(provider) {
    const p = PROVIDERS[provider];
    return Boolean(p && process.env[p.envKey] && String(process.env[p.envKey]).trim());
  }

  /** Status de cada provedor para o painel admin: chave configurada (OK) ou não. */
  static providerStatus() {
    return Object.entries(PROVIDERS).map(([key, p]) => ({
      provider: key,
      name: p.name,
      envKey: p.envKey,
      configured: this.isProviderConfigured(key),
    }));
  }

  static async refresh() {
    this._cache = await AiModel.find({}).sort({ order: 1, label: 1 }).lean();
    return this._cache;
  }

  static all() {
    return this._cache;
  }

  /** Modelos que o admin habilitou E cujo provedor tem chave (o que o usuário vê). */
  static availableModels() {
    return this._cache.filter((m) => m.enabled && this.isProviderConfigured(m.provider));
  }

  static availableLabels() {
    return this.availableModels().map((m) => m.label);
  }

  static defaultLabel() {
    const available = this.availableModels();
    const explicit = available.find((m) => m.isDefault);
    return (explicit || available[0])?.label || null;
  }

  static findByLabel(idOrLabel) {
    if (!idOrLabel) return null;
    const norm = String(idOrLabel).trim().toLowerCase();
    return (
      this._cache.find((m) => m.label.toLowerCase() === norm) ||
      this._cache.find((m) => m.apiModel.toLowerCase() === norm) ||
      null
    );
  }

  /**
   * Resolve um label (ou apiModel) para o que o ModelRouter precisa: provedor,
   * tipo de API, url, chave e o apiModel real. Faz fallback para o padrão.
   */
  static resolve(idOrLabel) {
    let model = this.findByLabel(idOrLabel);
    if (!model) {
      // heurística de compatibilidade com labels antigos
      const norm = String(idOrLabel || '').toLowerCase();
      if (norm.includes('claude')) model = this._cache.find((m) => m.provider === 'anthropic');
      else if (norm.includes('gpt') || norm.includes('openai')) model = this._cache.find((m) => m.provider === 'openai');
      else if (norm.includes('deepseek')) model = this._cache.find((m) => m.provider === 'deepseek');
    }
    if (!model) {
      model = this.availableModels()[0] || this._cache[0] || null;
    }

    if (!model) {
      // Fallback absoluto se o registro estiver vazio: DeepSeek.
      const p = PROVIDERS.deepseek;
      return {
        label: 'DeepSeek',
        provider: 'deepseek',
        kind: p.kind,
        apiModel: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
        baseUrl: p.baseUrl,
        envKey: p.envKey,
        inputPer1M: 0.27,
        outputPer1M: 1.1,
      };
    }

    const p = PROVIDERS[model.provider] || PROVIDERS.deepseek;
    return {
      label: model.label,
      provider: model.provider,
      kind: p.kind,
      apiModel: model.apiModel,
      baseUrl: p.baseUrl,
      envKey: p.envKey,
      inputPer1M: Number(model.inputPer1M || 0),
      outputPer1M: Number(model.outputPer1M || 0),
    };
  }

  static async seedDefaults() {
    const count = await AiModel.countDocuments();
    if (count > 0) {
      await this.refresh();
      return;
    }
    await AiModel.insertMany([
      { label: 'DeepSeek V3', provider: 'deepseek', apiModel: 'deepseek-chat', description: 'Barato, bom custo-benefício.', inputPer1M: 0.27, outputPer1M: 1.1, enabled: true, order: 1 },
      { label: 'GPT-4o mini', provider: 'openai', apiModel: 'gpt-4o-mini', description: 'OpenAI rápido e barato.', inputPer1M: 0.15, outputPer1M: 0.6, enabled: true, isDefault: true, order: 2 },
      { label: 'GPT-4o', provider: 'openai', apiModel: 'gpt-4o', description: 'OpenAI forte para código.', inputPer1M: 2.5, outputPer1M: 10, enabled: true, order: 3 },
      { label: 'Claude 3.5 Sonnet', provider: 'anthropic', apiModel: 'claude-3-5-sonnet-20240620', description: 'Excelente para código Roblox.', inputPer1M: 3, outputPer1M: 15, enabled: true, order: 4 },
    ]);
    await this.refresh();
  }
}
