import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { JWT_SECRET } from '../config/env.js';
import { User } from '../models/User.js';
import { Project } from '../models/Project.js';

function generatePluginKey() {
  return 'blox_' + crypto.randomBytes(24).toString('hex');
}

function issuePluginJwt(user) {
  return jwt.sign(
    { id: user._id, robloxId: user.robloxId, username: user.robloxUsername, role: user.role, planType: user.planType },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

/**
 * Pareamento do plugin via CHAVE DE CONTA (account key).
 *
 * Resolve o problema do ovo-e-galinha: o usuário copia a chave da conta no
 * dashboard web (existe logo após o login, antes de qualquer projeto) e cola no
 * plugin. O plugin detecta o Place ID e cria/conecta o projeto automaticamente.
 *
 * Body: { pluginKey, placeId, placeName? }
 */
export const pluginConnect = async (req, res) => {
  try {
    const { pluginKey, placeId, placeName } = req.body || {};
    if (!pluginKey || !placeId) {
      return res.status(400).json({ error: 'pluginKey e placeId são obrigatórios.' });
    }

    const user = await User.findOne({ pluginKey: String(pluginKey) }).select('+pluginKey');
    if (!user) return res.status(401).json({ error: 'Chave de pareamento inválida.' });
    if (user.status === 'banned') return res.status(403).json({ error: 'Conta banida.' });

    // Encontra o projeto deste usuário para o Place ID, ou cria um novo.
    let project = await Project.findOne({ owner: user._id, placeId: String(placeId) });
    let created = false;
    if (!project) {
      project = await Project.create({
        name: (placeName && String(placeName).trim()) || `Jogo ${placeId}`,
        placeId: String(placeId),
        owner: user._id,
        apiKey: crypto.randomBytes(32).toString('hex'),
        status: 'Online',
        lastSync: new Date(),
      });
      created = true;
    } else if (placeName && String(placeName).trim() && project.name !== String(placeName).trim()) {
      // Atualiza para o nome real do jogo, caso tenha mudado
      project.name = String(placeName).trim();
      project.lastSync = new Date();
      await project.save();
    }

    return res.json({
      token: issuePluginJwt(user),
      created,
      project: { id: project._id, name: project.name, apiKey: project.apiKey, placeId: project.placeId },
    });
  } catch (error) {
    console.error('[Plugin Connect Error]', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
};

/**
 * Autenticação legada por apiKey do projeto. Mantida para compatibilidade.
 * Body: { apiKey, placeId, placeName? }
 */
export const pluginAuth = async (req, res) => {
  try {
    const { apiKey, placeId } = req.body || {};
    if (!apiKey || !placeId) {
      return res.status(400).json({ error: 'apiKey e placeId são obrigatórios.' });
    }

    const project = await Project.findOne({ apiKey: String(apiKey), placeId: String(placeId) });
    if (!project) return res.status(401).json({ error: 'apiKey ou placeId inválidos.' });

    const user = await User.findById(project.owner);
    if (!user) return res.status(401).json({ error: 'Conta do proprietário não encontrada.' });
    if (user.status === 'banned') return res.status(403).json({ error: 'Conta banida.' });

    return res.json({
      token: issuePluginJwt(user),
      project: { id: project._id, name: project.name, apiKey: project.apiKey },
    });
  } catch (error) {
    console.error('[Plugin Auth Error]', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
};

// ── Gestão da chave de conta (web, autenticado) ────────────────────────────────

export const getPluginKey = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('+pluginKey');
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    let key = user.pluginKey;
    if (!key) {
      key = generatePluginKey();
      await User.findByIdAndUpdate(req.user.id, { pluginKey: key });
    }
    res.json({ pluginKey: key });
  } catch (error) {
    console.error('[getPluginKey]', error);
    res.status(500).json({ error: 'Falha ao obter a chave do plugin.' });
  }
};

export const regeneratePluginKey = async (req, res) => {
  try {
    const key = generatePluginKey();
    const user = await User.findByIdAndUpdate(req.user.id, { pluginKey: key }, { new: true });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
    res.json({ pluginKey: key });
  } catch (error) {
    console.error('[regeneratePluginKey]', error);
    res.status(500).json({ error: 'Falha ao regenerar a chave.' });
  }
};
