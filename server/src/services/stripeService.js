const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const PLANS = {
  free: {
    name: 'Free',
    priceId: null,
    limits: {
      requestsPerMonth: 100,
      projects: 3,
      maxScriptLength: 200
    }
  },
  pro: {
    name: 'Pro',
    priceId: process.env.STRIPE_PRICE_ID_PRO,
    limits: {
      requestsPerMonth: 1000,
      projects: 10,
      maxScriptLength: 500
    }
  },
  enterprise: {
    name: 'Enterprise',
    priceId: process.env.STRIPE_PRICE_ID_ENTERPRISE,
    limits: {
      requestsPerMonth: 10000,
      projects: -1,
      maxScriptLength: -1
    }
  }
};

class StripeService {
  async createCustomer(user) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: (user.profile?.firstName || '') + ' ' + (user.profile?.lastName || '') || user.email,
      metadata: {
        userId: user._id.toString()
      }
    });
    return customer;
  }

  async createCheckoutSession(customerId, priceId, userId) {
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{
        price: priceId,
        quantity: 1
      }],
      mode: 'subscription',
      success_url: `${process.env.FRONTEND_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/billing/cancel`,
      metadata: {
        userId: userId.toString()
      }
    });
    return session;
  }

  async createPortalSession(customerId) {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${process.env.FRONTEND_URL}/billing`
    });
    return portalSession;
  }

  async cancelSubscription(stripeSubscriptionId, cancelAtPeriodEnd = true) {
    if (cancelAtPeriodEnd) {
      const subscription = await stripe.subscriptions.update(
        stripeSubscriptionId,
        { cancel_at_period_end: true }
      );
      return subscription;
    } else {
      const subscription = await stripe.subscriptions.cancel(stripeSubscriptionId);
      return subscription;
    }
  }

  async resumeSubscription(stripeSubscriptionId) {
    const subscription = await stripe.subscriptions.update(
      stripeSubscriptionId,
      { cancel_at_period_end: false }
    );
    return subscription;
  }

  async getSubscription(stripeSubscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    return subscription;
  }

  async constructEvent(payload, signature) {
    return stripe.webhooks.constructEvent(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  }

  getPlanDetails(planName) {
    return PLANS[planName] || PLANS.free;
  }

  getAllPlans() {
    return PLANS;
  }
}

module.exports = new StripeService();
