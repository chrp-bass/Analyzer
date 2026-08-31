import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, adminConfigured } from "@/lib/supabase/admin";
import { decodeScanId } from "@/lib/scan-id";
import { OFFERS, type OfferKey } from "@/lib/commerce/offers";

/**
 * The entitlement authority.
 *
 * Every paid surface asks exactly one question — `assertReportAccess` — and
 * that question is answered from the database against a cookie-verified
 * Supabase identity. Nothing here reads localStorage, a query parameter, or
 * any client-supplied flag.
 *
 * Failure is always closed: an unconfigured environment, a missing session,
 * an expired window or an unmatched scan all deny.
 */

export interface EntitlementRow {
  id: string;
  user_id: string;
  offer: OfferKey;
  scan_id: string | null;
  track_slug: string | null;
  track_limit: number | null;
  status: "active" | "revoked" | "refunded";
  granted_at: string;
  expires_at: string;
}

export type DenyReason =
  | "not_configured"
  | "no_identity"
  | "invalid_scan"
  | "no_entitlement"
  | "expired"
  | "revoked"
  | "limit_reached";

export type AccessResult =
  | { ok: true; entitlement: EntitlementRow; trackSlug: string }
  | { ok: false; reason: DenyReason };

const ENTITLEMENT_COLUMNS =
  "id,user_id,offer,scan_id,track_slug,track_limit,status,granted_at,expires_at";

function isExpired(row: EntitlementRow): boolean {
  return new Date(row.expires_at).getTime() <= Date.now();
}

/**
 * Server-verified identity for the current request. Returns null when the
 * caller presents no valid Supabase session cookie.
 */
export async function currentUserId(): Promise<string | null> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return null;
  }
  try {
    const supabase = createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

/**
 * Does the caller hold a live entitlement covering this scan?
 *
 * Song Intelligence  — the entitlement is bound to one scan_id.
 * Creator Intelligence — the entitlement covers any scan attached to it in
 * entitlement_tracks, up to its track_limit. Attachment is a server action
 * (`attachTrackToCatalog`); the browser cannot add to its own allowance.
 */
export async function assertReportAccess(
  scanId: string,
): Promise<AccessResult> {
  if (!adminConfigured()) return { ok: false, reason: "not_configured" };

  const trackSlug = decodeScanId(scanId);
  if (!trackSlug) return { ok: false, reason: "invalid_scan" };

  const userId = await currentUserId();
  if (!userId) return { ok: false, reason: "no_identity" };

  const db = createAdminClient();

  // 1. A Song Intelligence entitlement bound to exactly this scan.
  const { data: songRows } = await db
    .from("entitlements")
    .select(ENTITLEMENT_COLUMNS)
    .eq("user_id", userId)
    .eq("offer", "song_intelligence")
    .eq("scan_id", scanId)
    .limit(1);

  const song = (songRows?.[0] as EntitlementRow | undefined) ?? null;
  if (song) {
    if (song.status !== "active") return { ok: false, reason: "revoked" };
    if (isExpired(song)) return { ok: false, reason: "expired" };
    return { ok: true, entitlement: song, trackSlug };
  }

  // 2. A Creator Intelligence entitlement with this scan already attached.
  const { data: catRows } = await db
    .from("entitlements")
    .select(`${ENTITLEMENT_COLUMNS},entitlement_tracks!inner(scan_id)`)
    .eq("user_id", userId)
    .eq("offer", "creator_intelligence")
    .eq("entitlement_tracks.scan_id", scanId)
    .limit(1);

  const cat = (catRows?.[0] as EntitlementRow | undefined) ?? null;
  if (cat) {
    if (cat.status !== "active") return { ok: false, reason: "revoked" };
    if (isExpired(cat)) return { ok: false, reason: "expired" };
    return { ok: true, entitlement: cat, trackSlug };
  }

  return { ok: false, reason: "no_entitlement" };
}

/**
 * Attach a scan to a live Creator Intelligence entitlement, enforcing the
 * track ceiling against a COUNT of persisted rows. Idempotent: re-attaching
 * an already-covered scan succeeds without consuming another slot.
 */
export async function attachTrackToCatalog(
  scanId: string,
): Promise<AccessResult> {
  if (!adminConfigured()) return { ok: false, reason: "not_configured" };

  const trackSlug = decodeScanId(scanId);
  if (!trackSlug) return { ok: false, reason: "invalid_scan" };

  const userId = await currentUserId();
  if (!userId) return { ok: false, reason: "no_identity" };

  const db = createAdminClient();
  const { data: rows } = await db
    .from("entitlements")
    .select(ENTITLEMENT_COLUMNS)
    .eq("user_id", userId)
    .eq("offer", "creator_intelligence")
    .eq("status", "active")
    .order("granted_at", { ascending: false })
    .limit(1);

  const ent = (rows?.[0] as EntitlementRow | undefined) ?? null;
  if (!ent) return { ok: false, reason: "no_entitlement" };
  if (isExpired(ent)) return { ok: false, reason: "expired" };

  // Already attached? Idempotent success.
  const { data: existing } = await db
    .from("entitlement_tracks")
    .select("id")
    .eq("entitlement_id", ent.id)
    .eq("scan_id", scanId)
    .limit(1);
  if (existing && existing.length > 0) {
    return { ok: true, entitlement: ent, trackSlug };
  }

  // Ceiling is counted server-side, never supplied by the caller.
  const { count } = await db
    .from("entitlement_tracks")
    .select("id", { count: "exact", head: true })
    .eq("entitlement_id", ent.id);

  const limit = ent.track_limit ?? OFFERS.creator_intelligence.trackLimit;
  if ((count ?? 0) >= limit) return { ok: false, reason: "limit_reached" };

  const { error } = await db.from("entitlement_tracks").insert({
    entitlement_id: ent.id,
    scan_id: scanId,
    track_slug: trackSlug,
  });
  // A unique-violation here means a concurrent request already attached it.
  if (error && !`${error.message}`.includes("duplicate")) {
    return { ok: false, reason: "no_entitlement" };
  }

  return { ok: true, entitlement: ent, trackSlug };
}

/** Live entitlements for the caller — presentation only, never authority. */
export async function listEntitlements(): Promise<EntitlementRow[]> {
  if (!adminConfigured()) return [];
  const userId = await currentUserId();
  if (!userId) return [];
  const db = createAdminClient();
  const { data } = await db
    .from("entitlements")
    .select(ENTITLEMENT_COLUMNS)
    .eq("user_id", userId)
    .eq("status", "active")
    .order("granted_at", { ascending: false });
  return ((data as EntitlementRow[] | null) ?? []).filter((r) => !isExpired(r));
}
