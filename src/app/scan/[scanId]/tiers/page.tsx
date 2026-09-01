import { notFound, redirect } from "next/navigation";
import { decodeScanId, isFixtureKey } from "@/lib/scan-id";
import { getFreeReportById } from "@/lib/fixtures/tracks";
import { TierPicker } from "@/components/scan/TierPicker";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export const dynamic = "force-dynamic";

export default function TiersPage({
  params,
}: {
  params: { scanId: string };
}) {
  const trackSlug = decodeScanId(params.scanId);
  if (!trackSlug) notFound();
  // A real ISRC scan has no fixture-backed report; these demo checkout
  // surfaces cannot describe it, and the real Stripe CTAs live on the
  // reveal. Send them there rather than 404 on a legitimate song.
  if (!isFixtureKey(trackSlug)) redirect(`/scan/${params.scanId}/preview`);
  const report = getFreeReportById(trackSlug);
  if (!report) notFound();
  return (
    <div className="product-shell">
      <SiteHeader showCta={false} />
      <main>
        <TierPicker scanId={params.scanId} report={report} />
      </main>
      <SiteFooter />
    </div>
  );
}
