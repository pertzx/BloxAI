import { Router } from 'express';
import { getProjects, createProject, getProjectDetails } from '../controllers/projectController.js';
import { handleChatIntent } from '../controllers/chatController.js';
import { getSyncState, postSyncState } from '../controllers/syncController.js';
import { getProjectCommands, updateProjectCommandApproval } from '../controllers/commandController.js';
import { authMiddleware } from '../middlewares/auth.js';

const router = Router();

// Todas as rotas de projeto precisam de autenticação
router.use(authMiddleware);

router.get('/', getProjects);
router.post('/', createProject);
router.get('/:id', getProjectDetails);
router.post('/:id/chat', handleChatIntent);
router.get('/:id/commands', getProjectCommands);
router.patch('/:id/commands', updateProjectCommandApproval);
router.get('/:id/sync', getSyncState);
router.post('/:id/sync', postSyncState);

export default router;
