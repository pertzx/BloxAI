import { ModelRegistry } from '../services/ModelRegistry.js';

export class ModelRouter {
  // Modelos disponíveis = os habilitados pelo admin cujo provedor tem chave no .env.
  static getAvailableModels() {
    const labels = ModelRegistry.availableLabels();
    return labels.length > 0 ? labels : (ModelRegistry.defaultLabel() ? [ModelRegistry.defaultLabel()] : []);
  }

  static async generateResponse(
    prompt,
    modelOrOptions = 'DeepSeek-V3',
    systemPrompt = 'Você é um assistente de IA focado em desenvolvimento para Roblox Studio.'
  ) {
    const options =
      typeof modelOrOptions === 'string'
        ? { model: modelOrOptions, systemPrompt }
        : { ...modelOrOptions, systemPrompt: modelOrOptions.systemPrompt || systemPrompt };

    const preferred = this.normalizePreferredModel(options.model) || ModelRegistry.defaultLabel() || 'DeepSeek-V3';
    const chain = this.buildModelFallbackChain(preferred);
    let lastError = null;

    for (let idx = 0; idx < chain.length; idx += 1) {
      const routedModel = this.resolveModelLabel(chain[idx]);
      if (idx === 0) console.log(`[ModelRouter] Roteando para: ${routedModel.label} (${routedModel.provider})`);
      else console.warn(`[ModelRouter] Fallback → ${routedModel.label} (anterior falhou)`);

      try {
        if (routedModel.kind === 'anthropic') {
          return await this.callAnthropic(
            process.env[routedModel.envKey],
            routedModel.apiModel,
            prompt,
            options.systemPrompt || systemPrompt,
            options.maxTokens,
            options.temperature
          );
        }

        return await this.callOpenAICompatible(
          routedModel.baseUrl,
          process.env[routedModel.envKey],
          routedModel.apiModel,
          prompt,
          options.systemPrompt || systemPrompt,
          options.maxTokens,
          options.temperature
        );
      } catch (error) {
        lastError = error;
        console.error(`[ModelRouter] ${routedModel.label} falhou: ${error.message}`);
      }
    }

    return {
      success: false,
      text: `[Erro de IA] Nenhum modelo respondeu. Verifique as chaves de API. Detalhe: ${lastError?.message || 'desconhecido'}`,
      model: preferred,
      usage: this.buildUsageSummary(this.resolveModelLabel(preferred), 0, 0, prompt, ''),
    };
  }

  // Seleção de modelo por estágio. Com o registro dinâmico, usamos o modelo
  // escolhido pelo usuário (se disponível) ou o padrão configurado pelo admin.
  static selectModel(options = {}) {
    const preferred = this.normalizePreferredModel(options.preferredModel);
    if (preferred) return preferred;
    return ModelRegistry.defaultLabel() || this.getAvailableModels()[0] || 'DeepSeek-V3';
  }

  // Retorna o label canônico se o modelo existir/estiver disponível no registro.
  static normalizePreferredModel(model) {
    if (!model) return null;
    const found = ModelRegistry.findByLabel(model);
    return found ? found.label : null;
  }

  // Resolve um label para { label, provider, kind, apiModel, baseUrl, envKey, pricing }.
  static resolveModelLabel(model) {
    return ModelRegistry.resolve(model);
  }

  /**
   * Cadeia de fallback: tenta o modelo preferido primeiro e, se falhar (chave
   * ausente, modelo inválido, timeout), cai para os demais modelos com chave
   * configurada. Evita que um único modelo quebrado derrube toda a resposta.
   */
  static buildModelFallbackChain(preferredLabel) {
    const available = this.getAvailableModels();
    const chain = [];
    if (preferredLabel) chain.push(preferredLabel);
    for (const label of available) {
      if (!chain.includes(label)) chain.push(label);
    }
    return chain.length > 0 ? chain : [preferredLabel || 'DeepSeek-V3'];
  }

  // ─── Streaming ────────────────────────────────────────────────────────────────

  /**
   * Chama o modelo com streaming habilitado. Invoca `onToken(delta)` para cada
   * pedaço de texto recebido e retorna o resultado completo ao final.
   */
  static async generateResponseStream(prompt, modelOrOptions = 'DeepSeek-V3', onToken) {
    const options =
      typeof modelOrOptions === 'string'
        ? { model: modelOrOptions }
        : { ...modelOrOptions };

    const preferred = this.normalizePreferredModel(options.model) || ModelRegistry.defaultLabel() || 'DeepSeek-V3';
    const chain = this.buildModelFallbackChain(preferred);
    const systemPrompt = options.systemPrompt || 'Você é um assistente de IA focado em desenvolvimento para Roblox Studio.';
    let lastError = null;
    let streamedAny = false;
    const guardedOnToken = (token) => {
      streamedAny = true;
      if (typeof onToken === 'function') return onToken(token);
    };

    for (let idx = 0; idx < chain.length; idx += 1) {
      const routedModel = this.resolveModelLabel(chain[idx]);
      if (idx === 0) console.log(`[ModelRouter] Stream para: ${routedModel.label} (${routedModel.provider})`);
      else console.warn(`[ModelRouter] Fallback de stream → ${routedModel.label}`);

      try {
        if (routedModel.kind === 'anthropic') {
          return await this.streamAnthropic(
            process.env[routedModel.envKey],
            routedModel.apiModel,
            prompt,
            systemPrompt,
            options.maxTokens,
            options.temperature,
            guardedOnToken
          );
        }

        return await this.streamOpenAICompatible(
          routedModel.baseUrl,
          process.env[routedModel.envKey],
          routedModel.apiModel,
          prompt,
          systemPrompt,
          options.maxTokens,
          options.temperature,
          guardedOnToken
        );
      } catch (error) {
        lastError = error;
        console.error(`[ModelRouter] stream ${routedModel.label} falhou: ${error.message}`);
        // Não dá para trocar de modelo no meio de um stream já iniciado.
        if (streamedAny) break;
      }
    }

    return {
      success: false,
      text: `[Erro de Stream AI] Nenhum modelo respondeu. Detalhe: ${lastError?.message || 'desconhecido'}`,
      model: preferred,
      usage: this.buildUsageSummary(this.resolveModelLabel(preferred), 0, 0, prompt, ''),
    };
  }

  static async streamOpenAICompatible(url, apiKey, modelName, prompt, systemPrompt, maxTokens = 8000, temperature = 0.2, onToken) {
    if (!apiKey) throw new Error(`API Key faltando para streaming (${modelName})`);

    const body = {
      model: modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: temperature ?? 0.2,
      stream: true,
      stream_options: { include_usage: true },
    };
    if (modelName.startsWith('gpt-5')) {
      body.max_completion_tokens = maxTokens ?? 8000;
    } else {
      body.max_tokens = maxTokens ?? 8000;
      delete body.stream_options;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180000),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`API Error (stream): ${err}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let finishReason = null;
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      const lines = buf.split('\n');
      buf = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const raw = trimmed.slice(5).trim();
        if (raw === '[DONE]') continue;
        try {
          const parsed = JSON.parse(raw);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            fullText += delta;
            if (typeof onToken === 'function') await onToken(delta);
          }
          if (parsed.choices?.[0]?.finish_reason) {
            finishReason = parsed.choices[0].finish_reason;
          }
          if (parsed.usage) {
            inputTokens = parsed.usage.prompt_tokens || 0;
            outputTokens = parsed.usage.completion_tokens || 0;
          }
        } catch {}
      }
    }

    const routedModel = this.resolveModelLabel(modelName);
    return {
      success: true,
      text: fullText,
      model: routedModel.label,
      finishReason,
      truncated: finishReason === 'length',
      usage: this.buildUsageSummary(routedModel, inputTokens, outputTokens, prompt, fullText),
    };
  }

  static async streamAnthropic(apiKey, modelName, prompt, systemPrompt, maxTokens = 2200, temperature = 0.2, onToken) {
    if (!apiKey) throw new Error('API Key faltando para Anthropic (stream)');

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
        max_tokens: maxTokens ?? 2200,
        temperature: temperature ?? 0.2,
        stream: true,
      }),
      signal: AbortSignal.timeout(180000),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`API Error (Anthropic stream): ${err}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let stopReason = null;
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      const lines = buf.split('\n');
      buf = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const raw = trimmed.slice(5).trim();
        try {
          const parsed = JSON.parse(raw);
          if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
            const delta = parsed.delta.text || '';
            if (delta) {
              fullText += delta;
              if (typeof onToken === 'function') await onToken(delta);
            }
          }
          if (parsed.type === 'message_delta') {
            if (parsed.usage) outputTokens = parsed.usage.output_tokens || 0;
            if (parsed.delta?.stop_reason) stopReason = parsed.delta.stop_reason;
          }
          if (parsed.type === 'message_start' && parsed.message?.usage) {
            inputTokens = parsed.message.usage.input_tokens || 0;
          }
        } catch {}
      }
    }

    const routedModel = this.resolveModelLabel(modelName);
    return {
      success: true,
      text: fullText,
      model: this.resolveModelLabel(modelName).label,
      finishReason: stopReason,
      truncated: stopReason === 'max_tokens',
      usage: this.buildUsageSummary(routedModel, inputTokens, outputTokens, prompt, fullText),
    };
  }

  // ──────────────────────────────────────────────────────────────────────────────

  static async callOpenAICompatible(url, apiKey, modelName, prompt, systemPrompt, maxTokens = 8000, temperature = 0.2) {
    if (!apiKey) throw new Error(`API Key faltando para ${modelName}`);

    const requestBody = {
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
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`API Error: ${err}`);
    }

    const data = await response.json();
    const outputText = data.choices?.[0]?.message?.content || '';
    const finishReason = data.choices?.[0]?.finish_reason || null;
    return {
      success: true,
      text: outputText,
      model: this.resolveModelLabel(modelName).label,
      finishReason,
      truncated: finishReason === 'length',
      usage: this.buildUsageSummary(
        this.resolveModelLabel(modelName),
        Number(data?.usage?.prompt_tokens || 0),
        Number(data?.usage?.completion_tokens || 0),
        prompt,
        outputText
      ),
    };
  }

  static async callAnthropic(apiKey, modelName, prompt, systemPrompt, maxTokens = 2200, temperature = 0.2) {
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
      signal: AbortSignal.timeout(120000),
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
      model: this.resolveModelLabel(modelName).label,
      finishReason: data?.stop_reason || null,
      truncated: data?.stop_reason === 'max_tokens',
      usage: this.buildUsageSummary(
        this.resolveModelLabel(modelName),
        Number(data?.usage?.input_tokens || 0),
        Number(data?.usage?.output_tokens || 0),
        prompt,
        outputText
      ),
    };
  }

  static buildUsageSummary(routedModel, inputTokens, outputTokens, prompt, text) {
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

  static estimateTokens(text) {
    return Math.max(1, Math.ceil(String(text || '').length / 4));
  }

  // Pricing vem do registro (configurado pelo admin por modelo). Fallback conservador.
  static estimateCostUsd(model, inputTokens, outputTokens) {
    const resolved = ModelRegistry.resolve(model);
    const inputPerMillion = Number(resolved?.inputPer1M) > 0 ? Number(resolved.inputPer1M) : 1;
    const outputPerMillion = Number(resolved?.outputPer1M) > 0 ? Number(resolved.outputPer1M) : 3;

    return Number(
      (
        (inputTokens / 1_000_000) * inputPerMillion +
        (outputTokens / 1_000_000) * outputPerMillion
      ).toFixed(6)
    );
  }
}
