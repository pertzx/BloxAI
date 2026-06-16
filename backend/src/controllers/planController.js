import { Plan } from '../models/Plan.js';
import { User } from '../models/User.js';
import { PlanService } from '../services/PlanService.js';
import { PricingEngine } from '../services/PricingEngine.js';
import { CreditService } from '../services/CreditService.js';

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

function sanitizePlanInput(body = {}, { partial = false } = {}) {
  const out = {};

  if (body.name !== undefined) out.name = String(body.name).trim();
  if (body.description !== undefined) out.description = String(body.description).trim();

  if (body.planType !== undefined) {
    if (!['recurring', 'prepaid'].includes(body.planType)) {
      throw new Error('planType inválido (use recurring ou prepaid).');
    }
    out.planType = body.planType;
  }

  if (body.stripePriceId !== undefined) out.stripePriceId = String(body.stripePriceId).trim();
  if (body.priceUsd !== undefined) out.priceUsd = clamp(body.priceUsd, 0, Number.MAX_SAFE_INTEGER);
  if (body.monthlyCreditUsd !== undefined) out.monthlyCreditUsd = clamp(body.monthlyCreditUsd, 0, Number.MAX_SAFE_INTEGER);
  if (body.signupBonusUsd !== undefined) out.signupBonusUsd = clamp(body.signupBonusUsd, 0, Number.MAX_SAFE_INTEGER);

  if (body.marginPercent !== undefined) {
    out.marginPercent =
      body.marginPercent === null || body.marginPercent === ''
        ? null
        : PricingEngine.normalizeMargin(body.marginPercent);
  }

  if (body.features !== undefined && body.features !== null) {
    out.features = {
      ideaGenerator: Boolean(body.features.ideaGenerator),
      thinkMode: body.features.thinkMode === undefined ? true : Boolean(body.features.thinkMode),
      prioritySupport: Boolean(body.features.prioritySupport),
    };
  }

  if (body.highlight !== undefined) out.highlight = Boolean(body.highlight);
  if (body.order !== undefined) out.order = Number(body.order) || 0;
  if (body.active !== undefined) out.active = Boolean(body.active);
  if (body.isDefault !== undefined) out.isDefault = Boolean(body.isDefault);

  if (!partial && !out.name) throw new Error('Nome do plano é obrigatório.');

  return out;
}

function clamp(raw, min, max) {
  const v = Number(raw);
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}

// ── Listar todos os planos (admin) ─────────────────────────────────────────────
export const listPlans = async (_req, res) => {
  try {
    await PlanService.refresh();
    res.json({ plans: PlanService.all() });
  } catch (error) {
    console.error('[plans] listPlans:', error);
    res.status(500).json({ error: 'Falha ao listar planos.' });
  }
};

// ── Criar plano ────────────────────────────────────────────────────────────────
export const createPlan = async (req, res) => {
  try {
    const key = String(req.body?.key || '').trim().toLowerCase();
    if (!SLUG_RE.test(key)) {
      return res.status(400).json({ error: 'key inválido. Use letras minúsculas, números e hífens (ex: pro-anual).' });
    }
    const exists = await Plan.findOne({ key });
    if (exists) return res.status(409).json({ error: 'Já existe um plano com esse key.' });

    const data = sanitizePlanInput(req.body);
    const plan = await Plan.create({ key, ...data });

    await ensureSingleDefault(plan);
    await PlanService.refresh();
    res.status(201).json({ success: true, plan: PlanService.get(plan.key) });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Falha ao criar plano.' });
  }
};

// ── Atualizar plano ──────────────────────────────────────────────────────────────
export const updatePlan = async (req, res) => {
  try {
    const data = sanitizePlanInput(req.body, { partial: true });
    const plan = await Plan.findByIdAndUpdate(req.params.id, data, { new: true });
    if (!plan) return res.status(404).json({ error: 'Plano não encontrado.' });

    await ensureSingleDefault(plan);

    // Se mudou o nome, propaga para o display dos usuários que usam este plano.
    if (data.name) {
      await User.updateMany({ planKey: plan.key }, { plan: plan.name });
    }
    // Se virou recurring/prepaid, mantém planType dos usuários em sincronia.
    if (data.planType) {
      await User.updateMany({ planKey: plan.key }, { planType: plan.planType });
    }

    await PlanService.refresh();
    res.json({ success: true, plan: PlanService.get(plan.key) });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Falha ao atualizar plano.' });
  }
};

// ── Remover plano ────────────────────────────────────────────────────────────────
export const deletePlan = async (req, res) => {
  try {
    const plan = await Plan.findById(req.params.id);
    if (!plan) return res.status(404).json({ error: 'Plano não encontrado.' });
    if (plan.isDefault) {
      return res.status(400).json({ error: 'Não é possível remover o plano padrão. Defina outro como padrão antes.' });
    }

    const inUse = await User.countDocuments({ planKey: plan.key });
    const fallback = PlanService.getDefault();
    if (inUse > 0 && fallback) {
      await User.updateMany(
        { planKey: plan.key },
        { planKey: fallback.key, plan: fallback.name, planType: fallback.planType }
      );
    }

    await plan.deleteOne();
    await PlanService.refresh();
    res.json({ success: true, reassigned: inUse, reassignedTo: fallback?.key || null });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Falha ao remover plano.' });
  }
};

// ── Atribuir plano a um usuário ──────────────────────────────────────────────────
export const assignPlan = async (req, res) => {
  try {
    const { userId, planKey, grantCredit } = req.body || {};
    if (!userId || !planKey) return res.status(400).json({ error: 'userId e planKey são obrigatórios.' });

    const plan = PlanService.get(planKey);
    if (!plan) return res.status(404).json({ error: 'Plano não encontrado.' });

    const user = await User.findByIdAndUpdate(
      userId,
      { planKey: plan.key, plan: plan.name, planType: plan.planType },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    // Opcional: já credita o valor mensal do plano na carteira.
    let credit = null;
    if (grantCredit && plan.monthlyCreditUsd > 0) {
      credit = await CreditService.topUp({ userId, amountUsd: plan.monthlyCreditUsd });
    }

    res.json({
      success: true,
      userId,
      planKey: plan.key,
      plan: plan.name,
      planType: plan.planType,
      effectiveMarginPercent: PlanService.resolveMargin(user),
      credit,
    });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Falha ao atribuir plano.' });
  }
};

// Garante que apenas um plano seja o padrão.
async function ensureSingleDefault(plan) {
  if (plan.isDefault) {
    await Plan.updateMany({ _id: { $ne: plan._id } }, { isDefault: false });
  }
}
