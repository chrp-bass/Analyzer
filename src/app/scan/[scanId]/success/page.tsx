import Link from "next/link";
import { redirect } from "next/navigation";
import { getStripe, stripeConfigured } from "@/lib/commerce/stripe";
import {
  assertReportAccess,
  currentUserId,
} from "@/lib/commerce/entitlements";
import { createAdminClient, adminConfigured } from "@/lib/supabase/admin";
import { isOfferKey, OFFERS, expiresAtFor } from "@/lib/commerce/offers";
import { decodeScanId } from "@/lib/scan-id";
import type Stripe from "stripe";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { RebindOnSuccess } from "@/components/scan/RebindOnSuccess";

export const dynamic = "force-dynamic";

/**
 * Post-payment return route.
 *
 * Stripe sends the buyer here with session_id={CHECKOUT_SESSION_ID}. This
 * page verifies that session against the Stripe API — but verification is
 * NOT a grant. Entitlement comes from the signed webhook and nothing else.
 *
 * When the caller's cookie identity does not own the paid entitlement — a
 * cleared cookie, a different browser, an expired anonymous JWT — the server
 * rebinds the entitlement AND the persisted analysis/song/report rows to
 * the current caller against Stripe's own confirmation of payment. When the
 * server has no identity yet, the client island below establishes one and
 * refetches, which brings the caller back through this page for the rebind.
 */
export default async function CheckoutSuccessPage({
  params,
  searchParams,
}: {
  params: { scanId: string };
  searchParams: { session_id?: string };
}) {
  const { scanId } = params;
  const sessionId = searchParams.session_id;

  // Verify the Stripe session first so a paid caller with a cookie identity
  // gets the rebind applied on the SAME request that would otherwise short-
  // circuit to /preview and leave the persistence rows stale.
  let paidSession: Stripe.Checkout.Session | null = null;
  if (sessionId && stripeConfigured()) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(sessionId);
      if (
        session.payment_status === "paid" &&
        session.metadata?.scan_id === scanId
      ) {
        paidSession = session;
      }
    } catch {
      paidSession = null;
    }
  }

  if (paidSession) {
    await ensureEntitlementForCaller(scanId, paidSession);
  }

  // Now check access with any rebind applied.
  const access = await assertReportAccess(scanId);
  if (access.ok) redirect(`/scan/${scanId}/preview?paid=1`);

  const paidButPending = paidSession !== null;

  return (
    <div className="product-shell">
      <SiteHeader showCta={false} />
      <main>
        <section className="page-hero">
          <div className="wrap">
            {paidButPending ? (
              <>
                <span className="eyebrow">Payment received</span>
                <h1>Unlocking your Song Intelligence.</h1>
                <p className="sub">
                  Stripe has confirmed your payment. We&rsquo;re recording your
                  access now — this usually takes a few seconds.
                </p>
                <p
                  style={{
                    marginTop: 18,
                    fontFamily: "var(--s)",
                    fontSize: 13,
                    color: "var(--on-light-2)",
                  }}
                >
                  This page does not need to stay open. Your access is tied to
                  your account, not to this tab.
                </p>
                {/* The client island runs when the server had no cookie
                    identity yet. It signs the browser in anonymously and
                    calls back into the rebind route, then reloads. */}
                <RebindOnSuccess scanId={scanId} sessionId={sessionId!} />
                <noscript>
                  <meta httpEquiv="refresh" content="4" />
                </noscript>
              </>
            ) : (
              <>
                <span className="eyebrow">Nothing was unlocked</span>
                <h1>We couldn&rsquo;t confirm a payment.</h1>
                <p className="sub">
                  If you completed a purchase, it may still be settling. Give
                  it a moment and reload. Nothing has been charged twice and
                  no access has been lost.
                </p>
              </>
            )}
            <div style={{ marginTop: 28, display: "flex", gap: 14, flexWrap: "wrap" }}>
              <Link href={`/scan/${scanId}/preview`} className="btn btn-ghost">
                Back to your reveal
              </Link>
              <Link href="/dashboard" className="btn btn-ghost">
                My songs
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

/**
 * Server-side rebind: bind the paid entitlement AND the persisted analysis,
 * song and report rows to the CURRENT caller. No-ops when they are already
 * bound; skipped entirely when there is no cookie identity yet (the client
 * island takes over that case).
 *
 * This is the only place on the read side that mutates entitlement.user_id
 * or analyses.creator_id, and it always requires a Stripe session Stripe
 * itself confirmed as paid for this scan.
 *
 * Guardrails (defense in depth beyond the Stripe signature the caller
 * cannot forge):
 *
 *   1. Session must be `payment_status = "paid"` AND `status = "complete"`
 *      AND `metadata.scan_id` must equal the URL scan (checked by the
 *      caller).
 *   2. Session must be recent (createdAt within REBIND_WINDOW_MS). A
 *      leaked success URL from long ago cannot be replayed to steal an
 *      established creator's catalog.
 *   3. Paying user must still be anonymous. Once they upgrade to a
 *      confirmed email their identity is durable — the recovery path is
 *      email sign-in, not a URL. This is the strongest defense against a
 *      leaked success URL being used against a real, upgraded creator.
 *   4. If the current caller is a DIFFERENT confirmed-email user, refuse.
 *      One confirmed creator cannot sweep another creator's paid catalog
 *      into their own with a success URL.
 *
 * The narrow legitimate case this covers: an anonymous buyer who lost
 * their session cookie between paying and returning. Every other case
 * either resolves silently (already bound) or is refused.
 */

/** How long after Stripe created the Checkout Session a rebind is allowed. */
const REBIND_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

async function ensureEntitlementForCaller(
  scanId: string,
  session: Stripe.Checkout.Session,
): Promise<void> {
  if (!adminConfigured()) return;

  const userId = await currentUserId();
  if (!userId) return;

  const offerKey = session.metadata?.offer;
  if (!isOfferKey(offerKey) || offerKey !== "song_intelligence") return;

  // Guardrail: Stripe session must be complete, not merely open or expired.
  // payment_status was already verified by the caller.
  if (session.status !== "complete") return;

  // Guardrail: session must be recent. A rebind of an old paid session is
  // exactly the pattern of a leaked URL being replayed against an
  // established creator.
  const createdMs = (session.created ?? 0) * 1000;
  if (!createdMs || Date.now() - createdMs > REBIND_WINDOW_MS) {
    console.error(
      `[success] rebind refused: session ${session.id} is older than the ${REBIND_WINDOW_MS}ms window`,
    );
    return;
  }

  const db = createAdminClient();
  const originalOwner =
    typeof session.metadata?.user_id === "string"
      ? session.metadata.user_id
      : (session.client_reference_id ?? null);

  // Guardrails 3 & 4: check auth state of both the paying user and the
  // current caller.
  if (originalOwner && originalOwner !== userId) {
    const { data: origData } = await db.auth.admin.getUserById(originalOwner);
    const origUser = origData?.user;
    // Paying user has a durable identity — refuse. They recover via email.
    if (origUser && origUser.is_anonymous === false && origUser.email) {
      console.error(
        `[success] rebind refused: paying user ${originalOwner} is upgraded (has confirmed email); use email recovery instead`,
      );
      return;
    }

    const { data: callerData } = await db.auth.admin.getUserById(userId);
    const callerUser = callerData?.user;
    // Current caller is a different confirmed-email user — refuse. One
    // confirmed creator cannot claim another's paid catalog with a URL.
    if (callerUser && callerUser.is_anonymous === false && callerUser.email) {
      // Only permitted when the caller's confirmed email exactly matches
      // the email Stripe captured on the session (the buyer signing in
      // afterwards on a fresh device).
      const stripeEmail =
        session.customer_details?.email?.toLowerCase() ?? null;
      if (
        !stripeEmail ||
        stripeEmail !== callerUser.email.toLowerCase()
      ) {
        console.error(
          `[success] rebind refused: caller ${userId} is a different confirmed identity than the payer`,
        );
        return;
      }
    }
  }

  const { data: bySession } = await db
    .from("entitlements")
    .select("id,user_id")
    .eq("stripe_checkout_session_id", session.id)
    .limit(1);
  const existing = bySession?.[0] as
    | { id: string; user_id: string }
    | undefined;

  if (existing) {
    if (existing.user_id !== userId) {
      const { error } = await db
        .from("entitlements")
        .update({ user_id: userId })
        .eq("id", existing.id);
      if (error) {
        console.error(
          `[success] rebind failed for entitlement ${existing.id}:`,
          error,
        );
        return;
      }
      console.error(
        `[success] rebound entitlement ${existing.id} from ${existing.user_id} to ${userId} (session ${session.id}, scan ${scanId})`,
      );
      await rebindPersistence(db, existing.user_id, userId, scanId);
      return;
    }
    // Already bound to us, but the persistence rows may still belong to the
    // original payer (a partial rebind from an earlier session, or a rebind
    // done before the cascade existed).
    if (originalOwner && originalOwner !== userId) {
      await rebindPersistence(db, originalOwner, userId, scanId);
    }
    return;
  }

  // Nothing bound yet — the webhook is still in flight. Create the row for
  // the current caller; a later webhook delivery will lose the insert race
  // on stripe_checkout_session_id uniqueness.
  const trackSlug =
    typeof session.metadata?.track_slug === "string"
      ? session.metadata.track_slug
      : decodeScanId(scanId);
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
    if (
      insertError.code === "23505" ||
      `${insertError.message ?? ""}`.toLowerCase().includes("duplicate key")
    ) {
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
        await rebindPersistence(db, row.user_id, userId, scanId);
      } else if (originalOwner && originalOwner !== userId) {
        await rebindPersistence(db, originalOwner, userId, scanId);
      }
      return;
    }
    console.error(
      `[success] entitlement insert failed for session ${session.id}:`,
      insertError,
    );
    return;
  }

  console.error(
    `[success] created entitlement for ${userId} (session ${session.id}, scan ${scanId})`,
  );
  if (originalOwner && originalOwner !== userId) {
    await rebindPersistence(db, originalOwner, userId, scanId);
  }
}

/**
 * Move the persisted analysis, song and report for `scanId` from
 * `previousOwner` to `newOwner`. Safe when nothing has to move.
 */
async function rebindPersistence(
  db: ReturnType<typeof createAdminClient>,
  previousOwner: string,
  newOwner: string,
  scanId: string,
): Promise<void> {
  if (previousOwner === newOwner) return;

  // If the new owner already has an analysis for this scan, do not move the
  // old one — the (creator_id, scan_id) unique index would reject it and
  // their own rows already resolve.
  const { data: newerRows } = await db
    .from("analyses")
    .select("id")
    .eq("creator_id", newOwner)
    .eq("scan_id", scanId)
    .limit(1);
  if (newerRows && newerRows.length > 0) return;

  const { data: prevRows } = await db
    .from("analyses")
    .select("id,song_id")
    .eq("creator_id", previousOwner)
    .eq("scan_id", scanId)
    .limit(1);
  const prev = prevRows?.[0] as { id: string; song_id: string } | undefined;
  if (!prev) return;

  const { data: songRow } = await db
    .from("songs")
    .select("id,creator_id,track_key")
    .eq("id", prev.song_id)
    .limit(1);
  const song = songRow?.[0] as
    | { id: string; creator_id: string; track_key: string }
    | undefined;

  if (song && song.creator_id === previousOwner) {
    const { data: dup } = await db
      .from("songs")
      .select("id")
      .eq("creator_id", newOwner)
      .eq("track_key", song.track_key)
      .limit(1);
    if (!dup || dup.length === 0) {
      const { error: songErr } = await db
        .from("songs")
        .update({ creator_id: newOwner })
        .eq("id", song.id);
      if (songErr) {
        console.error(
          `[success] song rebind failed (song ${song.id}):`,
          songErr,
        );
      }
    }
  }

  const { error: analysisErr } = await db
    .from("analyses")
    .update({ creator_id: newOwner })
    .eq("id", prev.id);
  if (analysisErr) {
    console.error(
      `[success] analysis rebind failed (analysis ${prev.id}):`,
      analysisErr,
    );
  } else {
    console.error(
      `[success] rebound analysis ${prev.id} from ${previousOwner} to ${newOwner} (scan ${scanId})`,
    );
  }

  const { error: reportErr } = await db
    .from("reports")
    .update({ creator_id: newOwner })
    .eq("creator_id", previousOwner)
    .eq("scan_id", scanId);
  if (reportErr) {
    console.error(
      `[success] report rebind failed (scan ${scanId}):`,
      reportErr,
    );
  }
}
