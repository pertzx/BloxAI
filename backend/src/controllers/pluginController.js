import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { JWT_SECRET } from '../config/env.js';
import { User } from '../models/User.js';
import { Project } from '../models/Project.js';

/**
 * Autenticação do plugin do Roblox Studio.
 * O plugin usa a apiKey do projeto (gerada e exibida no dashboard web)
 * em vez de email/senha — compatível com autenticação Roblox OAuth.
 *
 * Body: { apiKey, placeId, placeName? }
 */
export const pluginAuth = async (req, res) => {
  try {
    const { apiKey, placeId, placeName } = req.body || {};

    if (!apiKey || !placeId) {
      return res.status(400).json({ error: 'apiKey e placeId são obrigatórios.' });
    }

    // Busca o projeto pela apiKey
    const project = await Project.findOne({ apiKey: String(apiKey), placeId: String(placeId) });
    if (!project) {
      return res.status(401).json({ error: 'apiKey ou placeId inválidos.' });
    }

    // Verifica status do dono
    const user = await User.findById(project.owner);
    if (!user) {
      return res.status(401).json({ error: 'Conta do proprietário não encontrada.' });
    }
    if (user.status === 'banned') {
      return res.status(403).json({ error: 'Conta banida.' });
    }

    const token = jwt.sign(
      { id: user._id, robloxId: user.robloxId, username: user.robloxUsername, role: user.role, planType: user.planType },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    return res.json({
      token,
      project: { id: project._id, name: project.name, apiKey: project.apiKey },
    });
  } catch (error) {
    console.error('[Plugin Auth Error]', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
};
