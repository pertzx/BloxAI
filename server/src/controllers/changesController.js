/**
 * Blox AI - Changes Controller
 * Gerencia mudanças agendadas (via web offline) e histórico de mudanças aplicadas
 *
 * Regras:
 * - Mudanças agendadas: removidas da fila ao aceitar/recusar
 * - Histórico: máximo 10 mudanças mais recentes
 * - Suporte a revert de mudanças aplicadas
 */

const MAX_HISTORY = 10;

// Memória: { userId: { pending: Map<id, change>, history: Map<id, change>, lastTree: {timestamp, data} } }
const userChanges = new Map();

function getUserData(userId) {
    if (!userChanges.has(userId)) {
        userChanges.set(userId, {
            pending: new Map(),
            history: new Map(),
            lastTree: null
        });
    }
    return userChanges.get(userId);
}

// Cria uma mudança agendada
exports.createPendingChange = (req, res) => {
    try {
        const userId = req.user._id.toString();
        const { projectId, type, payload, source } = req.body;

        if (!projectId || !type || !payload) {
            return res.status(400).json({ status: 'error', message: 'projectId, type e payload são obrigatórios' });
        }

        const data = getUserData(userId);
        const changeId = `chg_${Date.now()}_${Math.random().toString(36).substr(2,9)}`;

        const change = {
            id: changeId,
            projectId,
            type, // 'create' | 'modify' | 'delete' | 'script'
            payload, // Dados específicos da mudança
            source: source || 'web', // 'web' | 'plugin'
            status: 'pending', // 'pending' | 'applied' | 'rejected' | 'reverted'
            createdAt: new Date(),
            appliedAt: null,
            snapshot: null // Para permitir revert
        };

        data.pending.set(changeId, change);

        res.json({ status: 'success', data: { change } });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// Lista mudanças pendentes
exports.listPending = (req, res) => {
    try {
        const userId = req.user._id.toString();
        const { projectId } = req.query;
        const data = getUserData(userId);
        let pending = Array.from(data.pending.values());
        if (projectId) pending = pending.filter(c => c.projectId === projectId);
        res.json({ status: 'success', data: { changes: pending, count: pending.length } });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// Aceita uma mudança (move para histórico)
exports.acceptChange = (req, res) => {
    try {
        const userId = req.user._id.toString();
        const { id } = req.params;
        const { snapshot } = req.body; // Estado anterior (para revert)

        const data = getUserData(userId);
        const change = data.pending.get(id);

        if (!change) {
            return res.status(404).json({ status: 'error', message: 'Mudança não encontrada' });
        }

        change.status = 'applied';
        change.appliedAt = new Date();
        if (snapshot) change.snapshot = snapshot;

        data.pending.delete(id);
        data.history.set(id, change);

        // Mantém apenas as 10 mais recentes
        if (data.history.size > MAX_HISTORY) {
            const sorted = Array.from(data.history.entries()).sort((a, b) =>
                new Date(b[1].appliedAt) - new Date(a[1].appliedAt)
            );
            const toRemove = sorted.slice(MAX_HISTORY);
            toRemove.forEach(([k]) => data.history.delete(k));
        }

        res.json({ status: 'success', data: { change } });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// Rejeita uma mudança (deleta permanentemente)
exports.rejectChange = (req, res) => {
    try {
        const userId = req.user._id.toString();
        const { id } = req.params;

        const data = getUserData(userId);
        const change = data.pending.get(id);

        if (!change) {
            return res.status(404).json({ status: 'error', message: 'Mudança não encontrada' });
        }

        data.pending.delete(id);

        res.json({ status: 'success', message: 'Mudança rejeitada e removida' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// Lista histórico de mudanças aplicadas
exports.listHistory = (req, res) => {
    try {
        const userId = req.user._id.toString();
        const { projectId } = req.query;
        const data = getUserData(userId);
        let history = Array.from(data.history.values());
        if (projectId) history = history.filter(c => c.projectId === projectId);
        history.sort((a, b) => new Date(b.appliedAt) - new Date(a.appliedAt));
        res.json({ status: 'success', data: { changes: history } });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// Reverte uma mudança aplicada
exports.revertChange = (req, res) => {
    try {
        const userId = req.user._id.toString();
        const { id } = req.params;

        const data = getUserData(userId);
        const change = data.history.get(id);

        if (!change) {
            return res.status(404).json({ status: 'error', message: 'Mudança não encontrada' });
        }

        if (!change.snapshot) {
            return res.status(400).json({ status: 'error', message: 'Sem snapshot para reverter' });
        }

        change.status = 'reverted';
        change.revertedAt = new Date();

        res.json({ status: 'success', data: { change, snapshot: change.snapshot } });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// Salva a última árvore sincronizada (para uso offline na web)
exports.saveLastTree = (req, res) => {
    try {
        const userId = req.user._id.toString();
        const { projectId, tree } = req.body;

        const data = getUserData(userId);
        data.lastTree = {
            projectId,
            tree,
            timestamp: new Date()
        };

        res.json({ status: 'success' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// Pega a última árvore (para uso offline)
exports.getLastTree = (req, res) => {
    try {
        const userId = req.user._id.toString();
        const { projectId } = req.query;
        const data = getUserData(userId);

        if (!data.lastTree) {
            return res.json({ status: 'success', data: null });
        }

        if (projectId && data.lastTree.projectId !== projectId) {
            return res.json({ status: 'success', data: null });
        }

        res.json({ status: 'success', data: data.lastTree });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};
