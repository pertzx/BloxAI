import { Router } from 'express';
import {
  generateGameIdea,
  refineIdea,
  generateIdeaImage,
  listIdeaHistory,
  applyIdeaToProject,
} from '../controllers/ideaController.js';
import { authMiddleware } from '../middlewares/auth.js';
import { ideaRateLimit } from '../middlewares/rateLimit.js';

const router = Router();
router.use(authMiddleware);

router.get('/history', listIdeaHistory);
router.post('/generate', ideaRateLimit, generateGameIdea);
router.post('/refine', ideaRateLimit, refineIdea);
router.post('/image', ideaRateLimit, generateIdeaImage);
router.post('/apply', applyIdeaToProject);

export default router;
