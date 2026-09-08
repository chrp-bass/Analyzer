"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { decodeScanId, isFixtureKey } from "@/lib/scan-id";
import { getFreeReportById } from "@/lib/fixtures/tracks";
import { ScanPreview } from "@/components/scan/ScanPreview";
import { useScanReadPath } from "@/components/scan/useScanReadPath";

/**
 * Preview page — the one destination for a scan that has an id.
 *
 * /success redirects here with `?paid=1`; the dashboard, a bookmark and a
 * refresh land here directly. All of them run the same read path
 * (`@/lib/scan/read-path`): the entitled, persisted report is asked for
 * FIRST, and only a 403 lets the unpaid flow — the free analysis, the
 * included-report claim, the reveal and the checkout boundary — run at all.
 * A paying creator never sees their report described as being built.
 */
export default function PreviewPage({
  params,
}: {
  params: { scanId: string };
}) {
  const router = useRouter();
  const search = useSearchParams();
  const trackSlug = decodeScanId(params.scanId);
  const fixture =
    trackSlug && isFixtureKey(trackSlug) ? getFreeReportById(trackSlug) : null;
  const paidReturn = search.get("paid") === "1";

  const { state, retry } = useScanReadPath(params.scanId, {
    paidReturn,
    fixture,
    enabled: trackSlug !== null,
  });

  useEffect(() => {
    if (!trackSlug) router.replace("/scan");
  }, [trackSlug, router]);

  if (!trackSlug) return <div className="product-shell" />;

  return (
    <div className="product-shell">
      <ScanPreview
        scanId={params.scanId}
        state={state}
        paidReturn={paidReturn}
        onRetry={retry}
      />
    </div>
  );
}
