import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { connectDB } from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import projectRoutes from './routes/projectRoutes.js';
import commandRoutes from './routes/commandRoutes.js';
import pluginRoutes from './routes/pluginRoutes.js';
import billingRoutes from './routes/billingRoutes.js';
import ideaRoutes from './routes/ideaRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';
import { jobQueue } from './services/JobQueue.js';
import { processAiThinkJob } from './services/AiThinkWorker.js';
import { startEmailQueueWorker } from './services/EmailService.js';
import { PlanService } from './services/PlanService.js';
import { ModelRegistry } from './services/ModelRegistry.js';
import { stripeWebhook } from './controllers/subscriptionController.js';

// Conectar ao Banco de Dados e semear planos + registro de modelos de IA
connectDB().then(() => {
  PlanService.seedDefaults().catch((err) =>
    console.error('[PlanService] Falha ao semear planos:', err.message)
  );
  ModelRegistry.seedDefaults().catch((err) =>
    console.error('[ModelRegistry] Falha ao semear modelos:', err.message)
  );
});

// Fila assíncrona de IA (modo Think). Registra o handler e detecta Redis/fallback.
jobQueue.registerAiThinkHandler(processAiThinkJob);
jobQueue.init();

// Fila de e-mails — processa pendências a cada 60s
startEmailQueueWorker(60_000);

const app = express();
const httpServer = createServer(app);

// Middlewares
app.use(cors());

// Webhook do Stripe precisa do corpo RAW (antes do express.json) e sem auth.
app.post('/api/billing/stripe/webhook', express.raw({ type: 'application/json' }), stripeWebhook);

app.use(express.json(
  {
    limit: '50mb',
    extended: true,
  }
));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/plugin', pluginRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/commands', commandRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/ideas', ideaRoutes);
app.use('/api/uploads', uploadRoutes);

// Basic health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Blox AI Backend Running' });
});

export { app, httpServer };
