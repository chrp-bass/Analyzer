import { notFound } from "next/navigation";
import { decodeScanId } from "@/lib/scan-id";
import { getReportById } from "@/lib/fixtures/tracks";
import { TierPicker } from "@/components/scan/TierPicker";

export const dynamic = "force-dynamic";

export default function TiersPage({
  params,
}: {
  params: { scanId: string };
}) {
  const trackSlug = decodeScanId(params.scanId);
  if (!trackSlug) notFound();
  const report = getReportById(trackSlug);
  if (!report) notFound();
  return <TierPicker scanId={params.scanId} report={report} />;
}
