import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ClaimForm } from "@/components/claim/ClaimForm";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";
import { CLAIM_MESSAGES } from "@/lib/outreach/claim";
import {
  claimOpenPath,
  logClaimEvent,
  lookupClaim,
  verifiedCreatorId,
  type ClaimView,
} from "@/lib/outreach/claim.server";

export const dynamic = "force-dynamic";
// Same reason as the claim routes: the claim state must never be a cached read.
export const fetchCache = "force-no-store";
export const revalidate = 0;

export const metadata = {
  title: "CHRP // Your report",
  robots: { index: false, follow: false },
};

const heading = {
  fontFamily: "var(--d)",
  fontWeight: 300,
  fontSize: "clamp(28px, 3.4vw, 40px)",
  lineHeight: 1.1,
  color: "var(--on-light)",
  marginBottom: 14,
} as const;
const body = {
  fontFamily: "var(--s)",
  fontSize: 15,
  lineHeight: 1.6,
  color: "var(--on-light-2)",
  marginBottom: 24,
} as const;

/**
 * GET /claim/[token] — where an outreach DM lands.
 *
 * Shows the song and asks for an email; the magic link that arrives signs
 * the recipient in and continues to /claim/[token]/open, which gives them
 * their own copy of the pre-generated report. Used, expired and unknown
 * links get a friendly message, never an error page.
 */
export default async function ClaimPage({ params }: { params: { token: string } }) {
  let view: ClaimView = {
    state: "invalid", itemId: null, batchId: null, scanId: null, title: null, artist: null, claimedBy: null,
  };
  if (adminConfigured()) {
    try {
      view = await lookupClaim(createAdminClient(), params.token);
    } catch (err) {
      console.error("[claim] lookup failed:", err);
    }
  }

  const viewer = view.state === "invalid" ? null : await verifiedCreatorId();
  // The person who claimed it, coming back through the same link.
  if (view.state === "used" && viewer && viewer === view.claimedBy && view.scanId) {
    redirect(`/scan/${view.scanId}/preview`);
  }
  if (view.state === "open") await logClaimEvent(createAdminClient(), view, "claim_opened");

  return (
    <div className="product-shell">
      <SiteHeader showCta={false} />
      <main>
        <section className="pad-md">
          <div className="wrap" style={{ maxWidth: 520, margin: "0 auto" }}>
            <span className="eyebrow" style={{ display: "block", marginBottom: 12 }}>
              Song Intelligence
            </span>
            {view.state === "open" ? (
              <>
                <h1 style={heading}>
                  {view.title}
                  {view.artist ? (
                    <span style={{ display: "block", fontSize: "0.55em", marginTop: 8, color: "var(--on-light-2)" }}>
                      {view.artist}
                    </span>
                  ) : null}
                </h1>
                <p style={body}>Enter your email to open your full report.</p>
                {viewer ? (
                  <a href={claimOpenPath(params.token)} className="btn btn-y">
                    Open my full report
                  </a>
                ) : (
                  <ClaimForm token={params.token} />
                )}
              </>
            ) : (
              <>
                <h1 style={heading}>{CLAIM_MESSAGES[view.state].heading}</h1>
                <p style={body}>{CLAIM_MESSAGES[view.state].body}</p>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <Link href="/scan" className="btn btn-y">
                    Scan a song free
                  </Link>
                  {view.state === "used" ? (
                    <Link href="/signin" className="btn">
                      Sign in
                    </Link>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
