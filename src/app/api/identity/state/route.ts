import { NextResponse } from "next/server";
import { createAdminClient, adminConfigured } from "@/lib/supabase/admin";
import { currentUserId } from "@/lib/commerce/entitlements";
import { getStripe, stripeConfigured } from "@/lib/commerce/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/identity/state?scanId=…
 *
 * What the ownership module needs to know, and nothing else:
 *
 *   ownership  "verified" — this creator has a confirmed email identity, so
 *                           the report is already durably theirs.
 *              "anonymous" — a real session owns the report, but only this
 *                           browser can reach it. This is the state the real
 *                           $19 purchase ended in.
 *              "none"      — no session at all.
 *
 *   email        the creator's own confirmed address, when there is one.
 *   prefillEmail a PREFILL HINT ONLY, read from the Stripe session behind a
 *                paid entitlement for this scan.
 *
 * The prefill is the sensitive part, so it is bounded deliberately:
 *
 *   - it is returned ONLY to the session that already owns the entitlement,
 *     so it cannot be used to read an address off someone else's purchase;
 *   - it is returned only while that creator is still anonymous, because a
 *     verified creator needs no hint;
 *   - it authorises NOTHING. Stripe says what was bought. Supabase says who
 *     someone is and what they own. Typing this address back still has to go
 *     through the ordinary verification before any creator history opens.
 */
export async function GET(req: Request) {
  const scanId = new URL(req.url).searchParams.get("scanId");

  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ ownership: "none", email: null, prefillEmail: null });
  }
  if (!adminConfigured()) {
    return NextResponse.json({ ownership: "anonymous", email: null, prefillEmail: null });
  }

  const db = createAdminClient();
  const { data: userData } = await db.auth.admin.getUserById(userId);
  const user = userData?.user;
  const email = user?.email ?? null;
  // Supabase marks the upgraded identity non-anonymous once the address is
  // confirmed. An address that is present but unconfirmed is not ownership.
  const verified = Boolean(email) && user?.is_anonymous !== true;

  if (verified) {
    return NextResponse.json({ ownership: "verified", email, prefillEmail: null });
  }

  let prefillEmail: string | null = null;
  if (scanId && stripeConfigured()) {
    const { data } = await db
      .from("entitlements")
      .select("stripe_checkout_session_id")
      .eq("user_id", userId)
      .eq("scan_id", scanId)
      .limit(1);
    const sessionId = (
      data?.[0] as { stripe_checkout_session_id?: string } | undefined
    )?.stripe_checkout_session_id;
    // free_first_* grants carry no Stripe session and must not be looked up.
    if (sessionId && sessionId.startsWith("cs_")) {
      try {
        const session = await getStripe().checkout.sessions.retrieve(sessionId);
        prefillEmail = session.customer_details?.email ?? null;
      } catch {
        prefillEmail = null;
      }
    }
  }

  return NextResponse.json({ ownership: "anonymous", email: null, prefillEmail });
}
