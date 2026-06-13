import { Router } from 'express';
import { pluginAuth } from '../controllers/pluginController.js';

const router = Router();

router.post('/auth', pluginAuth);

export default router;
