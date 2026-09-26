import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient, supabaseConfigured } from "@/lib/supabase/server";
import { renderEmail, sendEmail, emailConfigured } from "@/lib/email/send.server";
import { isReturnLinkType, tokenHashReturnUrl } from "@/lib/auth/return-link";
import { OFFERS, expiresAtFor } from "@/lib/commerce/offers";
import {
  claimSite,
  claimState,
  isClaimTokenShape,
  type ClaimOutcome,
  type ClaimState,
} from "@/lib/outreach/claim";

/**
 * Outreach claim links — server side. See `@/lib/outreach/claim`.
 *
 * Sign-in is the existing Supabase magic-link flow: the link is generated
 * (not sent) by the auth service as a one-time token hash and completes on
 * OUR /auth/callback, exactly like the purchase email, then continues to
 * /claim/<token>/open, which performs the claim for the signed-in creator.
 * A DM recipient usually has no account yet, so one is created for the
 * address first (confirmed only when they click the link).
 */

type Db = ReturnType<typeof createAdminClient>;

export interface ClaimView {
  state: ClaimState;
  itemId: string | null;
  batchId: string | null;
  scanId: string | null;
  title: string | null;
  artist: string | null;
  claimedBy: string | null;
}

export function claimPath(token: string): string {
  return `/claim/${token}`;
}
export function claimOpenPath(token: string): string {
  return `/claim/${token}/open`;
}

export async function lookupClaim(db: Db, token: string): Promise<ClaimView> {
  const none: ClaimView = {
    state: "invalid", itemId: null, batchId: null, scanId: null, title: null, artist: null, claimedBy: null,
  };
  if (!isClaimTokenShape(token)) return none;
  const { data, error } = await db
    .from("outreach_batch_items")
    .select("id,batch_id,scan_id,analysis_id,resolved_title,resolved_artist,requested_title,requested_artist,created_at,claimed_at,claimed_by_creator")
    .eq("claim_token", token)
    .limit(1);
  if (error) throw error;
  const row = data?.[0] as
    | {
        id: string; batch_id: string; scan_id: string | null; analysis_id: string | null;
        resolved_title: string | null; resolved_artist: string | null;
        requested_title: string; requested_artist: string;
        created_at: string; claimed_at: string | null; claimed_by_creator: string | null;
      }
    | undefined;
  if (!row) return none;
  return {
    state: claimState(row),
    itemId: row.id,
    batchId: row.batch_id,
    scanId: row.scan_id,
    title: row.resolved_title ?? row.requested_title,
    artist: row.resolved_artist ?? row.requested_artist,
    claimedBy: row.claimed_by_creator,
  };
}

/** Best-effort: an event that fails to write never blocks the page. */
export async function logClaimEvent(
  db: Db,
  view: ClaimView,
  event: "claim_opened",
): Promise<void> {
  try {
    const { error } = await db.from("outreach_events").insert({
      event,
      batch_id: view.batchId,
      scan_id: view.scanId,
      outreach_item_id: view.itemId,
    });
    if (error) throw error;
    console.log(`[claim] event=${event} batch_id=${view.batchId} scan_id=${view.scanId}`);
  } catch (err) {
    console.error(`[claim] could not log ${event}:`, err);
  }
}

/** The signed-in, email-verified creator for this request, or null. */
export async function verifiedCreatorId(): Promise<string | null> {
  if (!supabaseConfigured()) return null;
  try {
    const { data } = await createClient().auth.getUser();
    const user = data.user;
    if (!user || user.is_anonymous === true || !user.email) return null;
    return user.id;
  } catch {
    return null;
  }
}

async function ensureAuthUser(db: Db, email: string): Promise<void> {
  const { data } = await db.from("creators").select("id").eq("email", email).limit(1);
  if (data && data.length > 0) return;
  const { error } = await db.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { source: "outreach_claim" },
  });
  // Someone already holds this address (possibly with no creators row yet):
  // the magic link below signs them in as that identity.
  if (error && !/already|registered|exists/i.test(error.message)) throw error;
}

export type SendClaimLinkResult =
  | { ok: true }
  | { ok: false; reason: "not_open" | "not_configured" | "link_failed" | "send_failed"; state?: ClaimState };

export async function sendClaimLink(
  db: Db,
  token: string,
  email: string,
): Promise<SendClaimLinkResult> {
  const view = await lookupClaim(db, token);
  if (view.state !== "open") return { ok: false, reason: "not_open", state: view.state };
  if (!emailConfigured()) return { ok: false, reason: "not_configured" };

  const site = claimSite();
  const next = claimOpenPath(token);
  let ctaUrl: string;
  try {
    await ensureAuthUser(db, email);
    const { data, error } = await db.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: `${site}${next}` },
    });
    const tokenHash = data?.properties?.hashed_token;
    const type = data?.properties?.verification_type;
    if (error || !tokenHash || !isReturnLinkType(type)) {
      console.error(`[claim] link failed: ${error?.message ?? "no token hash"}`);
      return { ok: false, reason: "link_failed" };
    }
    ctaUrl = tokenHashReturnUrl({ site, tokenHash, type, next });
  } catch (err) {
    console.error("[claim] link failed:", err);
    return { ok: false, reason: "link_failed" };
  }

  const named = [view.title, view.artist].filter(Boolean).join(" by ");
  const safe = named.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const result = await sendEmail({
    to: email,
    subject: named ? `Your report for ${named.replace(/[\r\n]+/g, " ").slice(0, 120)}` : "Your CHRP report",
    html: renderEmail({
      heading: "Your report is ready.",
      body: safe
        ? `Your full Song Intelligence report for ${safe} is waiting for you.`
        : "Your full Song Intelligence report is waiting for you.",
      cta: "Open my report",
      ctaUrl,
      support: "It will be saved in My Songs, so you can come back anytime.",
    }),
  });
  if (!result.ok) {
    console.error(`[claim] send failed: ${result.detail ?? result.reason}`);
    return { ok: false, reason: result.reason === "not_configured" ? "not_configured" : "send_failed" };
  }
  return { ok: true };
}

export async function completeClaim(
  db: Db,
  token: string,
  creatorId: string,
): Promise<{ outcome: ClaimOutcome; scanId: string | null; batchId: string | null }> {
  if (!isClaimTokenShape(token)) return { outcome: "invalid", scanId: null, batchId: null };
  const offer = OFFERS.song_intelligence;
  const { data, error } = await db.rpc("claim_outreach_item", {
    p_token: token,
    p_creator: creatorId,
    p_expires_at: expiresAtFor(offer),
    p_track_limit: offer.trackLimit,
  });
  if (error) throw error;
  const row = (data as Array<{ outcome: ClaimOutcome; out_scan_id: string | null; out_batch_id: string | null }> | null)?.[0];
  const outcome = row?.outcome ?? "invalid";
  if (outcome === "claimed") {
    console.log(`[claim] event=claimed batch_id=${row?.out_batch_id} scan_id=${row?.out_scan_id}`);
  }
  return { outcome, scanId: row?.out_scan_id ?? null, batchId: row?.out_batch_id ?? null };
}
