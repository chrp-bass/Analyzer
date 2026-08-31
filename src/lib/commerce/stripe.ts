import "server-only";
import Stripe from "stripe";

/**
 * Stripe server client. Instantiated lazily so an unconfigured environment
 * fails closed at the call site with a clear error, rather than crashing the
 * whole module graph at import time.
 */
let cached: Stripe | null = null;

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  cached = new Stripe(key);
  return cached;
}
