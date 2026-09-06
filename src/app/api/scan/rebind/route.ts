import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, stripeConfigured } from "@/lib/commerce/stripe";
import { createAdminClient, adminConfigured } from "@/lib/supabase/admin";
import { currentUserId } from "@/lib/commerce/entitlements";
import { isOfferKey, OFFERS, expiresAtFor } from "@/lib/commerce/offers";
import { decodeScanId } from "@/lib/scan-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/scan/rebind   { scanId, sessionId }
 *
 * The recovery path for a paid Song Intelligence entitlement whose original
 * anonymous session was lost (cleared cookies, new browser, expired JWT).
 * Stripe is trusted as the payment record; the current cookie-verified
 * caller is trusted as the recipient. Anyone reaching /success has both.
 *
 * Rules:
 *   * The Stripe session id MUST match a paid Checkout Session whose metadata
 *     names THIS scan_id. Nothing else is enough to move an entitlement.
 *   * If an entitlement already exists for the current caller + this scan,
 *     nothing changes.
 *   * If an entitlement exists for a different user_id, it is REBOUND to the
 *     current caller. This is the only path in the system that mutates
 *     entitlements.user_id, and it always requires a matching Stripe session.
 *   * If no entitlement exists yet (webhook still in flight), we create one
 *     from the same Stripe session — the webhook's later delivery will lose
 *     the insert on stripe_checkout_session_id uniqueness, so exactly one row
 *     survives.
 *
 * Security: the Stripe session_id is a long random handle known only to the
 * paying browser (via the redirect URL). A leak of that URL is a leak of the
 * entitlement — but nothing else is compromised, no card is charged, no
 * personal data returned.
 */

interface Body {
  scanId?: unknown;
  sessionId?: unknown;
}

export async function POST(req: Request) {
  if (!stripeConfigured() || !adminConfigured()) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const scanId = typeof body.scanId === "string" ? body.scanId : null;
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : null;
  if (!scanId || !sessionId) {
    return NextResponse.json(
      { error: "scanId and sessionId required" },
      { status: 400 },
    );
  }

  const trackSlug = decodeScanId(scanId);
  if (!trackSlug) {
    return NextResponse.json({ error: "invalid scanId" }, { status: 400 });
  }

  // Only a Stripe Checkout Session id is meaningful here; refuse anything
  // that could not have come from our own redirect URL.
  if (!sessionId.startsWith("cs_")) {
    return NextResponse.json({ error: "invalid sessionId" }, { status: 400 });
  }

  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "no_identity" }, { status: 401 });
  }

  // Verify the Stripe session against Stripe. Metadata is trusted only when
  // it comes back from Stripe's own retrieve — never from the browser.
  let session: Stripe.Checkout.Session;
  try {
    session = await getStripe().checkout.sessions.retrieve(sessionId);
  } catch {
    return NextResponse.json({ error: "session_not_found" }, { status: 404 });
  }

  if (session.payment_status !== "paid") {
    return NextResponse.json(
      { error: "session_not_paid", status: session.payment_status },
      { status: 409 },
    );
  }
  const meta = session.metadata ?? {};
  if (meta.scan_id !== scanId) {
    return NextResponse.json(
      { error: "session_scan_mismatch" },
      { status: 409 },
    );
  }
  const offerKey = meta.offer;
  if (!isOfferKey(offerKey) || offerKey !== "song_intelligence") {
    return NextResponse.json({ error: "wrong_offer" }, { status: 409 });
  }

  const db = createAdminClient();

  // Is there already an entitlement for this exact Stripe session?
  const { data: bySession } = await db
    .from("entitlements")
    .select("id,user_id,scan_id,status")
    .eq("stripe_checkout_session_id", session.id)
    .limit(1);
  const existing = bySession?.[0] as
    | { id: string; user_id: string; scan_id: string; status: string }
    | undefined;

  if (existing) {
    if (existing.user_id === userId) {
      return NextResponse.json({ status: "already_bound" });
    }
    // Rebind. The one place we mutate user_id — and we do it only against
    // Stripe's confirmation that this session was paid and names this scan.
    const { error: updateError } = await db
      .from("entitlements")
      .update({ user_id: userId })
      .eq("id", existing.id);
    if (updateError) {
      console.error(
        `[api/scan/rebind] failed to rebind entitlement ${existing.id}:`,
        updateError,
      );
      return NextResponse.json({ error: "rebind_failed" }, { status: 500 });
    }
    console.error(
      `[api/scan/rebind] rebound entitlement ${existing.id} from ${existing.user_id} to ${userId} (session ${session.id}, scan ${scanId})`,
    );
    return NextResponse.json({ status: "rebound" });
  }

  // No entitlement row yet — the webhook may still be in flight. Create one
  // for the current caller. The webhook's later delivery will lose the
  // insert on stripe_checkout_session_id uniqueness, so exactly one row
  // survives.
  const offer = OFFERS[offerKey];
  const { error: insertError } = await db.from("entitlements").insert({
    user_id: userId,
    offer: offer.key,
    scan_id: scanId,
    track_slug: trackSlug,
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id:
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : (session.payment_intent?.id ?? null),
    stripe_customer_id:
      typeof session.customer === "string"
        ? session.customer
        : (session.customer?.id ?? null),
    amount_total_cents: session.amount_total ?? null,
    currency: session.currency ?? null,
    track_limit: offer.trackLimit,
    status: "active" as const,
    expires_at: expiresAtFor(offer),
  });

  if (insertError) {
    // 23505 → the webhook won the race. Treat that as success: an entitlement
    // exists for this session, and the next fetch resolves it.
    if (
      insertError.code === "23505" ||
      `${insertError.message ?? ""}`.toLowerCase().includes("duplicate key")
    ) {
      // Re-read and rebind if needed.
      const { data: retry } = await db
        .from("entitlements")
        .select("id,user_id")
        .eq("stripe_checkout_session_id", session.id)
        .limit(1);
      const row = retry?.[0] as { id: string; user_id: string } | undefined;
      if (row && row.user_id !== userId) {
        await db
          .from("entitlements")
          .update({ user_id: userId })
          .eq("id", row.id);
        return NextResponse.json({ status: "rebound" });
      }
      return NextResponse.json({ status: "already_bound" });
    }
    console.error(
      `[api/scan/rebind] insert failed for session ${session.id}:`,
      insertError,
    );
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  console.error(
    `[api/scan/rebind] created entitlement for ${userId} (session ${session.id}, scan ${scanId})`,
  );
  return NextResponse.json({ status: "created" });
}
