import { notFound } from "next/navigation";
import { decodeScanId } from "@/lib/scan-id";
import { getFreeReportById } from "@/lib/fixtures/tracks";
import { ScanProcessing } from "@/components/scan/ScanProcessing";
import { SiteHeader } from "@/components/SiteHeader";

export const dynamic = "force-dynamic";

export default function Processing({
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
        <ScanProcessing report={report} scanId={params.scanId} trackSlug={trackSlug} />
      </main>
    </div>
  );
}
