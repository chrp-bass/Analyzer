import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderEmail, sendEmail, emailConfigured } from "@/lib/email/send.server";
import type { OfferKey } from "@/lib/commerce/offers";
import { isReturnLinkType, tokenHashReturnUrl } from "@/lib/auth/return-link";

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

export const PURCHASE_COPY: Record<
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

type Copy = (typeof PURCHASE_COPY)[OfferKey];

/** Escape text for the email's HTML body. Titles are catalogue data. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** One line, bounded: a subject is a header, and a title is not ours. */
function oneLine(text: string, max: number): string {
  const flat = text.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}\u2026` : flat;
}

/**
 * The Song Intelligence copy, naming the song it is about.
 *
 * "Your Song Intelligence is ready" told a creator with several songs nothing
 * about WHICH one, in the inbox or in the message. With a title on file the
 * subject and body carry it; without one the specified generic copy stands,
 * unchanged. Returns the subject as plain text and the body as safe HTML.
 */
export function copyForSong(
  copy: Copy,
  song: { title: string | null; artist: string | null } | null,
): Copy {
  const title = song?.title ? oneLine(song.title, 80) : "";
  if (!title) return copy;
  const artist = song?.artist ? oneLine(song.artist, 60) : "";
  const named = artist ? `${title} by ${artist}` : title;
  return {
    ...copy,
    subject: `Your Song Intelligence \u2014 ${named}`,
    body: `Your complete report for ${escapeHtml(named)} is waiting for you.`,
  };
}

/**
 * The purchased song, as this creator's catalog knows it. Best-effort: any
 * failure here means the generic copy, never a missing email.
 */
async function songForScan(
  db: Db,
  userId: string,
  scanId: string,
): Promise<{ title: string | null; artist: string | null } | null> {
  try {
    const { data, error } = await db
      .from("analyses")
      .select("songs!inner(title,artist_name)")
      .eq("creator_id", userId)
      .eq("scan_id", scanId)
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    const joined = (data as { songs: unknown }).songs;
    const song = (Array.isArray(joined) ? joined[0] : joined) as
      | { title?: string | null; artist_name?: string | null }
      | null
      | undefined;
    if (!song) return null;
    return { title: song.title ?? null, artist: song.artist_name ?? null };
  } catch {
    return null;
  }
}

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

  const copy =
    input.offer === "song_intelligence" && input.scanId
      ? copyForSong(
          PURCHASE_COPY.song_intelligence,
          await songForScan(db, input.userId, input.scanId),
        )
      : PURCHASE_COPY[input.offer];
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://scan.chrp.ai").replace(
    /\/$/,
    "",
  );
  const destinationPath =
    input.offer === "song_intelligence" && input.scanId
      ? `/scan/${input.scanId}/preview`
      : copy.path;

  // The CTA is a secure return link for THIS creator. Generated, not sent,
  // by the auth service — the account email templates are untouched.
  //
  // The link is built from the one-time token hash and completes on OUR
  // /auth/callback, not from the auth service's `action_link`. That link
  // returns the session in the URL fragment, which the app's PKCE browser
  // client refuses ("Not a valid PKCE flow url") and no server can read — so
  // it would have dropped the creator on the page signed out. A token hash
  // needs nothing stored in the browser, so it also works from a phone or a
  // mail app's own browser.
  let ctaUrl: string;
  try {
    const { data, error } = await db.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: `${site}${destinationPath}` },
    });
    const tokenHash = data?.properties?.hashed_token;
    const type = data?.properties?.verification_type;
    if (error || !tokenHash || !isReturnLinkType(type)) {
      return { ok: false, reason: "link_failed", detail: error?.message };
    }
    ctaUrl = tokenHashReturnUrl({ site, tokenHash, type, next: destinationPath });
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
