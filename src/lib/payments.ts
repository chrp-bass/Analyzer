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
    priceUsd: 29,
    trackLimit: 1,
    artistLimit: 1,
    durationDays: 60,
    blurb: "60-day report access for one track.",
  },
  artist_catalog: {
    id: "artist_catalog",
    label: "Artist Catalog",
    priceUsd: 199,
    trackLimit: 15,
    artistLimit: 1,
    durationDays: 365,
    blurb: "Up to 15 tracks. One artist. 12 months.",
  },
  extended_catalog: {
    id: "extended_catalog",
    label: "Extended Catalog",
    priceUsd: 399,
    trackLimit: 40,
    artistLimit: 1,
    durationDays: 365,
    blurb: "Up to 40 tracks. One artist. 12 months.",
  },
  manager_roster: {
    id: "manager_roster",
    label: "Manager Roster",
    priceUsd: 899,
    trackLimit: 75,
    artistLimit: 5,
    durationDays: 365,
    blurb: "75 tracks across 5 artists. 12 months.",
  },
  annual_unlimited: {
    id: "annual_unlimited",
    label: "Annual Unlimited",
    priceUsd: 1499,
    trackLimit: null,
    artistLimit: null,
    durationDays: 365,
    blurb: "Unlimited tracks and artists.",
    comingSoon: true,
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
