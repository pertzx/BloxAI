import { Router } from 'express';
import {
  robloxOAuthStart,
  robloxOAuthCallback,
  getMe,
  setSecurityEmail,
  verifySecurityEmail,
  requestRecovery,
  confirmRecovery,
} from '../controllers/authController.js';
import { authMiddleware } from '../middlewares/auth.js';
import { authRateLimit } from '../middlewares/rateLimit.js';

const router = Router();

// Início do fluxo OAuth (redireciona para Roblox)
router.get('/roblox', robloxOAuthStart);

// Callback chamado pela Roblox após autorização
router.get('/roblox/callback', robloxOAuthCallback);

// Perfil do usuário autenticado
router.get('/me', authMiddleware, getMe);

// E-mail de segurança (autenticado)
router.post('/security-email', authMiddleware, authRateLimit, setSecurityEmail);

// Verificação do e-mail (link enviado por e-mail, sem auth)
router.get('/verify-email', verifySecurityEmail);

// Solicitar link de recuperação (sem auth, rate-limited)
router.post('/recover', authRateLimit, requestRecovery);

// Confirmar recuperação via link do e-mail (sem auth)
router.get('/recover/confirm', confirmRecovery);

export default router;
