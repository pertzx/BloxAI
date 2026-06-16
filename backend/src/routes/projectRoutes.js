import { Router } from 'express';
import { getProjects, createProject, getProjectDetails } from '../controllers/projectController.js';
import { handleChatIntent, getChatTask } from '../controllers/chatController.js';
import { handleChatStream } from '../controllers/streamController.js';
import { getSyncState, postSyncState } from '../controllers/syncController.js';
import { getProjectCommands, updateProjectCommandApproval } from '../controllers/commandController.js';
import { getContextState, putContextState } from '../controllers/contextController.js';
import { authMiddleware } from '../middlewares/auth.js';
import { chatRateLimit } from '../middlewares/rateLimit.js';

const router = Router();

// Todas as rotas de projeto precisam de autenticação
router.use(authMiddleware);

router.get('/', getProjects);
router.post('/', createProject);
router.get('/:id', getProjectDetails);
router.post('/:id/chat', chatRateLimit, handleChatIntent);
router.post('/:id/chat/stream', chatRateLimit, handleChatStream);
router.get('/:id/chat/task/:taskId', getChatTask);
router.get('/:id/commands', getProjectCommands);
router.patch('/:id/commands', updateProjectCommandApproval);
router.get('/:id/sync', getSyncState);
router.post('/:id/sync', postSyncState);
router.get('/:id/context', getContextState);
router.put('/:id/context', putContextState);

export default router;
