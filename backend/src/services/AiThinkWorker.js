import { AiJob } from '../models/AiJob.js';
import { Project } from '../models/Project.js';
import { ChatService } from './ChatService.js';

/**
 * Processa uma tarefa Think: roda o pipeline pesado em background e grava o
 * resultado final no AiJob para o cliente consumir via polling.
 */
export async function processAiThinkJob(jobId) {
  const job = await AiJob.findById(jobId);
  if (!job) {
    console.error(`[AiThinkWorker] job ${jobId} não encontrado.`);
    return;
  }
  if (job.status === 'done' || job.status === 'processing') {
    return; // idempotência: evita reprocessar (ex.: retry após sucesso)
  }

  job.status = 'processing';
  await job.save();

  try {
    const project = await Project.findById(job.project);
    if (!project) throw new Error('Projeto não encontrado para a tarefa.');

    const out = await ChatService.runIntent({
      project,
      userId: String(job.user),
      intent: job.intent,
      chatId: job.chatId,
      chatTitle: job.chatTitle,
      model: job.model,
      mode: 'think',
    });

    job.status = 'done';
    job.result = out.aiResult;
    job.billing = out.billing || null;
    job.commandId = out.commandId || null;
    job.error = null;
    await job.save();
  } catch (error) {
    console.error(`[AiThinkWorker] falha ao processar job ${jobId}:`, error?.message);
    job.status = 'failed';
    job.error = error?.message || 'Falha ao processar tarefa Think.';
    await job.save();
  }
}
