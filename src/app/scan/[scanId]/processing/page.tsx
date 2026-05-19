import { notFound } from "next/navigation";
import { decodeScanId } from "@/lib/scan-id";
import { getReportById } from "@/lib/fixtures/tracks";
import { ScanProcessing } from "@/components/scan/ScanProcessing";

export const dynamic = "force-dynamic";

export default function Processing({
  params,
}: {
  params: { scanId: string };
}) {
  const trackSlug = decodeScanId(params.scanId);
  if (!trackSlug) notFound();
  const report = getReportById(trackSlug);
  if (!report) notFound();
  return (
    <ScanProcessing report={report} scanId={params.scanId} trackSlug={trackSlug} />
  );
}
