"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { decodeScanId } from "@/lib/scan-id";
import { getReportById, type ReportPayload } from "@/lib/fixtures/tracks";
import { getScanReport } from "@/lib/data-source";
import { ScanPreview } from "@/components/scan/ScanPreview";

/**
 * Preview page — client component so getScanReport can hit its client-side
 * localStorage cache before falling through to the server-side generation
 * bridge at /api/scan-report. First view: initial render uses the fixture
 * for instant paint, then swaps in the generated payload when it arrives.
 * Subsequent views of the same scanId hit the localStorage cache and skip
 * the API round-trip entirely.
 */
export default function PreviewPage({
  params,
}: {
  params: { scanId: string };
}) {
  const router = useRouter();
  const trackSlug = decodeScanId(params.scanId);
  const fixture = trackSlug ? getReportById(trackSlug) : null;
  const [report, setReport] = useState<ReportPayload | null>(fixture);

  useEffect(() => {
    if (!fixture) {
      router.replace("/scan");
      return;
    }
    let cancelled = false;
    (async () => {
      const upgraded = await getScanReport(params.scanId);
      if (!cancelled && upgraded) setReport(upgraded);
    })();
    return () => {
      cancelled = true;
    };
  }, [params.scanId, fixture, router]);

  if (!trackSlug || !fixture || !report) return null;
  return (
    <div className="product-shell">
      <ScanPreview report={report} scanId={params.scanId} trackSlug={trackSlug} />
    </div>
  );
}
