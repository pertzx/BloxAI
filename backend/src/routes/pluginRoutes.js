import { Router } from 'express';
import {
  pluginAuth,
  pluginConnect,
  getPluginKey,
  regeneratePluginKey,
} from '../controllers/pluginController.js';
import { authMiddleware } from '../middlewares/auth.js';

const router = Router();

// Pareamento via chave de conta (cria/conecta projeto automaticamente)
router.post('/connect', pluginConnect);
// Autenticação legada por apiKey do projeto
router.post('/auth', pluginAuth);

// Gestão da chave de conta (web, autenticado)
router.get('/key', authMiddleware, getPluginKey);
router.post('/key/regenerate', authMiddleware, regeneratePluginKey);

export default router;
