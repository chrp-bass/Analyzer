import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, stripeConfigured } from "@/lib/commerce/stripe";
import { createAdminClient, adminConfigured } from "@/lib/supabase/admin";
import {
  OFFERS,
  isOfferKey,
  expiresAtFor,
  type OfferKey,
} from "@/lib/commerce/offers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/stripe/webhook
 *
 * The only path in the system that grants an entitlement.
 *
 * Three properties this endpoint must hold:
 *   1. Authenticity — the raw body is verified against STRIPE_WEBHOOK_SECRET.
 *      An unsigned or mis-signed body is rejected before it is parsed as an
 *      event, so an attacker cannot mint entitlements by POSTing JSON.
 *   2. Idempotency — every event id is inserted into stripe_events under a
 *      primary-key constraint. A repeated delivery loses that insert and
 *      returns 200 without granting a second entitlement.
 *   3. Trusted binding — the buyer and the purchased scan come from session
 *      metadata that this server set at checkout, never from the request.
 */

/** Events that can retire an entitlement after the fact. */
const REVOKING_EVENTS = new Set([
  "charge.refunded",
  "charge.dispute.created",
]);


/**
 * Postgres 23505 unique_violation — the only error that legitimately means
 * "this event has already been recorded".
 */
function isUniqueViolation(err: { code?: string; message?: string }): boolean {
  if (err?.code === "23505") return true;
  const m = `${err?.message ?? ""}`.toLowerCase();
  return m.includes("duplicate key") || m.includes("already exists");
}

export async function POST(req: Request) {
  if (!stripeConfigured() || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "webhook not configured" },
      { status: 503 },
    );
  }
  if (!adminConfigured()) {
    // Fail loudly: Stripe will retry, and we must not acknowledge an event
    // we cannot durably record.
    return NextResponse.json(
      { error: "entitlement store not configured" },
      { status: 503 },
    );
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing signature" }, { status: 400 });
  }

  // The raw body is required for signature verification — never req.json().
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      raw,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err) {
    console.error("[stripe webhook] signature verification failed:", err);
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  const db = createAdminClient();

  // Idempotency gate. The primary key on stripe_event_id makes this a race
  // that exactly one delivery can win.
  const { error: ledgerError } = await db
    .from("stripe_events")
    .insert({ stripe_event_id: event.id, type: event.type });

  if (ledgerError) {
    // Only a uniqueness violation means "already processed". Anything else
    // (the database is unreachable, the table is missing, permissions are
    // wrong) must NOT be acknowledged as a duplicate — that would silently
    // drop a real payment. Return 5xx so Stripe retries.
    if (isUniqueViolation(ledgerError)) {
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.error("[stripe webhook] event ledger unavailable:", ledgerError);
    return NextResponse.json(
      { error: "ledger unavailable" },
      { status: 503 },
    );
  }

  try {
    if (event.type === "checkout.session.completed") {
      await grantFromSession(db, event.data.object as Stripe.Checkout.Session);
    } else if (REVOKING_EVENTS.has(event.type)) {
      await revokeFromCharge(db, event.data.object as Stripe.Charge);
    }

    await db
      .from("stripe_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("stripe_event_id", event.id);

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error(`[stripe webhook] processing ${event.type} failed:`, err);
    // Roll the ledger row back so Stripe's retry can be processed rather
    // than being swallowed as a duplicate.
    await db.from("stripe_events").delete().eq("stripe_event_id", event.id);
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}

type AdminDb = ReturnType<typeof createAdminClient>;

async function grantFromSession(
  db: AdminDb,
  session: Stripe.Checkout.Session,
) {
  // Only a genuinely paid session grants anything.
  if (session.payment_status !== "paid") {
    console.warn(
      `[stripe webhook] session ${session.id} completed but payment_status=${session.payment_status}; no grant`,
    );
    return;
  }

  const meta = session.metadata ?? {};
  const offerKey = meta.offer;
  if (!isOfferKey(offerKey)) {
    console.error(`[stripe webhook] session ${session.id} has no valid offer metadata`);
    return;
  }
  const userId = meta.user_id || session.client_reference_id;
  if (!userId) {
    console.error(`[stripe webhook] session ${session.id} has no user binding`);
    return;
  }

  const offer = OFFERS[offerKey as OfferKey];
  const scanId = meta.scan_id ?? null;
  const trackSlug = meta.track_slug ?? null;

  const row = {
    user_id: userId,
    offer: offer.key,
    scan_id: offer.key === "song_intelligence" ? scanId : null,
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
  };

  if (offer.key === "song_intelligence" && !row.scan_id) {
    console.error(`[stripe webhook] song purchase ${session.id} has no scan_id`);
    return;
  }

  // Unique on stripe_checkout_session_id — a second grant for the same
  // session is impossible even if this ran twice.
  const { data: inserted, error } = await db
    .from("entitlements")
    .insert(row)
    .select("id")
    .single();

  if (error) {
    // A duplicate here means the same Checkout Session was already granted.
    if (isUniqueViolation(error)) return;
    throw error;
  }

  // Creator Intelligence: seed the originating scan as the first attached
  // track so the buyer's allowance is tracked from the moment of purchase.
  if (offer.key === "creator_intelligence" && scanId && inserted) {
    await db.from("entitlement_tracks").insert({
      entitlement_id: inserted.id,
      scan_id: scanId,
      track_slug: trackSlug,
    });
  }
}

async function revokeFromCharge(db: AdminDb, charge: Stripe.Charge) {
  const pi =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : charge.payment_intent?.id;
  if (!pi) return;
  await db
    .from("entitlements")
    .update({ status: "refunded" })
    .eq("stripe_payment_intent_id", pi);
}
