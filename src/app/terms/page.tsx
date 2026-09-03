import { redirect } from "next/navigation";

// See src/app/privacy/page.tsx — without this, the static build loses the
// Location header and a real visitor lands on a broken 307.
export const dynamic = "force-dynamic";

/**
 * CHRP is one company with one legal source of truth. This route used to
 * render a local page whose own copy said "CHRP's formal terms of service
 * are in review" — a stub, not the real Terms of Service, reachable
 * directly even after the footer stopped linking to it.
 *
 * FLAGGED, not silently dropped: that stub also carried the only
 * customer-facing statement of this product's $19 / $149 pricing and its
 * 7-day refund policy. chrp.ai/terms does not state a refund policy at
 * all. Redirecting here removes that sentence from the product with
 * nothing else stating it. Fixing the legal destination is correct
 * regardless — a self-disclaimed "in review" stub was never the real
 * Terms of Service — but the refund/pricing line is commercial copy, not
 * legal boilerplate, and belongs restated somewhere in the product (the
 * checkout or tier surfaces) as a deliberate decision, not invented here
 * as a side effect of a footer fix. See chrp-footer-legal-governance.md.
 */
export default function TermsRedirect() {
  redirect("https://chrp.ai/terms");
}
