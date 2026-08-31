import {
  MODE,
  ProductId,
  CatalogPurchase,
  getCurrentUser,
  setUserEmail,
  setUserCatalogPurchase,
  markScanPaid,
  getOrCreateGuestUser,
} from "@/lib/accounts";

/**
 * PAYMENT — production vs demo.
 *
 * Real money moves through POST /api/checkout -> Stripe Checkout -> the
 * signed webhook at /api/stripe/webhook, which is the ONLY path that grants
 * an entitlement. Nothing in this module can unlock paid content: entitlement
 * lives in Postgres and is read server-side.
 *
 * The demo helpers below are development scaffolding. They are hard-disabled
 * in production (see assertDemoAllowed) so a stray call cannot mint access,
 * and the EARLYACCESS promo cannot produce a real entitlement.
 */

/** Demo helpers are refused outside development. */
function assertDemoAllowed(fn: string): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `${fn} is a development helper and is disabled in production. ` +
        "Real purchases go through /api/checkout and the Stripe webhook.",
    );
  }
}

/**
 * Start a real Stripe Checkout Session. The browser sends an offer key and a
 * scan id; the server resolves the price. Returns the Stripe-hosted URL.
 */
export async function startCheckout(
  offer: "song_intelligence" | "creator_intelligence",
  scanId?: string,
): Promise<{ url: string }> {
  const res = await fetch("/api/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ offer, scanId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error ?? "checkout unavailable");
  }
  const body = (await res.json()) as { url?: string };
  if (!body.url) throw new Error("checkout unavailable");
  return { url: body.url };
}

export interface TierConfig {
  id: ProductId;
  label: string;
  priceUsd: number;
  trackLimit: number | null;
  artistLimit: number | null;
  durationDays: number;
  blurb: string;
  comingSoon?: boolean;
}

export const TIERS: Record<ProductId, TierConfig> = {
  single: {
    id: "single",
    label: "Song scan",
    priceUsd: 19,
    trackLimit: 1,
    artistLimit: 1,
    durationDays: 60,
    blurb: "60-day report access for one track.",
  },
  artist_catalog: {
    id: "artist_catalog",
    label: "Artist Catalog",
    priceUsd: 149,
    trackLimit: 10,
    artistLimit: 1,
    durationDays: 365,
    blurb: "Up to 10 tracks. One artist. 12 months.",
  },
};

export interface CheckoutSession {
  sessionId: string;
  checkoutUrl: string;
  productId: ProductId;
  scanId: string;
}

const SESSION_KEY = (id: string) => `chrp_checkout_session_${id}`;

function ls(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export async function createCheckoutSession(
  productId: ProductId,
  scanId: string,
): Promise<CheckoutSession> {
  assertDemoAllowed("createCheckoutSession");
  if (MODE === "demo") {
    const sessionId = `demo_${Date.now().toString(36)}${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    const tier = TIERS[productId];
    const path =
      productId === "single"
        ? `/scan/${scanId}/checkout`
        : `/scan/${scanId}/checkout-tier`;
    const checkoutUrl = `${path}?session=${sessionId}&product=${productId}`;
    const s = ls();
    s?.setItem(
      SESSION_KEY(sessionId),
      JSON.stringify({ sessionId, productId, scanId, priceUsd: tier.priceUsd }),
    );
    return { sessionId, checkoutUrl, productId, scanId };
  }
  throw new Error("Production Stripe checkout not yet connected");
  // Production:
  //   const res = await fetch('/api/checkout', { method: 'POST', body: JSON.stringify({productId, scanId}) });
  //   return res.json();
}

export async function simulatePaymentSuccess(
  sessionId: string,
  email: string,
): Promise<{ productId: ProductId; scanId: string }> {
  assertDemoAllowed("simulatePaymentSuccess");
  if (MODE === "demo") {
    const s = ls();
    const raw = s?.getItem(SESSION_KEY(sessionId));
    if (!raw) throw new Error("Demo checkout session not found");
    const session: {
      sessionId: string;
      productId: ProductId;
      scanId: string;
      priceUsd: number;
    } = JSON.parse(raw);

    const existing = await getCurrentUser();
    const user = existing
      ? await setUserEmail(email)
      : await (async () => {
          await getOrCreateGuestUser();
          return setUserEmail(email);
        })();

    if (!user) throw new Error("Failed to create user");

    if (session.productId === "single") {
      await markScanPaid(user.id, session.scanId);
    } else {
      const tier = TIERS[session.productId];
      const purchase: CatalogPurchase = {
        tier: session.productId,
        trackLimit: tier.trackLimit,
        tracksUsed: 1, // The current scan counts as the first
        artistLimit: tier.artistLimit,
        expiresAt: new Date(
          Date.now() + tier.durationDays * 86_400_000,
        ).toISOString(),
        purchasedAt: new Date().toISOString(),
      };
      await setUserCatalogPurchase(user.id, purchase);
      await markScanPaid(user.id, session.scanId);
    }

    s?.removeItem(SESSION_KEY(sessionId));

    return { productId: session.productId, scanId: session.scanId };
  }
  throw new Error("Production Stripe checkout not yet connected");
  // Production: handled by Stripe webhook, not called from client.
}

export async function getCheckoutSessionMeta(
  sessionId: string,
): Promise<{ productId: ProductId; scanId: string; priceUsd: number } | null> {
  if (MODE === "demo") {
    const s = ls();
    const raw = s?.getItem(SESSION_KEY(sessionId));
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  throw new Error("Production Stripe not yet connected");
}
