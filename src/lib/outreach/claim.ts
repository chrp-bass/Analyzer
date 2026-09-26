/**
 * Outreach claim links — the pure rules.
 *
 * A DM carries https://scan.chrp.ai/claim/<token>. The token names one
 * outreach_batch_items row whose analysis and report were generated ahead of
 * time under the outreach identity. It is single use and lives 30 days from
 * the row's creation. Claiming copies the analysis and report to the creator
 * who signed in and grants the entitlement (see `claim_outreach_item` in the
 * 20260926200000 migration, which re-checks all of this under a row lock).
 */

export const CLAIM_TTL_DAYS = 30;

/** The public origin claim links are built on. */
export function claimSite(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://scan.chrp.ai").replace(/\/$/, "");
}
const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

export function isClaimTokenShape(token: string | null | undefined): token is string {
  return typeof token === "string" && TOKEN_RE.test(token);
}

export type ClaimState = "open" | "used" | "expired" | "invalid";

export interface ClaimRow {
  created_at: string;
  claimed_at: string | null;
  analysis_id: string | null;
}

export function claimState(row: ClaimRow | null, now: Date = new Date()): ClaimState {
  if (!row || !row.analysis_id) return "invalid";
  if (row.claimed_at) return "used";
  const age = now.getTime() - new Date(row.created_at).getTime();
  if (age > CLAIM_TTL_DAYS * 86_400_000) return "expired";
  return "open";
}

/** What the claim page says for a link that cannot be opened. */
export const CLAIM_MESSAGES: Record<Exclude<ClaimState, "open">, { heading: string; body: string }> = {
  used: {
    heading: "This link has already been used.",
    body: "The report it opened now lives in the My Songs of whoever claimed it. If that was you, sign in to see it.",
  },
  expired: {
    heading: "This link has expired.",
    body: "Claim links last 30 days. You can still scan any song for free and see what it does.",
  },
  invalid: {
    heading: "We couldn't find that link.",
    body: "Check that the whole link was copied. You can also scan any song for free.",
  },
};

/** Outcomes of `claim_outreach_item`. */
export type ClaimOutcome = "claimed" | "already_yours" | "used" | "expired" | "invalid" | "unavailable";

export function normalizeClaimEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const email = input.trim().toLowerCase();
  if (email.length < 5 || email.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}
