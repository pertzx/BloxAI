import Stripe from 'stripe';
import { STRIPE_SECRET_KEY } from '../config/env.js';

/**
 * Cliente Stripe singleton. Se a chave não estiver configurada, `stripe` é null
 * e os controllers respondem 503 — o resto da app continua funcionando.
 */
export const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

export function isStripeEnabled() {
  return Boolean(stripe);
}
