import { notFound } from "next/navigation";
import { decodeScanId } from "@/lib/scan-id";
import { getReportById } from "@/lib/fixtures/tracks";
import { ReportShell } from "@/components/scan/ReportShell";

export const dynamic = "force-dynamic";

export default function ReportPageRoute({
  params,
  searchParams,
}: {
  params: { scanId: string };
  searchParams: { welcome?: string; email?: string };
}) {
  const trackSlug = decodeScanId(params.scanId);
  if (!trackSlug) notFound();
  const report = getReportById(trackSlug);
  if (!report) notFound();
  return (
    <ReportShell
      report={report}
      scanId={params.scanId}
      trackSlug={trackSlug}
      welcome={searchParams.welcome === "1"}
      email={searchParams.email ?? null}
    />
  );
}
