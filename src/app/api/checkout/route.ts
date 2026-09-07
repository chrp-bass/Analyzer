import { NextResponse } from "next/server";
import { getStripe, stripeConfigured } from "@/lib/commerce/stripe";
import {
  getOffer,
  isOfferKey,
  priceIdFor,
  type Offer,
} from "@/lib/commerce/offers";
import { currentUserId } from "@/lib/commerce/entitlements";
import {
  ensureAnalysisPersisted,
  fulfillmentMessage,
  ENGINE_VERSION,
} from "@/lib/scan/fulfillment.server";
import { verifyCheckoutReadiness } from "@/lib/reports/prepare.server";
import { decodeScanId } from "@/lib/scan-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/checkout   { offer, scanId?, reportId?, reportVersion? }
 *
 * Creates a real Stripe Checkout Session. The client may name an offer and a
 * scan; it may not name a price. The price comes from server configuration,
 * and is verified against the locked commercial amount before any session is
 * created — a misconfigured Stripe Price fails the request rather than
 * charging an amount nobody approved.
 *
 * For Song Intelligence the client must also name the report it prepared
 * (`reportId`, `reportVersion`, from POST /api/scan/prepare). Nobody is
 * charged until the complete report is already persisted for THIS identity
 * and THIS scan, from the analysis on file, under the current report and
 * engine versions, matching that claim exactly. Anything stale or mismatched
 * is refused before Stripe is contacted.
 *
 * Entitlement is NOT granted here. This endpoint only starts a payment; the
 * signed webhook is the sole grant path.
 */

interface Body {
  offer?: unknown;
  scanId?: unknown;
  reportId?: unknown;
  reportVersion?: unknown;
}

const READINESS_MESSAGE: Record<string, string> = {
  not_ready:
    "Your report hasn't finished preparing yet. Nothing has been charged — please try again in a moment.",
  analysis_incomplete:
    "This song's analysis isn't complete, so a report can't be sold for it yet. Nothing has been charged.",
  mismatch:
    "This checkout no longer matches the report that was prepared. Nothing has been charged — please try again.",
  stale_version:
    "The prepared report is out of date. Nothing has been charged — please prepare it again.",
};

function origin(req: Request): string {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");
  const h = req.headers;
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

/**
 * Confirm the configured Stripe Price actually matches the locked offer.
 * Stripe is the payment source of truth, so we read the real Price object
 * rather than trusting our own constant.
 */
async function resolveVerifiedPrice(
  offer: Offer,
): Promise<{ priceId: string } | { error: string; status: number }> {
  const priceId = priceIdFor(offer);
  if (!priceId) {
    return {
      error: `${offer.priceEnvVar} is not configured`,
      status: 503,
    };
  }
  const stripe = getStripe();
  let price;
  try {
    price = await stripe.prices.retrieve(priceId);
  } catch {
    return { error: "configured Stripe price could not be retrieved", status: 503 };
  }
  if (!price.active) {
    return { error: "configured Stripe price is inactive", status: 503 };
  }
  if (price.unit_amount !== offer.expectedAmountCents) {
    console.error(
      `[checkout] price mismatch for ${offer.key}: Stripe has ${price.unit_amount}, expected ${offer.expectedAmountCents}`,
    );
    return { error: "configured price does not match the published offer", status: 409 };
  }
  if (price.currency !== offer.expectedCurrency) {
    return { error: "configured price currency does not match", status: 409 };
  }
  if (price.recurring) {
    return { error: "configured price is recurring; offers are one-time", status: 409 };
  }
  return { priceId };
}

export async function POST(req: Request) {
  if (!stripeConfigured()) {
    return NextResponse.json(
      { error: "checkout unavailable: STRIPE_SECRET_KEY not configured" },
      { status: 503 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  if (!isOfferKey(body.offer)) {
    return NextResponse.json({ error: "unknown offer" }, { status: 400 });
  }
  const offer = getOffer(body.offer);

  // A Song Intelligence purchase must name a real, decodable scan.
  let scanId: string | null = null;
  let trackSlug: string | null = null;
  if (offer.key === "song_intelligence") {
    if (typeof body.scanId !== "string") {
      return NextResponse.json({ error: "scanId required" }, { status: 400 });
    }
    trackSlug = decodeScanId(body.scanId);
    if (!trackSlug) {
      return NextResponse.json({ error: "invalid scanId" }, { status: 400 });
    }
    scanId = body.scanId;
  } else if (typeof body.scanId === "string") {
    const slug = decodeScanId(body.scanId);
    if (slug) {
      scanId = body.scanId;
      trackSlug = slug;
    }
  }

  // The buyer must have a server-verified identity before paying, so the
  // webhook has someone to grant the entitlement to.
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json(
      { error: "no_identity", message: "Session could not be established." },
      { status: 401 },
    );
  }

  // ── Fulfillment guard ──────────────────────────────────────────────────
  //
  // Nobody reaches Stripe for a report that does not already exist.
  //
  // Song Intelligence: the COMPLETE paid report — analysis, enrichments,
  // Christian context, governed Rhodes text — must already be persisted for
  // this identity and scan, and must be the exact report the client says it
  // prepared. The paid path after payment only reads that row.
  //
  // Creator Intelligence (out of scope for this pass, unchanged): the
  // completed analysis is persisted so the catalog has something to attach.
  //
  // Server-side by necessity — a client check would be advisory, and this
  // decides whether money moves.
  let reportBinding: Record<string, string> = {};
  if (offer.key === "song_intelligence" && scanId) {
    const claim =
      typeof body.reportId === "string" && typeof body.reportVersion === "string"
        ? { reportId: body.reportId, reportVersion: body.reportVersion }
        : null;
    if (!claim) {
      return NextResponse.json(
        {
          error: "report_not_ready",
          reason: "not_ready",
          message: READINESS_MESSAGE.not_ready,
        },
        { status: 409 },
      );
    }
    const readiness = await verifyCheckoutReadiness(userId, scanId, claim);
    if (!readiness.ok) {
      console.error(
        `[api/checkout] refusing checkout for ${scanId}: report ${readiness.reason} (claimed ${claim.reportId}@${claim.reportVersion})`,
      );
      return NextResponse.json(
        {
          error: readiness.reason === "not_ready" ? "report_not_ready" : "report_stale",
          reason: readiness.reason,
          message: READINESS_MESSAGE[readiness.reason],
        },
        { status: 409 },
      );
    }
    reportBinding = {
      report_id: readiness.readiness.reportId,
      report_version: readiness.readiness.reportVersion,
      analysis_id: readiness.readiness.analysisId,
      engine_version: readiness.engineVersion,
    };
  } else if (scanId) {
    const fulfillment = await ensureAnalysisPersisted(userId, scanId);
    if (!fulfillment.ok) {
      console.error(
        `[api/checkout] refusing checkout for ${scanId}: ${fulfillment.reason}` +
          (fulfillment.detail ? ` — ${fulfillment.detail}` : ""),
      );
      return NextResponse.json(
        {
          error: "fulfillment_unavailable",
          reason: fulfillment.reason,
          message: fulfillmentMessage(fulfillment.reason),
        },
        { status: 409 },
      );
    }
    reportBinding = { analysis_id: fulfillment.analysisId, engine_version: ENGINE_VERSION };
  }

  const verified = await resolveVerifiedPrice(offer);
  if ("error" in verified) {
    return NextResponse.json(
      { error: verified.error },
      { status: verified.status },
    );
  }

  const base = origin(req);
  const successPath = scanId
    ? `/scan/${scanId}/success`
    : `/dashboard/success`;

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      allow_promotion_codes: true,
      line_items: [{ price: verified.priceId, quantity: 1 }],
      success_url: `${base}${successPath}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: scanId ? `${base}/scan/${scanId}/preview` : `${base}/`,
      client_reference_id: userId,
      // Server-controlled metadata only. Nothing here is buyer-supplied:
      // the webhook trusts these fields to bind the purchase to an identity.
      metadata: {
        offer: offer.key,
        user_id: userId,
        ...(scanId ? { scan_id: scanId } : {}),
        ...(trackSlug ? { track_slug: trackSlug } : {}),
        // The exact report this payment is for. The webhook does not read
        // these; they bind the charge to what was prepared, for audit.
        ...reportBinding,
      },
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "stripe did not return a checkout url" },
        { status: 502 },
      );
    }
    return NextResponse.json({ url: session.url, id: session.id });
  } catch (err) {
    console.error("[api/checkout] session creation failed:", err);
    return NextResponse.json(
      { error: "could not start checkout" },
      { status: 502 },
    );
  }
}
