import { stripe, isStripeEnabled } from '../services/StripeService.js';
import { STRIPE_WEBHOOK_SECRET, FRONTEND_URL } from '../config/env.js';
import { User } from '../models/User.js';
import { PlanService } from '../services/PlanService.js';
import { CreditService } from '../services/CreditService.js';

// ── Lista pública de planos ativos (sem segredos) ──────────────────────────────
export const listPublicPlans = async (_req, res) => {
  try {
    await PlanService.refresh();
    const plans = PlanService.allActive().map((p) => ({
      key: p.key,
      name: p.name,
      description: p.description,
      planType: p.planType,
      priceUsd: p.priceUsd,
      monthlyCreditUsd: p.monthlyCreditUsd,
      features: p.features,
      highlight: p.highlight,
      order: p.order,
      purchasable: p.planType === 'recurring' && Boolean(p.stripePriceId),
    }));
    res.json({ plans, stripeEnabled: isStripeEnabled() });
  } catch (error) {
    console.error('[subscription] listPublicPlans:', error);
    res.status(500).json({ error: 'Falha ao listar planos.' });
  }
};

// ── Cria sessão de checkout do Stripe para um plano ────────────────────────────
export const createCheckoutSession = async (req, res) => {
  try {
    if (!isStripeEnabled()) {
      return res.status(503).json({ error: 'Pagamentos não estão configurados no servidor.' });
    }

    const { planKey } = req.body || {};
    const plan = PlanService.get(planKey);
    if (!plan || !plan.active) return res.status(404).json({ error: 'Plano não encontrado.' });
    if (plan.planType !== 'recurring' || !plan.stripePriceId) {
      return res.status(400).json({ error: 'Este plano não está disponível para compra.' });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    // Garante um customer Stripe para o usuário
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        metadata: { userId: String(user._id), robloxId: user.robloxId },
        name: user.robloxDisplayName || user.robloxUsername || undefined,
      });
      customerId = customer.id;
      user.stripeCustomerId = customerId;
      await user.save();
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      client_reference_id: String(user._id),
      metadata: { userId: String(user._id), planKey: plan.key },
      subscription_data: { metadata: { userId: String(user._id), planKey: plan.key } },
      success_url: `${FRONTEND_URL}/upgrade?status=success`,
      cancel_url: `${FRONTEND_URL}/upgrade?status=cancel`,
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('[subscription] createCheckoutSession:', error.message);
    res.status(500).json({ error: 'Falha ao iniciar o checkout.' });
  }
};

// Aplica um plano ao usuário e credita a cota mensal.
async function activatePlan(userId, planKey, { subscriptionId, customerId, status } = {}) {
  const plan = PlanService.get(planKey);
  if (!plan) { console.error('[subscription] activatePlan: plano inexistente', planKey); return; }

  const update = {
    planKey: plan.key,
    plan: plan.name,
    planType: plan.planType,
  };
  if (subscriptionId) update.stripeSubscriptionId = subscriptionId;
  if (customerId) update.stripeCustomerId = customerId;
  if (status) update.subscriptionStatus = status;

  await User.findByIdAndUpdate(userId, update);

  if (plan.monthlyCreditUsd > 0) {
    await CreditService.topUp({ userId, amountUsd: plan.monthlyCreditUsd });
  }
  console.log(`[subscription] Plano ${plan.key} ativado para user ${userId}`);
}

// Rebaixa o usuário para o plano padrão (free) ao cancelar.
async function downgradeToDefault(userId, status) {
  const def = PlanService.getDefault();
  await User.findByIdAndUpdate(userId, {
    planKey: def?.key || 'free',
    plan: def?.name || 'Free',
    planType: def?.planType || 'prepaid',
    stripeSubscriptionId: null,
    subscriptionStatus: status || 'canceled',
  });
  console.log(`[subscription] User ${userId} rebaixado para ${def?.key || 'free'}`);
}

// ── Webhook do Stripe (corpo raw, sem auth) ────────────────────────────────────
export const stripeWebhook = async (req, res) => {
  if (!isStripeEnabled()) return res.status(503).end();

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[subscription] webhook signature inválida:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object;
        const userId = s.metadata?.userId || s.client_reference_id;
        const planKey = s.metadata?.planKey;
        if (userId && planKey) {
          await activatePlan(userId, planKey, {
            subscriptionId: s.subscription,
            customerId: s.customer,
            status: 'active',
          });
        }
        break;
      }
      case 'invoice.paid': {
        // Renovação recorrente — credita a cota do ciclo novamente.
        const inv = event.data.object;
        const sub = inv.subscription;
        if (sub && inv.billing_reason === 'subscription_cycle') {
          const subscription = await stripe.subscriptions.retrieve(sub);
          const userId = subscription.metadata?.userId;
          const planKey = subscription.metadata?.planKey;
          if (userId && planKey) await activatePlan(userId, planKey, { status: 'active' });
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const userId = sub.metadata?.userId;
        if (userId) await downgradeToDefault(userId, sub.status);
        break;
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const userId = sub.metadata?.userId;
        if (userId) {
          if (['canceled', 'unpaid', 'incomplete_expired'].includes(sub.status)) {
            await downgradeToDefault(userId, sub.status);
          } else {
            await User.findByIdAndUpdate(userId, { subscriptionStatus: sub.status });
          }
        }
        break;
      }
      default:
        break;
    }
    res.json({ received: true });
  } catch (error) {
    console.error('[subscription] webhook handler error:', error.message);
    res.status(500).end();
  }
};
