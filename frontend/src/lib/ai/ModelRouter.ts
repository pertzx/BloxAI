const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

type SupportedModelId = 'DeepSeek-V3' | 'GPT-5.4 Mini' | 'Claude 3.5';
type TaskType = 'roblox_code' | 'ui_frontend' | 'debug' | 'review' | 'architecture' | 'analysis' | 'generic';
type ExecutionMode = 'fast' | 'deep';
type RiskLevel = 'low' | 'medium' | 'high';
type Stage = 'classify' | 'plan' | 'generate' | 'review' | 'summarize';

type GenerateOptions = {
  model?: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
};

type RouteOptions = {
  preferredModel?: string;
  taskType?: TaskType;
  executionMode?: ExecutionMode;
  riskLevel?: RiskLevel;
  stage?: Stage;
};

type RoutedModel = {
  label: SupportedModelId;
  provider: 'openai-compatible' | 'anthropic';
  apiModel: string;
};

type UsageSummary = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  model: SupportedModelId;
  provider: RoutedModel['provider'];
};

export class ModelRouter {
  static getAvailableModels(): SupportedModelId[] {
    const models: SupportedModelId[] = [];
    if (DEEPSEEK_API_KEY) models.push('DeepSeek-V3');
    if (OPENAI_API_KEY) models.push('GPT-5.4 Mini');
    if (ANTHROPIC_API_KEY) models.push('Claude 3.5');
    return models;
  }

  static async generateResponse(
    prompt: string,
    modelOrOptions: string | GenerateOptions = 'DeepSeek-V3',
    systemPrompt = 'Você é um assistente de IA focado em desenvolvimento para Roblox Studio.'
  ) {
    const options: GenerateOptions =
      typeof modelOrOptions === 'string'
        ? { model: modelOrOptions, systemPrompt }
        : { ...modelOrOptions, systemPrompt: modelOrOptions.systemPrompt || systemPrompt };

    const routedModel = this.resolveModelLabel(options.model);
    console.log(`[ModelRouter] Roteando prompt para o modelo: ${routedModel.label}`);

    try {
      if (routedModel.provider === 'anthropic') {
        return await this.callAnthropic(
          ANTHROPIC_API_KEY,
          routedModel.apiModel,
          prompt,
          options.systemPrompt || systemPrompt,
          options.maxTokens,
          options.temperature
        );
      }

      const apiKey = routedModel.label === 'GPT-5.4 Mini' ? OPENAI_API_KEY : DEEPSEEK_API_KEY;
      const url =
        routedModel.label === 'GPT-5.4 Mini'
          ? 'https://api.openai.com/v1/chat/completions'
          : 'https://api.deepseek.com/v1/chat/completions';

      return await this.callOpenAICompatible(
        url,
        apiKey,
        routedModel.apiModel,
        prompt,
        options.systemPrompt || systemPrompt,
        options.maxTokens,
        options.temperature
      );
    } catch (error: any) {
      console.error('[ModelRouter] Erro ao chamar a API real:', error.message);
      return {
        success: false,
        text: `[Erro de Conexão AI] Verifique suas chaves de API. Detalhe: ${error.message}`,
        model: routedModel.label,
        usage: this.buildUsageSummary(routedModel, 0, 0, prompt, ''),
      };
    }
  }

  static selectModel(options: RouteOptions = {}): SupportedModelId {
    const preferred = this.normalizePreferredModel(options.preferredModel);
    if (preferred) return preferred;

    const stage = options.stage || 'generate';
    const taskType = options.taskType || 'generic';
    const executionMode = options.executionMode || 'fast';
    const riskLevel = options.riskLevel || 'low';

    if (stage === 'classify' || stage === 'summarize') return 'DeepSeek-V3';
    if (stage === 'review') {
      if (riskLevel === 'high') return 'Claude 3.5';
      if (riskLevel === 'medium') return 'GPT-5.4 Mini';
      return 'DeepSeek-V3';
    }

    if (taskType === 'review') return 'Claude 3.5';
    if (taskType === 'architecture' || taskType === 'debug') {
      return executionMode === 'deep' || riskLevel !== 'low' ? 'GPT-5.4 Mini' : 'DeepSeek-V3';
    }
    if (taskType === 'ui_frontend') {
      return executionMode === 'deep' ? 'GPT-5.4 Mini' : 'DeepSeek-V3';
    }

    return riskLevel === 'high' ? 'GPT-5.4 Mini' : 'DeepSeek-V3';
  }

  private static normalizePreferredModel(model?: string): SupportedModelId | null {
    if (!model) return null;
    const normalized = model.toLowerCase();
    if (normalized.includes('claude')) return 'Claude 3.5';
    if (normalized.includes('gpt')) return 'GPT-5.4 Mini';
    if (normalized.includes('deepseek')) return 'DeepSeek-V3';
    return null;
  }

  private static resolveModelLabel(model?: string): RoutedModel {
    const normalized = this.normalizePreferredModel(model) || 'DeepSeek-V3';

    if (normalized === 'Claude 3.5') {
      return {
        label: 'Claude 3.5',
        provider: 'anthropic',
        apiModel: 'claude-3-5-sonnet-20240620',
      };
    }

    if (normalized === 'GPT-5.4 Mini') {
      return {
        label: 'GPT-5.4 Mini',
        provider: 'openai-compatible',
        apiModel: 'gpt-5.4-mini',
      };
    }

    return {
      label: 'DeepSeek-V3',
      provider: 'openai-compatible',
      apiModel: 'deepseek-chat',
    };
  }

  static async callOpenAICompatible(
    url: string,
    apiKey: string,
    modelName: string,
    prompt: string,
    systemPrompt: string,
    maxTokens = 1800,
    temperature = 0.2
  ) {
    if (!apiKey) throw new Error(`API Key faltando para ${modelName}`);

    const requestBody: Record<string, any> = {
      model: modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature,
    };

    if (modelName.startsWith('gpt-5')) {
      requestBody.max_completion_tokens = maxTokens;
    } else {
      requestBody.max_tokens = maxTokens;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`API Error: ${err}`);
    }

    const data = await response.json();
    const outputText = data.choices?.[0]?.message?.content || '';
    return {
      success: true,
      text: outputText,
      model: this.resolveModelLabel(modelName).label,
      usage: this.buildUsageSummary(
        this.resolveModelLabel(modelName),
        Number(data?.usage?.prompt_tokens || 0),
        Number(data?.usage?.completion_tokens || 0),
        prompt,
        outputText
      ),
    };
  }

  static async callAnthropic(
    apiKey: string,
    modelName: string,
    prompt: string,
    systemPrompt: string,
    maxTokens = 2200,
    temperature = 0.2
  ) {
    if (!apiKey) throw new Error('API Key faltando para Anthropic');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: modelName,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`API Error: ${err}`);
    }

    const data = await response.json();
    const outputText = data.content?.[0]?.text || '';
    return {
      success: true,
      text: outputText,
      model: 'Claude 3.5',
      usage: this.buildUsageSummary(
        this.resolveModelLabel(modelName),
        Number(data?.usage?.input_tokens || 0),
        Number(data?.usage?.output_tokens || 0),
        prompt,
        outputText
      ),
    };
  }

  private static buildUsageSummary(
    routedModel: RoutedModel,
    inputTokens: number,
    outputTokens: number,
    prompt: string,
    text: string
  ): UsageSummary {
    const normalizedInput = inputTokens > 0 ? inputTokens : this.estimateTokens(prompt);
    const normalizedOutput = outputTokens > 0 ? outputTokens : this.estimateTokens(text);
    return {
      inputTokens: normalizedInput,
      outputTokens: normalizedOutput,
      totalTokens: normalizedInput + normalizedOutput,
      estimatedCostUsd: this.estimateCostUsd(routedModel.label, normalizedInput, normalizedOutput),
      model: routedModel.label,
      provider: routedModel.provider,
    };
  }

  private static estimateTokens(text: string) {
    return Math.max(1, Math.ceil(String(text || '').length / 4));
  }

  private static estimateCostUsd(model: SupportedModelId, inputTokens: number, outputTokens: number) {
    const pricing =
      model === 'GPT-5.4 Mini'
        ? { inputPerMillion: 5, outputPerMillion: 15 }
        : model === 'Claude 3.5'
          ? { inputPerMillion: 3, outputPerMillion: 15 }
          : { inputPerMillion: 0.27, outputPerMillion: 1.1 };

    return Number(
      (
        (inputTokens / 1_000_000) * pricing.inputPerMillion +
        (outputTokens / 1_000_000) * pricing.outputPerMillion
      ).toFixed(6)
    );
  }
}
