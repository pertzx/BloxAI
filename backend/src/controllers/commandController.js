import { Command } from '../models/Command.js';
import { Project } from '../models/Project.js';
import { AgentOrchestrator } from '../ai/AgentOrchestrator.js';

export const getNextCommand = async (req, res) => {
  try {
    const project = await Project.findOne({ owner: req.user.id }).sort({ lastSync: -1 });
    if (!project) {
      return res.json({ command: null });
    }

    const command = await Command.findOne({ project: project._id, status: 'PENDING' }).sort({ createdAt: 1 });
    if (!command) {
      return res.json({ command: null });
    }

    if (command.parentCommandId) {
      await Command.updateOne(
        { _id: command.parentCommandId },
        { $set: { status: 'EXECUTING', updatedAt: new Date() } }
      );
    }

    command.status = 'EXECUTING';
    await command.save();

    res.json({ command });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar comando' });
  }
};

export const reportCommandResult = async (req, res) => {
  try {
    const { id } = req.params;
    const { success, result } = req.body;
    const normalizedSuccess = Boolean(success) && !hasEmbeddedFailure(result);
    const summarizedError = normalizedSuccess ? null : summarizeExecutionError(result);

    const command = await Command.findById(id);
    if (!command) return res.status(404).json({ error: 'Comando não encontrado' });

    const project = await Project.findOne({ _id: command.project, owner: req.user.id });
    if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });

    command.status = normalizedSuccess ? 'DONE' : 'FAILED';
    command.result = result;
    await command.save();

    if (!command.parentCommandId) {
      return res.json({
        message: 'Resultado salvo',
        requestCompleted: true,
        requestStatus: command.status,
        resultSummary: summarizeResult(result),
      });
    }

    const parentCommand = await Command.findById(command.parentCommandId);
    if (!parentCommand) {
      return res.json({ message: 'Resultado salvo', requestCompleted: false, requestStatus: command.status });
    }

    const requestId = parentCommand.requestId || String(parentCommand._id);
    const isThinkMode =
      parentCommand.payload?.aiMode === 'think' ||
      parentCommand.payload?.aiExecutionMode === 'deep';

    if (!normalizedSuccess) {
      await Command.updateMany(
        {
          project: command.project,
          requestId,
          parentCommandId: String(parentCommand._id),
          _id: { $ne: command._id },
          status: { $in: ['PENDING', 'QUEUED'] },
        },
        {
          $set: {
            status: 'CANCELLED',
            updatedAt: new Date(),
            result: 'Cancelado após falha anterior na mesma requisição.',
          },
        }
      );
    }

    let siblings = await Command.find({
      project: command.project,
      requestId,
      parentCommandId: String(parentCommand._id),
    }).sort({ createdAt: 1 });

    const executionSteps = siblings.map((item, index) => ({
      stepIndex: index + 1,
      commandId: String(item._id),
      action: item.action,
      payload: item.payload || {},
      status: item.status,
      result: item.result ?? null,
    }));

    parentCommand.payload = {
      ...(parentCommand.payload || {}),
      executionSteps,
      lastExecutionResult: result ?? null,
      lastExecutionError: summarizedError,
      lastFailedStep: normalizedSuccess
        ? parentCommand.payload?.lastFailedStep || null
        : {
            commandId: String(command._id),
            action: String(command.action || 'Comando'),
            stepIndex: siblings.findIndex((item) => String(item._id) === String(command._id)) + 1,
            error: summarizedError || stringifyResult(result),
          },
    };

    let followUpGenerated = false;
    if (!normalizedSuccess && Number(parentCommand.retryCount || 0) < Number(parentCommand.maxRetries || 1)) {
      const workspaceNodes = Array.isArray(project?.workspaceNodes) ? project.workspaceNodes : [];
      const failedIndex = siblings.findIndex((item) => String(item._id) === String(command._id));
      const priorSuccessfulCommands =
        failedIndex <= 0
          ? []
          : siblings.slice(0, failedIndex).filter((item) => item.status === 'DONE');
      const shouldRegenerateFullScript =
        ['RunLuau', 'CreateScript'].includes(String(command.action)) &&
        priorSuccessfulCommands.length === 0;
      const compileErrorGuidance = buildCompileErrorGuidance(summarizedError || stringifyResult(result));
      const retryIntent = [
        String(parentCommand.payload?.message || ''),
        '',
        `O comando ${command.action} falhou com este erro especifico: ${summarizedError || stringifyResult(result)}.`,
        isThinkMode && summarizedError && summarizedError !== stringifyResult(result)
          ? `Detalhes brutos reportados pelo plugin: ${stringifyResult(result)}.`
          : '',
        compileErrorGuidance,
        shouldRegenerateFullScript
          ? 'A primeira execucao falhou antes de concluir. Assuma que nada foi aplicado com seguranca e regenere a implementacao completa, nao envie apenas um trecho de correcao.'
          : isThinkMode
            ? 'Analise o que aconteceu, classifique se a falha foi de sintaxe, ambiente ou logica, corrija com a menor quantidade de comandos possivel e nao repita o que ja deu certo.'
            : 'Corrija rapidamente o problema com a menor quantidade de comandos possivel e nao repita o que ja deu certo.',
        'Se a falha aconteceu em script principal ou RunLuau, prefira reenviar o script completo corrigido em vez de patch parcial.',
        'Se nao houver correcao segura, responda sem execucoes.',
      ]
        .filter(Boolean)
        .join('\n');
      const aiResult = await AgentOrchestrator.processUserIntent(retryIntent, {
        preferredModel: parentCommand.payload?.selectedModel || parentCommand.payload?.model,
        preferredExecutionMode: isThinkMode ? 'think' : 'instant',
        project: {
          id: String(project?._id || ''),
          name: project?.name,
          placeId: project?.placeId,
          status: project?.status,
          rootCount: workspaceNodes.length,
          totalNodeCount: countNodes(workspaceNodes),
          workspaceNodes,
        },
        recentCommands: siblings.map((item) => ({
          role: 'system',
          message: item.action,
          result: stringifyResult(item.result),
          status: item.status,
          model: parentCommand.payload?.selectedModel || parentCommand.payload?.model,
        })),
      });

      if (Array.isArray(aiResult.executableCommands) && aiResult.executableCommands.length > 0) {
        const repairCommands = aiResult.executableCommands.map((item) => ({
          project: command.project,
          chatId: parentCommand.chatId,
          chatTitle: parentCommand.chatTitle,
          requestId,
          parentCommandId: String(parentCommand._id),
          action: item.action,
          payload: {
            ...(item.payload || {}),
            __retryGeneratedFrom: {
              failedCommandId: String(command._id),
              failedAction: String(command.action || 'Comando'),
              failedStepIndex: failedIndex + 1,
              failedError: summarizedError || stringifyResult(result),
              retryMode: isThinkMode ? 'think' : 'instant',
            },
            __fullScriptRegeneration:
              shouldRegenerateFullScript && ['RunLuau', 'CreateScript'].includes(String(item.action))
                ? {
                    enabled: true,
                    reason: 'A primeira execucao falhou antes de aplicar com seguranca, entao a correcao reenviou a implementacao completa.',
                    retryMode: isThinkMode ? 'think' : 'instant',
                  }
                : undefined,
          },
          status: 'AWAITING_APPROVAL',
          requiresApproval: true,
          approvedByUser: false,
        }));
        await Command.insertMany(repairCommands);
        siblings = await Command.find({
          project: command.project,
          requestId,
          parentCommandId: String(parentCommand._id),
        }).sort({ createdAt: 1 });
        parentCommand.retryCount = Number(parentCommand.retryCount || 0) + 1;
        parentCommand.status = 'AWAITING_APPROVAL';
        parentCommand.payload = {
          ...(parentCommand.payload || {}),
          aiReply: aiResult.reply,
          aiPlan: aiResult.plan,
          aiCommands: aiResult.commands,
          aiStructuredResponse: aiResult.structuredResponse,
          aiExecutions: aiResult.structuredResponse?.executions || [],
          lastRetryGeneratedFrom: {
            failedCommandId: String(command._id),
            failedAction: String(command.action || 'Comando'),
            failedStepIndex: failedIndex + 1,
            failedError: summarizedError || stringifyResult(result),
            retryMode: isThinkMode ? 'think' : 'instant',
          },
          lastRetryWasFullScriptRegeneration: Boolean(shouldRegenerateFullScript),
          executionSteps: siblings.map((item, index) => ({
            stepIndex: index + 1,
            commandId: String(item._id),
            action: item.action,
            payload: item.payload || {},
            status: item.status,
            result: item.result ?? null,
          })),
        };
        followUpGenerated = true;
      }
    }

    if (!followUpGenerated) {
      if (siblings.some((item) => item.status === 'FAILED')) {
        parentCommand.status = 'FAILED';
      } else if (siblings.some((item) => item.status === 'EXECUTING')) {
        parentCommand.status = 'EXECUTING';
      } else if (siblings.some((item) => item.status === 'AWAITING_APPROVAL')) {
        parentCommand.status = 'AWAITING_APPROVAL';
      } else if (siblings.some((item) => ['PENDING', 'QUEUED'].includes(item.status))) {
        parentCommand.status = 'QUEUED';
      } else if (siblings.every((item) => ['DONE', 'CANCELLED'].includes(item.status))) {
        parentCommand.status = 'DONE';
      }
    }

    await parentCommand.save();

    const requestCompleted = ['DONE', 'FAILED', 'FAILED_FINAL', 'CANCELLED'].includes(parentCommand.status);
    return res.json({
      message: 'Resultado salvo',
      requestCompleted,
      requestStatus: parentCommand.status,
      followUpGenerated,
      latestError: summarizedError,
      resultSummary: summarizeResult(result),
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao salvar resultado' });
  }
};

export const getProjectCommands = async (req, res) => {
  try {
    const project = await Project.findOne({ _id: req.params.id, owner: req.user.id });
    if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });

    const chatId = typeof req.query.chatId === 'string' ? req.query.chatId : null;
    const filter = { project: req.params.id };
    if (chatId) {
      filter.chatId = chatId;
    }

    const commands = await Command.find(filter).sort({ createdAt: 1 });
    return res.json(commands);
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao buscar comandos' });
  }
};

export const updateProjectCommandApproval = async (req, res) => {
  try {
    const project = await Project.findOne({ _id: req.params.id, owner: req.user.id });
    if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });

    const { parentCommandId, decision } = req.body || {};
    if (!parentCommandId || !['approve', 'cancel'].includes(decision)) {
      return res.status(400).json({ error: 'Parâmetros inválidos' });
    }

    const parentCommand = await Command.findOne({
      _id: parentCommandId,
      project: req.params.id,
      action: 'LogIntent',
    });
    if (!parentCommand) {
      return res.status(404).json({ error: 'Requisição não encontrada' });
    }

    const requestId = parentCommand.requestId || String(parentCommand._id);
    const now = new Date();

    if (decision === 'approve') {
      await Command.updateMany(
        { project: req.params.id, requestId, parentCommandId: String(parentCommand._id), status: 'AWAITING_APPROVAL' },
        {
          $set: {
            status: 'PENDING',
            approvedByUser: true,
            approvedAt: now,
            updatedAt: now,
          },
        }
      );

      parentCommand.status = 'QUEUED';
      parentCommand.requiresApproval = true;
      parentCommand.approvedByUser = true;
      parentCommand.approvedAt = now;
      parentCommand.payload = {
        ...(parentCommand.payload || {}),
        approvalState: 'approved',
      };
      await parentCommand.save();
    }

    if (decision === 'cancel') {
      await Command.updateMany(
        {
          project: req.params.id,
          requestId,
          parentCommandId: String(parentCommand._id),
          status: { $in: ['AWAITING_APPROVAL', 'PENDING', 'QUEUED'] },
        },
        {
          $set: {
            status: 'CANCELLED',
            rejectedAt: now,
            updatedAt: now,
            result: 'Cancelado pelo usuário antes da execução.',
          },
        }
      );

      parentCommand.status = 'CANCELLED';
      parentCommand.rejectedAt = now;
      parentCommand.payload = {
        ...(parentCommand.payload || {}),
        approvalState: 'cancelled',
      };
      await parentCommand.save();
    }

    const commands = await Command.find({ project: req.params.id, requestId }).sort({ createdAt: 1 });
    return res.json({ success: true, commands });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao atualizar aprovação' });
  }
};

function countNodes(nodes = []) {
  return nodes.reduce((acc, node) => acc + 1 + countNodes(Array.isArray(node?.filhos) ? node.filhos : []), 0);
}

function stringifyResult(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function hasEmbeddedFailure(result) {
  if (!result || typeof result !== 'object') return false;
  if (result.success === false) return true;
  if (result.result && typeof result.result === 'object' && result.result.ok === false) return true;
  return false;
}

function summarizeResult(result) {
  if (!result) return '';
  if (typeof result === 'string') return result;
  if (typeof result === 'object') {
    const directSummary = typeof result.summary === 'string' ? result.summary : '';
    const nestedSummary = typeof result.result?.summary === 'string' ? result.result.summary : '';
    const path = typeof result.result?.path === 'string' ? result.result.path : '';
    return directSummary || nestedSummary || path || stringifyResult(result);
  }
  return String(result);
}

function summarizeExecutionError(result) {
  if (!result) return '';
  if (typeof result === 'string') return result;
  if (typeof result !== 'object') return String(result);

  const nested = result.result && typeof result.result === 'object' ? result.result : null;
  const code = typeof nested?.code === 'string' ? nested.code : typeof result.code === 'string' ? result.code : '';
  const summary =
    typeof nested?.summary === 'string'
      ? nested.summary
      : typeof result.summary === 'string'
        ? result.summary
        : '';
  const detail =
    typeof nested?.detail === 'string'
      ? nested.detail
      : typeof result.detail === 'string'
        ? result.detail
        : '';

  const parts = [summary, code ? `code=${code}` : '', detail].filter(Boolean);
  return parts.join(' | ') || stringifyResult(result);
}

function buildCompileErrorGuidance(errorText) {
  const normalized = String(errorText || '').toLowerCase();
  if (!normalized) return '';

  const isCompileError =
    normalized.includes('compile') ||
    normalized.includes('malformed string') ||
    normalized.includes('expected') ||
    normalized.includes('got <eof>') ||
    normalized.includes('did you forget to finish it');

  if (!isCompileError) {
    return '';
  }

  return [
    'A falha parece ser de compilacao/sintaxe em Luau.',
    'Reescreva a execution completa com foco em sintaxe valida.',
    'Se houver Script/LocalScript/ModuleScript embutido com `.Source`, use obrigatoriamente long brackets [=[...]=] ou table.concat, nunca string multiline comum.',
    'Feche corretamente aspas, parenteses, brackets e blocos function/end antes de responder.',
  ].join(' ');
}
