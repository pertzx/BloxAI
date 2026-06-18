import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.js';
import { requireAdmin } from '../middlewares/requireAdmin.js';
import {
  getMyBilling,
  getRanking,
  adminTopUp,
  adminSetMargin,
  adminSetStatus,
  adminListUsers,
} from '../controllers/billingController.js';
import {
  listPlans,
  createPlan,
  updatePlan,
  deletePlan,
  assignPlan,
} from '../controllers/planController.js';
import {
  listAiModels,
  createAiModel,
  updateAiModel,
  deleteAiModel,
} from '../controllers/aiModelController.js';
import {
  listPublicPlans,
  createCheckoutSession,
} from '../controllers/subscriptionController.js';

const router = Router();

router.use(authMiddleware);

// Usuário autenticado
router.get('/me', getMyBilling);
router.get('/ranking', getRanking);
router.get('/plans', listPublicPlans);
router.post('/checkout', createCheckoutSession);

// Administração — usuários
router.get('/admin/users', requireAdmin, adminListUsers);
router.post('/admin/topup', requireAdmin, adminTopUp);
router.post('/admin/margin', requireAdmin, adminSetMargin);
router.post('/admin/status', requireAdmin, adminSetStatus);

// Administração — planos (config dinâmica)
router.get('/admin/plans', requireAdmin, listPlans);
router.post('/admin/plans', requireAdmin, createPlan);
router.put('/admin/plans/:id', requireAdmin, updatePlan);
router.delete('/admin/plans/:id', requireAdmin, deletePlan);
router.post('/admin/plans/assign', requireAdmin, assignPlan);

// Administração — modelos de IA (registro dinâmico por provedor)
router.get('/admin/models', requireAdmin, listAiModels);
router.post('/admin/models', requireAdmin, createAiModel);
router.put('/admin/models/:id', requireAdmin, updateAiModel);
router.delete('/admin/models/:id', requireAdmin, deleteAiModel);

export default router;
