import "server-only";

/**
 * Server-side offer catalogue.
 *
 * The browser submits an offer KEY and nothing else. Price, currency,
 * duration and track allowance are resolved here, on the server, from
 * environment configuration. There is no code path by which a client can
 * propose an amount.
 *
 * Stripe remains the payment source of truth: `expectedAmountCents` is a
 * guard, not the charge. At checkout time the configured Stripe Price is
 * retrieved and compared against it; a mismatch fails the request rather
 * than charging an amount nobody approved.
 */

export type OfferKey = "song_intelligence" | "creator_intelligence";

export interface Offer {
  key: OfferKey;
  label: string;
  /** Env var holding the Stripe Price id. Never a hard-coded price. */
  priceEnvVar: string;
  /** Commercial amount from the locked architecture, in minor units. */
  expectedAmountCents: number;
  expectedCurrency: string;
  /** Access window granted on successful payment. */
  durationDays: number;
  /** Reports covered. Song = 1 scan; Creator = up to 10 tracks. */
  trackLimit: number;
}

export const OFFERS: Record<OfferKey, Offer> = {
  song_intelligence: {
    key: "song_intelligence",
    label: "Full Song Intelligence",
    priceEnvVar: "STRIPE_SONG_INTELLIGENCE_PRICE_ID",
    expectedAmountCents: 1900, // $19
    expectedCurrency: "usd",
    durationDays: 60,
    trackLimit: 1,
  },
  creator_intelligence: {
    key: "creator_intelligence",
    label: "Creator Intelligence",
    priceEnvVar: "STRIPE_CREATOR_INTELLIGENCE_PRICE_ID",
    expectedAmountCents: 14900, // $149
    expectedCurrency: "usd",
    durationDays: 365,
    trackLimit: 10,
  },
};

export function isOfferKey(v: unknown): v is OfferKey {
  return v === "song_intelligence" || v === "creator_intelligence";
}

export function getOffer(key: OfferKey): Offer {
  return OFFERS[key];
}

/** The configured Stripe Price id for an offer, or null when unset. */
export function priceIdFor(offer: Offer): string | null {
  return process.env[offer.priceEnvVar] || null;
}

export function expiresAtFor(offer: Offer, from: Date = new Date()): string {
  return new Date(
    from.getTime() + offer.durationDays * 86_400_000,
  ).toISOString();
}
