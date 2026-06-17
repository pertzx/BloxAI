import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.js';
import { uploadMiddleware, handleUpload } from '../controllers/uploadController.js';

const router = Router();

router.use(authMiddleware);
router.post('/', uploadMiddleware, handleUpload);

export default router;
