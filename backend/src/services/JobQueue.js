import IORedis from 'ioredis';
import { Queue, Worker } from 'bullmq';
import { REDIS_URL } from '../config/env.js';

const QUEUE_NAME = 'bloxai-ai-jobs';
const AI_THINK_JOB = 'ai-think';

/**
 * Fila de jobs de IA com degradação graciosa.
 *
 * - Se houver Redis acessível, usa BullMQ (durável, multi-instância).
 * - Se NÃO houver Redis (ex.: ambiente local de dev), cai para uma fila em
 *   processo (setImmediate). Funciona em uma única instância e não persiste
 *   entre reinícios — suficiente para desenvolvimento.
 *
 * O handler é registrado uma vez (registerAiThinkHandler) e recebe o jobId,
 * deixando a lógica pesada (orquestrador + persistência + cobrança) fora da fila.
 */
class JobQueue {
  constructor() {
    this.mode = 'memory';
    this.handler = null;
    this.bullQueue = null;
    this.worker = null;
    this.initialized = false;
  }

  registerAiThinkHandler(fn) {
    this.handler = fn;
  }

  async init() {
    if (this.initialized) return this.mode;
    this.initialized = true;

    const redisAvailable = await this.probeRedis();
    if (redisAvailable) {
      try {
        this.bullQueue = new Queue(QUEUE_NAME, { connection: this.makeConnection() });
        this.worker = new Worker(
          QUEUE_NAME,
          async (job) => {
            if (job.name === AI_THINK_JOB) {
              await this.runHandler(job.data?.jobId);
            }
          },
          { connection: this.makeConnection(), concurrency: 2 }
        );
        this.worker.on('failed', (job, err) => {
          console.error(`[JobQueue] job ${job?.id} falhou:`, err?.message);
        });
        this.mode = 'bull';
        console.log('[JobQueue] Redis disponível — usando BullMQ.');
        return this.mode;
      } catch (error) {
        console.error('[JobQueue] falha ao iniciar BullMQ, caindo para memória:', error?.message);
      }
    }

    this.mode = 'memory';
    console.warn(
      '[JobQueue] Redis indisponível — usando fila em memória (apenas dev/single-instance). ' +
        'Defina REDIS_URL e suba o Redis para produção.'
    );
    return this.mode;
  }

  async enqueueAiThink(jobId) {
    if (this.mode === 'bull' && this.bullQueue) {
      await this.bullQueue.add(
        AI_THINK_JOB,
        { jobId: String(jobId) },
        { attempts: 2, backoff: { type: 'exponential', delay: 500 }, removeOnComplete: 100, removeOnFail: 200 }
      );
      return;
    }
    // Fallback em memória: processa fora do ciclo da requisição HTTP.
    setImmediate(() => {
      this.runHandler(jobId);
    });
  }

  async runHandler(jobId) {
    if (!this.handler) {
      console.error('[JobQueue] nenhum handler registrado para ai-think.');
      return;
    }
    try {
      await this.handler(String(jobId));
    } catch (error) {
      console.error('[JobQueue] handler ai-think lançou erro:', error?.message);
    }
  }

  makeConnection() {
    // BullMQ exige maxRetriesPerRequest: null na conexão.
    return new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
  }

  async probeRedis() {
    let client;
    try {
      client = new IORedis(REDIS_URL, {
        lazyConnect: true,
        connectTimeout: 1000,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null, // não fica retentando se o Redis não existe
      });
      await client.connect();
      const pong = await client.ping();
      return pong === 'PONG';
    } catch {
      return false;
    } finally {
      try {
        client?.disconnect();
      } catch {
        /* noop */
      }
    }
  }
}

export const jobQueue = new JobQueue();
