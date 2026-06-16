import { User } from '../models/User.js';
import { CostLog } from '../models/CostLog.js';
import { PricingEngine } from '../services/PricingEngine.js';
import { CreditService } from '../services/CreditService.js';
import { PlanService } from '../services/PlanService.js';

// ---- Usuário: visão da própria carteira e consumo ----

export const getMyBilling = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).lean();
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const margin = PlanService.resolveMargin(user);
    const balanceUsd = round6(user.balanceUsd);
    const walletStartUsd = round6(user.walletStartUsd || 0);

    const logs = await CostLog.find({ user: user._id })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    res.json({
      plan: user.plan,
      planType: user.planType,
      status: CreditService.resolveStatus(user),
      role: user.role,
      marginPercent: margin,
      multiplier: round6(PricingEngine.getMultiplier(margin)),
      balanceUsd,
      walletStartUsd,
      consumptionPercent: consumptionPercent(balanceUsd, walletStartUsd),
      lifetime: {
        totalRealCostUsd: round6(user.totalRealCostUsd),
        totalChargedUsd: round6(user.totalChargedUsd),
      },
      recentUsage: logs.map(serializeLog),
    });
  } catch (error) {
    console.error('[billing] getMyBilling:', error);
    res.status(500).json({ error: 'Falha ao carregar dados de cobrança.' });
  }
};

// ---- Admin: gestão de saldo, margem e status ----

export const adminTopUp = async (req, res) => {
  try {
    const { userId, amountUsd } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId é obrigatório.' });

    const result = await CreditService.topUp({ userId, amountUsd });
    res.json({ success: true, userId, ...result });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Falha ao recarregar saldo.' });
  }
};

export const adminSetMargin = async (req, res) => {
  try {
    const { userId, marginPercent } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId é obrigatório.' });

    const normalized =
      marginPercent === null || marginPercent === undefined || marginPercent === ''
        ? null
        : PricingEngine.normalizeMargin(marginPercent);

    const user = await User.findByIdAndUpdate(
      userId,
      { marginPercent: normalized },
      { new: true }
    ).lean();
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const effective = PlanService.resolveMargin(user);
    res.json({
      success: true,
      userId,
      marginPercent: user.marginPercent,
      effectiveMarginPercent: effective,
      multiplier: round6(PricingEngine.getMultiplier(effective)),
    });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Falha ao definir margem.' });
  }
};

export const adminSetStatus = async (req, res) => {
  try {
    const { userId, status, suspendedMinutes } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId é obrigatório.' });
    if (!['active', 'suspended', 'banned'].includes(status)) {
      return res.status(400).json({ error: 'status inválido. Use active, suspended ou banned.' });
    }

    const update = { status };
    if (status === 'suspended') {
      const minutes = Number(suspendedMinutes);
      update.suspendedUntil = Number.isFinite(minutes) && minutes > 0
        ? new Date(Date.now() + minutes * 60_000)
        : null; // suspensão sem prazo definido
    } else {
      update.suspendedUntil = null;
    }

    const user = await User.findByIdAndUpdate(userId, update, { new: true }).lean();
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    res.json({ success: true, userId, status: user.status, suspendedUntil: user.suspendedUntil });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Falha ao atualizar status.' });
  }
};

export const adminListUsers = async (req, res) => {
  try {
    const { q, status, plan } = req.query || {};
    const filter = {};
    if (status) filter.status = status;
    if (plan) filter.planKey = plan;
    if (q) {
      filter.$or = [
        { robloxUsername: { $regex: String(q), $options: 'i' } },
        { robloxDisplayName: { $regex: String(q), $options: 'i' } },
      ];
    }

    const users = await User.find(filter).sort({ createdAt: -1 }).limit(100).lean();
    res.json({
      count: users.length,
      users: users.map((user) => {
        const margin = PlanService.resolveMargin(user);
        const resolvedPlan = PlanService.resolveForUser(user);
        return {
          id: user._id,
          robloxUsername: user.robloxUsername,
          robloxDisplayName: user.robloxDisplayName,
          plan: user.plan,
          planKey: resolvedPlan?.key || user.planKey || null,
          planType: user.planType,
          role: user.role,
          status: CreditService.resolveStatus(user),
          suspendedUntil: user.suspendedUntil,
          balanceUsd: round6(user.balanceUsd),
          marginPercent: user.marginPercent,
          effectiveMarginPercent: margin,
          totalRealCostUsd: round6(user.totalRealCostUsd),
          totalChargedUsd: round6(user.totalChargedUsd),
          createdAt: user.createdAt,
        };
      }),
    });
  } catch (error) {
    console.error('[billing] adminListUsers:', error);
    res.status(500).json({ error: 'Falha ao listar usuários.' });
  }
};

// ---- Ranking de atividade (visível a qualquer usuário autenticado) ----

export const getRanking = async (req, res) => {
  try {
    const top = await CostLog.aggregate([
      { $group: { _id: '$user', totalTokens: { $sum: '$totalTokens' }, commands: { $sum: 1 } } },
      { $sort: { totalTokens: -1, commands: -1 } },
      { $limit: 10 },
    ]);

    const ids = top.map((t) => t._id).filter(Boolean);
    const users = await User.find({ _id: { $in: ids } })
      .select('robloxUsername robloxDisplayName robloxAvatarUrl')
      .lean();
    const byId = new Map(users.map((u) => [String(u._id), u]));

    const ranking = top
      .map((t, i) => {
        const u = byId.get(String(t._id));
        if (!u) return null;
        return {
          rank: i + 1,
          robloxUsername: u.robloxUsername || '',
          robloxDisplayName: u.robloxDisplayName || '',
          robloxAvatarUrl: u.robloxAvatarUrl || '',
          totalTokens: Number(t.totalTokens || 0),
          commands: Number(t.commands || 0),
          isMe: String(t._id) === String(req.user.id),
        };
      })
      .filter(Boolean);

    res.json({ ranking });
  } catch (error) {
    console.error('[billing] getRanking:', error);
    res.status(500).json({ error: 'Falha ao carregar ranking.' });
  }
};

function serializeLog(log) {
  return {
    id: log._id,
    type: log.type,
    model: log.model,
    realCostUsd: round6(log.realCostUsd),
    chargedUsd: round6(log.chargedUsd),
    marginPercent: log.marginPercent,
    multiplier: round6(log.multiplier),
    totalTokens: log.totalTokens,
    balanceAfterUsd: round6(log.balanceAfterUsd),
    createdAt: log.createdAt,
  };
}

// Consumo de 0% a 100% relativo ao teto da carteira (última recarga).
function consumptionPercent(balanceUsd, walletStartUsd) {
  if (walletStartUsd > 0) {
    const consumed = (1 - balanceUsd / walletStartUsd) * 100;
    return Number(Math.min(100, Math.max(0, consumed)).toFixed(2));
  }
  return balanceUsd > 0 ? 0 : 100;
}

function round6(value) {
  return Number((Number(value) || 0).toFixed(6));
}
