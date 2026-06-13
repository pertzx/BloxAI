const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  stripeCustomerId: {
    type: String,
    required: true,
    index: true
  },
  stripeSubscriptionId: {
    type: String,
    unique: true,
    sparse: true
  },
  stripePriceId: {
    type: String,
    required: true
  },
  plan: {
    type: String,
    enum: ['free', 'pro', 'enterprise'],
    default: 'free'
  },
  status: {
    type: String,
    enum: ['trialing', 'active', 'canceled', 'incomplete', 'incomplete_expired', 'past_due', 'unpaid', 'paused'],
    default: 'incomplete'
  },
  currentPeriodStart: Date,
  currentPeriodEnd: Date,
  trialStart: Date,
  trialEnd: Date,
  canceledAt: Date,
  cancelAtPeriodEnd: {
    type: Boolean,
    default: false
  },
  usage: {
    requestsUsed: { type: Number, default: 0 },
    requestsLimit: { type: Number, default: 100 },
    lastResetAt: { type: Date, default: Date.now }
  },
  paymentMethod: {
    brand: String,
    last4: String,
    expMonth: Number,
    expYear: Number
  }
}, {
  timestamps: true
});

subscriptionSchema.index({ userId: 1 });
subscriptionSchema.index({ stripeCustomerId: 1 });
subscriptionSchema.index({ stripeSubscriptionId: 1 });
subscriptionSchema.index({ status: 1 });

subscriptionSchema.methods.isActive = function() {
  return ['trialing', 'active'].includes(this.status) && 
         this.currentPeriodEnd > new Date();
};

subscriptionSchema.methods.hasExceededLimit = function() {
  return this.usage.requestsUsed >= this.usage.requestsLimit;
};

subscriptionSchema.methods.incrementUsage = async function(amount = 1) {
  this.usage.requestsUsed += amount;
  await this.save();
};

subscriptionSchema.methods.resetUsage = async function() {
  this.usage.requestsUsed = 0;
  this.usage.lastResetAt = new Date();
  await this.save();
};

module.exports = mongoose.model('Subscription', subscriptionSchema);
