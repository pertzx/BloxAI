import { User } from '../models/User.js';

// Garante que o usuário autenticado tem papel de admin.
// O papel é validado no banco (nunca confiamos apenas no JWT para autorização).
export const requireAdmin = async (req, res, next) => {
  try {
    const user = await User.findById(req.user?.id).lean();
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Acesso restrito a administradores.' });
    }
    req.currentUser = user;
    next();
  } catch (error) {
    console.error('[requireAdmin] falha ao validar permissões:', error);
    res.status(500).json({ error: 'Falha ao validar permissões.' });
  }
};
