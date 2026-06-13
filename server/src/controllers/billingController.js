const stripeService = require('../services/stripeService');
const User = require('../models/User');
const Subscription = require('../models/Subscription');

exports.getPlans = async (req, res, next) => {
  try {
    const plans = stripeService.getAllPlans();
    res.status(200).json({
      status: 'success',
      data: { plans }
    });
  } catch (error) {
    next(error);
  }
};

exports.createCheckoutSession = async (req, res, next) => {
  try {
    const { priceId } = req.body;
    const user = req.user;

    let subscription = await Subscription.findOne({ userId: user._id });
    
    if (!subscription) {
      const customer = await stripeService.createCustomer(user);
      subscription = await Subscription.create({
        userId: user._id,
        stripeCustomerId: customer.id,
        stripePriceId: priceId,
        plan: 'pro',
        status: 'incomplete'
      });
    }

    const session = await stripeService.createCheckoutSession(
      subscription.stripeCustomerId,
      priceId,
      user._id
    );

    res.status(200).json({
      status: 'success',
      data: {
        sessionId: session.id,
        url: session.url
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.getCustomerPortal = async (req, res, next) => {
  try {
    const subscription = await Subscription.findOne({ userId: req.user._id });
    
    if (!subscription || !subscription.stripeCustomerId) {
      return res.status(404).json({
        status: 'error',
        message: 'Nenhuma assinatura encontrada.'
      });
    }

    const portalSession = await stripeService.createPortalSession(
      subscription.stripeCustomerId
    );

    res.status(200).json({
      status: 'success',
      data: {
        url: portalSession.url
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.cancelSubscription = async (req, res, next) => {
  try {
    const subscription = await Subscription.findOne({ userId: req.user._id });
    
    if (!subscription || !subscription.stripeSubscriptionId) {
      return res.status(404).json({
        status: 'error',
        message: 'Nenhuma assinatura ativa encontrada.'
      });
    }

    const stripeSubscription = await stripeService.cancelSubscription(
      subscription.stripeSubscriptionId,
      true
    );

    subscription.status = stripeSubscription.status;
    subscription.cancelAtPeriodEnd = stripeSubscription.cancel_at_period_end;
    await subscription.save();

    res.status(200).json({
      status: 'success',
      message: 'Assinatura será cancelada ao final do período atual.',
      data: {
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        currentPeriodEnd: subscription.currentPeriodEnd
      }
    });
  } catch (error) {
    next(error);
  }
};

// Webhook handler
exports.webhook = async (req, res, next) => {
  try {
    const signature = req.headers['stripe-signature'];
    let event;

    try {
      event = await stripeService.constructEvent(req.body, signature);
    } catch (err) {
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        await handleCheckoutCompleted(session);
        break;
      }
      case 'invoice.paid': {
        const invoice = event.data.object;
        await handleInvoicePaid(invoice);
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        await handleInvoicePaymentFailed(invoice);
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await handleSubscriptionDeleted(subscription);
        break;
      }
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        await handleSubscriptionUpdated(subscription);
        break;
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    next(error);
  }
};

// Webhook handlers
async function handleCheckoutCompleted(session) {
  const userId = session.metadata.userId;
  
  const subscription = await Subscription.findOne({ userId });
  if (subscription) {
    subscription.stripeSubscriptionId = session.subscription;
    subscription.status = 'active';
    await subscription.save();
  }
}

async function handleInvoicePaid(invoice) {
  const subscription = await Subscription.findOne({
    stripeCustomerId: invoice.customer
  });
  
  if (subscription) {
    subscription.status = 'active';
    subscription.currentPeriodStart = new Date(invoice.period_start * 1000);
    subscription.currentPeriodEnd = new Date(invoice.period_end * 1000);
    await subscription.save();
  }
}

async function handleInvoicePaymentFailed(invoice) {
  const subscription = await Subscription.findOne({
    stripeCustomerId: invoice.customer
  });
  
  if (subscription) {
    subscription.status = 'past_due';
    await subscription.save();
  }
}

async function handleSubscriptionDeleted(subscription) {
  const localSubscription = await Subscription.findOne({
    stripeSubscriptionId: subscription.id
  });
  
  if (localSubscription) {
    localSubscription.status = 'canceled';
    localSubscription.endedAt = new Date();
    await localSubscription.save();
  }
}

async function handleSubscriptionUpdated(subscription) {
  const localSubscription = await Subscription.findOne({
    stripeSubscriptionId: subscription.id
  });
  
  if (localSubscription) {
    localSubscription.status = subscription.status;
    localSubscription.currentPeriodStart = new Date(subscription.current_period_start * 1000);
    localSubscription.currentPeriodEnd = new Date(subscription.current_period_end * 1000);
    localSubscription.cancelAtPeriodEnd = subscription.cancel_at_period_end;
    await localSubscription.save();
  }
}
