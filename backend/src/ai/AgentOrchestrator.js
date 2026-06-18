import { ModelRouter } from './ModelRouter.js';
import { LuauValidator } from './LuauValidator.js';

const PLUGIN_DOC_CAPSULE = `
QUEM VOCÊ É E COMO O SEU CÓDIGO VIRA O JOGO:
- Você é um DESENVOLVEDOR de Roblox de verdade — igual ao usuário. A ÚNICA diferença é que você não usa o mouse no Roblox Studio. Em troca, você está dentro de um PLUGIN: você escreve CÓDIGO Luau que é EXECUTADO no Studio e CRIA O JOGO LITERALMENTE (instâncias, partes, scripts, UI, sons, animações — tudo). Você não ensina o usuário a fazer e não dá tutorial; você FAZ.
- Fluxo real, ponta a ponta: o usuário descreve o objetivo no chat → você devolve uma ou mais execuções de Luau → o backend valida → o PLUGIN RODA esse Luau dentro do Studio (no servidor) → os objetos passam a existir no jogo de verdade. Ou seja: tudo que você escreve ACONTECE no jogo. Trate cada execução como se você mesmo estivesse construindo o jogo.
- Imagine como se estivesse DENTRO do jogo: pense no resultado final jogável e construa para chegar nele de forma coerente, não em pedaços soltos.
- Você pode criar/editar scripts, criar e posicionar partes e instâncias, reorganizar a hierarquia e montar sistemas completos — tudo pelo código que retorna.

PREFERÊNCIAS DE CONSTRUÇÃO:
- UI: PARA interfaces, nunca crie um localscript que cria a interface, crie diretamente a interface se prescisar de localscript coloque dentro dos arquivos da interface ou do StarterPlayer interface em runtime (em StarterPlayer.StarterPlayerScripts, ou um LocalScript dentro de um ScreenGui em StarterGui) em vez de instanciar a UI "na mão", peça por peça. Assim a UI nasce por código, replica por jogador e já vem com a lógica e os eventos conectados.
- Lógica de servidor → ServerScriptService. Lógica de cliente → StarterPlayer.StarterPlayerScripts. Módulos e RemoteEvents compartilhados → ReplicatedStorage.
- Para criar um Script/LocalScript/ModuleScript dentro do seu Luau, atribua \`.Source\` usando long brackets [=[ ... ]=] (NUNCA string multiline comum entre aspas).

COMPLETUDE — REGRA INEGOCIÁVEL:
- É PROIBIDO deixar qualquer coisa pela metade: nada de função vazia, corpo em branco, "-- TODO", "-- implementar depois", "-- preencher aqui", placeholder, mock, ou lógica comentada para fazer depois. Isso é considerado ERRO GRAVE.
- ANALISE erros de vulnerabilidade e corrija o mais rapido possivel.
- Entregue TUDO funcional AGORA — completo, conectado e testável — como um dev sênior que fecha a tarefa inteira numa única entrega. Se começou algo, termina na hora.
- Quando fizer sentido, finalize o source com um \`return\` de tabela resumo verificável, ex.: return { ok = true, summary = "...", created = { ... } }.
- Antes de finalizar, confira aspas, parênteses, colchetes e blocos function/end; não deixe strings, chamadas ou blocos truncados.
`.trim();

const ROBLOX_QUALITY_RULES = [
  'REGRAS DE QUALIDADE ROBLOX (siga sempre):',
  '- Detecção de jogador no Touched: use `local char = hit.Parent; local hum = char and char:FindFirstChildWhichIsA("Humanoid")` e `game:GetService("Players"):GetPlayerFromCharacter(char)`. NUNCA `hit:IsA("Player")` (hit é uma BasePart).',
  '- Não use APIs depreciadas: use `AssemblyLinearVelocity` (não `.Velocity`), `task.wait`/`task.spawn` (não `wait`/`spawn`), `WaitForChild` para referências que podem não existir ainda.',
  '- Configure TODAS as propriedades da instância ANTES de definir `.Parent` (evita replicação parcial e flicker).',
  '- Idempotência: antes de criar algo, cheque com `FindFirstChild` e reutilize/limpe o existente para não duplicar a cada execução.',
  '- Partes estruturais devem ter `Anchored = true`. Dê `Name` significativo a tudo que criar.',
  '- ORGANIZAÇÃO (obrigatório): NUNCA jogue objetos soltos no workspace. Crie uma Folder/Model raiz nomeada para o sistema (ex.: `workspace.HockeyGame`) e agrupe os elementos relacionados dentro dela em sub-pastas (ex.: Arena, Goals, Spawns). Reaproveite via FindFirstChild se já existir, em vez de duplicar.',
  '- Coloque cada coisa no lugar certo: scripts de servidor em ServerScriptService (ou dentro do objeto), scripts de cliente em StarterPlayer.StarterPlayerScripts, módulos e RemoteEvents compartilhados em ReplicatedStorage (numa Folder própria). Use serviços via `game:GetService(...)`.',
  '- Código limpo, organizado e completo — nada de placeholder, TODO ou lógica pela metade.',
].join('\n');

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
    const telemetryStages = [];
    // Conversa pura não precisa do seletor de explorer (LLM) — evita gasto de tokens avulso.
    // Para os demais tipos, o think-selection é cobrado via telemetryStages.
    const thinkSelection =
      intentProfile.responseType === 'conversation'
        ? this.buildSkippedExplorerSelection('Conversa: explorer dispensado.')
        : await this.runThinkSelection(intent, context, intentProfile, selectedModels.think, telemetryStages);
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
        maxTokens: 1200,
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
        maxTokens: intentProfile.executionMode === 'deep' ? 8000 : 4000,
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
      maxTokens: 8000,
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
      generationEnvelopeIssue?.reason ||
        (generation.truncated
          ? 'A geração foi cortada pelo limite de tokens (resposta incompleta). Reescreva a resposta inteira em JSON válido e mais enxuta, sem truncar o source nem o JSON.'
          : '')
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
    let executableCommands = this.compileExecutionsToCommands(finalStructuredResponse.executions);
    this.logExecutableCommandsDebug('commands:compiled', executableCommands);

    // Portão final: valida e autorrepara o Luau antes de qualquer enfileiramento.
    if (executableCommands.length > 0) {
      const validation = await this.validateAndRepairExecutions(executableCommands, {
        reviewModel: selectedModels.review,
        telemetrySink: telemetryStages,
      });
      executableCommands = validation.commands;
      this.logDebug('validate:report', validation.report);
    }

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
      normalized.includes('coloque') ||
      normalized.includes('implementa') ||
      normalized.includes('implemente') ||
      normalized.includes('monta') ||
      normalized.includes('monte') ||
      normalized.includes('configura') ||
      normalized.includes('configure') ||
      normalized.includes('programa') ||
      normalized.includes('programe') ||
      normalized.includes('desenvolv') ||
      normalized.includes('refatora') ||
      normalized.includes('refatore') ||
      normalized.includes('corrija') ||
      normalized.includes('conserta') ||
      normalized.includes('conserte') ||
      normalized.includes('escreva') ||
      normalized.includes('spawn');

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
      Array.isArray(context.project?.contextState) && context.project.contextState.length > 0
        ? `ContextoAtivoDoUsuario:\n${context.project.contextState.map((t) => `- ${t}`).join('\n')}`
        : '',
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

  // Single-pass: lê o workspace e pede a solução COMPLETA e organizada de uma vez.
  static buildSolutionPrompt(intent, compactContext, workspaceNodes) {
    const nodes = Array.isArray(workspaceNodes) ? workspaceNodes : [];
    const workspace = this.summarizeWorkspaceForAgent(nodes, 220);
    const hasGame = nodes.some((n) => Array.isArray(n?.filhos) && n.filhos.length > 0);

    return [
      `Pedido do usuário: ${intent}`,
      hasGame
        ? `═══ ESTADO ATUAL DO JOGO (já existe no Studio — LEIA antes de criar QUALQUER coisa) ═══\n${workspace}\n═══════════════════════════════════════════════════════════════`
        : 'O jogo está praticamente vazio no momento (nada relevante sincronizado).',
      'REGRA DE OURO — NÃO DUPLIQUE: tudo listado acima JÁ EXISTE. Antes de criar qualquer objeto nomeado, faça `local x = parent:FindFirstChild("Nome")` e REUTILIZE se existir; só crie (`x = x or Instance.new(...)`) o que realmente falta. NUNCA dê `Instance.new` cego de algo que já pode existir — isso polui o jogo com cópias. Se o pedido é "melhorar/terminar", MODIFIQUE o que já existe.',
      'Você é um engenheiro Roblox sênior. Entregue a SOLUÇÃO COMPLETA do pedido, sem deixar nada pela metade.',
      'PREFIRA UMA ÚNICA execution Luau totalmente IDEMPOTENTE (rodar de novo NÃO cria duplicata). Se precisar de mais de uma, lembre que elas rodam EM ORDEM — execuções seguintes devem assumir que as anteriores já criaram suas coisas e referenciá-las com FindFirstChild, sem recriar.',
      'Organize sob uma pasta/Model raiz nomeada; server em ServerScriptService, cliente em StarterPlayer.StarterPlayerScripts, módulos/RemoteEvents em ReplicatedStorage. UI: prefira um LocalScript que monta a interface em runtime.',
      'Na `message`: resumo curto do que foi feito + 2-3 sugestões de próximos passos.',
      compactContext.summary,
      PLUGIN_DOC_CAPSULE,
      ROBLOX_QUALITY_RULES,
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  static buildGeneratorPrompt(intent, compactContext, intentProfile, explorerSelection) {
    return [
      `Pedido do usuario: ${intent}`,
      `Tipo: ${intentProfile.taskType}`,
      `ThinkExplorer: ${explorerSelection.reason}`,
      PLUGIN_DOC_CAPSULE,
      ROBLOX_QUALITY_RULES,
      'Responda como agente independente, mestre do projeto e em controle do ambiente.',
      'Se o pedido for executável, devolva diretamente as execuções necessárias. Não transforme isso em tutorial passo a passo para o usuário.',
      'A resposta final deve ser operacional: o que sera feito e quais executions representam isso.',
      'O agente deve priorizar source livre em Luau como formato principal da execution. So use comando JSON com action/payload ou legacy plugin_call como fallback interno de compatibilidade. Prefira uma unica execution com um unico source Luau auto contido quando isso for suficiente. Use isso para criar e editar scripts, criar elementos e instancias, reorganizar objetos e montar sistemas completos. Se o source criar scripts internos, atribua `.Source` com long brackets [=[...]=] ou table.concat, nunca com string multiline comum. O backend exige aprovacao manual antes de executar.',
      'Envelope: {"message":"texto curto","executions":[{"executionId":1,"source": <CODIGO_LUAU>}]}.',
      'IMPORTANTE sobre `source`: entregue o código Luau dentro de um bloco Lua long bracket [=[ ... ]=] como valor de `source` (PREFERIDO — evita erros de escape de JSON), ou então como string JSON escapada. NUNCA use string multiline comum entre aspas. `message` continua sendo string JSON normal.',
      'Mantenha `message` curta quando o source for grande.',
      'Resolva todos os pontos explicitos do pedido do usuario. Se houver varios subpedidos, a message deve resumir cada um de forma curta, clara e completa.',
      compactContext.summary,
    ].join('\n\n');
  }

  static buildSkippedExplorerSelection(reason) {
    return {
      needExplorer: false,
      includeAll: false,
      includePaths: [],
      includeClasses: [],
      includeChildrenDepth: 0,
      includeParentChain: false,
      includeScriptSource: false,
      reason: reason || 'Explorer dispensado.',
    };
  }

  static async runThinkSelection(intent, context, intentProfile, thinkModel, telemetrySink) {
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

    if (Array.isArray(telemetrySink)) {
      this.pushUsageTelemetry(telemetrySink, 'think-select', response);
    }

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
      maxTokens: 8000,
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
      maxTokens: 8000,
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
    // Desativado: templates fixos (pirâmide/rua/cubo/esfera) sequestravam o pedido
    // por palavra-chave e produziam resultados rígidos/errados. Tudo passa pelo
    // modelo agora, para qualidade consistente (objetivo "parecido com o Claude").
    return null;
    // eslint-disable-next-line no-unreachable
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
      if (sourceColonIndex === -1) break;

      // O modelo frequentemente entrega o source como bloco Lua [=[ ... ]=] ou cerca
      // ```lua em vez de string JSON escapada — aceitamos os três formatos.
      const sourceToken = this.readSourceValue(text, sourceColonIndex + 1);
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

  static matchLuaLongBracketOpen(text, pos) {
    if (text[pos] !== '[') return null;
    let i = pos + 1;
    let level = 0;
    while (text[i] === '=') {
      level += 1;
      i += 1;
    }
    if (text[i] === '[') {
      return { level, contentStart: i + 1, closer: `]${'='.repeat(level)}]` };
    }
    return null;
  }

  /**
   * Lê o valor de `source` aceitando três formatos que os modelos produzem:
   *  1. Bloco Lua long bracket:  [=[ ... ]=]  ou  [[ ... ]]
   *  2. Cerca de código:         ```lua ... ```  (ou ```luau / ``` )
   *  3. String JSON escapada:    "local x = ..."
   * Retorna { value, nextIndex } ou null.
   */
  static readSourceValue(text, startIndex) {
    let i = startIndex;
    while (i < text.length && /\s/.test(text[i])) i += 1;
    if (i >= text.length) return null;

    const ch = text[i];

    // 1. Bloco Lua long bracket
    if (ch === '[') {
      const lb = this.matchLuaLongBracketOpen(text, i);
      if (lb) {
        const close = text.indexOf(lb.closer, lb.contentStart);
        if (close !== -1) {
          return {
            value: text.slice(lb.contentStart, close).replace(/^\r?\n/, ''),
            nextIndex: close + lb.closer.length,
          };
        }
      }
    }

    // 2. Cerca de código (```lua ... ```)
    if (text.startsWith('```', i)) {
      const lineEnd = text.indexOf('\n', i);
      const contentStart = lineEnd === -1 ? i + 3 : lineEnd + 1;
      const close = text.indexOf('```', contentStart);
      if (close !== -1) {
        return { value: text.slice(contentStart, close).trim(), nextIndex: close + 3 };
      }
    }

    // 3. String JSON escapada
    if (ch === '"') {
      return (
        this.readLooseJsonTailString(text, i, ['","executionId"', '"}]', '"}', '}]}']) ||
        this.readJsonLikeString(text, i)
      );
    }

    return null;
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

  static getCommandLuauSource(command) {
    if (!command || typeof command.payload !== 'object') return null;
    if (command.action === 'RunLuau' || command.action === 'CreateScript') {
      return typeof command.payload.source === 'string' ? command.payload.source : null;
    }
    return null;
  }

  static withCommandSource(command, source) {
    return { ...command, payload: { ...(command.payload || {}), source } };
  }

  static extractLuauFromText(text) {
    const trimmed = String(text || '').trim();
    if (!trimmed) return null;
    const fenced = trimmed.match(/```(?:luau|lua)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]?.trim()) return fenced[1].trim();
    return trimmed;
  }

  /**
   * Conserta apenas a sintaxe de um source Luau, preservando a lógica. Uma única
   * chamada de modelo, focada. Retorna o source corrigido ou null se falhar.
   */
  static async repairLuauSource(source, errorSummary, model, telemetrySink) {
    const prompt = [
      'Corrija APENAS os erros de sintaxe do código Luau abaixo, preservando exatamente a mesma lógica e intenção.',
      `Problemas detectados pelo validador: ${errorSummary || 'sintaxe inválida'}.`,
      'Regras obrigatórias:',
      '- Feche todos os blocos function/if/for/while/do com o `end` correspondente.',
      '- Balanceie (), {} e [].',
      '- Para `.Source` de Script/LocalScript/ModuleScript embutido use long brackets [=[ ... ]=] ou table.concat — nunca string multiline comum entre aspas.',
      '- Não trunque o código; devolva-o completo.',
      'Responda SOMENTE com o código Luau corrigido, sem explicação e sem cercas de código (```).',
      '',
      source,
    ].join('\n');

    const response = await ModelRouter.generateResponse(prompt, {
      model,
      systemPrompt: 'Você é um linter/reparador de Luau. Devolve apenas o código corrigido, nada mais.',
      maxTokens: 8000,
      temperature: 0.1,
    });

    if (Array.isArray(telemetrySink)) {
      this.pushUsageTelemetry(telemetrySink, 'luau-repair', response);
    }
    if (!response || response.success === false) return null;
    return this.extractLuauFromText(response.text);
  }

  /**
   * Portão final de qualidade: valida cada execução Luau e tenta um autorreparo.
   * Garante que NUNCA seja enfileirado código com erro de sintaxe definitivo
   * (string/bracket aberto, truncamento). Heurística de blocos só dispara reparo;
   * nunca bloqueia sozinha (evita falso positivo).
   *
   * Retorna { commands, report, rejected }.
   */
  static async validateAndRepairExecutions(commands, options = {}) {
    const { reviewModel, telemetrySink } = options;
    const out = [];
    const report = { checked: 0, repaired: 0, rejected: 0, details: [] };
    let rejected = false;

    for (const command of Array.isArray(commands) ? commands : []) {
      const source = this.getCommandLuauSource(command);
      if (source == null) {
        out.push(command);
        continue;
      }

      report.checked += 1;
      const first = LuauValidator.validate(source);
      if (first.ok) {
        out.push(command);
        continue;
      }

      this.logDebug('validate:issues', {
        action: command.action,
        hardErrors: first.hardErrors,
        softWarnings: first.softWarnings,
      });

      const repairedSource = await this.repairLuauSource(
        source,
        [...first.hardErrors, ...first.softWarnings].join(' '),
        reviewModel,
        telemetrySink
      );
      const second = repairedSource
        ? LuauValidator.validate(repairedSource)
        : { ok: false, hardErrors: ['Reparo automático não retornou código.'], softWarnings: [] };

      // O reparo melhorou? (sem hard errors, ou pelo menos resolveu os hard errors originais)
      const repairImproved =
        repairedSource && (second.ok || (second.hardErrors.length === 0 && first.hardErrors.length > 0));

      if (repairImproved) {
        report.repaired += 1;
        out.push(this.withCommandSource(command, repairedSource));
        continue;
      }

      // Hard error persistente em ambos → código quebrado de verdade: NÃO enfileira.
      if (first.hardErrors.length > 0 && (!second || second.hardErrors.length > 0)) {
        report.rejected += 1;
        rejected = true;
        report.details.push({ action: command.action, errors: first.hardErrors });
        continue;
      }

      // Só warnings de bloco (possível falso positivo) → confia no modelo, enfileira original.
      out.push(command);
    }

    return { commands: out, report, rejected };
  }

  // ─── Loop agêntico multi-passo ──────────────────────────────────────────────

  // Mapa do jogo focado em ESTRUTURA: mostra todos os containers/scripts/UI
  // (o que a IA precisa reaproveitar) e resume massas de partes para não estourar.
  static summarizeWorkspaceForAgent(nodes, cap = 220) {
    const STRUCTURAL = new Set([
      'Folder', 'Model', 'Script', 'LocalScript', 'ModuleScript',
      'RemoteEvent', 'RemoteFunction', 'BindableEvent', 'BindableFunction',
      'ScreenGui', 'SurfaceGui', 'BillboardGui', 'Frame', 'ScrollingFrame',
      'TextButton', 'TextLabel', 'TextBox', 'ImageLabel', 'ImageButton',
      'Configuration', 'Tool', 'SpawnLocation', 'ProximityPrompt', 'Animation',
    ]);
    const lines = [];
    let count = 0;

    const walk = (list, indent) => {
      const arr = Array.isArray(list) ? list : [];
      let leafShown = 0;
      let leafTotal = 0;
      for (const node of arr) {
        if (count >= cap) return;
        const props = node?.propriedades || {};
        const cls = props.ClassName || 'Instance';
        const name = node?.nome || props.Name || 'node';
        const kids = Array.isArray(node?.filhos) ? node.filhos : [];
        const isService = indent === 0;
        const isStructural = STRUCTURAL.has(cls);

        if (isService || isStructural) {
          lines.push(`${'  '.repeat(indent)}- ${name} [${cls}]${kids.length ? ` (${kids.length} filhos)` : ''}`);
          count += 1;
          if (kids.length) walk(kids, indent + 1);
        } else {
          leafTotal += 1;
          if (leafShown < 4) {
            lines.push(`${'  '.repeat(indent)}- ${name} [${cls}]`);
            count += 1;
            leafShown += 1;
          }
        }
      }
      if (leafTotal > leafShown) {
        lines.push(`${'  '.repeat(indent)}- ... (+${leafTotal - leafShown} outros objetos)`);
      }
    };

    walk(nodes, 0);
    return lines.slice(0, cap).join('\n');
  }

  static buildAgentStepPrompt({ goal, project, history, currentPlan, attemptsOnCurrent, lastStepFailed, lastError, mustContinueReason }) {
    const historyText = (history || [])
      .slice(-8)
      .map(
        (h) =>
          `#${h.stepIndex} [${h.status}] ${h.action}: ${this.limit(h.resultSummary || '-', 200)}\n  source: ${this.limit(h.sourcePreview || '', 240)}`
      )
      .join('\n');
    const workspace = this.summarizeWorkspaceForAgent(project?.workspaceNodes || []);
    const planText =
      Array.isArray(currentPlan) && currentPlan.length > 0
        ? currentPlan.map((t) => `- [${t.status}] ${t.title}`).join('\n')
        : '(ainda NÃO existe lista de tarefas — crie uma agora a partir do objetivo)';

    return [
      `Objetivo do usuário: ${goal}`,
      project?.name ? `Projeto: ${project.name} (PlaceId ${project.placeId || '-'})` : '',
      workspace ? `Estado atual do workspace (parcial, sincronizado do Studio):\n${workspace}` : 'Workspace vazio ou ainda não sincronizado.',
      [
        'MEMÓRIA E TRABALHO INCREMENTAL (crítico):',
        '- LEIA o estado do workspace acima e o histórico de passos. Os objetos criados nos passos anteriores JÁ EXISTEM, mesmo que ainda não apareçam no snapshot (o sync é periódico) — confie no histórico.',
        '- NUNCA recrie a estrutura ou objetos que já existem. NÃO repita `Instance.new` de algo já criado num passo anterior.',
        '- Antes de criar QUALQUER coisa, use `FindFirstChild`/`WaitForChild` e só crie o que está faltando; caso exista, MODIFIQUE/AJUSTE em vez de recriar.',
        '- PADRÃO OBRIGATÓRIO ao criar algo nomeado: `local x = parent:FindFirstChild("Nome") or Instance.new(ClassName); x.Name = "Nome"; x.Parent = parent`. Assim o passo é IDEMPOTENTE e NUNCA duplica, mesmo se rodar de novo.',
        '- Se o objetivo é "melhorar"/"terminar" um jogo que já existe, parta do que está no workspace e ADICIONE/CORRIJA incrementalmente — não comece do zero.',
        '- Cada passo faz APENAS a próxima tarefa NÃO concluída; jamais refaça tarefas marcadas como "done".',
      ].join('\n'),
      `Lista de tarefas (to-do) atual:\n${planText}`,
      history && history.length > 0
        ? `Passos já executados e seus resultados REAIS:\n${historyText}`
        : 'Nenhum passo executado ainda — este é o primeiro passo do objetivo.',
      lastStepFailed
        ? `⚠️ O último passo FALHOU: ${lastError || 'erro desconhecido'}. NÃO marque essa tarefa como "done" (mantenha "failed"/"doing"). Gere uma versão CORRIGIDA da MESMA tarefa, levando o erro em conta (tentativa ${attemptsOnCurrent || 1}). Não pule para a próxima tarefa enquanto esta não funcionar.`
        : '',
      mustContinueReason ? `⛔ ${mustContinueReason} NÃO declare done=true; continue executando a próxima tarefa pendente.` : '',
      'SUA FUNÇÃO a cada passo:',
      '1. Manter e ATUALIZAR a lista de tarefas. Se ainda não existe, DECOMPONHA o objetivo numa lista ordenada de tarefas concretas e pequenas. A 1ª tarefa SEMPRE deve criar a ESTRUTURA ORGANIZADA (Folder/Model raiz + sub-pastas: ex. Arena, Goals, Spawns, Remotes). Depois: partes → RemoteEvents → script servidor → script cliente → UI. Pense tudo do zero e organize.',
      '2. Atualizar o status de cada tarefa com base no RESULTADO REAL do passo anterior: marque "done" o que já foi concluído (veja o histórico), "doing" a atual, "failed" a que falhou. MANTENHA OS MESMOS TÍTULOS das tarefas — só mude o status (e acrescente novas no FIM, se faltar). Devolva a lista COMPLETA.',
      '3. Escolher o ÚNICO próximo passo executável: a próxima tarefa "pending", ou a CORREÇÃO da que falhou. Coloque tudo DENTRO da estrutura organizada criada na 1ª tarefa.',
      '4. A `message` DEVE dizer claramente em qual tarefa você está agora (ex.: "Tarefa 2/6: criando os gols").',
      '5. Declarar done=true SOMENTE quando TODAS as tarefas da lista estiverem "done". Se UMA estiver pending/doing/failed, done=false e você DEVE fornecer a `execution` do próximo passo. NÃO encerre cedo.',
      'Responda SOMENTE em JSON: {"plan":[{"title":"...","status":"done|doing|pending|failed"}],"done":false,"message":"Tarefa X/Y: ...","execution":{"executionId":1,"source": <CODIGO_LUAU>}}',
      'Só quando TUDO estiver done: {"plan":[...todas done...],"done":true,"message":"Resumo do que foi construído. Próximos passos sugeridos: 1) ... 2) ... 3) ...","execution":null}. No fim, SEMPRE inclua 2-3 sugestões de próximos passos/melhorias.',
      'O `source` pode vir como bloco Lua long bracket [=[ ... ]=] (PREFERIDO, evita erros de escape) ou string JSON escapada. NUNCA string multiline comum entre aspas. Luau auto-contido, executável de uma vez. NÃO repita tarefas já "done".',
      ROBLOX_QUALITY_RULES,
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  static normalizeAgentPlan(rawPlan) {
    if (!Array.isArray(rawPlan)) return null;
    const allowed = ['pending', 'doing', 'done', 'failed'];
    const plan = rawPlan.slice(0, 25).map((item, index) => {
      if (typeof item === 'string') {
        return { id: index + 1, title: this.limit(item, 160), status: 'pending' };
      }
      const title =
        typeof item?.title === 'string'
          ? item.title
          : typeof item?.task === 'string'
            ? item.task
            : `Tarefa ${index + 1}`;
      const status = allowed.includes(item?.status) ? item.status : 'pending';
      return { id: index + 1, title: this.limit(title, 160), status };
    });
    return plan.length > 0 ? plan : null;
  }

  /**
   * Decide o próximo passo de um loop agêntico a partir do objetivo + resultados
   * reais já observados. Retorna { done, message, execution|null, truncated }.
   */
  static async planNextAgentStep(args, telemetrySink) {
    const { model, executionMode } = args;
    const prompt = this.buildAgentStepPrompt(args);

    const response = await ModelRouter.generateResponse(prompt, {
      model,
      systemPrompt:
        'Você é um agente autônomo de engenharia Roblox executando um objetivo passo a passo dentro do Studio. Você MANTÉM uma lista de tarefas (to-do), vê o resultado REAL de cada passo e decide o próximo. Responda SEMPRE em JSON puro estrito {"plan":[{"title":string,"status":string}],"done":boolean,"message":string,"execution":{"executionId":number,"source":string}|null}. Um passo por vez, sem texto fora do JSON.',
      maxTokens: 8000,
      temperature: executionMode === 'deep' ? 0.4 : 0.2,
    });

    if (Array.isArray(telemetrySink)) {
      this.pushUsageTelemetry(telemetrySink, 'agent-step', response);
    }

    const fallbackPlan = Array.isArray(args.currentPlan) ? args.currentPlan : null;

    if (!response || response.success === false) {
      return {
        done: true,
        message: 'O agente não conseguiu planejar o próximo passo (falha do modelo). Encerrando o loop com segurança.',
        execution: null,
        plan: fallbackPlan,
        error: true,
      };
    }

    const decision = this.parseAgentDecision(response.text, fallbackPlan);
    if (!decision) {
      return {
        done: true,
        message: this.limit(response.text || 'Resposta do agente ilegível.', 400),
        execution: null,
        plan: fallbackPlan,
        error: true,
      };
    }

    // Truncou no meio do source → não confia nesse passo.
    if (decision.execution && response.truncated) {
      return { ...decision, execution: null, truncated: true };
    }

    // Não deixa concluir com tarefas pendentes: re-pergunta UMA vez forçando continuar.
    // Usa o plano canônico do backend (args.currentPlan), não o auto-relato do modelo.
    const pendingReference = Array.isArray(args.currentPlan) ? args.currentPlan : decision.plan;
    if (decision.done && this.planHasPending(pendingReference) && !args.__reasked) {
      const pendingTitles = (pendingReference || [])
        .filter((t) => t && t.status !== 'done')
        .map((t) => t.title)
        .slice(0, 8)
        .join('; ');
      return await this.planNextAgentStep(
        {
          ...args,
          __reasked: true,
          currentPlan: decision.plan || args.currentPlan,
          lastStepFailed: false,
          lastError: null,
          mustContinueReason: `Você tentou concluir, mas ainda há tarefas não-"done": ${pendingTitles}.`,
        },
        telemetrySink
      );
    }

    return { ...decision, truncated: false };
  }

  static planHasPending(plan) {
    return Array.isArray(plan) && plan.some((t) => t && t.status !== 'done');
  }

  // Localiza um bloco de Luau (cerca ```lua OU long bracket [=[ ... ]=]) e devolve
  // sua posição + conteúdo. Usa o bloco que aparecer primeiro no texto.
  static matchLuauBlockWithRange(text) {
    const t = String(text || '');
    const candidates = [];

    const fence = t.match(/```(?:luau|lua)?\s*[\s\S]*?```/i);
    if (fence && typeof fence.index === 'number') {
      const inner = fence[0].replace(/^```(?:luau|lua)?[^\n]*\n?/i, '').replace(/```\s*$/, '').trim();
      candidates.push({ start: fence.index, end: fence.index + fence[0].length, code: inner });
    }

    const longBracket = t.match(/\[(=*)\[([\s\S]*?)\]\1\]/);
    if (longBracket && typeof longBracket.index === 'number') {
      candidates.push({
        start: longBracket.index,
        end: longBracket.index + longBracket[0].length,
        code: longBracket[2].replace(/^\r?\n/, ''),
      });
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.start - b.start);
    return candidates[0];
  }

  static shapeAgentDecision(obj, fallbackPlan) {
    const plan = this.normalizeAgentPlan(obj.plan) || fallbackPlan;
    const done = obj.done === true;
    const message =
      typeof obj.message === 'string' && obj.message.trim()
        ? obj.message.trim()
        : done
          ? 'Objetivo concluído.'
          : 'Próximo passo.';
    let execution = null;
    if (!done && obj.execution && typeof obj.execution.source === 'string' && obj.execution.source.trim()) {
      execution = { executionId: Number(obj.execution.executionId) || 1, source: obj.execution.source };
    }
    return { done, message, execution, plan };
  }

  /**
   * Parser robusto do envelope do passo do agente. Preserva `plan`/`done`/`message`
   * mesmo quando o `source` vem como bloco Lua [=[ ... ]=] (que invalida o JSON):
   * extrai o bloco, troca por um placeholder JSON, parseia o resto e reinjeta o código.
   */
  static parseAgentDecision(rawText, fallbackPlan) {
    const text = String(rawText || '');

    // 1) JSON direto (source como string escapada bem-formada).
    try {
      const obj = JSON.parse(this.extractJsonObject(text));
      if (obj && typeof obj === 'object') return this.shapeAgentDecision(obj, fallbackPlan);
    } catch {}

    // 2) Extrai o SOURCE de forma tolerante: long bracket [=[ ]=], cerca ```lua, OU
    //    string JSON "solta" (com quebras de linha/aspas cruas). É RunLuau — não precisa
    //    "parsear" o código, só pegá-lo. readSourceValue cobre os três formatos.
    let sourceCode = null;
    let span = null;
    const sourceKey = text.indexOf('"source"');
    if (sourceKey !== -1) {
      const colon = text.indexOf(':', sourceKey);
      if (colon !== -1) {
        const tok = this.readSourceValue(text, colon + 1);
        if (tok && typeof tok.value === 'string' && tok.value.trim()) {
          sourceCode = tok.value;
          span = { start: colon + 1, end: tok.nextIndex };
        }
      }
    }
    if (!sourceCode) {
      const block = this.matchLuauBlockWithRange(text);
      if (block) {
        sourceCode = block.code;
        span = { start: block.start, end: block.end };
      }
    }

    // 3) Recupera plan/done/message. Tenta o JSON com o source trocado por placeholder;
    //    se falhar, extrai cada campo de forma leniente (não depende do código).
    let obj = null;
    if (span) {
      const neutralized = `${text.slice(0, span.start)}"__BLOXAI_CODE__"${text.slice(span.end)}`;
      try { obj = JSON.parse(this.extractJsonObject(neutralized)); } catch {}
    }
    if (!obj) obj = this.lenientAgentEnvelope(text);

    if (obj) {
      if (sourceCode) {
        if (obj.execution && typeof obj.execution === 'object') obj.execution.source = sourceCode;
        else if (obj.done !== true) obj.execution = { executionId: 1, source: sourceCode };
      }
      return this.shapeAgentDecision(obj, fallbackPlan);
    }

    // 4) Sem envelope recuperável, mas temos o código → passo único.
    if (sourceCode) {
      return { done: false, message: 'Próximo passo.', execution: { executionId: 1, source: sourceCode }, plan: fallbackPlan };
    }

    return null;
  }

  // Extrai plan/done/message de um envelope mesmo com JSON malformado (source cru).
  static lenientAgentEnvelope(text) {
    const out = {};
    const doneMatch = String(text).match(/"done"\s*:\s*(true|false)/);
    if (doneMatch) out.done = doneMatch[1] === 'true';

    const messageKey = text.indexOf('"message"');
    if (messageKey !== -1) {
      const colon = text.indexOf(':', messageKey);
      const quote = colon !== -1 ? text.indexOf('"', colon + 1) : -1;
      if (quote !== -1) {
        const tok = this.readJsonLikeString(text, quote);
        if (tok) out.message = tok.value;
      }
    }

    const planKey = text.indexOf('"plan"');
    if (planKey !== -1) {
      const bracket = text.indexOf('[', planKey);
      if (bracket !== -1) {
        const seg = this.extractBalancedJsonSegment(text, bracket, '[', ']');
        if (seg) {
          try { out.plan = JSON.parse(seg); } catch {}
        }
      }
    }

    return Object.keys(out).length > 0 ? out : null;
  }

  static extractFencedLuau(text) {
    const match = String(text || '').match(/```(?:luau|lua)\s*([\s\S]*?)```/i);
    return match?.[1]?.trim() || null;
  }

  // Extrai um bloco de Luau de uma cerca ```lua OU de um long bracket Lua [=[ ... ]=].
  static extractAnyLuauBlock(text) {
    const fenced = this.extractFencedLuau(text);
    if (fenced) return fenced;
    const longBracket = String(text || '').match(/\[(=*)\[([\s\S]*?)\]\1\]/);
    return longBracket?.[2]?.trim() || null;
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
