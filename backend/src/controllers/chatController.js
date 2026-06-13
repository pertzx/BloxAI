import { AgentOrchestrator } from '../ai/AgentOrchestrator.js';
import { Command } from '../models/Command.js';
import { Project } from '../models/Project.js';

export const handleChatIntent = async (req, res) => {
  try {
    const project = await Project.findOne({ _id: req.params.id, owner: req.user.id });
    if (!project) {
      return res.status(404).json({ error: 'Projeto não encontrado' });
    }

    const { intent, chatId, chatTitle, model, mode } = req.body || {};
    if (!intent) {
      return res.status(400).json({ error: 'Faltam parâmetros' });
    }

    const normalizedChatId = typeof chatId === 'string' && chatId.trim() ? chatId.trim() : 'default';
    const normalizedChatTitle = typeof chatTitle === 'string' && chatTitle.trim() ? chatTitle.trim() : 'Chat principal';
    const recentCommands = await Command.find({ project: req.params.id, chatId: normalizedChatId })
      .sort({ createdAt: -1 })
      .limit(6)
      .lean();

    const workspaceNodes = Array.isArray(project.workspaceNodes) ? project.workspaceNodes : [];
    let aiResult;
    try {
      aiResult = await AgentOrchestrator.processUserIntent(intent, {
        preferredModel: typeof model === 'string' && model.trim() ? model.trim() : undefined,
        preferredExecutionMode: mode === 'think' ? 'think' : 'instant',
        project: {
          id: String(project._id),
          name: project.name,
          placeId: project.placeId,
          status: project.status,
          rootCount: workspaceNodes.length,
          totalNodeCount: countNodes(workspaceNodes),
          selectedNodePath: extractFirstReferencePath(intent),
          selectedNodeSummary: summarizeReferencedNode(workspaceNodes, extractFirstReferencePath(intent)),
          selectedScriptSummary: extractFirstReferenceContent(intent),
          workspaceNodes,
        },
        recentCommands: recentCommands
          .reverse()
          .map((command) => ({
            role: 'user',
            message: command.payload?.message,
            plan: command.payload?.aiPlan,
            result: safeStringify(command.result).slice(0, 240),
            status: command.status,
            model: command.payload?.selectedModel || command.payload?.model,
          })),
      });
    } catch (error) {
      console.error('[chat route] falha no orquestrador:', error);
      aiResult = {
        protocol: 'BloxAI Context Router v2',
        taskType: 'analysis',
        executionMode: 'fast',
        riskLevel: 'medium',
        responseType: 'analysis',
        plan: 'Falha segura no backend do chat.',
        commands: '',
        review: error?.message || 'Falha interna ao processar a intenção.',
        reply: 'O backend encontrou um erro ao processar sua mensagem. A conversa foi preservada e nenhum comando foi executado.',
        structuredResponse: {
          message: 'O backend encontrou um erro ao processar sua mensagem. A conversa foi preservada e nenhum comando foi executado.',
          executions: [],
        },
        contextSummary: '',
        routingReason: 'fallback-after-error',
        thinking: {
          supportedByProtocol: false,
          mode: 'fast',
          uiSupport: false,
          note: error?.message || 'Falha interna ao processar a intenção.',
        },
        selectedAgents: [],
        executableCommands: [],
        shouldQueueCommands: false,
      };
    }

    const rawExecutions = Array.isArray(aiResult.structuredResponse?.executions) ? aiResult.structuredResponse.executions : [];
    const executableCommands = Array.isArray(aiResult.executableCommands) ? aiResult.executableCommands : [];
    const shouldAwaitApproval = Boolean(aiResult.shouldQueueCommands && executableCommands.length > 0);
    const hasUncompiledExecutions = rawExecutions.length > 0 && executableCommands.length === 0;
    const requestStatus = shouldAwaitApproval ? 'AWAITING_APPROVAL' : hasUncompiledExecutions ? 'FAILED_FINAL' : 'DONE';
    const logIntentDocument = {
      project: req.params.id,
      chatId: normalizedChatId,
      chatTitle: normalizedChatTitle,
      requestId: '',
      action: 'LogIntent',
      payload: {
        message: intent,
        aiPlan: aiResult.plan,
        aiCommands: aiResult.commands,
        aiReview: aiResult.review,
        aiStructuredResponse: aiResult.structuredResponse,
        aiExecutions: rawExecutions,
        aiContextSummary: aiResult.contextSummary,
        aiProtocol: aiResult.protocol,
        aiTaskType: aiResult.taskType,
        aiRiskLevel: aiResult.riskLevel,
        aiExecutionMode: aiResult.executionMode,
        aiResponseType: aiResult.responseType,
        aiReply: aiResult.reply,
        aiRoutingReason: aiResult.routingReason,
        aiThinking: aiResult.thinking,
        aiSelectedAgents: aiResult.selectedAgents,
        aiTelemetry: aiResult.telemetry || null,
        aiContextBudget: aiResult.contextBudget || null,
        aiMode: mode === 'think' ? 'think' : 'instant',
        executionSteps:
          executableCommands.length > 0
            ? executableCommands.map((item, index) => ({
                stepIndex: index + 1,
                action: item.action,
                payload: item.payload || {},
                status: shouldAwaitApproval ? 'AWAITING_APPROVAL' : 'DONE',
                result: null,
              }))
            : hasUncompiledExecutions
              ? rawExecutions.map((item, index) => ({
                  stepIndex: index + 1,
                  action: `Execution ${item?.executionId || index + 1}`,
                  payload: {
                    __rawSource: typeof item?.source === 'string' ? item.source : '',
                  },
                  status: 'FAILED_FINAL',
                  result: 'A IA gerou uma execucao, mas o backend nao conseguiu compilar isso para uma acao valida do plugin.',
                }))
              : [],
        lastExecutionError: hasUncompiledExecutions
          ? 'A IA retornou execucoes brutas, mas nenhuma foi compilada para um comando valido do plugin. Revise o source abaixo.'
          : null,
        model: typeof model === 'string' && model.trim() ? model.trim() : 'GPT-5.4 Mini',
        selectedModel:
          aiResult.selectedAgents?.[1]?.model ||
          aiResult.selectedAgents?.[0]?.model ||
          (typeof model === 'string' && model.trim() ? model.trim() : 'GPT-5.4 Mini'),
      },
      status: requestStatus,
      requiresApproval: shouldAwaitApproval,
      approvedByUser: !shouldAwaitApproval,
    };

    try {
      const command = await Command.create(logIntentDocument);
      const requestId = String(command._id);
      command.requestId = requestId;
      await command.save();

      if (aiResult.shouldQueueCommands && executableCommands.length > 0) {
        await Command.insertMany(
          executableCommands.map((item) => ({
            project: req.params.id,
            chatId: normalizedChatId,
            chatTitle: normalizedChatTitle,
            requestId,
            parentCommandId: requestId,
            action: item.action,
            payload: item.payload || {},
            status: 'AWAITING_APPROVAL',
            requiresApproval: true,
            approvedByUser: false,
          }))
        );
      }

      res.json({ success: true, aiResult, commandId: command._id });
    } catch (persistenceError) {
      console.error('[chat route] falha ao persistir conversa/comandos:', persistenceError);
      res.json({
        success: true,
        aiResult: {
          ...aiResult,
          reply:
            'O backend gerou a resposta, mas houve falha ao salvar a conversa. Nenhum comando foi executado automaticamente.',
          structuredResponse: {
            message:
              'O backend gerou a resposta, mas houve falha ao salvar a conversa. Nenhum comando foi executado automaticamente.',
            executions: rawExecutions,
          },
          executableCommands: [],
          shouldQueueCommands: false,
        },
        commandId: null,
      });
    }
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

function safeStringify(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function countNodes(nodes = []) {
  return nodes.reduce((acc, node) => acc + 1 + countNodes(Array.isArray(node?.filhos) ? node.filhos : []), 0);
}

function extractFirstReferencePath(intent) {
  const match = String(intent || '').match(/\('((?:\\.|[^'])*)',\s*"((?:\\.|[^"])*)"\)/);
  return match?.[1] || null;
}

function extractFirstReferenceContent(intent) {
  const match = String(intent || '').match(/\('((?:\\.|[^'])*)',\s*"((?:\\.|[^"])*)"\)/);
  return match?.[2]?.split('\n').slice(0, 6).join(' ') || null;
}

function summarizeReferencedNode(nodes, targetPath) {
  if (!targetPath) return null;
  const node = findNodeByPath(nodes, targetPath);
  if (!node) return null;

  const props = node.propriedades || {};
  const summary = [
    node.nome ? `nome=${node.nome}` : '',
    props.ClassName ? `tipo=${props.ClassName}` : '',
    props.Parent ? `parent=${props.Parent}` : '',
    typeof node.filhos?.length === 'number' ? `filhos=${node.filhos.length}` : '',
    props.RunContext ? `runContext=${props.RunContext}` : '',
  ]
    .filter(Boolean)
    .join(', ');

  return summary || null;
}

function findNodeByPath(nodes, targetPath) {
  for (const node of nodes) {
    if (node?.propriedades?.Path === targetPath) return node;
    const found = findNodeByPath(Array.isArray(node?.filhos) ? node.filhos : [], targetPath);
    if (found) return found;
  }
  return null;
}
