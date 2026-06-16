import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.js';
import { requireAdmin } from '../middlewares/requireAdmin.js';
import {
  getMyBilling,
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

const router = Router();

router.use(authMiddleware);

// Usuário autenticado
router.get('/me', getMyBilling);

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

export default router;
