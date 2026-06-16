import { DEFAULT_MARGIN_PERCENT } from '../config/env.js';

// Margem máxima permitida. Acima disso o multiplicador inverso explodiria
// (1 / (1 - 1) = infinito), então travamos em 99% para manter o cálculo finito.
const MAX_MARGIN_PERCENT = 99;

/**
 * Motor de precificação por margem inversa.
 *
 * A plataforma define uma margem M%. O cliente enxerga e é debitado pelo
 * "Custo para a Plataforma", que é o custo real da IA multiplicado por:
 *
 *     multiplicador = 1 / (1 - M/100)
 *
 * Assim, quando o cliente consome 100% do saldo que pagou, o custo real
 * gasto com a API foi exatamente (1 - M/100) do valor pago, preservando a
 * margem M% como lucro líquido.
 */
export class PricingEngine {
  static normalizeMargin(marginPercent) {
    const value = Number(marginPercent);
    if (!Number.isFinite(value)) return DEFAULT_MARGIN_PERCENT;
    return Math.min(MAX_MARGIN_PERCENT, Math.max(0, value));
  }

  /** Margem efetiva: override do usuário quando definido, senão o padrão global. */
  static resolveMargin(user) {
    if (user && user.marginPercent !== null && user.marginPercent !== undefined) {
      return this.normalizeMargin(user.marginPercent);
    }
    return this.normalizeMargin(DEFAULT_MARGIN_PERCENT);
  }

  /** multiplicador = 1 / (1 - M/100) */
  static getMultiplier(marginPercent) {
    const margin = this.normalizeMargin(marginPercent);
    return 1 / (1 - margin / 100);
  }

  /**
   * Converte o custo real (USD) no custo cobrado do cliente (USD) e devolve
   * o detalhamento completo para auditoria.
   */
  static computeCharge(realCostUsd, marginPercent) {
    const realCost = Math.max(0, Number(realCostUsd) || 0);
    const margin = this.normalizeMargin(marginPercent);
    const multiplier = this.getMultiplier(margin);
    const chargedUsd = round6(realCost * multiplier);

    return {
      realCostUsd: round6(realCost),
      marginPercent: margin,
      multiplier: round6(multiplier),
      chargedUsd,
      profitUsd: round6(chargedUsd - realCost),
    };
  }
}

function round6(value) {
  return Number((Number(value) || 0).toFixed(6));
}
