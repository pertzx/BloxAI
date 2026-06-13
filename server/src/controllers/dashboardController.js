/**
 * Blox AI - Dashboard Controller
 * Gerencia todas as rotas de páginas
 */

const User = require('../models/User');
const Subscription = require('../models/Subscription');
const Project = require('../models/Project');
const Session = require('../models/Session');
const UserAIConfig = require('../models/UserAIConfig');

// === PAGE RENDERS ===

exports.renderLogin = (req, res) => {
    if (req.cookies?.blox_access_token || req.headers.authorization) {
        return res.redirect('/dashboard');
    }
    res.render('auth/login', { 
        title: 'Login',
        layout: false
    });
};

exports.renderRegister = (req, res) => {
    res.render('auth/register', { 
        title: 'Cadastro',
        layout: false
    });
};

exports.renderDashboard = async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .populate('subscription')
            .select('-password -refreshTokens');
        
        res.render('dashboard/index', { 
            title: 'Dashboard',
            user: user.toObject(),
            layout: false
        });
    } catch (error) {
        console.error('Dashboard render error:', error);
        res.status(500).render('errors/500', { 
            title: 'Erro',
            message: 'Erro ao carregar dashboard',
            layout: false
        });
    }
};

exports.renderForgotPassword = (req, res) => {
    res.render('auth/forgot-password', {
        title: 'Recuperar Senha',
        layout: false
    });
};

exports.renderResetPassword = (req, res) => {
    res.render('auth/reset-password', {
        title: 'Redefinir Senha',
        token: req.params.token,
        layout: false
    });
};

// === API ENDPOINTS (JSON) ===

exports.getCurrentUser = async (req, res, next) => {
    try {
        const user = await User.findById(req.user._id)
            .populate('subscription')
            .select('-password -refreshTokens');
        
        res.json({
            status: 'success',
            data: { user }
        });
    } catch (error) {
        next(error);
    }
};

exports.getProjects = async (req, res, next) => {
    try {
        const projects = await Project.find({
            userId: req.user._id,
            isArchived: false
        }).sort({ updatedAt: -1 });

        res.json({
            status: 'success',
            data: { projects }
        });
    } catch (error) {
        next(error);
    }
};

exports.getProject = async (req, res, next) => {
    try {
        const project = await Project.findOne({
            _id: req.params.id,
            userId: req.user._id
        });

        if (!project) {
            return res.status(404).json({
                status: 'error',
                message: 'Projeto não encontrado'
            });
        }

        res.json({
            status: 'success',
            data: { project }
        });
    } catch (error) {
        next(error);
    }
};

exports.createProject = async (req, res, next) => {
    try {
        const { name, description } = req.body;
        
        const project = await Project.create({
            userId: req.user._id,
            name,
            description
        });
        
        res.status(201).json({
            status: 'success',
            data: { project }
        });
    } catch (error) {
        next(error);
    }
};

exports.updateProject = async (req, res, next) => {
    try {
        const project = await Project.findOneAndUpdate(
            { _id: req.params.id, userId: req.user._id },
            req.body,
            { new: true, runValidators: true }
        );
        
        if (!project) {
            return res.status(404).json({
                status: 'error',
                message: 'Projeto não encontrado'
            });
        }
        
        res.json({
            status: 'success',
            data: { project }
        });
    } catch (error) {
        next(error);
    }
};

exports.deleteProject = async (req, res, next) => {
    try {
        const project = await Project.findOneAndDelete({
            _id: req.params.id,
            userId: req.user._id
        });
        
        if (!project) {
            return res.status(404).json({
                status: 'error',
                message: 'Projeto não encontrado'
            });
        }
        
        res.json({
            status: 'success',
            message: 'Projeto deletado'
        });
    } catch (error) {
        next(error);
    }
};

// === SESSIONS / HISTORY ===

exports.getSessions = async (req, res, next) => {
    try {
        const sessions = await Session.find({ 
            userId: req.user._id 
        })
        .sort({ updatedAt: -1 })
        .limit(50)
        .select('title stats createdAt updatedAt isActive');
        
        res.json({
            status: 'success',
            data: { sessions }
        });
    } catch (error) {
        next(error);
    }
};

exports.getSession = async (req, res, next) => {
    try {
        const session = await Session.findOne({
            _id: req.params.id,
            userId: req.user._id
        });
        
        if (!session) {
            return res.status(404).json({
                status: 'error',
                message: 'Sessão não encontrada'
            });
        }
        
        res.json({
            status: 'success',
            data: { session }
        });
    } catch (error) {
        next(error);
    }
};

exports.deleteSession = async (req, res, next) => {
    try {
        await Session.findOneAndDelete({
            _id: req.params.id,
            userId: req.user._id
        });
        
        res.json({
            status: 'success',
            message: 'Sessão deletada'
        });
    } catch (error) {
        next(error);
    }
};

exports.clearHistory = async (req, res, next) => {
    try {
        await Session.deleteMany({ userId: req.user._id });
        
        res.json({
            status: 'success',
            message: 'Histórico limpo'
        });
    } catch (error) {
        next(error);
    }
};

// === CLOUD BACKUP SYSTEM (Memory-based for Vercel) ===
// In-memory cache for backups - works on serverless environments
const backupCache = new Map();
const MAX_BACKUPS_PER_USER = 10;
const BACKUP_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Cleanup expired backups periodically
setInterval(() => {
    const now = Date.now();
    for (const [key, backup] of backupCache.entries()) {
        if (now - backup.timestamp > BACKUP_EXPIRY_MS) {
            backupCache.delete(key);
        }
    }
}, 60 * 60 * 1000); // Every hour

exports.createBackup = async (req, res, next) => {
    try {
        const userId = req.user._id.toString();
        const timestamp = Date.now();
        const backupId = `backup_${userId}_${timestamp}`;
        
        // Collect all user data
        const [user, subscription, projects, sessions, aiConfig] = await Promise.all([
            User.findById(req.user._id).select('-password -refreshTokens'),
            Subscription.findOne({ userId: req.user._id }),
            Project.find({ userId: req.user._id }),
            Session.find({ userId: req.user._id }),
            UserAIConfig.findOne({ userId: req.user._id }).select('-apiKeys.openai.key -apiKeys.gemini.key -apiKeys.kimi.key -apiKeys.custom.key')
        ]);
        
        const backup = {
            version: '1.0',
            timestamp,
            userId,
            data: {
                user,
                subscription,
                projects,
                sessions,
                aiConfig
            }
        };
        
        // Store in memory cache
        backupCache.set(backupId, backup);
        
        // Cleanup old backups for this user
        const userBackups = [];
        for (const [key, value] of backupCache.entries()) {
            if (key.startsWith(`backup_${userId}_`)) {
                userBackups.push({ key, timestamp: value.timestamp });
            }
        }
        
        // Sort by timestamp (oldest first) and remove excess
        userBackups.sort((a, b) => a.timestamp - b.timestamp);
        while (userBackups.length > MAX_BACKUPS_PER_USER) {
            const oldest = userBackups.shift();
            backupCache.delete(oldest.key);
        }
        
        res.json({
            status: 'success',
            data: {
                backupId,
                timestamp,
                size: JSON.stringify(backup).length
            }
        });
    } catch (error) {
        next(error);
    }
};

exports.listBackups = async (req, res, next) => {
    try {
        const userId = req.user._id.toString();
        const backups = [];
        
        for (const [key, backup] of backupCache.entries()) {
            if (key.startsWith(`backup_${userId}_`)) {
                backups.push({
                    id: key,
                    name: key,
                    size: JSON.stringify(backup).length,
                    createdAt: new Date(backup.timestamp)
                });
            }
        }
        
        backups.sort((a, b) => b.createdAt - a.createdAt);
        
        res.json({
            status: 'success',
            data: { backups }
        });
    } catch (error) {
        next(error);
    }
};

exports.restoreBackup = async (req, res, next) => {
    try {
        const backupId = req.params.id;
        const backup = backupCache.get(backupId);
        
        if (!backup) {
            return res.status(404).json({
                status: 'error',
                message: 'Backup não encontrado ou expirado'
            });
        }
        
        // Restore data
        if (backup.data.subscription) {
            await Subscription.findOneAndUpdate(
                { userId: req.user._id },
                backup.data.subscription,
                { upsert: true }
            );
        }
        
        if (backup.data.aiConfig) {
            await UserAIConfig.findOneAndUpdate(
                { userId: req.user._id },
                backup.data.aiConfig,
                { upsert: true }
            );
        }
        
        res.json({
            status: 'success',
            message: 'Backup restaurado com sucesso'
        });
    } catch (error) {
        next(error);
    }
};

// === AUTOMATIC BACKUP (Cron) ===
// Run backup every 24 hours
exports.startAutoBackup = (io) => {
    setInterval(async () => {
        try {
            const users = await User.find({ isActive: true });
            
            for (const user of users) {
                const timestamp = Date.now();
                const backupName = `auto_${user._id}_${timestamp}.json`;
                const backupPath = path.join(BACKUP_DIR, backupName);
                
                const [subscription, projects, sessions, aiConfig] = await Promise.all([
                    Subscription.findOne({ userId: user._id }),
                    Project.find({ userId: user._id }),
                    Session.find({ userId: user._id }),
                    UserAIConfig.findOne({ userId: user._id }).select('-apiKeys')
                ]);
                
                const backup = {
                    version: '1.0',
                    timestamp,
                    userId: user._id.toString(),
                    type: 'automatic',
                    data: { subscription, projects, sessions, aiConfig }
                };
                
                fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
                
                // Clean old backups (keep last 7)
                const userBackups = fs.readdirSync(BACKUP_DIR)
                    .filter(f => f.startsWith(`auto_${user._id}_`))
                    .sort();
                
                while (userBackups.length > 7) {
                    const oldFile = userBackups.shift();
                    fs.unlinkSync(path.join(BACKUP_DIR, oldFile));
                }
            }
            
            console.log(`[AutoBackup] Completed for ${users.length} users`);
        } catch (error) {
            console.error('[AutoBackup] Error:', error);
        }
    }, 24 * 60 * 60 * 1000); // 24 hours
};
