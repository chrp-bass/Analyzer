"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { decodeScanId, isFixtureKey } from "@/lib/scan-id";
import { getFreeReportById, type FreeReport } from "@/lib/fixtures/tracks";
import { getScanReport, ScanError } from "@/lib/data-source";
import { ScanPreview, ReportPreparing } from "@/components/scan/ScanPreview";

/**
 * Preview page.
 *
 * A fixture scan paints instantly from the bundled report. A real scan reads
 * its scoring from the engine — the analyze route caches by ISRC and the
 * session keeps its own in-memory copy, so arriving here from processing is
 * normally free.
 */
export default function PreviewPage({
  params,
}: {
  params: { scanId: string };
}) {
  const router = useRouter();
  const trackSlug = decodeScanId(params.scanId);
  const fixture =
    trackSlug && isFixtureKey(trackSlug) ? getFreeReportById(trackSlug) : null;

  const [report, setReport] = useState<FreeReport | null>(fixture);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!trackSlug) {
      router.replace("/scan");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const resolved = await getScanReport(params.scanId);
        if (cancelled) return;
        if (resolved) setReport(resolved);
        else if (!fixture) {
          setError(
            "This song isn't available for analysis yet. Try a different version or another track.",
          );
        }
      } catch (err) {
        if (cancelled) return;
        if (!fixture) {
          setError(
            err instanceof ScanError
              ? err.userMessage
              : "Something went wrong. Please try again.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.scanId, trackSlug, fixture, router]);

  if (error) {
    return (
      <div className="product-shell">
        <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
          <p
            className="font-display italic text-[20px] text-chrp-black"
            style={{ maxWidth: "44ch" }}
          >
            {error}
          </p>
          <button
            onClick={() => router.push("/scan")}
            className="btn btn-y"
            style={{ marginTop: 28 }}
          >
            Try another song
          </button>
        </div>
      </div>
    );
  }

  // A real scan has no report until the engine answers. This used to return
  // null, then an empty coloured div — both of which are a dead viewport.
  // The same waiting screen the entitlement check uses renders here too, so
  // the whole window from processing to report is one continuous state.
  if (!trackSlug || !report) {
    return (
      <div className="product-shell">
        <ReportPreparing report={null} />
      </div>
    );
  }
  return (
    <div className="product-shell">
      <ScanPreview
        report={report}
        scanId={params.scanId}
        trackSlug={trackSlug}
      />
    </div>
  );
}
