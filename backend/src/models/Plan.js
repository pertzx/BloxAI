import mongoose from 'mongoose';

/**
 * Configuração dinâmica de planos.
 *
 * Os planos deixam de ser hardcoded: o admin cria/edita/remove planos pelo
 * painel. Cada plano define margem, créditos, preço e quais features libera.
 * O `key` é o identificador estável (slug) referenciado por User.planKey.
 */
const planSchema = new mongoose.Schema({
  // Identificador estável (slug). Imutável após criado.
  key: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },

  // recurring = assinatura mensal; prepaid = carteira pré-paga (pay-as-you-go)
  planType: { type: String, enum: ['recurring', 'prepaid'], default: 'prepaid' },

  // Preço de exibição (USD/mês para recurring). 0 = grátis.
  priceUsd: { type: Number, default: 0, min: 0 },

  // Margem aplicada aos usuários deste plano. null = usa o padrão global (.env).
  marginPercent: { type: Number, default: null, min: 0, max: 99 },

  // Crédito (USD cobrado) concedido por ciclo ao atribuir o plano (recurring).
  monthlyCreditUsd: { type: Number, default: 0, min: 0 },

  // Bônus de saldo concedido ao novo usuário que cai neste plano por padrão.
  signupBonusUsd: { type: Number, default: 0, min: 0 },

  // Features liberadas pelo plano.
  features: {
    ideaGenerator: { type: Boolean, default: false },
    thinkMode: { type: Boolean, default: true },
    prioritySupport: { type: Boolean, default: false },
  },

  // Apresentação no painel / pricing.
  highlight: { type: Boolean, default: false },
  order: { type: Number, default: 0 },

  active: { type: Boolean, default: true },
  // Plano atribuído automaticamente a novos usuários. Apenas um deve ser true.
  isDefault: { type: Boolean, default: false },
}, { timestamps: true });

export const Plan = mongoose.models.Plan || mongoose.model('Plan', planSchema);
