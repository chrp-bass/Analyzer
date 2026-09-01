import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderEmail, sendEmail, emailConfigured } from "@/lib/email/send.server";
import type { OfferKey } from "@/lib/commerce/offers";

/**
 * Post-purchase confirmation.
 *
 * Strictly downstream: this runs only after Stripe has confirmed payment and
 * the entitlement has already been granted. It cannot fail a purchase — every
 * path returns a reason instead of throwing, and the caller ignores the
 * result beyond logging it.
 *
 * Identity rule that shapes this whole module: the email goes to the address
 * on the SUPABASE creator, never to the address Stripe collected. A secure
 * return link is minted for a specific auth identity, so sending to a Stripe
 * address would log the buyer into a DIFFERENT creator than the one that owns
 * the purchase — a second identity, a second My Songs, the exact split this
 * architecture exists to prevent. A creator with no email on file simply gets
 * no email; their report is waiting for them in the product either way.
 */

type Db = ReturnType<typeof createAdminClient>;

export type PurchaseEmailResult =
  | { ok: true }
  | {
      ok: false;
      reason: "not_configured" | "no_email_on_file" | "link_failed" | "send_failed";
      detail?: string;
    };

const COPY: Record<
  OfferKey,
  { subject: string; heading: string; body: string; cta: string; support: string; path: string }
> = {
  song_intelligence: {
    subject: "Your Song Intelligence is ready",
    heading: "Your Song Intelligence is ready.",
    body: "Your complete report is waiting for you.",
    cta: "View my report",
    support:
      "Your report is saved in My Songs, so you can come back anytime.",
    path: "/dashboard",
  },
  creator_intelligence: {
    subject: "Your Creator Intelligence is ready",
    heading: "Your Creator Intelligence is ready.",
    body: "You now have access to your Creator Intelligence analyses.",
    cta: "Analyze my next song",
    support:
      "Your previous analyses stay in My Songs, so you can build your catalog intelligence over time.",
    path: "/scan",
  },
};

/**
 * Send the confirmation for a completed purchase.
 *
 * `scanId` targets the CTA at the purchased song's report when we have one;
 * otherwise the creator lands in their songs. Either destination goes through
 * the ordinary secure return, so authorization is unchanged — the link proves
 * identity, it does not carry access.
 */
export async function sendPurchaseEmail(
  db: Db,
  input: { userId: string; offer: OfferKey; scanId?: string | null },
): Promise<PurchaseEmailResult> {
  if (!emailConfigured()) return { ok: false, reason: "not_configured" };

  // The creator's own address, from the identity that owns the purchase.
  const { data: userData, error: userError } =
    await db.auth.admin.getUserById(input.userId);
  const email = userData?.user?.email;
  if (userError || !email) return { ok: false, reason: "no_email_on_file" };

  const copy = COPY[input.offer];
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://scan.chrp.ai").replace(
    /\/$/,
    "",
  );
  const destination =
    input.offer === "song_intelligence" && input.scanId
      ? `${site}/scan/${input.scanId}/preview`
      : `${site}${copy.path}`;

  // The CTA is a secure return link for THIS creator. Generated, not sent,
  // by the auth service — the account email templates are untouched.
  let ctaUrl: string;
  try {
    const { data, error } = await db.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: destination },
    });
    const link = data?.properties?.action_link;
    if (error || !link) {
      return { ok: false, reason: "link_failed", detail: error?.message };
    }
    ctaUrl = link;
  } catch (err) {
    return {
      ok: false,
      reason: "link_failed",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  const result = await sendEmail({
    to: email,
    subject: copy.subject,
    html: renderEmail({
      heading: copy.heading,
      body: copy.body,
      cta: copy.cta,
      ctaUrl,
      support: copy.support,
    }),
  });

  if (!result.ok) {
    return {
      ok: false,
      reason: result.reason === "not_configured" ? "not_configured" : "send_failed",
      detail: result.detail,
    };
  }
  return { ok: true };
}
