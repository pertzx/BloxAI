import { ModelRouter } from './ModelRouter.js';

const PLUGIN_DOC_CAPSULE = `
Blox AI plugin documentation capsule:
- The plugin is not a chatbot. It is the local executor and sensor inside Roblox Studio.
- The plugin sees the current DataModel snapshot and executes structured commands one by one.
- The plugin must be treated as the master executor of the Roblox project when the user asks for a change.
- The plugin consumes one command at a time from the backend queue, reports result, then fetches the next command.
- The AI should return executable Luau source directly as the primary execution format whenever possible.
- JSON with action/payload and legacy plugin_call are only compatibility fallbacks for cases where free source cannot be represented safely otherwise.
- The AI is allowed to create scripts, edit script source, create parts, create instances, reorganize hierarchy, and generate full systems through the command it returns.
- The AI should behave like the owner of the workspace execution flow, not like a tutor explaining what the user should do manually.
- Preferred free execution format:
  {"executionId":1,"source":"local p = Instance.new('Part')\\np.Anchored = true\\np.Position = Vector3.new(0,5,0)\\np.Parent = workspace"}
- Prefer a single executionId with one self-contained Luau source whenever the task can be completed in one script.
- When using Luau source, always finish with a return summary table, for example:
  return { ok = true, summary = "Created 1 part", created = { "workspace.Part" } }
- Luau generation safety rules:
  - If the code creates another Script, LocalScript or ModuleScript and assigns '.Source', NEVER use a normal quoted multiline string for that embedded source.
  - Always use Lua long brackets like '[=[ ... ]=]' for embedded script source, or build the source with 'table.concat'.
  - Before finalizing, mentally verify all quotes, parentheses, brackets and 'function/end' pairs.
  - Do not leave unterminated strings, unterminated function calls or truncated blocks.
- The backend keeps manual approval before execution and preserves raw previews.
- The AI must return structured output in JSON and only mention execution references using executionId:X.
- The AI should use the explorer only as context for better execution decisions, not as filler.
`.trim();

export class AgentOrchestrator {
  static async processUserIntent(intent, context = {}) {
    this.logDebug('intent:start', {
      intentLength: String(intent || '').length,
      mode: context.preferredExecutionMode || 'instant',
      preferredModel: context.preferredModel || null,
    });

    const intentProfile = this.classifyIntent(intent);
    if (context.preferredExecutionMode === 'instant') {
      intentProfile.executionMode = 'fast';
      intentProfile.reason += ', userMode=instant';
    } else if (context.preferredExecutionMode === 'think') {
      intentProfile.executionMode = 'deep';
      intentProfile.reason += ', userMode=think';
    }

    const selectedModels = this.selectModels(intentProfile, context.preferredModel);
    const thinkSelection = await this.runThinkSelection(intent, context, intentProfile, selectedModels.think);
    const telemetryStages = [];
    const compactContext = this.buildCompactContext(intent, context, intentProfile, thinkSelection);

    if (intentProfile.responseType === 'conversation') {
      const replyPrompt = [
        `Pedido do usuario: ${intent}`,
        'Responda de forma natural, curta, útil e amigável. Não trate isso como comando a executar.',
        PLUGIN_DOC_CAPSULE,
        compactContext.summary,
      ].join('\n\n');

      const reply = await ModelRouter.generateResponse(replyPrompt, {
        model: selectedModels.generate,
        systemPrompt:
          'Você é um assistente conversacional para um painel de IA de desenvolvimento. Responda como chat natural, sem falar de fila, execução ou comandos se o usuário só estiver conversando. Responda cobrindo todos os pontos explicitos do pedido do usuario, sem ignorar subpedidos.',
        maxTokens: 420,
        temperature: 0.3,
      });
      this.pushUsageTelemetry(telemetryStages, 'conversation', reply);

      return {
        protocol: 'BloxAI Context Router v2',
        status: 'Completed',
        taskType: intentProfile.taskType,
        executionMode: intentProfile.executionMode,
        riskLevel: intentProfile.riskLevel,
        responseType: intentProfile.responseType,
        thinking: {
          supportedByProtocol: true,
          mode: intentProfile.executionMode,
          uiSupport: false,
          note: 'O backend suporta profundidade de raciocínio por modo fast/deep, mas a UI atual não expõe um controle de thinking nem mostra etapas internas dedicadas.',
        },
        selectedAgents: [{ role: 'assistant', model: selectedModels.generate }],
        contextSummary: compactContext.summary,
        contextBudget: compactContext.budget,
        telemetry: this.finalizeUsageTelemetry(telemetryStages),
        plan: thinkSelection.reason,
        commands: '',
        review: '',
        reply: reply.text,
        structuredResponse: this.buildStructuredResponse(reply.text, []),
        routingReason: `${intentProfile.reason}, think=${thinkSelection.reason}`,
        executableCommands: [],
        shouldQueueCommands: false,
      };
    }

    if (intentProfile.responseType === 'analysis' && context.preferredExecutionMode === 'think') {
      const analysisPrompt = [
        `Pedido do usuario: ${intent}`,
        `Tipo: ${intentProfile.taskType}`,
        `Modo: ${intentProfile.executionMode}`,
        'Responda como analista tecnico do projeto. Analise, planeje e explique a melhor direcao sem gerar execucoes e sem agir como se ja fosse aplicar algo.',
        'Se houver varios pontos no pedido, cubra todos de forma objetiva e completa.',
        'Nao devolva executions nesse modo.',
        PLUGIN_DOC_CAPSULE,
        compactContext.summary,
      ].join('\n\n');

      const analysis = await ModelRouter.generateResponse(analysisPrompt, {
        model: selectedModels.generate,
        systemPrompt:
          'Você é um agente analitico do Blox AI. Quando o pedido for de analise, planejamento, revisao ou explicacao, responda em texto normal, sem gerar executions, sem fila e sem proposta de aprovacao.',
        maxTokens: intentProfile.executionMode === 'deep' ? 5000 : 700,
        temperature: intentProfile.executionMode === 'deep' ? 0.4 : 0.2,
      });
      this.pushUsageTelemetry(telemetryStages, 'analysis', analysis);

      return {
        protocol: 'BloxAI Context Router v2',
        status: 'Completed',
        taskType: intentProfile.taskType,
        executionMode: intentProfile.executionMode,
        riskLevel: intentProfile.riskLevel,
        responseType: intentProfile.responseType,
        thinking: {
          supportedByProtocol: true,
          mode: intentProfile.executionMode,
          uiSupport: true,
          note: 'Resposta analitica concluida sem gerar execucoes.',
        },
        selectedAgents: [{ role: 'analyst', model: selectedModels.generate }],
        contextSummary: compactContext.summary,
        contextBudget: compactContext.budget,
        telemetry: this.finalizeUsageTelemetry(telemetryStages),
        plan: thinkSelection.reason,
        commands: '',
        review: '',
        reply: analysis.text,
        structuredResponse: this.buildStructuredResponse(analysis.text, []),
        routingReason: `${intentProfile.reason}, think=${thinkSelection.reason}, analysisMode=true`,
        executableCommands: [],
        shouldQueueCommands: false,
      };
    }

    const localExecution = this.tryBuildLocalExecutionPlan(intent, context, intentProfile);
    if (localExecution) {
      const structuredResponse = this.buildStructuredResponse(localExecution.reply, localExecution.executions);
      return {
        protocol: 'BloxAI Context Router v2',
        status: 'Ready to Queue',
        taskType: intentProfile.taskType,
        executionMode: intentProfile.executionMode,
        riskLevel: intentProfile.riskLevel,
        responseType: intentProfile.responseType,
        thinking: {
          supportedByProtocol: true,
          mode: intentProfile.executionMode,
          uiSupport: false,
          note: 'Pedido reconhecido como construcao simples. O backend gerou source livre localmente para manter contexto e reduzir custo.',
        },
        selectedAgents: [{ role: 'local-executor-planner', model: 'deterministic-local' }],
        contextSummary: compactContext.summary,
        contextBudget: compactContext.budget,
        telemetry: this.finalizeUsageTelemetry(telemetryStages),
        plan: `${thinkSelection.reason} | ${localExecution.plan}`,
        commands: JSON.stringify(localExecution.executableCommands),
        review: 'Revisão curta: execucao unica, contexto preservado e mudancas geradas diretamente pelo agente no projeto.',
        reply: structuredResponse.message,
        structuredResponse,
        routingReason: `${intentProfile.reason}, think=${thinkSelection.reason}, localExecution=true`,
        executableCommands: localExecution.executableCommands,
        shouldQueueCommands: true,
      };
    }

    const generatorPrompt = this.buildGeneratorPrompt(intent, compactContext, intentProfile, thinkSelection);
    const generation = await ModelRouter.generateResponse(generatorPrompt, {
      model: selectedModels.generate,
      systemPrompt:
        'Você é o agente executor mestre do Blox AI. Responda em JSON puro no formato {"message":"texto","executions":[{"executionId":1,"source":"conteudo"}]}. O formato principal da execution deve ser source livre em Luau, auto contido e pronto para executar. Prefira uma única execution com um único source em Luau quando der para resolver a tarefa inteira sem perder contexto. Use esse source para criar scripts, editar scripts, criar elementos, instancias, partes e sistemas completos quando o pedido exigir. Se usar Luau, o source deve terminar com return de uma tabela resumo verificável. Se o source criar outro Script/LocalScript/ModuleScript e atribuir .Source, use obrigatoriamente long brackets [=[...]=] ou table.concat para o source embutido, nunca string multiline comum entre aspas. Antes de finalizar, confira mentalmente aspas, parenteses, brackets e blocos function/end. So use JSON com action/payload ou legacy plugin_call como fallback de compatibilidade, nao como formato principal. Na message, mencione execuções apenas como executionId:X. Cubra todos os itens explicitos do pedido do usuario e nao entregue resposta curta demais quando houver varios requisitos.',
      maxTokens: intentProfile.executionMode === 'deep' ? 5000 : 1800,
      temperature: intentProfile.executionMode === 'deep' ? 0.4 : 0.2,
    });
    this.pushUsageTelemetry(telemetryStages, 'generate', generation);
    this.logDebug('generate:raw-response', {
      textLength: String(generation.text || '').length,
      textPreview: this.previewText(generation.text, 500),
    });
    const generationEnvelopeIssue = this.detectMalformedStructuredEnvelope(generation.text);
    if (generationEnvelopeIssue) {
      this.logDebug('generate:envelope-issue', generationEnvelopeIssue);
    }

    const generatedStructuredResponse = this.parseStructuredResponse(generation.text);
    this.logStructuredResponseDebug('generate:parsed-response', generatedStructuredResponse);
    const repairedStructuredResponse = await this.rethinkAndRepairResponse(
      intent,
      compactContext,
      intentProfile,
      generatedStructuredResponse,
      generation.text,
      selectedModels.review,
      telemetryStages,
      generationEnvelopeIssue?.reason || ''
    );
    const expectsExecution =
      intentProfile.taskType === 'roblox_code' ||
      intentProfile.executionMode === 'direct' ||
      intentProfile.responseType === 'proposal';
    const structuredResponse = this.ensureExecutionFallback(
      repairedStructuredResponse || generatedStructuredResponse,
      generation.text,
      expectsExecution
    );
    this.logStructuredResponseDebug('response:after-fallback', structuredResponse);
    const validatedStructuredResponse = await this.runPreflightValidation(
      intent,
      compactContext,
      intentProfile,
      structuredResponse,
      selectedModels.review,
      telemetryStages,
      expectsExecution
    );
    const finalStructuredResponse = validatedStructuredResponse || structuredResponse;
    this.logStructuredResponseDebug('response:final', finalStructuredResponse);
    const executableCommands = this.compileExecutionsToCommands(finalStructuredResponse.executions);
    this.logExecutableCommandsDebug('commands:compiled', executableCommands);

    if (expectsExecution && executableCommands.length === 0) {
      const fallbackExecutions =
        finalStructuredResponse.executions.length > 0
          ? finalStructuredResponse.executions
          : [
              {
                executionId: 1,
                source: this.limit(generation.text || finalStructuredResponse.message || 'Sem conteúdo bruto disponível.', 5000),
              },
            ];

      return {
        protocol: 'BloxAI Context Router v2',
        status: 'Execution Preview Failed',
        taskType: intentProfile.taskType,
        executionMode: intentProfile.executionMode,
        riskLevel: intentProfile.riskLevel,
        responseType: intentProfile.responseType,
        thinking: {
          supportedByProtocol: true,
          mode: intentProfile.executionMode,
          uiSupport: false,
          note: 'A IA respondeu, mas o backend nao conseguiu transformar a saida em uma execucao valida para aprovacao.',
        },
        selectedAgents: [
          { role: 'think-selector', model: selectedModels.think },
          { role: 'generator', model: selectedModels.generate },
          { role: 'reviewer-repair', model: selectedModels.review },
        ],
        contextSummary: compactContext.summary,
        contextBudget: compactContext.budget,
        telemetry: this.finalizeUsageTelemetry(telemetryStages),
        plan: thinkSelection.reason,
        commands: '',
        review: 'Falha de compilação: a resposta da IA não virou uma execucao valida. O preview bruto foi preservado para inspeção.',
        reply: 'Nao consegui gerar uma execucao valida para este pedido. Revise o preview abaixo.',
        structuredResponse: this.buildStructuredResponse(
          'Nao consegui gerar uma execucao valida para este pedido. Revise o preview abaixo.',
          fallbackExecutions
        ),
        routingReason: `${intentProfile.reason}, think=${thinkSelection.reason}, compileFailed=true`,
        executableCommands: [],
        shouldQueueCommands: false,
      };
    }

    return {
      protocol: 'BloxAI Context Router v2',
      status: 'Ready to Queue',
      taskType: intentProfile.taskType,
      executionMode: intentProfile.executionMode,
      riskLevel: intentProfile.riskLevel,
      responseType: intentProfile.responseType,
      thinking: {
        supportedByProtocol: true,
        mode: intentProfile.executionMode,
        uiSupport: false,
        note: 'O backend agora usa think seletivo sem explorer, depois gera a execução com contexto filtrado, repensa e corrige antes de entregar.',
      },
      selectedAgents: [
        { role: 'think-selector', model: selectedModels.think },
        { role: 'generator', model: selectedModels.generate },
        { role: 'reviewer-repair', model: selectedModels.review },
      ],
      contextSummary: compactContext.summary,
      contextBudget: compactContext.budget,
      telemetry: this.finalizeUsageTelemetry(telemetryStages),
      plan: thinkSelection.reason,
      commands: JSON.stringify(executableCommands),
      review: validatedStructuredResponse
        ? 'Resposta revisada, corrigida e validada em preflight antes da entrega.'
        : repairedStructuredResponse
          ? 'Resposta revisada e corrigida antes da entrega.'
          : 'Resposta validada sem correção adicional.',
      reply: finalStructuredResponse.message,
      structuredResponse: finalStructuredResponse,
      routingReason: `${intentProfile.reason}, think=${thinkSelection.reason}`,
      executableCommands,
      shouldQueueCommands: executableCommands.length > 0,
    };
  }

  static classifyIntent(intent) {
    const normalized = String(intent || '').toLowerCase();
    const hasUi =
      normalized.includes('ui') ||
      normalized.includes('dashboard') ||
      normalized.includes('layout') ||
      normalized.includes('responsiv') ||
      normalized.includes('tailwind');
    const hasDebug =
      normalized.includes('erro') ||
      normalized.includes('bug') ||
      normalized.includes('debug') ||
      normalized.includes('exception') ||
      normalized.includes('stack');
    const hasReview =
      normalized.includes('segurança') ||
      normalized.includes('security') ||
      normalized.includes('review') ||
      normalized.includes('permiss') ||
      normalized.includes('vulnerab');
    const hasArchitecture =
      normalized.includes('arquitet') ||
      normalized.includes('protocolo') ||
      normalized.includes('fluxo') ||
      normalized.includes('agent') ||
      normalized.includes('modelo');
    const hasRoblox =
      normalized.includes('roblox') ||
      normalized.includes('luau') ||
      normalized.includes('localscript') ||
      normalized.includes('modulescript') ||
      normalized.includes('script');
    const hasBuildIntent =
      normalized.includes('cria') ||
      normalized.includes('crie') ||
      normalized.includes('gera') ||
      normalized.includes('faça') ||
      normalized.includes('fazer') ||
      normalized.includes('construa') ||
      normalized.includes('construir') ||
      normalized.includes('adicione') ||
      normalized.includes('adiciona') ||
      normalized.includes('insira') ||
      normalized.includes('coloque');

    const isGreeting = /^(oi|ola|olá|e ai|e aí|bom dia|boa tarde|boa noite|hello|hi|hey)\b/.test(normalized.trim());
    const isShortConversation =
      normalized.trim().length <= 40 &&
      (isGreeting ||
        normalized.includes('tudo bem') ||
        normalized.includes('como vai') ||
        normalized.includes('quem é você'));
    const hasExplicitAnalysisIntent =
      normalized.includes('analise') ||
      normalized.includes('analisar') ||
      normalized.includes('análise') ||
      normalized.includes('explique') ||
      normalized.includes('explica') ||
      normalized.includes('planeje') ||
      normalized.includes('planejar') ||
      normalized.includes('me diga') ||
      normalized.includes('o que acha') ||
      normalized.includes('avalie') ||
      normalized.includes('avaliar');

    let taskType = 'generic';
    if (hasDebug) taskType = 'debug';
    else if (hasReview) taskType = 'review';
    else if (hasArchitecture) taskType = 'architecture';
    else if (hasUi) taskType = 'ui_frontend';
    else if (hasRoblox || hasBuildIntent) taskType = 'roblox_code';
    else taskType = 'analysis';

    const riskLevel =
      hasReview || normalized.includes('auth') || normalized.includes('token') || normalized.includes('api')
        ? 'high'
        : hasDebug || hasArchitecture
          ? 'medium'
          : 'low';

    const executionMode =
      normalized.length > 320 ||
      hasArchitecture ||
      hasDebug ||
      normalized.includes('completo') ||
      normalized.includes('100%')
        ? 'deep'
        : 'fast';

    const responseType = isShortConversation
      ? 'conversation'
      : hasBuildIntent
        ? 'proposal'
        : taskType === 'analysis' || taskType === 'generic' || hasExplicitAnalysisIntent
          ? 'analysis'
          : 'proposal';

    return {
      taskType,
      riskLevel,
      executionMode,
      responseType,
      requiresReview: riskLevel === 'high',
      reason: `task=${taskType}, risk=${riskLevel}, mode=${executionMode}, response=${responseType}`,
    };
  }

  static buildCompactContext(intent, context, intentProfile, explorerSelection) {
    const recentHistory = (context.recentCommands || [])
      .slice(-6)
      .map((entry, index) => {
        const message = this.limit(entry.message || '', 220);
        const plan = this.limit(entry.plan || '', 180);
        const result = this.limit(entry.result || '', 180);
        return `${index + 1}. role=${entry.role || 'unknown'} status=${entry.status || '-'} model=${entry.model || '-'} msg="${message}" plan="${plan}" result="${result}"`;
      })
      .join('\n');

    const projectSummary = [
      context.project?.name ? `Projeto: ${context.project.name}` : '',
      context.project?.placeId ? `PlaceId: ${context.project.placeId}` : '',
      context.project?.status ? `Studio: ${context.project.status}` : '',
      typeof context.project?.rootCount === 'number' ? `Raizes: ${context.project.rootCount}` : '',
      typeof context.project?.totalNodeCount === 'number' ? `TotalNodes: ${context.project.totalNodeCount}` : '',
      context.project?.selectedNodePath ? `NodeSelecionado: ${context.project.selectedNodePath}` : '',
      context.project?.selectedNodeClassName ? `TipoNode: ${context.project.selectedNodeClassName}` : '',
      context.project?.selectedNodeSummary ? `ResumoNode: ${this.limit(context.project.selectedNodeSummary, 260)}` : '',
      context.project?.selectedScriptSummary ? `ResumoScript: ${this.limit(context.project.selectedScriptSummary, 260)}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const explorerContext = this.buildFilteredExplorerContext(
      context.project?.workspaceNodes || [],
      explorerSelection,
      context.project?.selectedNodePath || null
    );

    const attachmentSummary = this.extractAttachmentSummary(intent);
    const summary = [
      `Perfil: ${intentProfile.reason}`,
      `ThinkExplorer: ${explorerSelection.reason}`,
      attachmentSummary ? `Anexos: ${attachmentSummary}` : '',
      projectSummary,
      explorerContext ? `ExplorerSelecionado:\n${explorerContext}` : 'ExplorerSelecionado: nao enviado',
      recentHistory ? `HistoricoRecente:\n${recentHistory}` : 'HistoricoRecente: vazio',
    ]
      .filter(Boolean)
      .join('\n\n');

    return {
      summary,
      budget: {
        recentMessages: Math.min((context.recentCommands || []).length, 6),
        summaryChars: summary.length,
        attachmentCount: attachmentSummary ? attachmentSummary.split(';').length : 0,
        explorerChars: explorerContext.length,
      },
    };
  }

  static selectModels(intentProfile, preferredModel) {
    return {
      think: ModelRouter.selectModel({
        preferredModel,
        taskType: intentProfile.taskType,
        executionMode: 'fast',
        riskLevel: 'low',
        stage: 'classify',
      }),
      generate: ModelRouter.selectModel({
        preferredModel,
        taskType: intentProfile.taskType,
        executionMode: intentProfile.executionMode,
        riskLevel: intentProfile.riskLevel,
        stage: 'generate',
      }),
      review: ModelRouter.selectModel({
        preferredModel,
        taskType: 'review',
        executionMode: 'deep',
        riskLevel: intentProfile.riskLevel,
        stage: 'review',
      }),
    };
  }

  static buildGeneratorPrompt(intent, compactContext, intentProfile, explorerSelection) {
    return [
      `Pedido do usuario: ${intent}`,
      `Tipo: ${intentProfile.taskType}`,
      `ThinkExplorer: ${explorerSelection.reason}`,
      PLUGIN_DOC_CAPSULE,
      'Responda como agente independente, mestre do projeto e em controle do ambiente.',
      'Se o pedido for executável, devolva diretamente as execuções necessárias. Não transforme isso em tutorial passo a passo para o usuário.',
      'A resposta final deve ser operacional: o que sera feito e quais executions representam isso.',
      'O agente deve priorizar source livre em Luau como formato principal da execution. So use comando JSON com action/payload ou legacy plugin_call como fallback interno de compatibilidade. Prefira uma unica execution com um unico source Luau auto contido quando isso for suficiente. Use isso para criar e editar scripts, criar elementos e instancias, reorganizar objetos e montar sistemas completos. Se o source criar scripts internos, atribua `.Source` com long brackets [=[...]=] ou table.concat, nunca com string multiline comum. O backend exige aprovacao manual antes de executar.',
      'A resposta inteira deve ser JSON valido estrito. Escape corretamente aspas, barras e quebras de linha dentro de `source`.',
      'Se o source ficar grande, mantenha `message` curta para reduzir risco de JSON malformado.',
      'Resolva todos os pontos explicitos do pedido do usuario. Se houver varios subpedidos, a message deve resumir cada um de forma curta, clara e completa.',
      compactContext.summary,
    ].join('\n\n');
  }

  static async runThinkSelection(intent, context, intentProfile, thinkModel) {
    const prompt = [
      'Analise o pedido e decida qual parte do explorer seria realmente necessaria para responder com alta qualidade e baixo custo.',
      'Nao receba o explorer agora. Decida apenas a selecao.',
      'Responda somente em JSON puro no formato:',
      '{"needExplorer":true,"includeAll":false,"includePaths":["Workspace.Part"],"includeClasses":["Script"],"includeChildrenDepth":2,"includeParentChain":true,"includeScriptSource":false,"reason":"motivo curto"}',
      `Pedido do usuario: ${intent}`,
      `TaskType: ${intentProfile.taskType}`,
      `Modo: ${intentProfile.executionMode}`,
      `Projeto: ${context.project?.name || '-'}`,
      `PlaceId: ${context.project?.placeId || '-'}`,
      `Node selecionado: ${context.project?.selectedNodePath || '-'}`,
      PLUGIN_DOC_CAPSULE,
    ].join('\n\n');

    const response = await ModelRouter.generateResponse(prompt, {
      model: thinkModel,
      systemPrompt:
        'Você é um selector de contexto. Sua única função é retornar JSON curto dizendo qual parte do explorer vale a pena enviar ao agente executor. Nunca peça todo o explorer sem necessidade.',
      maxTokens: 260,
      temperature: 0.1,
    });

    return this.parseExplorerSelection(response.text, context.project?.selectedNodePath || null);
  }

  static async rethinkAndRepairResponse(
    intent,
    compactContext,
    intentProfile,
    structuredResponse,
    rawGeneration,
    reviewModel,
    telemetryStages,
    forceRepairReason = ''
  ) {
    const expectsExecution =
      intentProfile.taskType === 'roblox_code' ||
      intentProfile.executionMode === 'direct' ||
      intentProfile.responseType === 'proposal';
    const primaryResponseLooksUsable =
      Boolean(structuredResponse.message.trim()) &&
      (!expectsExecution || structuredResponse.executions.length > 0);
    const shouldTrustPrimaryResponseInInstant =
      intentProfile.executionMode !== 'deep' &&
      primaryResponseLooksUsable &&
      !forceRepairReason;

    if (shouldTrustPrimaryResponseInInstant) {
      this.logDebug('repair:skipped-instant-primary-valid', {
        messageLength: structuredResponse.message.trim().length,
        executionCount: structuredResponse.executions.length,
      });
      return null;
    }

    const needsRepair =
      !structuredResponse.message.trim() ||
      (expectsExecution && structuredResponse.executions.length === 0) ||
      (intent.length > 90 && structuredResponse.message.trim().length < 48) ||
      Boolean(forceRepairReason);

    if (!needsRepair) return null;

    const prompt = [
      `Pedido do usuario: ${intent}`,
      `Tipo: ${intentProfile.taskType}`,
      PLUGIN_DOC_CAPSULE,
      'Revise e corrija a resposta do executor.',
      'Use a resposta parseada da primeira camada como base canonica.',
      'Mantenha exatamente o mesmo formato estrutural: {"message":"texto","executions":[{"executionId":1,"source":"conteudo"}]}.',
      'Se a primeira camada ja trouxe uma execution valida, preserve a mesma ideia, o mesmo executionId e a mesma estrutura geral, alterando apenas o que for necessario para corrigir.',
      'Devolva uma message nova explicando de forma objetiva o que foi corrigido e o que a execucao agora entrega.',
      forceRepairReason ? `Problema detectado na resposta atual: ${forceRepairReason}` : '',
      forceRepairReason
        ? 'A resposta anterior ficou em JSON malformado ou envelope inseguro. Reemita tudo em JSON valido estrito, sem pseudo-JSON e sem cortar o source.'
        : '',
      'Se for uma acao executavel, devolva JSON com executions validas.',
      'Prefira consolidar tudo em uma unica execution com um unico source Luau livre e return final verificavel quando isso for possivel.',
      'Se o source criar scripts e atribuir `.Source`, use long brackets [=[...]=] ou table.concat no source embutido.',
      'Mantenha a message curta quando o source for grande.',
      'Se nao houver execucao segura possivel, devolva JSON com message curta explicando e executions vazio.',
      `Resposta atual estruturada: ${JSON.stringify(structuredResponse)}`,
      `Resposta bruta do modelo: ${this.limit(rawGeneration, 2200)}`,
      compactContext.summary,
    ].join('\n\n');

    const review = await ModelRouter.generateResponse(prompt, {
      model: reviewModel,
      systemPrompt:
        'Você é um agente de reparo executor. Responda somente em JSON puro no formato {"message":"texto","executions":[{"executionId":1,"source":"conteudo"}]}. Use a resposta parseada anterior como base canonica da correcao. Preserve o mesmo executionId e a mesma estrutura sempre que possivel, alterando apenas o necessario para corrigir. A resposta inteira deve ser JSON valido estrito. Escape corretamente quotes, barras e quebras de linha. Prefira uma unica execution com um unico source Luau livre e return verificavel. Se o source criar scripts e atribuir `.Source`, use long brackets [=[...]=] ou table.concat no source embutido e confira aspas, parenteses e blocos antes de responder. Mantenha a message curta quando o source for grande, mas faca a nova message explicar o que foi corrigido e o que a execucao entrega agora. So use JSON com action/payload ou legacy plugin_call como fallback de compatibilidade. Corrija a resposta para que o agente realmente crie, edite e reorganize o projeto quando isso foi pedido.',
      maxTokens: intentProfile.executionMode === 'deep' ? 5000 : 1800,
      temperature: intentProfile.executionMode === 'deep' ? 0.4 : 0.2,
    });
    this.pushUsageTelemetry(telemetryStages, 'repair', review);
    this.logDebug('repair:raw-response', {
      textLength: String(review.text || '').length,
      textPreview: this.previewText(review.text, 500),
    });
    const repairEnvelopeIssue = this.detectMalformedStructuredEnvelope(review.text);
    if (repairEnvelopeIssue) {
      this.logDebug('repair:envelope-issue', repairEnvelopeIssue);
      return null;
    }

    const repaired = this.parseStructuredResponse(review.text);
    if (!repaired.message.trim()) return null;
    return repaired;
  }

  static async runPreflightValidation(
    intent,
    compactContext,
    intentProfile,
    structuredResponse,
    reviewModel,
    telemetryStages,
    expectsExecution
  ) {
    if (!expectsExecution || intentProfile.executionMode !== 'deep' || structuredResponse.executions.length === 0) {
      return null;
    }

    const prompt = [
      `Pedido do usuario: ${intent}`,
      `Tipo: ${intentProfile.taskType}`,
      'Preflight final: revise a resposta executavel antes da entrega.',
      'Use a resposta parseada da primeira camada como base canonica.',
      'Mantenha exatamente o mesmo formato estrutural: {"message":"texto","executions":[{"executionId":1,"source":"conteudo"}]}.',
      'Se a execucao base estiver boa, preserve a mesma estrutura e apenas devolva uma message nova confirmando o que ela entrega.',
      'Se houver erro, corrija a mesma estrutura em vez de inventar outro envelope.',
      'Verifique se ha falha de sintaxe, erro de logica, trecho incompleto, retorno inconsistente ou algo que nao entrega corretamente o que foi pedido.',
      'Confirme especialmente se nao existem strings malformadas, `.Source` embutido com aspas comuns multiline, parenteses abertos ou blocos truncados.',
      'Se encontrar qualquer falha, devolva a execution completa corrigida, nao um patch parcial.',
      'Se a execucao estiver boa, devolva exatamente a mesma estrutura.',
      `Resposta estruturada candidata: ${JSON.stringify(structuredResponse)}`,
      compactContext.summary,
      PLUGIN_DOC_CAPSULE,
    ].join('\n\n');

    const preflight = await ModelRouter.generateResponse(prompt, {
      model: reviewModel,
      systemPrompt:
        'Você é um validador final de execucao. Responda somente em JSON puro no formato {"message":"texto","executions":[{"executionId":1,"source":"conteudo"}]}. Use a resposta parseada anterior como base canonica. Preserve o mesmo executionId e a mesma estrutura sempre que possivel. A resposta inteira deve ser JSON valido estrito. Escape corretamente quotes, barras e quebras de linha. O formato principal da execution deve ser source livre em Luau. Se houver falha de sintaxe, logica ou aderencia, reescreva a execucao completa corrigida mantendo o mesmo formato. Se houver scripts embutidos via `.Source`, use long brackets [=[...]=] ou table.concat. Mantenha a message curta quando o source for grande, mas faca a nova message explicar o que foi validado ou corrigido. Nunca devolva apenas trecho de patch.',
      maxTokens: intentProfile.executionMode === 'deep' ? 5000 : 1800,
      temperature: intentProfile.executionMode === 'deep' ? 0.4 : 0.2,
    });
    this.pushUsageTelemetry(telemetryStages, 'preflight', preflight);
    this.logDebug('preflight:raw-response', {
      textLength: String(preflight.text || '').length,
      textPreview: this.previewText(preflight.text, 500),
    });
    const preflightEnvelopeIssue = this.detectMalformedStructuredEnvelope(preflight.text);
    if (preflightEnvelopeIssue) {
      this.logDebug('preflight:envelope-issue', preflightEnvelopeIssue);
      return null;
    }

    const validated = this.parseStructuredResponse(preflight.text);
    if (!validated.message.trim() || validated.executions.length === 0) {
      return null;
    }

    return validated;
  }

  static pushUsageTelemetry(target, stage, response) {
    if (!response?.usage) return;
    target.push({
      stage,
      model: String(response.usage.model || response.model || 'unknown'),
      inputTokens: Number(response.usage.inputTokens || 0),
      outputTokens: Number(response.usage.outputTokens || 0),
      totalTokens: Number(response.usage.totalTokens || 0),
      estimatedCostUsd: Number(response.usage.estimatedCostUsd || 0),
    });
  }

  static finalizeUsageTelemetry(modelBreakdown) {
    return {
      inputTokens: modelBreakdown.reduce((acc, item) => acc + item.inputTokens, 0),
      outputTokens: modelBreakdown.reduce((acc, item) => acc + item.outputTokens, 0),
      totalTokens: modelBreakdown.reduce((acc, item) => acc + item.totalTokens, 0),
      estimatedCostUsd: Number(modelBreakdown.reduce((acc, item) => acc + item.estimatedCostUsd, 0).toFixed(6)),
      modelBreakdown,
    };
  }

  static extractAttachmentSummary(intent) {
    const matches = [...String(intent || '').matchAll(/\('((?:\\.|[^'])*)',\s*"((?:\\.|[^"])*)"\)/g)];
    if (matches.length === 0) return '';
    return matches
      .slice(0, 5)
      .map((match) => `${this.limit(match[1], 80)} => ${this.limit(match[2].split('\n')[0], 80)}`)
      .join('; ');
  }

  static limit(value, max = 240) {
    const normalized = String(value || '').replace(/\s+/g, ' ').trim();
    if (normalized.length <= max) return normalized;
    return `${normalized.slice(0, max - 3)}...`;
  }

  static parseExplorerSelection(rawText, selectedPath) {
    const fallback = {
      needExplorer: Boolean(selectedPath),
      includeAll: false,
      includePaths: selectedPath ? [selectedPath] : [],
      includeClasses: [],
      includeChildrenDepth: selectedPath ? 2 : 1,
      includeParentChain: true,
      includeScriptSource: false,
      reason: selectedPath
        ? 'Usar node selecionado e vizinhança imediata para economizar tokens.'
        : 'Sem explorer por padrão; usar apenas contexto textual do pedido.',
    };

    try {
      const parsed = JSON.parse(this.extractJsonObject(rawText));
      return {
        needExplorer: Boolean(parsed?.needExplorer),
        includeAll: Boolean(parsed?.includeAll),
        includePaths: Array.isArray(parsed?.includePaths)
          ? parsed.includePaths.filter((item) => typeof item === 'string' && item.trim()).slice(0, 12)
          : fallback.includePaths,
        includeClasses: Array.isArray(parsed?.includeClasses)
          ? parsed.includeClasses.filter((item) => typeof item === 'string' && item.trim()).slice(0, 8)
          : [],
        includeChildrenDepth: Math.max(0, Math.min(4, Number(parsed?.includeChildrenDepth) || fallback.includeChildrenDepth)),
        includeParentChain: parsed?.includeParentChain !== false,
        includeScriptSource: Boolean(parsed?.includeScriptSource),
        reason: typeof parsed?.reason === 'string' && parsed.reason.trim() ? parsed.reason.trim() : fallback.reason,
      };
    } catch {
      return fallback;
    }
  }

  static buildFilteredExplorerContext(nodes, selection, selectedPath) {
    if (!selection.needExplorer || !Array.isArray(nodes) || nodes.length === 0) return '';

    const desiredPaths = new Set(selection.includePaths || []);
    if (selectedPath) desiredPaths.add(selectedPath);

    const relevantNodes = selection.includeAll
      ? nodes.slice(0, 20)
      : this.collectRelevantNodes(
          nodes,
          desiredPaths,
          new Set(selection.includeClasses || []),
          selection.includeChildrenDepth,
          selection.includeParentChain
        );

    if (relevantNodes.length === 0) {
      return `Raizes: ${nodes.length}\nSem nodes especificos selecionados.`;
    }

    return relevantNodes
      .slice(0, 32)
      .map((node) => this.serializeNodeForPrompt(node, selection.includeScriptSource))
      .join('\n');
  }

  static collectRelevantNodes(nodes, desiredPaths, desiredClasses, includeChildrenDepth, includeParentChain) {
    const results = new Map();

    const walk = (node, parents) => {
      const path = String(node?.propriedades?.Path || '');
      const className = String(node?.propriedades?.ClassName || '');
      const matchesPath = path && desiredPaths.has(path);
      const matchesClass = className && desiredClasses.has(className);

      if (matchesPath || matchesClass) {
        results.set(path || `${className}:${node?.nome}`, node);
        if (includeParentChain) {
          for (const parent of parents) {
            const parentPath = String(parent?.propriedades?.Path || parent?.nome || '');
            if (parentPath) results.set(parentPath, parent);
          }
        }
        if (includeChildrenDepth > 0) {
          this.collectChildren(node, includeChildrenDepth, results);
        }
      }

      for (const child of Array.isArray(node?.filhos) ? node.filhos : []) {
        walk(child, [...parents, node]);
      }
    };

    for (const node of nodes) walk(node, []);
    return Array.from(results.values());
  }

  static collectChildren(node, depth, results) {
    if (depth <= 0) return;
    for (const child of Array.isArray(node?.filhos) ? node.filhos : []) {
      const path = String(child?.propriedades?.Path || child?.nome || '');
      if (path) results.set(path, child);
      this.collectChildren(child, depth - 1, results);
    }
  }

  static serializeNodeForPrompt(node, includeScriptSource) {
    const props = node?.propriedades || {};
    const summaryProps = {
      ClassName: props.ClassName,
      Parent: props.Parent,
      Path: props.Path,
      Position: props.Position,
      Size: props.Size,
      Material: props.Material,
      Value: props.Value,
      RunContext: props.RunContext,
      ChildCount: Array.isArray(node?.filhos) ? node.filhos.length : 0,
    };

    const scriptSource =
      includeScriptSource && typeof props.Source === 'string'
        ? ` source="${this.limit(props.Source, 400)}"`
        : '';

    return `${props.Path || node?.nome || 'node'} => ${JSON.stringify(summaryProps)}${scriptSource}`;
  }

  static tryBuildLocalExecutionPlan(intent, context, intentProfile) {
    if (intentProfile.taskType !== 'roblox_code') return null;

    const normalized = String(intent || '').toLowerCase();
    const hasCreateVerb =
      normalized.includes('cria') ||
      normalized.includes('crie') ||
      normalized.includes('fazer') ||
      normalized.includes('faça') ||
      normalized.includes('gera') ||
      normalized.includes('gera ') ||
      normalized.includes('create') ||
      normalized.includes('build');

    if (!hasCreateVerb) return null;

    if (normalized.includes('piramide') || normalized.includes('pirâmide')) {
      return this.buildPyramidPlan(context.project?.selectedNodePath || 'workspace');
    }

    if (
      (normalized.includes('rua') || normalized.includes('road')) &&
      (normalized.includes('casa') || normalized.includes('casas') || normalized.includes('house')) &&
      normalized.includes('carro')
    ) {
      return this.buildStreetScenePlan();
    }

    if (normalized.includes('cubo') || normalized.includes('bloco') || normalized.includes('part')) {
      return this.buildSinglePartPlan('Block', 'Criei um bloco básico no workspace.');
    }

    if (normalized.includes('esfera')) {
      return this.buildSinglePartPlan('Ball', 'Criei uma esfera básica no workspace.');
    }

    if (normalized.includes('cilindro')) {
      return this.buildSinglePartPlan('Cylinder', 'Criei um cilindro básico no workspace.');
    }

    return null;
  }

  static buildSinglePartPlan(shape, reply) {
    const source = [
      'local part = Instance.new("Part")',
      `part.Name = "${shape === 'Block' ? 'GeneratedPart' : `Generated${shape}`}"`,
      `part.Shape = Enum.PartType.${shape}`,
      'part.Anchored = true',
      'part.Position = Vector3.new(0, 5, 0)',
      'part.Size = Vector3.new(6, 6, 6)',
      'part.Parent = workspace',
      '',
      'return {',
      '  ok = true,',
      `  summary = "Created 1 ${shape}",`,
      '  created = { part:GetFullName() },',
      '}',
    ].join('\n');
    const command = {
      action: 'RunLuau',
      payload: {
        language: 'luau',
        source,
      },
    };

    return {
      plan: `Gerar 1 ${shape} ancorado no workspace em uma posição central.`,
      reply,
      executableCommands: [command],
      executions: [{ executionId: 1, source }],
    };
  }

  static buildPyramidPlan() {
    const source = [
      'local sizes = {10, 8, 6, 4, 2}',
      'local created = {}',
      'for index, size in ipairs(sizes) do',
      '  local part = Instance.new("Part")',
      '  part.Name = "PyramidLayer" .. index',
      '  part.Anchored = true',
      '  part.Material = Enum.Material.Sand',
      '  part.Position = Vector3.new(0, 0.5 + (index - 1), 0)',
      '  part.Size = Vector3.new(size, 1, size)',
      '  part.Parent = workspace',
      '  table.insert(created, part:GetFullName())',
      'end',
      '',
      'return {',
      '  ok = true,',
      '  summary = "Created pyramid with 5 layers",',
      '  created = created,',
      '}',
    ].join('\n');
    const command = {
      action: 'RunLuau',
      payload: {
        language: 'luau',
        source,
      },
    };

    return {
      plan: 'Gerar uma pirâmide simples em 5 camadas usando Parts ancoradas, cada camada menor e centralizada acima da anterior.',
      reply: 'Entendi. Vou criar uma pirâmide básica em 5 camadas diretamente no workspace e enfileirar a execução `executionId:1` agora.',
      executableCommands: [command],
      executions: [{ executionId: 1, source }],
    };
  }

  static buildStreetScenePlan() {
    const source = [
      'local created = {}',
      'local function makePart(name, position, size, props)',
      '  local part = Instance.new("Part")',
      '  part.Name = name',
      '  part.Anchored = true',
      '  part.Position = position',
      '  part.Size = size',
      '  for key, value in pairs(props or {}) do',
      '    part[key] = value',
      '  end',
      '  part.Parent = workspace',
      '  table.insert(created, part:GetFullName())',
      '  return part',
      'end',
      '',
      'makePart("SceneGround", Vector3.new(0, -0.5, 0), Vector3.new(180, 1, 100), { Material = Enum.Material.Grass, Color = Color3.fromRGB(71, 162, 61) })',
      'makePart("MainRoad", Vector3.new(0, 0.05, 0), Vector3.new(140, 0.2, 18), { Material = Enum.Material.Asphalt, Color = Color3.fromRGB(42, 44, 52) })',
      'for i = -2, 2 do',
      '  makePart("RoadStripe" .. tostring(i + 3), Vector3.new(i * 24, 0.18, 0), Vector3.new(10, 0.08, 1), { Material = Enum.Material.Neon, Color = Color3.fromRGB(251, 196, 48) })',
      'end',
      '',
      'local houseXs = { -40, 0, 40 }',
      'local houseColors = { Color3.fromRGB(220, 142, 110), Color3.fromRGB(211, 182, 133), Color3.fromRGB(166, 197, 232) }',
      'for index, x in ipairs(houseXs) do',
      '  local color = houseColors[index]',
      '  makePart("House" .. index .. "Base", Vector3.new(x, 5, -24), Vector3.new(18, 10, 14), { Material = Enum.Material.Brick, Color = color })',
      '  makePart("House" .. index .. "Roof", Vector3.new(x, 11, -24), Vector3.new(20, 2, 16), { Material = Enum.Material.Slate, Color = Color3.fromRGB(88, 42, 42) })',
      '  makePart("House" .. index .. "Door", Vector3.new(x, 2.5, -16.8), Vector3.new(3, 5, 0.8), { Material = Enum.Material.Wood, Color = Color3.fromRGB(91, 61, 40) })',
      '  makePart("House" .. index .. "WindowLeft", Vector3.new(x - 4.5, 5.5, -16.7), Vector3.new(3, 3, 0.6), { Material = Enum.Material.Glass, Transparency = 0.25, Color = Color3.fromRGB(161, 225, 255) })',
      '  makePart("House" .. index .. "WindowRight", Vector3.new(x + 4.5, 5.5, -16.7), Vector3.new(3, 3, 0.6), { Material = Enum.Material.Glass, Transparency = 0.25, Color = Color3.fromRGB(161, 225, 255) })',
      'end',
      '',
      'for index, x in ipairs({ -64, 64 }) do',
      '  makePart("Tunnel" .. index .. "LeftWall", Vector3.new(x, 6, -8), Vector3.new(12, 12, 2), { Material = Enum.Material.Concrete, Color = Color3.fromRGB(121, 121, 121) })',
      '  makePart("Tunnel" .. index .. "RightWall", Vector3.new(x, 6, 8), Vector3.new(12, 12, 2), { Material = Enum.Material.Concrete, Color = Color3.fromRGB(121, 121, 121) })',
      '  makePart("Tunnel" .. index .. "Roof", Vector3.new(x, 12, 0), Vector3.new(12, 2, 18), { Material = Enum.Material.Concrete, Color = Color3.fromRGB(106, 106, 106) })',
      'end',
      '',
      'makePart("CarBody", Vector3.new(-56, 1.6, 0), Vector3.new(6, 2, 4), { Material = Enum.Material.Metal, Color = Color3.fromRGB(220, 40, 60) })',
      'makePart("CarCabin", Vector3.new(-56, 3.1, 0), Vector3.new(3, 1.6, 3.2), { Material = Enum.Material.Glass, Transparency = 0.2, Color = Color3.fromRGB(190, 231, 255) })',
      'makePart("CarWheelFL", Vector3.new(-54.2, 0.7, -1.6), Vector3.new(1, 1, 1), { Material = Enum.Material.SmoothPlastic, Color = Color3.fromRGB(33, 33, 33) })',
      'makePart("CarWheelFR", Vector3.new(-54.2, 0.7, 1.6), Vector3.new(1, 1, 1), { Material = Enum.Material.SmoothPlastic, Color = Color3.fromRGB(33, 33, 33) })',
      'makePart("CarWheelBL", Vector3.new(-57.8, 0.7, -1.6), Vector3.new(1, 1, 1), { Material = Enum.Material.SmoothPlastic, Color = Color3.fromRGB(33, 33, 33) })',
      'makePart("CarWheelBR", Vector3.new(-57.8, 0.7, 1.6), Vector3.new(1, 1, 1), { Material = Enum.Material.SmoothPlastic, Color = Color3.fromRGB(33, 33, 33) })',
      '',
      'local patrolScript = Instance.new("Script")',
      'patrolScript.Name = "StreetCarPatrol"',
      'patrolScript.Source = [=[local RunService = game:GetService("RunService")',
      'local names = {"CarBody","CarCabin","CarWheelFL","CarWheelFR","CarWheelBL","CarWheelBR"}',
      'local parts = {}',
      'for _, name in ipairs(names) do',
      '  parts[name] = workspace:WaitForChild(name)',
      'end',
      'local body = parts.CarBody',
      'local offsets = {}',
      'for name, part in pairs(parts) do',
      '  offsets[name] = body.CFrame:ToObjectSpace(part.CFrame)',
      'end',
      'local minX, maxX, speed, direction, x = -56, 56, 18, 1, -56',
      'RunService.Heartbeat:Connect(function(dt)',
      '  x += direction * speed * dt',
      '  if x >= maxX then x = maxX direction = -1 elseif x <= minX then x = minX direction = 1 end',
      '  local facing = direction == 1 and 0 or math.pi',
      '  local frame = CFrame.new(x, 1.6, 0) * CFrame.Angles(0, facing, 0)',
      '  for name, part in pairs(parts) do',
      '    part.CFrame = frame * offsets[name]',
      '  end',
      'end)]=]',
      'patrolScript.Parent = workspace',
      'table.insert(created, patrolScript:GetFullName())',
      '',
      'return {',
      '  ok = true,',
      '  summary = "Created street scene with 3 houses, 2 tunnels and animated car",',
      '  created = created,',
      '}',
    ].join('\n');
    const command = {
      action: 'RunLuau',
      payload: {
        language: 'luau',
        source,
      },
    };

    return {
      plan: 'Gerar uma cena completa com terreno, rua principal, 3 casas, 2 tuneis e um carro animado patrulhando de um lado ao outro.',
      reply: 'Entendi. Vou criar uma rua basica com 3 casas, dois tuneis e um carro se movendo de um lado para o outro pela cena usando a execução `executionId:1`.',
      executableCommands: [command],
      executions: [{ executionId: 1, source }],
    };
  }

  static buildStructuredResponse(message, executions) {
    return { message, executions };
  }

  static ensureExecutionFallback(response, rawGeneration, expectsExecution) {
    if (!expectsExecution || response.executions.length > 0) {
      return response;
    }

    const candidate = this.extractExecutableSourceCandidate(rawGeneration);
    if (!candidate) {
      return response;
    }

    return {
      message: response.message,
      executions: [{ executionId: 1, source: candidate }],
    };
  }

  static parseStructuredResponse(rawText) {
    const normalizedText = this.extractJsonObject(rawText);
    this.logDebug('parse:start', {
      rawLength: String(rawText || '').length,
      normalizedLength: normalizedText.length,
      rawPreview: this.previewText(rawText, 240),
      normalizedPreview: this.previewText(normalizedText, 240),
    });
    try {
      const parsed = JSON.parse(normalizedText);
      if (parsed && typeof parsed.message === 'string' && Array.isArray(parsed.executions)) {
        const structured = {
          message: parsed.message,
          executions: parsed.executions
            .filter((item) => typeof item?.executionId === 'number' && typeof item?.source === 'string')
            .map((item) => ({
              executionId: item.executionId,
              source: item.source,
            })),
        };
        this.logStructuredResponseDebug('parse:json-success', structured);
        return structured;
      }
    } catch (error) {
      this.logDebug('parse:json-failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const lenientParsed =
      this.tryParseLenientStructuredResponse(normalizedText) ||
      this.tryParseLenientStructuredResponse(rawText);
    if (lenientParsed) {
      this.logStructuredResponseDebug('parse:lenient-success', lenientParsed);
      return lenientParsed;
    }

    const fallback = {
      message: rawText,
      executions: [],
    };
    this.logStructuredResponseDebug('parse:fallback-raw', fallback);
    return fallback;
  }

  static detectMalformedStructuredEnvelope(rawText) {
    const trimmed = String(rawText || '').trim();
    if (!trimmed || !trimmed.includes('"executions"') || !trimmed.includes('"message"')) {
      return null;
    }

    const normalizedText = this.extractJsonObject(trimmed);
    try {
      JSON.parse(normalizedText);
      return null;
    } catch (error) {
      return {
        reason: `JSON estruturado malformado: ${error instanceof Error ? error.message : String(error)}`,
        rawLength: trimmed.length,
        normalizedLength: normalizedText.length,
      };
    }
  }

  static extractJsonObject(rawText) {
    const trimmed = String(rawText || '').trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;

    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fencedMatch?.[1]) {
      return fencedMatch[1].trim();
    }

    const firstBrace = trimmed.indexOf('{');
    if (firstBrace !== -1) {
      const extracted = this.extractBalancedJsonSegment(trimmed, firstBrace, '{', '}');
      if (extracted) {
        return extracted;
      }
    }

    return trimmed;
  }

  static extractExecutableSourceCandidate(rawText) {
    const trimmed = String(rawText || '').trim();
    if (!trimmed) return '';

    const structuredJson = this.extractJsonObject(trimmed);
    if (structuredJson !== trimmed && structuredJson.includes('"executions"')) {
      return '';
    }

    const fencedCodeMatch = trimmed.match(/```(?:luau|lua|json|javascript|js|ts|typescript)?\s*([\s\S]*?)```/i);
    if (fencedCodeMatch?.[1]?.trim()) {
      return fencedCodeMatch[1].trim();
    }

    if (
      trimmed.includes('Instance.new') ||
      trimmed.includes('game:GetService') ||
      trimmed.includes('local function') ||
      trimmed.includes('return {') ||
      trimmed.includes('"action"') ||
      trimmed.includes('"source"')
    ) {
      return trimmed;
    }

    return '';
  }

  static tryParseLenientStructuredResponse(rawText) {
    const text = String(rawText || '').trim();
    if (!text.includes('"message"') || !text.includes('"executions"')) {
      return null;
    }

    const messageKeyIndex = text.indexOf('"message"');
    const messageColonIndex = text.indexOf(':', messageKeyIndex);
    const messageQuoteIndex = text.indexOf('"', messageColonIndex + 1);
    if (messageColonIndex === -1 || messageQuoteIndex === -1) {
      return null;
    }

    const messageToken = this.readJsonLikeString(text, messageQuoteIndex);
    if (!messageToken) {
      return null;
    }

    const executions = [];
    let searchIndex = text.indexOf('"executions"', messageToken.nextIndex);
    if (searchIndex === -1) {
      searchIndex = text.indexOf('"executions"');
    }

    while (searchIndex !== -1) {
      const executionIdKeyIndex = text.indexOf('"executionId"', searchIndex);
      if (executionIdKeyIndex === -1) break;

      const executionIdMatch = text.slice(executionIdKeyIndex).match(/"executionId"\s*:\s*(\d+)/);
      if (!executionIdMatch) break;
      const executionId = Number(executionIdMatch[1]);
      const sourceKeyIndex = text.indexOf('"source"', executionIdKeyIndex);
      if (sourceKeyIndex === -1) break;

      const sourceColonIndex = text.indexOf(':', sourceKeyIndex);
      const sourceQuoteIndex = text.indexOf('"', sourceColonIndex + 1);
      if (sourceColonIndex === -1 || sourceQuoteIndex === -1) break;

      const sourceToken =
        this.readLooseJsonTailString(text, sourceQuoteIndex, ['","executionId"', '"}]', '"}', '}]}']) ||
        this.readJsonLikeString(text, sourceQuoteIndex);
      if (!sourceToken) break;

      executions.push({
        executionId,
        source: sourceToken.value,
      });
      this.logDebug('parse:lenient-execution', {
        executionId,
        sourceLength: String(sourceToken.value || '').length,
        sourcePreview: this.previewText(sourceToken.value, 200),
        nextIndex: sourceToken.nextIndex,
      });

      searchIndex = text.indexOf('"executionId"', sourceToken.nextIndex);
    }

    return {
      message: messageToken.value,
      executions,
    };
  }

  static readJsonLikeString(text, openingQuoteIndex) {
    if (openingQuoteIndex < 0 || text[openingQuoteIndex] !== '"') {
      return null;
    }

    let index = openingQuoteIndex + 1;
    let output = '';
    let escaping = false;

    while (index < text.length) {
      const char = text[index];

      if (escaping) {
        if (char === 'n') output += '\n';
        else if (char === 'r') output += '\r';
        else if (char === 't') output += '\t';
        else if (char === '"') output += '"';
        else if (char === '\\') output += '\\';
        else output += char;
        escaping = false;
        index += 1;
        continue;
      }

      if (char === '\\') {
        escaping = true;
        index += 1;
        continue;
      }

      if (char === '"') {
        return {
          value: output,
          nextIndex: index + 1,
        };
      }

      output += char;
      index += 1;
    }

    return null;
  }

  static readLooseJsonTailString(text, openingQuoteIndex, terminators = []) {
    if (openingQuoteIndex < 0 || text[openingQuoteIndex] !== '"') {
      return null;
    }

    let index = openingQuoteIndex + 1;
    let output = '';
    let escaping = false;

    while (index < text.length) {
      const remainder = text.slice(index);
      const foundTerminator = terminators.find((item) => remainder.startsWith(item));
      if (foundTerminator) {
        return {
          value: this.unescapeJsonLikeString(output),
          nextIndex: index,
        };
      }

      const char = text[index];

      if (escaping) {
        output += `\\${char}`;
        escaping = false;
        index += 1;
        continue;
      }

      if (char === '\\') {
        escaping = true;
        index += 1;
        continue;
      }

      if (char === '"') {
        const tail = text.slice(index);
        const nextNonWhitespaceChar = this.findNextNonWhitespaceChar(text, index + 1);
        const looksLikeJsonClosingQuote =
          terminators.some((item) => tail.startsWith(item)) ||
          nextNonWhitespaceChar === ',' ||
          nextNonWhitespaceChar === '}' ||
          nextNonWhitespaceChar === ']';

        if (looksLikeJsonClosingQuote) {
          return {
            value: this.unescapeJsonLikeString(output),
            nextIndex: index + 1,
          };
        }

        output += char;
        index += 1;
        continue;
      }

      output += char;
      index += 1;
    }

    if (!output.trim()) {
      return null;
    }

    return {
      value: this.unescapeJsonLikeString(output),
      nextIndex: text.length,
    };
  }

  static unescapeJsonLikeString(value) {
    return String(value || '')
      .replace(/\\\\/g, '\\')
      .replace(/\\"/g, '"')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t');
  }

  static findNextNonWhitespaceChar(text, startIndex) {
    for (let index = startIndex; index < text.length; index += 1) {
      const char = text[index];
      if (!/\s/.test(char)) {
        return char;
      }
    }

    return '';
  }

  static extractBalancedJsonSegment(text, startIndex, openingChar, closingChar) {
    if (startIndex < 0 || text[startIndex] !== openingChar) {
      return '';
    }

    let depth = 0;
    let inString = false;
    let escaping = false;

    for (let index = startIndex; index < text.length; index += 1) {
      const char = text[index];

      if (inString) {
        if (escaping) {
          escaping = false;
          continue;
        }

        if (char === '\\') {
          escaping = true;
          continue;
        }

        if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === openingChar) {
        depth += 1;
        continue;
      }

      if (char === closingChar) {
        depth -= 1;
        if (depth === 0) {
          return text.slice(startIndex, index + 1);
        }
      }
    }

    return '';
  }

  static compileExecutionsToCommands(executions) {
    const compiled = [];

    for (const execution of executions) {
      let compiledForExecution = 0;
      try {
        const parsed = JSON.parse(this.extractJsonArrayOrObject(execution.source));
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            const command = this.normalizeExecutionItem(item);
            if (command) {
              compiled.push(command);
              compiledForExecution += 1;
            }
          }
        } else {
          const command = this.normalizeExecutionItem(parsed);
          if (command) {
            compiled.push(command);
            compiledForExecution += 1;
          }
        }
      } catch {
        compiledForExecution = 0;
      }

      if (compiledForExecution === 0) {
        const command = this.rawSourceToCommand(execution.source);
        if (command) compiled.push(command);
      }
    }

    return compiled;
  }

  static normalizeExecutionItem(value) {
    if (!value) return null;

    if (typeof value === 'string') {
      return this.rawSourceToCommand(value);
    }

    if (this.isPluginCallExecution(value)) {
      return this.pluginCallToCommand(value);
    }

    if (typeof value === 'object' && typeof value.action === 'string') {
      return {
        action: value.action,
        payload: value.payload && typeof value.payload === 'object' ? value.payload : {},
      };
    }

    if (typeof value === 'object' && value.type === 'free_command') {
      return this.rawSourceToCommand(
        typeof value.source === 'string' ? value.source : '',
        typeof value.language === 'string' ? value.language : undefined
      );
    }

    if (typeof value === 'object' && typeof value.source === 'string') {
      return this.rawSourceToCommand(value.source, value.language);
    }

    if (typeof value === 'object' && typeof value.code === 'string') {
      return this.rawSourceToCommand(value.code, value.language);
    }

    return null;
  }

  static rawSourceToCommand(source, language) {
    const normalized = String(source || '').trim();
    if (!normalized) return null;

    this.logDebug('commands:raw-source-to-command', {
      language: typeof language === 'string' && language.trim() ? language.trim() : 'luau',
      sourceLength: normalized.length,
      sourcePreview: this.previewText(normalized, 220),
    });

    return {
      action: 'RunLuau',
      payload: {
        language: typeof language === 'string' && language.trim() ? language.trim() : 'luau',
        source: normalized,
      },
    };
  }

  static pluginCallToCommand(value) {
    if (!this.isPluginCallExecution(value)) {
      return null;
    }

    if (value.api === 'Workspace3D.CreatePart') {
      return {
        action: 'CreatePart',
        payload: {
          shape: value.args.shape || 'Block',
          position: value.args.position || { x: 0, y: 5, z: 0 },
          size: value.args.size || { x: 4, y: 1, z: 4 },
          properties: value.args.properties || {},
        },
      };
    }

    if (value.api === 'ScriptManager.Create') {
      return {
        action: 'CreateScript',
        payload: {
          scriptType: value.args.scriptType || 'Script',
          parent: value.args.parent || 'workspace',
          name: value.args.name || 'NewScript',
          source: value.args.source || '',
        },
      };
    }

    if (value.api === 'AssetImporter.InsertById') {
      return {
        action: 'InsertAsset',
        payload: {
          assetId: value.args.assetId,
          parent: value.args.parent || 'workspace',
          position: value.args.position || null,
        },
      };
    }

    if (value.api === 'InstanceManager.Create') {
      return {
        action: 'CreateInstance',
        payload: {
          className: value.args.className,
          parent: value.args.parent || 'workspace',
          name: value.args.name || 'NewInstance',
          properties: value.args.properties || {},
        },
      };
    }

    if (value.api === 'InstanceManager.SetProperty') {
      return {
        action: 'SetInstanceProperty',
        payload: {
          target: value.args.target,
          property: value.args.property,
          value: value.args.value,
        },
      };
    }

    return null;
  }

  static isPluginCallExecution(value) {
    if (!value || typeof value !== 'object') return false;
    if (value.type !== 'plugin_call') return false;
    if (typeof value.api !== 'string') return false;
    if (!value.args || typeof value.args !== 'object') return false;
    return [
      'Workspace3D.CreatePart',
      'ScriptManager.Create',
      'AssetImporter.InsertById',
      'InstanceManager.Create',
      'InstanceManager.SetProperty',
    ].includes(value.api);
  }

  static logStructuredResponseDebug(stage, response) {
    this.logDebug(stage, {
      messageLength: String(response?.message || '').length,
      messagePreview: this.previewText(response?.message || '', 180),
      executionCount: Array.isArray(response?.executions) ? response.executions.length : 0,
      executions: Array.isArray(response?.executions)
        ? response.executions.slice(0, 4).map((execution) => ({
            executionId: execution.executionId,
            sourceLength: String(execution.source || '').length,
            sourcePreview: this.previewText(execution.source, 180),
          }))
        : [],
    });
  }

  static logExecutableCommandsDebug(stage, commands) {
    this.logDebug(stage, {
      commandCount: Array.isArray(commands) ? commands.length : 0,
      commands: (commands || []).slice(0, 6).map((command) => ({
        action: command.action,
        payloadKeys: command.payload && typeof command.payload === 'object' ? Object.keys(command.payload).slice(0, 12) : [],
        sourceLength: command.payload && typeof command.payload?.source === 'string' ? command.payload.source.length : 0,
        sourcePreview:
          command.payload && typeof command.payload?.source === 'string'
            ? this.previewText(command.payload.source, 180)
            : '',
      })),
    });
  }

  static previewText(value, max = 200) {
    const normalized = String(value || '').replace(/\r/g, '\\r').replace(/\n/g, '\\n');
    if (normalized.length <= max) return normalized;
    return `${normalized.slice(0, max)}...`;
  }

  static logDebug(stage, payload) {
    try {
      console.info(`[ai-debug] ${stage}`, payload);
    } catch {}
  }

  static extractJsonArrayOrObject(rawText) {
    const trimmed = String(rawText || '').trim();
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      return trimmed;
    }

    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fencedMatch?.[1]) {
      return fencedMatch[1].trim();
    }

    const firstObjectBrace = trimmed.indexOf('{');
    const firstArrayBracket = trimmed.indexOf('[');

    if (firstArrayBracket !== -1 && (firstObjectBrace === -1 || firstArrayBracket < firstObjectBrace)) {
      const extractedArray = this.extractBalancedJsonSegment(trimmed, firstArrayBracket, '[', ']');
      if (extractedArray) {
        return extractedArray;
      }
    }

    if (firstObjectBrace !== -1) {
      const extractedObject = this.extractBalancedJsonSegment(trimmed, firstObjectBrace, '{', '}');
      if (extractedObject) {
        return extractedObject;
      }
    }

    return trimmed;
  }
}
