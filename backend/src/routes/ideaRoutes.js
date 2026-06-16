import { Router } from 'express';
import { generateGameIdea } from '../controllers/ideaController.js';
import { authMiddleware } from '../middlewares/auth.js';
import { ideaRateLimit } from '../middlewares/rateLimit.js';

const router = Router();
router.use(authMiddleware);
router.post('/generate', ideaRateLimit, generateGameIdea);

export default router;
