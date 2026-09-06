import Link from "next/link";
import { redirect } from "next/navigation";
import { getStripe, stripeConfigured } from "@/lib/commerce/stripe";
import { assertReportAccess } from "@/lib/commerce/entitlements";
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
 * cleared cookie, a different browser, an expired anonymous JWT — the client
 * island below establishes an identity and calls /api/scan/rebind, which
 * moves the entitlement to the current caller against Stripe's own
 * confirmation of payment. The Stripe session id in the URL is the proof
 * that this caller is the one who just paid.
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

  // If the webhook has already landed AND we already own it, skip the
  // interstitial entirely.
  const access = await assertReportAccess(scanId);
  if (access.ok) redirect(`/scan/${scanId}/preview?paid=1`);

  let paidButPending = false;
  if (sessionId && stripeConfigured()) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(sessionId);
      // Only a genuinely paid session justifies showing a waiting state.
      paidButPending =
        session.payment_status === "paid" &&
        session.metadata?.scan_id === scanId;
    } catch {
      paidButPending = false;
    }
  }

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
                {/* The client island below establishes an identity and asks
                    the server to rebind the entitlement. When it lands, it
                    navigates to /preview. The meta-refresh is the fallback
                    for a browser that cannot run scripts. */}
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
