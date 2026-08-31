import { notFound } from "next/navigation";
import { decodeScanId } from "@/lib/scan-id";
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
