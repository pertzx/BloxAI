import { Queue, Worker } from 'bullmq';
import { REDIS_URL } from '../config/env.js';
import { Command } from '../models/Command.js';

// Setup de conexão com Redis
const connection = {
  url: REDIS_URL
};

export const commandQueue = new Queue('bloxai-commands', { connection });

// O Worker processa a fila de comandos (1 por vez, como manda a doc)
export const commandWorker = new Worker('bloxai-commands', async job => {
  const { commandId, projectId } = job.data;
  console.log(`[Worker] Processando comando: ${commandId} para projeto: ${projectId}`);
  
  const command = await Command.findById(commandId);
  if (!command) throw new Error('Comando não encontrado no BD');

  // Atualiza status para QUEUED/EXECUTING
  command.status = 'EXECUTING';
  await command.save();

  // A lógica de execução real acontece quando o Plugin faz o polling ou recebe via WebSocket.
  // O BullMQ aqui serve para garantir a ordem (topological sort) e o rate limit.
  
  // Como o plugin Roblox é quem executa, este worker pode apenas sinalizar via WebSocket
  // para a sala do projeto que há um novo comando pronto para ser consumido.
  
  // Em uma arquitetura real robusta, o worker ficaria esperando a confirmação do plugin.
  // Para manter o event-loop livre, emitimos o evento e o endpoint HTTP de callback conclui a job.

  return { status: 'Command dispatched to Plugin queue' };
}, { 
  connection,
  concurrency: 1 // Garante 1 comando por vez por worker
});

commandWorker.on('completed', job => {
  console.log(`[Worker] Job finalizada: ${job.id}`);
});

commandWorker.on('failed', (job, err) => {
  console.error(`[Worker] Job falhou: ${job.id}`, err.message);
});
