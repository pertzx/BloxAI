import { Plan } from '../models/Plan.js';
import { PricingEngine } from './PricingEngine.js';
import { DEFAULT_MARGIN_PERCENT } from '../config/env.js';

/**
 * Camada de acesso a planos com cache em memória.
 *
 * Planos mudam raramente, mas são lidos a cada cobrança/gate de feature.
 * Mantemos um cache sincronizado que é recarregado a cada escrita (refresh()).
 */
let byKey = new Map();   // key -> plano (lean)
let byName = new Map();  // nome minúsculo -> plano (fallback p/ usuários legados)

const DEFAULT_PLANS = [
  {
    key: 'free', name: 'Free', description: 'Para começar a explorar.',
    planType: 'prepaid', priceUsd: 0, marginPercent: null,
    monthlyCreditUsd: 0, signupBonusUsd: 0.5,
    features: { ideaGenerator: false, thinkMode: true, prioritySupport: false },
    highlight: false, order: 0, active: true, isDefault: true,
  },
  {
    key: 'creator', name: 'Creator', description: 'Para devs solo levando o jogo a sério.',
    planType: 'recurring', priceUsd: 9.99, marginPercent: 50,
    monthlyCreditUsd: 10, signupBonusUsd: 0,
    features: { ideaGenerator: true, thinkMode: true, prioritySupport: false },
    highlight: true, order: 1, active: true, isDefault: false,
  },
  {
    key: 'studio', name: 'Studio', description: 'Para estúdios em ritmo de produção.',
    planType: 'recurring', priceUsd: 29.99, marginPercent: 40,
    monthlyCreditUsd: 35, signupBonusUsd: 0,
    features: { ideaGenerator: true, thinkMode: true, prioritySupport: true },
    highlight: false, order: 2, active: true, isDefault: false,
  },
  {
    key: 'enterprise', name: 'Enterprise', description: 'Volume alto e suporte dedicado.',
    planType: 'recurring', priceUsd: 99.99, marginPercent: 30,
    monthlyCreditUsd: 150, signupBonusUsd: 0,
    features: { ideaGenerator: true, thinkMode: true, prioritySupport: true },
    highlight: false, order: 3, active: true, isDefault: false,
  },
];

export class PlanService {
  /** Recarrega o cache a partir do banco. Chame após qualquer escrita. */
  static async refresh() {
    const plans = await Plan.find().sort({ order: 1 }).lean();
    byKey = new Map(plans.map((p) => [p.key, p]));
    byName = new Map(plans.map((p) => [String(p.name).toLowerCase(), p]));
    return plans;
  }

  /** Todos os planos (ordenados). Lê do cache. */
  static all() {
    return [...byKey.values()].sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  /** Apenas planos ativos. */
  static allActive() {
    return this.all().filter((p) => p.active);
  }

  static get(key) {
    return key ? byKey.get(String(key)) : undefined;
  }

  /** Plano padrão (atribuído a novos usuários). */
  static getDefault() {
    return this.all().find((p) => p.isDefault) || this.all()[0];
  }

  /** Resolve o plano de um usuário: por planKey, depois por nome (legado), senão o default. */
  static resolveForUser(user) {
    if (!user) return undefined;
    if (user.planKey && byKey.has(user.planKey)) return byKey.get(user.planKey);
    if (user.plan && byName.has(String(user.plan).toLowerCase())) {
      return byName.get(String(user.plan).toLowerCase());
    }
    return this.getDefault();
  }

  /** Margem efetiva: override do usuário → margem do plano → padrão global. */
  static resolveMargin(user) {
    if (user && user.marginPercent !== null && user.marginPercent !== undefined) {
      return PricingEngine.normalizeMargin(user.marginPercent);
    }
    const plan = this.resolveForUser(user);
    if (plan && plan.marginPercent !== null && plan.marginPercent !== undefined) {
      return PricingEngine.normalizeMargin(plan.marginPercent);
    }
    return PricingEngine.normalizeMargin(DEFAULT_MARGIN_PERCENT);
  }

  /** Verifica se o usuário tem acesso a uma feature pelo plano (admin sempre tem). */
  static hasFeature(user, feature) {
    if (user?.role === 'admin') return true;
    const plan = this.resolveForUser(user);
    return Boolean(plan?.features?.[feature]);
  }

  /** Semeia planos padrão na primeira execução e popula o cache. */
  static async seedDefaults() {
    const count = await Plan.countDocuments();
    if (count === 0) {
      await Plan.create(DEFAULT_PLANS);
      console.log('[PlanService] Planos padrão criados (free, creator, studio, enterprise).');
    }
    await this.refresh();
  }
}
