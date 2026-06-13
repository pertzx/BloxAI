/**
 * Blox AI - Project Controller
 *
 * Cada projeto é vinculado a um jogo (placeId, universeId).
 * Chats e Explorer são por projeto.
 */

const Project = require('../models/Project');
const Session = require('../models/Session');

// Cria ou encontra projeto baseado no jogo
exports.connectGame = async (req, res) => {
    try {
        const userId = req.user._id.toString();
        const { placeId, universeId, name } = req.body;

        if (!placeId) {
            return res.status(400).json({ status: 'error', message: 'placeId é obrigatório' });
        }

        // Procura projeto existente
        let project = await Project.findOne({ userId, placeId });

        if (project) {
            // Atualiza
            project.lastConnectedAt = new Date();
            project.isConnectedToStudio = true;
            if (universeId) project.universeId = universeId;
            if (name) project.name = name;
            await project.save();
        } else {
            // Cria novo
            project = new Project({
                userId,
                placeId,
                universeId: universeId || null,
                name: name || `Jogo ${placeId}`,
                isConnectedToStudio: true,
                lastConnectedAt: new Date(),
                status: 'active'
            });
            await project.save();
        }

        res.json({ status: 'success', data: { project } });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// Lista projetos do usuário
exports.listProjects = async (req, res) => {
    try {
        const userId = req.user._id.toString();
        const projects = await Project.find({ userId }).sort({ lastConnectedAt: -1 });
        res.json({ status: 'success', data: { projects } });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// Pega detalhes de um projeto
exports.getProject = async (req, res) => {
    try {
        const userId = req.user._id.toString();
        const { id } = req.params;
        const project = await Project.findOne({ _id: id, userId });
        if (!project) {
            return res.status(404).json({ status: 'error', message: 'Projeto não encontrado' });
        }
        res.json({ status: 'success', data: { project } });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// Lista chats de um projeto
exports.listChats = async (req, res) => {
    try {
        const userId = req.user._id.toString();
        const { projectId } = req.params;
        const sessions = await Session.find({ userId, projectId })
            .sort({ createdAt: -1 })
            .limit(50);
        res.json({ status: 'success', data: { chats: sessions } });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// Pega um chat específico
exports.getChat = async (req, res) => {
    try {
        const userId = req.user._id.toString();
        const { chatId } = req.params;
        const session = await Session.findOne({ _id: chatId, userId });
        if (!session) {
            return res.status(404).json({ status: 'error', message: 'Chat não encontrado' });
        }
        res.json({ status: 'success', data: { chat: session } });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// Cria novo chat
exports.createChat = async (req, res) => {
    try {
        const userId = req.user._id.toString();
        const { projectId, title, prompt } = req.body;

        const session = new Session({
            userId,
            projectId,
            title: title || 'Novo Chat',
            prompt: prompt || '',
            response: null,
            createdAt: new Date()
        });
        await session.save();

        res.json({ status: 'success', data: { chat: session } });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// Deleta chat
exports.deleteChat = async (req, res) => {
    try {
        const userId = req.user._id.toString();
        const { chatId } = req.params;
        await Session.deleteOne({ _id: chatId, userId });
        res.json({ status: 'success', message: 'Chat deletado' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// Desconecta plugin do projeto
exports.disconnectGame = async (req, res) => {
    try {
        const userId = req.user._id.toString();
        const { id } = req.params;
        await Project.updateOne(
            { _id: id, userId },
            { $set: { isConnectedToStudio: false } }
        );
        res.json({ status: 'success', message: 'Desconectado' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};
