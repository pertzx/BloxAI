/**
 * Blox AI - Sync Controller
 * Gerencia sincronização entre Plugin (Roblox Studio) e Dashboard Web
 */

const Project = require('../models/Project');
const Session = require('../models/Session');

// === IN-MEMORY STATE STORE ===
const userStates = new Map();
const commandQueues = new Map();

// Limpa estados expirados a cada hora
setInterval(() => {
    const now = Date.now();
    const EXPIRY = 24 * 60 * 60 * 1000;
    for (const [userId, state] of userStates.entries()) {
        if (now - state.lastAccess > EXPIRY) {
            userStates.delete(userId);
            commandQueues.delete(userId);
        }
    }
}, 60 * 60 * 1000);

function getUserState(userId) {
    if (!userStates.has(userId)) {
        userStates.set(userId, {
            userId,
            projects: new Map(),
            currentProjectId: null,
            sessions: new Map(),
            lastAccess: Date.now(),
            connectedClients: new Set()
        });
    }
    const state = userStates.get(userId);
    state.lastAccess = Date.now();
    return state;
}

function addCommand(userId, type, payload, source) {
    if (!commandQueues.has(userId)) {
        commandQueues.set(userId, []);
    }
    const queue = commandQueues.get(userId);
    const command = {
        id: `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type,
        payload,
        source,
        timestamp: Date.now(),
        ack: false,
        ackBy: null,
        ackAt: null
    };
    queue.push(command);
    if (queue.length > 100) queue.shift();
    return command;
}

// === ALIASES para compatibilidade com app.js ===
exports.sendCommand = exports.executeCommand;
exports.acknowledgeCommand = exports.ackCommand;

// === SYNC STATE ENDPOINTS ===
exports.syncState = async (req, res, next) => {
    try {
        const userId = req.user._id.toString();
        const { source, currentProjectId, projects, sessions, gameInfo } = req.body;
        const state = getUserState(userId);
        state.connectedClients.add(source);
        if (currentProjectId) state.currentProjectId = currentProjectId;
        if (projects && Array.isArray(projects)) {
            for (const proj of projects) {
                proj.lastSyncedAt = Date.now();
                proj.syncedBy = source;
                state.projects.set(proj.id || proj._id, proj);
                if (source === 'plugin' && gameInfo && proj.id) {
                    try {
                        await Project.findOneAndUpdate(
                            { _id: proj.id, userId },
                            { $set: { gameInfo, lastConnectedAt: new Date(), isConnectedToStudio: true }},
                            { upsert: true, new: true }
                        );
                    } catch (e) {
                        console.error('[Sync] Error:', e);
                    }
                }
            }
        }
        if (sessions && Array.isArray(sessions)) {
            for (const sess of sessions) {
                sess.lastSyncedAt = Date.now();
                sess.syncedBy = source;
                state.sessions.set(sess.id || sess._id, sess);
            }
        }
        res.json({
            status: 'success',
            data: {
                currentProjectId: state.currentProjectId,
                projects: Array.from(state.projects.values()),
                sessions: Array.from(state.sessions.values()),
                connectedClients: Array.from(state.connectedClients),
                serverTime: Date.now()
            }
        });
    } catch (error) {
        next(error);
    }
};

exports.getState = async (req, res, next) => {
    try {
        const userId = req.user._id.toString();
        const state = userStates.get(userId);
        if (!state) {
            return res.json({ status: 'success', data: null, message: 'No state' });
        }
        res.json({
            status: 'success',
            data: {
                currentProjectId: state.currentProjectId,
                projects: Array.from(state.projects.values()),
                sessions: Array.from(state.sessions.values()),
                connectedClients: Array.from(state.connectedClients)
            }
        });
    } catch (error) {
        next(error);
    }
};

exports.executeCommand = async (req, res, next) => {
    try {
        const userId = req.user._id.toString();
        const { type, payload, target } = req.body;
        const source = req.body.source || 'web';
        const command = addCommand(userId, type, payload, source);
        command.target = target || 'both';
        res.json({ status: 'success', data: { command } });
    } catch (error) {
        next(error);
    }
};

exports.getPendingCommands = async (req, res, next) => {
    try {
        const userId = req.user._id.toString();
        const { since } = req.query;
        const sinceTime = since ? parseInt(since) : 0;
        const queue = commandQueues.get(userId) || [];
        const pending = queue.filter(cmd => {
            if (cmd.ack) return false;
            return cmd.timestamp > sinceTime;
        });
        res.json({ status: 'success', data: { commands: pending, serverTime: Date.now() } });
    } catch (error) {
        next(error);
    }
};

exports.ackCommand = async (req, res, next) => {
    try {
        const userId = req.user._id.toString();
        const { id } = req.params;
        const { result, error: execError } = req.body;
        const queue = commandQueues.get(userId);
        if (queue) {
            const cmd = queue.find(c => c.id === id);
            if (cmd) {
                cmd.ack = true;
                cmd.ackBy = 'plugin';
                cmd.ackAt = Date.now();
                cmd.result = result;
                cmd.execError = execError;
            }
        }
        res.json({ status: 'success', message: 'Acknowledged' });
    } catch (error) {
        next(error);
    }
};

// === ALIASES para compatibilidade com app.js ===
// Devem ficar APÓS as declarações para funcionar
exports.registerGameSession = exports.syncState;
exports.getActiveSessions = exports.getState;
exports.sendCommand = exports.executeCommand;
exports.acknowledgeCommand = exports.ackCommand;
exports.getCommandResults = exports.getPendingCommands;
