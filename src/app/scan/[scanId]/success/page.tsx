import Link from "next/link";
import { redirect } from "next/navigation";
import { getStripe, stripeConfigured } from "@/lib/commerce/stripe";
import { assertReportAccess } from "@/lib/commerce/entitlements";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export const dynamic = "force-dynamic";

/**
 * Post-payment return route.
 *
 * Stripe sends the buyer here with session_id={CHECKOUT_SESSION_ID}. This
 * page verifies that session against the Stripe API — but verification is
 * NOT a grant. Entitlement comes from the signed webhook and nothing else.
 *
 * So there are three outcomes:
 *   entitled           -> straight to the report
 *   paid, not yet in DB -> a short, honest processing state (webhook in flight)
 *   not paid / unknown  -> back to the reveal, nothing unlocked
 *
 * A forged or replayed session_id therefore buys nothing: it cannot create
 * an entitlement row, and the report route reads only the database.
 */
export default async function CheckoutSuccessPage({
  params,
  searchParams,
}: {
  params: { scanId: string };
  searchParams: { session_id?: string };
}) {
  const { scanId } = params;

  // If the webhook has already landed, skip the interstitial entirely.
  const access = await assertReportAccess(scanId);
  if (access.ok) redirect(`/scan/${scanId}/preview`);

  const sessionId = searchParams.session_id;
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
                {/* Refresh rather than poll: the redirect above fires the
                    moment the webhook-written entitlement is readable. */}
                <meta httpEquiv="refresh" content="4" />
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
