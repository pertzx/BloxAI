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
import { jobQueue } from './services/JobQueue.js';
import { processAiThinkJob } from './services/AiThinkWorker.js';
import { startEmailQueueWorker } from './services/EmailService.js';
import { PlanService } from './services/PlanService.js';

// Conectar ao Banco de Dados e semear planos padrão
connectDB().then(() => {
  PlanService.seedDefaults().catch((err) =>
    console.error('[PlanService] Falha ao semear planos:', err.message)
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

// Basic health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Blox AI Backend Running' });
});

export { app, httpServer };
