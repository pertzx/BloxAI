import test from 'node:test';
import assert from 'node:assert/strict';
import { jobQueue } from '../src/services/JobQueue.js';

// Sem chamar init(), o singleton fica em modo 'memory' (sem tocar no Redis),
// então enqueue deve agendar e executar o handler registrado.
test('fila em memória executa o handler ai-think registrado', async () => {
  const calls = [];
  jobQueue.registerAiThinkHandler(async (jobId) => {
    calls.push(jobId);
  });

  await jobQueue.enqueueAiThink('job-abc-123');
  // setImmediate roda no próximo ciclo do event loop.
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(calls, ['job-abc-123']);
});

test('erro no handler não derruba o processo (é capturado)', async () => {
  jobQueue.registerAiThinkHandler(async () => {
    throw new Error('boom');
  });

  // Não deve lançar para fora.
  await assert.doesNotReject(async () => {
    await jobQueue.enqueueAiThink('job-err');
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
  });
});
