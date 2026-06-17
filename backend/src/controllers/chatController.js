import { Project } from '../models/Project.js';
import { User } from '../models/User.js';
import { AiJob } from '../models/AiJob.js';
import { CreditService } from '../services/CreditService.js';
import { ChatService } from '../services/ChatService.js';
import { jobQueue } from '../services/JobQueue.js';
import { buildAttachmentsBlock } from '../services/FileService.js';

export const handleChatIntent = async (req, res) => {
  try {
    const project = await Project.findOne({ _id: req.params.id, owner: req.user.id });
    if (!project) {
      return res.status(404).json({ error: 'Projeto não encontrado' });
    }

    const { intent, chatId, chatTitle, model, mode, attachments } = req.body || {};
    if (!intent) {
      return res.status(400).json({ error: 'Faltam parâmetros' });
    }

    // Anexos do usuário são injetados como contexto no próprio intent
    // (flui para os modos think e instant sem replumbing).
    const attachBlock = buildAttachmentsBlock(attachments);
    const effectiveIntent = attachBlock ? `${intent}\n\n${attachBlock}` : intent;

    // Valida saldo e status da conta antes de gastar API de IA.
    const billingUser = await User.findById(req.user.id);
    const eligibility = CreditService.checkSpendEligibility(billingUser);
    if (!eligibility.allowed) {
      return res.status(402).json({
        error: eligibility.reason,
        code: eligibility.code,
        billing: {
          balanceUsd: billingUser ? Number((billingUser.balanceUsd || 0).toFixed(6)) : 0,
          status: billingUser ? CreditService.resolveStatus(billingUser) : 'unknown',
        },
      });
    }

    // Modo Think: desacopla em fila. Responde 202 na hora e processa em background,
    // evitando timeouts de conexão HTTP em gerações longas.
    if (mode === 'think') {
      const job = await AiJob.create({
        project: project._id,
        user: req.user.id,
        intent: effectiveIntent,
        chatId: typeof chatId === 'string' && chatId.trim() ? chatId.trim() : 'default',
        chatTitle: typeof chatTitle === 'string' && chatTitle.trim() ? chatTitle.trim() : 'Chat principal',
        model: typeof model === 'string' && model.trim() ? model.trim() : '',
        mode: 'think',
        status: 'queued',
      });

      await jobQueue.enqueueAiThink(String(job._id));

      return res.status(202).json({
        success: true,
        mode: 'think',
        taskId: String(job._id),
        status: 'queued',
        pollUrl: `/api/projects/${req.params.id}/chat/task/${job._id}`,
      });
    }

    // Modo Instant: processamento síncrono.
    const out = await ChatService.runIntent({
      project,
      userId: req.user.id,
      intent: effectiveIntent,
      chatId,
      chatTitle,
      model,
      mode: 'instant',
    });

    return res.json({ success: true, ...out });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: true,
      aiResult: {
        protocol: 'BloxAI Context Router v2',
        taskType: 'analysis',
        executionMode: 'fast',
        riskLevel: 'high',
        responseType: 'analysis',
        plan: 'Falha critica da rota de chat.',
        commands: '',
        review: error instanceof Error ? error.message : 'Falha critica no backend do chat.',
        reply: 'A rota do chat falhou antes de concluir o processamento. Nenhum comando foi executado.',
        structuredResponse: {
          message: 'A rota do chat falhou antes de concluir o processamento. Nenhum comando foi executado.',
          executions: [],
        },
        contextSummary: '',
        routingReason: 'route-critical-fallback',
        thinking: {
          supportedByProtocol: false,
          mode: 'fast',
          uiSupport: false,
          note: error instanceof Error ? error.message : 'Falha critica no backend do chat.',
        },
        selectedAgents: [],
        executableCommands: [],
        shouldQueueCommands: false,
      },
      commandId: null,
    });
  }
};

// Polling de tarefa Think: o cliente consulta até status 'done'/'failed'.
export const getChatTask = async (req, res) => {
  try {
    const job = await AiJob.findOne({
      _id: req.params.taskId,
      project: req.params.id,
      user: req.user.id,
    }).lean();

    if (!job) {
      return res.status(404).json({ error: 'Tarefa não encontrada' });
    }

    res.json({
      success: true,
      taskId: String(job._id),
      status: job.status,
      mode: job.mode,
      aiResult: job.status === 'done' ? job.result : null,
      billing: job.billing || null,
      commandId: job.commandId || null,
      error: job.error || null,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    });
  } catch (error) {
    console.error('[chat task] falha ao consultar tarefa:', error);
    res.status(500).json({ error: 'Falha ao consultar tarefa.' });
  }
};
