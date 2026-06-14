import { Router } from 'express';
import { getNextCommand, reportCommandResult } from '../controllers/commandController.js';
import { authMiddleware } from '../middlewares/auth.js';

const router = Router();

// Endpoint para o plugin puxar a fila
router.get('/next', authMiddleware, getNextCommand);

// Endpoint para o plugin enviar o resultado
router.post('/:id/result', authMiddleware, reportCommandResult);

export default router;
