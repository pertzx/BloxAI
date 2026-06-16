import { Project } from '../models/Project.js';
import { User } from '../models/User.js';
import { Command } from '../models/Command.js';
import { CreditService } from '../services/CreditService.js';
import { ModelRouter } from '../ai/ModelRouter.js';
import { AgentOrchestrator } from '../ai/AgentOrchestrator.js';

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

    const { intent, chatId, chatTitle, model } = req.body || {};
    if (!intent) {
      sendEvent({ type: 'error', error: 'Parâmetro "intent" obrigatório' });
      return res.end();
    }

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

    // runThinkSelection é uma chamada rápida de classificação de explorer
    const thinkSelection = await AgentOrchestrator.runThinkSelection(
      intent,
      context,
      intentProfile,
      selectedModels.think
    );
    const compactContext = AgentOrchestrator.buildCompactContext(
      intent,
      context,
      intentProfile,
      thinkSelection
    );

    // ── 4. Montar prompt por tipo de resposta ─────────────────────────────────
    let prompt, systemPrompt, maxTokens;

    if (intentProfile.responseType === 'conversation') {
      prompt = [
        `Pedido do usuario: ${intent}`,
        'Responda de forma natural, curta, útil e amigável. Não trate isso como comando a executar.',
        compactContext.summary,
      ].join('\n\n');
      systemPrompt =
        'Você é um assistente conversacional para um painel de IA de desenvolvimento Roblox. Responda como chat natural, sem mencionar fila, execução ou comandos.';
      maxTokens = 420;
    } else if (
      intentProfile.responseType === 'analysis' ||
      intentProfile.taskType === 'analysis' ||
      intentProfile.taskType === 'generic'
    ) {
      prompt = [
        `Pedido do usuario: ${intent}`,
        `Tipo: ${intentProfile.taskType}`,
        'Responda como analista técnico. Analise, planeje e explique. Se houver vários pontos, cubra todos.',
        compactContext.summary,
      ].join('\n\n');
      systemPrompt =
        'Você é um agente analítico do Blox AI. Responda em texto normal, sem gerar executions, sem fila e sem proposta de aprovação.';
      maxTokens = 1400;
    } else {
      // proposal / roblox_code / debug / etc. → formato JSON executor
      prompt = AgentOrchestrator.buildGeneratorPrompt(intent, compactContext, intentProfile, thinkSelection);
      systemPrompt =
        'Você é o agente executor mestre do Blox AI. Responda em JSON puro no formato {"message":"texto","executions":[{"executionId":1,"source":"conteudo"}]}. O source deve ser Luau auto-contido. Se criar scripts internos use long brackets [=[...]=]. Antes de finalizar, confira aspas, parênteses e blocos function/end.';
      maxTokens = 1800;
    }

    // ── 5. Stream de tokens ───────────────────────────────────────────────────
    sendEvent({ type: 'start', responseType: intentProfile.responseType });

    const streamResult = await ModelRouter.generateResponseStream(
      prompt,
      { model: selectedModels.generate, systemPrompt, maxTokens, temperature: 0.2 },
      (token) => sendEvent({ type: 'token', token })
    );

    // ── 6. Extrair reply e execuções do texto acumulado ───────────────────────
    let reply = streamResult.text;
    let structuredResponse = { message: reply, executions: [] };

    if (
      intentProfile.responseType !== 'conversation' &&
      intentProfile.responseType !== 'analysis'
    ) {
      try {
        const parsed = AgentOrchestrator.parseStructuredResponse(streamResult.text);
        structuredResponse = parsed;
        reply = parsed.message || streamResult.text;
      } catch {
        // mantém reply como texto bruto se JSON falhar
      }
    }

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
      commands: '',
      review: '',
      reply,
      structuredResponse,
      routingReason: intentProfile.reason,
      executableCommands: [],
      shouldQueueCommands: false,
      telemetry: {
        estimatedCostUsd: streamResult.usage?.estimatedCostUsd || 0,
        inputTokens: streamResult.usage?.inputTokens || 0,
        outputTokens: streamResult.usage?.outputTokens || 0,
        totalTokens: streamResult.usage?.totalTokens || 0,
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
          aiContextSummary: compactContext.summary,
          aiTaskType: intentProfile.taskType,
        },
        status: 'DONE',
        requiresApproval: false,
        approvedByUser: true,
      });
      commandDoc.requestId = String(commandDoc._id);
      commandId = String(commandDoc._id);

      const realCostUsd = Number(streamResult.usage?.estimatedCostUsd || 0);
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
              inputTokens: streamResult.usage?.inputTokens || 0,
              outputTokens: streamResult.usage?.outputTokens || 0,
              totalTokens: streamResult.usage?.totalTokens || 0,
            },
          });
          commandDoc.payload.aiBilling = billing;
          commandDoc.markModified('payload');
        } catch (billingErr) {
          console.error('[stream] falha ao cobrar:', billingErr?.message);
        }
      }

      await commandDoc.save();
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
