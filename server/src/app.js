/**
 * Blox AI - Main Application
 * Entry point com EJS e todas as rotas
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const path = require('path');
require('dotenv').config();

const connectDB = require('./config/database');
const { protect } = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');

// Controllers
const authController = require('./controllers/authController');
const authExtended = require('./controllers/authControllerExtended');
const aiController = require('./controllers/aiController');
const billingController = require('./controllers/billingController');
const dashboardController = require('./controllers/dashboardController');

const app = express();

// === Connect Database ===
connectDB();

// === View Engine ===
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// === Security Middleware ===
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://cdn.socket.io"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://api.openai.com", "https://generativelanguage.googleapis.com", "https://api.moonshot.cn"]
        }
    }
}));

// === CORS ===
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
}));

// === Body Parsing ===
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// === Static Files ===
app.use(express.static(path.join(__dirname, '../public')));

// === Rate Limiting ===
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { status: 'error', message: 'Muitas requisições, tente novamente mais tarde.' }
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { status: 'error', message: 'Muitas tentativas de login. Tente novamente em 15 minutos.' }
});

const aiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    message: { status: 'error', message: 'Limite de requisições IA atingido. Aguarde 1 minuto.' }
});

// =====================================================
// === PAGE ROUTES (EJS Rendering) ===
// =====================================================

// Home
app.get('/', (req, res) => {
    res.redirect('/login');
});

// Auth pages
app.get('/login', dashboardController.renderLogin);
app.get('/register', dashboardController.renderRegister);
app.get('/forgot-password', dashboardController.renderForgotPassword);
app.get('/reset-password/:token', dashboardController.renderResetPassword);

// Dashboard (protected)
app.get('/dashboard', protect, dashboardController.renderDashboard);

// Dashboard sections
app.get('/dashboard/projects', protect, dashboardController.renderDashboard);
app.get('/dashboard/explorer', protect, dashboardController.renderDashboard);
app.get('/dashboard/history', protect, dashboardController.renderDashboard);
app.get('/dashboard/docs', protect, dashboardController.renderDashboard);
app.get('/dashboard/settings', protect, dashboardController.renderDashboard);

// =====================================================
// === API ROUTES (JSON) ===
// =====================================================

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'success',
        message: 'Blox AI API is running',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// === AUTH ROUTES ===
app.post('/api/auth/register', authLimiter, authController.register);
app.post('/api/auth/login', authLimiter, authController.login);
app.post('/api/auth/refresh', authController.refresh);
app.post('/api/auth/logout', protect, authController.logout);
app.get('/api/auth/me', protect, authController.me);
app.post('/api/auth/api-key', protect, authController.generateApiKey);
app.post('/api/auth/change-password', protect, authExtended.changePassword);
app.patch('/api/auth/profile', protect, authController.updateProfile);
app.post('/api/auth/forgot-password', authLimiter, authExtended.forgotPassword);
app.post('/api/auth/reset-password', authExtended.resetPassword);

// === AI ROUTES ===
app.get('/api/ai/providers', protect, aiController.getProviders);
app.get('/api/ai/config', protect, aiController.getConfig);
app.patch('/api/ai/config', protect, aiController.updateConfig);
app.post('/api/ai/apikeys', protect, aiController.saveApiKey);
app.delete('/api/ai/apikeys/:provider', protect, aiController.removeApiKey);
app.post('/api/ai/test', protect, aiController.testConnection);
app.post('/api/ai/generate', protect, aiLimiter, aiController.generateWithProvider);
app.post('/api/ai/processing/start', protect, aiController.startProcessing);
app.get('/api/ai/processing/:id', protect, aiController.getProcessingStatus);

// === PROJECTS ROUTES ===
const projectController = require('./controllers/projectController');

// Novas rotas: vinculação jogo ↔ projeto
app.post('/api/projects/connect', protect, projectController.connectGame);
app.get('/api/projects/list/all', protect, projectController.listProjects);
app.get('/api/projects/get/:id', protect, projectController.getProject);
app.get('/api/projects/:projectId/chats', protect, projectController.listChats);
app.get('/api/projects/chats/:chatId', protect, projectController.getChat);
app.post('/api/projects/chat/create', protect, projectController.createChat);
app.delete('/api/projects/chat/:chatId', protect, projectController.deleteChat);
app.post('/api/projects/:id/disconnect', protect, projectController.disconnectGame);

// Rotas legadas (compatibilidade)
app.post('/api/projects', protect, dashboardController.createProject);
app.get('/api/projects', protect, dashboardController.getProjects);
app.get('/api/projects/:id', protect, dashboardController.getProject);
app.patch('/api/projects/:id', protect, dashboardController.updateProject);
app.delete('/api/projects/:id', protect, dashboardController.deleteProject);
app.get('/api/projects/:projectId/sessions', protect, projectController.listChats);

// === SESSIONS / HISTORY ROUTES ===
app.get('/api/sessions', protect, dashboardController.getSessions);
app.get('/api/sessions/:id', protect, dashboardController.getSession);
app.delete('/api/sessions/:id', protect, dashboardController.deleteSession);
app.delete('/api/sessions/clear', protect, dashboardController.clearHistory);

// === SYNC ROUTES (Plugin ↔ Web Dashboard) ===
const syncController = require('./controllers/syncController');

// Registro de sessão de jogo do Roblox
app.post('/api/sync/game-session', protect, syncController.registerGameSession);
app.get('/api/sync/active-sessions', protect, syncController.getActiveSessions);

// Comandos do dashboard para o plugin
app.post('/api/sync/command', protect, syncController.sendCommand);
app.get('/api/sync/commands/:sessionId', protect, syncController.getPendingCommands);
app.post('/api/sync/command-ack', protect, syncController.acknowledgeCommand);
app.get('/api/sync/command-results/:sessionId', protect, syncController.getCommandResults);

// === CHANGES ROUTES (Pending + History) ===
const changesController = require('./controllers/changesController');
app.post('/api/changes/pending', protect, changesController.createPendingChange);
app.get('/api/changes/pending', protect, changesController.listPending);
app.post('/api/changes/pending/:id/accept', protect, changesController.acceptChange);
app.post('/api/changes/pending/:id/reject', protect, changesController.rejectChange);
app.get('/api/changes/history', protect, changesController.listHistory);
app.post('/api/changes/history/:id/revert', protect, changesController.revertChange);
app.post('/api/changes/tree', protect, changesController.saveLastTree);
app.get('/api/changes/tree', protect, changesController.getLastTree);

// === BILLING ROUTES ===
app.get('/api/billing/plans', protect, billingController.getPlans);
app.post('/api/billing/checkout', protect, billingController.createCheckoutSession);
app.post('/api/billing/portal', protect, billingController.getCustomerPortal);
app.post('/api/billing/cancel', protect, billingController.cancelSubscription);

// Stripe webhook (needs raw body)
app.post('/api/billing/webhook', 
    express.raw({ type: 'application/json' }),
    billingController.webhook
);

// === SUBSCRIPTION STATUS ===
app.get('/api/subscription/status', protect, async (req, res, next) => {
    try {
        const Subscription = require('./models/Subscription');
        const subscription = await Subscription.findOne({ userId: req.user._id });

        res.json({
            status: 'success',
            data: {
                subscription: subscription || {
                    plan: 'free',
                    status: 'active',
                    usage: { requestsUsed: 0, requestsLimit: 100 }
                }
            }
        });
    } catch (error) {
        next(error);
    }
});

// === BACKUP ROUTES ===
app.post('/api/backup/create', protect, dashboardController.createBackup);
app.get('/api/backup', protect, dashboardController.listBackups);
app.post('/api/backup/:id/restore', protect, dashboardController.restoreBackup);

// =====================================================
// === ERROR HANDLING ===
// =====================================================

// 404
app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
        res.status(404).json({
            status: 'error',
            message: 'Endpoint não encontrado'
        });
    } else {
        res.status(404).render('errors/404', {
            title: '404 - Não encontrado',
            layout: false
        });
    }
});

// Global error handler
app.use(errorHandler);

// =====================================================
// === START SERVER ===
// =====================================================

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log('╔═══════════════════════════════════════╗');
    console.log('║         🚀 BLOX AI SERVER 🚀          ║');
    console.log('╚═══════════════════════════════════════╝');
    console.log(`✓ Port: ${PORT}`);
    console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`✓ Frontend: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
    console.log(`✓ Database: ${process.env.MONGODB_URI ? 'Connected' : 'Not configured'}`);
    console.log(`✓ Stripe: ${process.env.STRIPE_SECRET_KEY ? 'Configured' : 'Not configured'}`);
    console.log('');
    console.log('📖 Docs: http://localhost:' + PORT);
    console.log('🔐 Login: http://localhost:' + PORT + '/login');
    console.log('📊 Dashboard: http://localhost:' + PORT + '/dashboard');
    console.log('💚 Health: http://localhost:' + PORT + '/api/health');
    
    // Start automatic backup
    dashboardController.startAutoBackup();
});

module.exports = app;
