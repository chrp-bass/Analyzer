import { redirect } from "next/navigation";

// Without this, Next statically prerenders the page at build time and the
// resulting production response loses its Location header entirely — a
// 307 with no destination, verified against a production `next start`
// build. Dev mode never showed the bug because dev never statically
// optimizes. Matches the existing redirect at src/app/report/[scanId].
export const dynamic = "force-dynamic";

/**
 * CHRP is one company with one legal source of truth. This route used to
 * render a local page whose own copy said "CHRP's formal privacy policy is
 * in review" — a stub, reachable directly even after the footer stopped
 * linking to it. Redirected rather than deleted, so anything that already
 * points here (a bookmark, an indexed search result, an old email) still
 * lands on the real policy instead of a 404 or a page that undersells it.
 *
 * See chrp-footer-legal-governance.md.
 */
export default function PrivacyRedirect() {
  redirect("https://chrp.ai/privacy");
}
