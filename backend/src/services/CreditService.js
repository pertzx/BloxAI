import { User } from '../models/User.js';
import { CostLog } from '../models/CostLog.js';
import { PricingEngine } from './PricingEngine.js';
import { PlanService } from './PlanService.js';

/**
 * Regras de carteira pré-paga e cobrança por geração.
 *
 * O saldo (balanceUsd) é mantido em dólares "cobrados" (o valor que o cliente
 * pagou e enxerga). Cada geração debita o custo cobrado = custo real * multiplicador.
 * Quando o saldo zera, novas gerações são bloqueadas até uma recarga.
 */
export class CreditService {
  /** Status efetivo, reativando suspensões temporárias já expiradas. */
  static resolveStatus(user) {
    if (
      user.status === 'suspended' &&
      user.suspendedUntil &&
      new Date(user.suspendedUntil).getTime() <= Date.now()
    ) {
      return 'active';
    }
    return user.status || 'active';
  }

  /** Verifica se o usuário pode iniciar uma geração (status + saldo). */
  static checkSpendEligibility(user) {
    if (!user) {
      return { allowed: false, code: 'NO_USER', reason: 'Usuário não encontrado.' };
    }

    const status = this.resolveStatus(user);
    if (status === 'banned') {
      return { allowed: false, code: 'BANNED', reason: 'Conta banida permanentemente.' };
    }
    if (status === 'suspended') {
      return {
        allowed: false,
        code: 'SUSPENDED',
        reason: user.suspendedUntil
          ? `Conta suspensa até ${new Date(user.suspendedUntil).toISOString()}.`
          : 'Conta suspensa.',
      };
    }
    if ((Number(user.balanceUsd) || 0) <= 0) {
      return {
        allowed: false,
        code: 'NO_BALANCE',
        reason: 'Saldo insuficiente. Faça uma recarga para continuar gerando.',
      };
    }
    return { allowed: true, code: 'OK', reason: 'Saldo e status válidos.' };
  }

  /**
   * Cobra o usuário após a geração: calcula o custo cobrado pela margem,
   * debita o saldo atomicamente e grava o log de auditoria.
   * Retorna o detalhamento da cobrança e o saldo resultante.
   */
  static async chargeForUsage({ userId, realCostUsd, model, type, projectId, commandId, tokens = {} }) {
    const user = await User.findById(userId);
    if (!user) throw new Error('Usuário não encontrado para cobrança.');

    const breakdown = PricingEngine.computeCharge(realCostUsd, PlanService.resolveMargin(user));

    // Debita o valor cobrado e acumula auditoria de forma atômica.
    const updated = await User.findByIdAndUpdate(
      userId,
      {
        $inc: {
          balanceUsd: -breakdown.chargedUsd,
          totalRealCostUsd: breakdown.realCostUsd,
          totalChargedUsd: breakdown.chargedUsd,
        },
      },
      { new: true }
    );

    const balanceAfterUsd = round6(updated.balanceUsd);

    const log = await CostLog.create({
      user: userId,
      project: projectId || undefined,
      command: commandId || undefined,
      type: type || 'generic',
      model: model || 'unknown',
      realCostUsd: breakdown.realCostUsd,
      multiplier: breakdown.multiplier,
      marginPercent: breakdown.marginPercent,
      chargedUsd: breakdown.chargedUsd,
      profitUsd: breakdown.profitUsd,
      inputTokens: Number(tokens.inputTokens || 0),
      outputTokens: Number(tokens.outputTokens || 0),
      totalTokens: Number(tokens.totalTokens || 0),
      balanceAfterUsd,
    });

    return { ...breakdown, balanceAfterUsd, costLogId: log._id };
  }

  /**
   * Recarrega a carteira. O valor pago é convertido integralmente em saldo e
   * define o novo teto de referência (walletStartUsd) para o consumo de 0% a 100%.
   */
  static async topUp({ userId, amountUsd }) {
    const amount = Number(amountUsd);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Valor de recarga inválido.');
    }

    const user = await User.findById(userId);
    if (!user) throw new Error('Usuário não encontrado.');

    user.balanceUsd = round6((Number(user.balanceUsd) || 0) + amount);
    user.walletStartUsd = user.balanceUsd;
    await user.save();

    return { balanceUsd: user.balanceUsd, walletStartUsd: user.walletStartUsd, added: round6(amount) };
  }
}

function round6(value) {
  return Number((Number(value) || 0).toFixed(6));
}
