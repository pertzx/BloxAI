import { Project } from '../models/Project.js';
import { User } from '../models/User.js';
import { Command } from '../models/Command.js';
import { CreditService } from '../services/CreditService.js';
import { ModelRouter } from '../ai/ModelRouter.js';
import { AgentOrchestrator } from '../ai/AgentOrchestrator.js';
import { buildAttachmentsBlock } from '../services/FileService.js';

/**
 * SSE endpoint para modo Instant com streaming real de tokens.
 * POST /api/projects/:id/chat/stream
 *
 * Eventos enviados (text/event-stream):
 *  {type:"start", responseType}            — logo antes dos tokens
 *  {type:"token", token:"..."}             — cada delta de texto
 *  {type:"done", aiResult, commandId, billing} — tudo persistido
 *  {type:"error", error, code?}            — qualquer falha
 */
export const handleChatStream = async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const sendEvent = (data) => {
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {}
  };

  try {
    // ── 1. Validações básicas ─────────────────────────────────────────────────
    const project = await Project.findOne({ _id: req.params.id, owner: req.user.id });
    if (!project) {
      sendEvent({ type: 'error', error: 'Projeto não encontrado' });
      return res.end();
    }

    const { intent, chatId, chatTitle, model, attachments, mode } = req.body || {};
    if (!intent) {
      sendEvent({ type: 'error', error: 'Parâmetro "intent" obrigatório' });
      return res.end();
    }

    const attachBlock = buildAttachmentsBlock(attachments);

    const user = await User.findById(req.user.id);
    const eligibility = CreditService.checkSpendEligibility(user);
    if (!eligibility.allowed) {
      sendEvent({ type: 'error', error: eligibility.reason, code: eligibility.code });
      return res.end();
    }

    // ── 2. Classificar intent + selecionar modelos ────────────────────────────
    const intentProfile = AgentOrchestrator.classifyIntent(intent);
    intentProfile.executionMode = 'fast';
    intentProfile.reason += ', userMode=stream';

    const selectedModels = AgentOrchestrator.selectModels(intentProfile, model || null);

    // ── 3. Construir contexto (igual ao ChatService) ──────────────────────────
    const normalizedChatId = typeof chatId === 'string' && chatId.trim() ? chatId.trim() : 'default';
    const normalizedChatTitle =
      typeof chatTitle === 'string' && chatTitle.trim() ? chatTitle.trim() : 'Chat principal';

    const recentCommands = await Command.find({
      project: String(project._id),
      chatId: normalizedChatId,
    })
      .sort({ createdAt: -1 })
      .limit(6)
      .lean();

    const workspaceNodes = Array.isArray(project.workspaceNodes) ? project.workspaceNodes : [];
    const activeContextItems = Array.isArray(project.contextState)
      ? project.contextState.filter((i) => !i.done).map((i) => i.text)
      : [];

    const context = {
      preferredModel: model,
      preferredExecutionMode: 'instant',
      project: {
        id: String(project._id),
        name: project.name,
        placeId: project.placeId,
        status: project.status,
        rootCount: workspaceNodes.length,
        totalNodeCount: countNodes(workspaceNodes),
        workspaceNodes,
        contextState: activeContextItems.length > 0 ? activeContextItems : null,
      },
      recentCommands: recentCommands
        .slice()
        .reverse()
        .map((cmd) => ({
          role: 'user',
          message: cmd.payload?.message,
          plan: cmd.payload?.aiPlan,
          result: safeStringify(cmd.result).slice(0, 240),
          status: cmd.status,
          model: cmd.payload?.selectedModel || cmd.payload?.model,
        })),
    };

    // Conversa pura não precisa do seletor de explorer (LLM) — evita gasto de tokens
    // avulso em saudações. Para os demais tipos, o custo é faturado via thinkTelemetry.
    // Single-pass (Think) e conversa NÃO usam o seletor de explorer por LLM — o Think
    // já recebe o workspace inteiro no prompt da solução, e conversa não precisa.
    const thinkTelemetry = [];
    const thinkSelection =
      intentProfile.responseType === 'conversation' || mode === 'think'
        ? AgentOrchestrator.buildSkippedExplorerSelection('Single-pass/conversa: workspace enviado direto, sem seletor LLM.')
        : await AgentOrchestrator.runThinkSelection(intent, context, intentProfile, selectedModels.think, thinkTelemetry);
    const thinkCostUsd = thinkTelemetry.reduce((acc, item) => acc + Number(item.estimatedCostUsd || 0), 0);
    const compactContext = AgentOrchestrator.buildCompactContext(
      intent,
      context,
      intentProfile,
      thinkSelection
    );

    // ── 3.5 Fase de raciocínio (Think) — streamada ao vivo no painel "Raciocínio". ──
    let reasoningText = '';
    let reasoningCostUsd = 0;
    if (mode === 'think') {
      sendEvent({ type: 'think_start' });
      try {
        const wsSummary = AgentOrchestrator.summarizeWorkspaceForAgent(workspaceNodes, 120);
        const reasoningResult = await ModelRouter.generateResponseStream(
          [
            `Objetivo do usuário: ${intent}`,
            wsSummary ? `Estado atual do jogo (não recrie o que já existe):\n${wsSummary}` : 'Jogo praticamente vazio.',
            compactContext.summary,
            'Pense em voz alta, em português: o que JÁ existe, a lista de tarefas (to-do) para concluir o objetivo, e a ordem. NÃO escreva o código final aqui — só o raciocínio e o plano.',
          ].filter(Boolean).join('\n\n'),
          {
            model: selectedModels.generate,
            systemPrompt: 'Você é um engenheiro Roblox sênior raciocinando sobre o problema antes de construir. Escreva o raciocínio e o plano de tarefas de forma clara e concisa, em primeira pessoa.',
            maxTokens: 1200,
            temperature: 0.4,
          },
          (token) => sendEvent({ type: 'think_token', token })
        );
        reasoningText = reasoningResult.text || '';
        reasoningCostUsd = Number(reasoningResult.usage?.estimatedCostUsd || 0);
      } catch (reasoningErr) {
        console.error('[stream] falha na fase de raciocínio:', reasoningErr?.message);
      }
      sendEvent({ type: 'think_done' });
    }

    // ── 4. Gerar resposta ──────────────────────────────────────────────────────
    const isConversation = intentProfile.responseType === 'conversation';
    const treatAsAnalysis =
      mode !== 'think' &&
      (intentProfile.responseType === 'analysis' ||
        intentProfile.taskType === 'analysis' ||
        intentProfile.taskType === 'generic');
    // Think = solução completa lendo o workspace; Instant não-conversa/não-análise também executa.
    const wantsExecution = !isConversation && !treatAsAnalysis;
    if (wantsExecution) intentProfile.responseType = 'proposal';

    let reply = '';
    let structuredResponse = { message: '', executions: [] };
    let rawExecutions = [];
    let executableCommands = [];
    let repairCostUsd = 0;
    let genUsage = { estimatedCostUsd: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    let agentPlan = null;

    sendEvent({ type: 'start', responseType: intentProfile.responseType });

    if (mode === 'think') {
      // === MODO AGENTE: planeja a to-do e gera o PRIMEIRO passo. Os próximos
      // saem um a um (loop em reportCommandResult) até concluir, com sugestões no fim. ===
      intentProfile.responseType = 'proposal';
      const plannerTelemetry = [];
      const decision = await AgentOrchestrator.planNextAgentStep(
        {
          goal: intent,
          project: { name: project.name, placeId: project.placeId, workspaceNodes },
          history: [],
          currentPlan: null,
          attemptsOnCurrent: 0,
          lastStepFailed: false,
          lastError: null,
          model: selectedModels.generate,
          executionMode: 'fast',
        },
        plannerTelemetry
      );
      genUsage = {
        estimatedCostUsd: plannerTelemetry.reduce((a, i) => a + Number(i.estimatedCostUsd || 0), 0),
        inputTokens: plannerTelemetry.reduce((a, i) => a + Number(i.inputTokens || 0), 0),
        outputTokens: plannerTelemetry.reduce((a, i) => a + Number(i.outputTokens || 0), 0),
        totalTokens: plannerTelemetry.reduce((a, i) => a + Number(i.totalTokens || 0), 0),
      };
      agentPlan = Array.isArray(decision.plan)
        ? decision.plan.map((t, i) => ({ title: t.title, status: i === 0 ? 'doing' : 'pending' }))
        : null;
      reply = decision.message || 'Plano criado.';
      if (decision.execution && typeof decision.execution.source === 'string' && decision.execution.source.trim()) {
        rawExecutions = [decision.execution];
        executableCommands = [{ action: 'RunLuau', payload: { language: 'luau', source: decision.execution.source } }];
      }
      structuredResponse = { message: reply, executions: rawExecutions };
      sendEvent({ type: 'token', token: reply });
    } else {
      // === INSTANT: conversa / análise / proposta — single-pass em streaming. ===
      let prompt, systemPrompt, maxTokens;
      if (isConversation) {
        prompt = [
          `Pedido do usuario: ${intent}`,
          'Responda de forma natural, curta, útil e amigável. Não trate isso como comando a executar.',
          compactContext.summary,
        ].join('\n\n');
        systemPrompt =
          'Você é um assistente conversacional para um painel de IA de desenvolvimento Roblox. Responda como chat natural, sem mencionar fila, execução ou comandos.';
        maxTokens = 1200;
      } else if (treatAsAnalysis) {
        prompt = [
          `Pedido do usuario: ${intent}`,
          `Tipo: ${intentProfile.taskType}`,
          'Responda como analista técnico. Analise, planeje e explique. Se houver vários pontos, cubra todos.',
          compactContext.summary,
        ].join('\n\n');
        systemPrompt =
          'Você é um agente analítico do Blox AI. Responda em texto normal, sem gerar executions, sem fila e sem proposta de aprovação. Cubra todos os pontos do pedido com profundidade, sem encurtar a resposta.';
        maxTokens = 4000;
      } else {
        prompt = AgentOrchestrator.buildGeneratorPrompt(intent, compactContext, intentProfile, thinkSelection);
        systemPrompt =
          'Você é um DESENVOLVEDOR Roblox sênior dentro de um plugin: o Luau que você retorna É EXECUTADO no Studio e cria o jogo de verdade. Para UI, PREFIRA um LocalScript que monta a interface. NUNCA deixe nada pela metade (sem TODO/placeholder/comentário "fazer depois") — termine TUDO agora. Responda APENAS com o JSON do envelope — sem "THINK:", sem "Resposta:", sem nenhum texto antes ou depois. Formato: {"message":"texto curto","executions":[{"executionId":1,"source": <CODIGO_LUAU>}]}. O `source` pode ser um bloco Lua long bracket [=[ ... ]=] (PREFERIDO) ou string JSON escapada; nunca string multiline comum entre aspas. Código auto-contido, completo e de alta qualidade, nunca truncado ou simplificado demais. Antes de finalizar, confira aspas, parênteses e blocos function/end.';
        maxTokens = 8000;
      }

      if (attachBlock) prompt = `${prompt}\n\n${attachBlock}`;

      const streamResult = await ModelRouter.generateResponseStream(
        prompt,
        { model: selectedModels.generate, systemPrompt, maxTokens, temperature: 0.2 },
        (token) => sendEvent({ type: 'token', token })
      );

      if (streamResult.success === false) {
        sendEvent({ type: 'error', error: streamResult.text || 'Falha na geração da IA.' });
        return res.end();
      }
      genUsage = streamResult.usage || genUsage;

      reply = streamResult.text;
      structuredResponse = { message: reply, executions: [] };
      if (wantsExecution) {
        try {
          const parsed = AgentOrchestrator.parseStructuredResponse(streamResult.text);
          structuredResponse = parsed;
          reply = parsed.message || streamResult.text;
        } catch {
          // mantém reply como texto bruto se JSON falhar
        }
      }
      rawExecutions = Array.isArray(structuredResponse.executions) ? structuredResponse.executions : [];
      if (wantsExecution) {
        try { executableCommands = AgentOrchestrator.compileExecutionsToCommands(rawExecutions) || []; }
        catch { executableCommands = []; }
      }
      if (streamResult.truncated && wantsExecution) {
        executableCommands = [];
        reply = 'A resposta foi cortada pelo limite de tokens. Para evitar código incompleto, nada foi enfileirado — divida o pedido em partes menores e tente de novo.';
        structuredResponse = { message: reply, executions: [] };
      }
    }

    // Portão de qualidade (compartilhado): valida e autorrepara o Luau antes de enfileirar.
    if (executableCommands.length > 0) {
      const repairTelemetry = [];
      const validation = await AgentOrchestrator.validateAndRepairExecutions(executableCommands, {
        reviewModel: selectedModels.review,
        telemetrySink: repairTelemetry,
      });
      executableCommands = validation.commands;
      repairCostUsd += repairTelemetry.reduce((acc, item) => acc + Number(item.estimatedCostUsd || 0), 0);
      if (validation.rejected && executableCommands.length === 0) {
        reply = 'Gerei a implementação, mas a validação de sintaxe Luau encontrou código quebrado que não consegui corrigir com segurança — então não enfileirei nada para não dar erro no Studio. Reenvie o pedido (de preferência com escopo um pouco menor).';
        structuredResponse = { message: reply, executions: [] };
      }
    }

    // Modo agente (Think): enfileira só o PRIMEIRO passo; os próximos saem um a um.
    if (mode === 'think' && executableCommands.length > 1) {
      executableCommands = [executableCommands[0]];
    }

    const shouldAwaitApproval = executableCommands.length > 0;
    const hasUncompiledExecutions = rawExecutions.length > 0 && executableCommands.length === 0;
    const requestStatus = shouldAwaitApproval ? 'AWAITING_APPROVAL' : (hasUncompiledExecutions ? 'FAILED_FINAL' : 'DONE');

    const aiResult = {
      protocol: 'BloxAI Context Router v2',
      status: 'Completed',
      taskType: intentProfile.taskType,
      executionMode: 'fast',
      riskLevel: intentProfile.riskLevel,
      responseType: intentProfile.responseType,
      thinking: {
        supportedByProtocol: false,
        mode: 'fast',
        uiSupport: false,
        note: 'Resposta gerada em modo stream.',
      },
      selectedAgents: [{ role: 'assistant', model: selectedModels.generate }],
      contextSummary: compactContext.summary,
      contextBudget: compactContext.budget,
      plan: thinkSelection.reason,
      reasoning: reasoningText,
      commands: '',
      review: '',
      reply,
      structuredResponse,
      agentPlan: agentPlan || null,
      routingReason: intentProfile.reason,
      executableCommands,
      shouldQueueCommands: shouldAwaitApproval,
      telemetry: {
        estimatedCostUsd: genUsage?.estimatedCostUsd || 0,
        inputTokens: genUsage?.inputTokens || 0,
        outputTokens: genUsage?.outputTokens || 0,
        totalTokens: genUsage?.totalTokens || 0,
      },
    };

    // ── 7. Persistir conversa + cobrar uso ────────────────────────────────────
    let commandId = null;
    let billing = null;

    try {
      const commandDoc = await Command.create({
        project: String(project._id),
        chatId: normalizedChatId,
        chatTitle: normalizedChatTitle,
        requestId: '',
        action: 'LogIntent',
        payload: {
          message: intent,
          aiPlan: thinkSelection.reason,
          aiReply: reply,
          aiMode: 'stream',
          model: selectedModels.generate,
          selectedModel: selectedModels.generate,
          aiStructuredResponse: structuredResponse,
          aiExecutions: rawExecutions,
          aiContextSummary: compactContext.summary,
          aiReasoning: reasoningText,
          aiMode2: mode === 'think' ? 'think' : 'instant',
          ...(mode === 'think' && shouldAwaitApproval
            ? {
                agentLoop: true,
                agentGoal: intent,
                agentMaxSteps: 12,
                agentStep: 1,
                agentStatus: 'running',
                agentPlan: agentPlan || null,
                agentTaskCursor: 0,
              }
            : {}),
          aiResponseType: intentProfile.responseType,
          aiTaskType: intentProfile.taskType,
          executionSteps: shouldAwaitApproval
            ? executableCommands.map((item, index) => ({
                stepIndex: index + 1,
                action: item.action,
                payload: item.payload || {},
                status: 'AWAITING_APPROVAL',
                result: null,
              }))
            : hasUncompiledExecutions
              ? rawExecutions.map((item, index) => ({
                  stepIndex: index + 1,
                  action: `Execution ${item?.executionId || index + 1}`,
                  payload: { __rawSource: typeof item?.source === 'string' ? item.source : '' },
                  status: 'FAILED_FINAL',
                  result: 'A IA gerou uma execução, mas o backend não conseguiu compilar para uma ação válida do plugin.',
                }))
              : [],
          lastExecutionError: hasUncompiledExecutions
            ? 'A IA retornou execuções brutas, mas nenhuma foi compilada para um comando válido do plugin.'
            : null,
        },
        status: requestStatus,
        requiresApproval: shouldAwaitApproval,
        approvedByUser: !shouldAwaitApproval,
      });
      commandDoc.requestId = String(commandDoc._id);
      commandId = String(commandDoc._id);

      const realCostUsd = Number(genUsage?.estimatedCostUsd || 0) + thinkCostUsd + repairCostUsd + reasoningCostUsd;
      if (realCostUsd > 0) {
        try {
          billing = await CreditService.chargeForUsage({
            userId: String(user._id),
            realCostUsd,
            model: selectedModels.generate,
            type: intentProfile.taskType,
            projectId: String(project._id),
            commandId: commandDoc._id,
            tokens: {
              inputTokens: genUsage?.inputTokens || 0,
              outputTokens: genUsage?.outputTokens || 0,
              totalTokens: genUsage?.totalTokens || 0,
            },
          });
          commandDoc.payload.aiBilling = billing;
          commandDoc.markModified('payload');
        } catch (billingErr) {
          console.error('[stream] falha ao cobrar:', billingErr?.message);
        }
      }

      await commandDoc.save();

      // Enfileira os comandos executáveis (aguardando aprovação) para o plugin executar.
      if (shouldAwaitApproval) {
        await Command.insertMany(
          executableCommands.map((item) => ({
            project: String(project._id),
            chatId: normalizedChatId,
            chatTitle: normalizedChatTitle,
            requestId: commandDoc.requestId,
            parentCommandId: commandDoc.requestId,
            action: item.action,
            payload: item.payload || {},
            status: 'AWAITING_APPROVAL',
            requiresApproval: true,
            approvedByUser: false,
          }))
        );
      }
    } catch (persistErr) {
      console.error('[stream] falha ao persistir:', persistErr?.message);
    }

    sendEvent({ type: 'done', aiResult, commandId, billing });
    res.end();
  } catch (err) {
    console.error('[stream] erro crítico:', err);
    try {
      res.write(`data: ${JSON.stringify({ type: 'error', error: err?.message || 'Erro interno' })}\n\n`);
    } catch {}
    res.end();
  }
};

// ─── Helpers locais ───────────────────────────────────────────────────────────

function countNodes(nodes = []) {
  return nodes.reduce((acc, node) => acc + 1 + countNodes(Array.isArray(node?.filhos) ? node.filhos : []), 0);
}

function safeStringify(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}
