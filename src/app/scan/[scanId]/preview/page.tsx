import { notFound } from "next/navigation";
import { decodeScanId } from "@/lib/scan-id";
import { getReportById } from "@/lib/fixtures/tracks";
import { ScanPreview } from "@/components/scan/ScanPreview";

export const dynamic = "force-dynamic";

export default function PreviewPage({
  params,
}: {
  params: { scanId: string };
}) {
  const trackSlug = decodeScanId(params.scanId);
  if (!trackSlug) notFound();
  const report = getReportById(trackSlug);
  if (!report) notFound();
  return (
    <ScanPreview report={report} scanId={params.scanId} trackSlug={trackSlug} />
  );
}
