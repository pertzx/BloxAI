import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { JWT_SECRET } from '../config/env.js';
import { User } from '../models/User.js';
import { Project } from '../models/Project.js';

export const pluginAuth = async (req, res) => {
  try {
    const { email, password, placeId, placeName } = req.body || {};

    if (!email || !password || !placeId) {
      return res.status(400).json({ error: 'Email, senha e placeId são obrigatórios' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const token = jwt.sign({ id: user._id, plan: user.plan }, JWT_SECRET, { expiresIn: '30d' });

    let project = await Project.findOne({ placeId: String(placeId), owner: user._id });
    if (!project) {
      const apiKey = crypto.randomBytes(32).toString('hex');
      project = await Project.create({
        name: placeName || `Projeto ${placeId}`,
        placeId: String(placeId),
        owner: user._id,
        apiKey,
      });
    }

    return res.json({
      token,
      project: {
        id: project._id,
        name: project.name,
        apiKey: project.apiKey,
      },
    });
  } catch (error) {
    console.error('[Plugin Auth Error]', error);
    return res.status(500).json({ error: 'Erro interno no servidor' });
  }
};
