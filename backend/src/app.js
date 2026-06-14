import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { connectDB } from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import projectRoutes from './routes/projectRoutes.js';
import commandRoutes from './routes/commandRoutes.js';
import pluginRoutes from './routes/pluginRoutes.js';

// Conectar ao Banco de Dados
connectDB();

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

// Basic health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Blox AI Backend Running' });
});

export { app, httpServer };
