import { notFound } from "next/navigation";
import { decodeScanId, isFixtureKey } from "@/lib/scan-id";
import { getFreeReportById } from "@/lib/fixtures/tracks";
import { ScanProcessing } from "@/components/scan/ScanProcessing";
import { SiteHeader } from "@/components/SiteHeader";

export const dynamic = "force-dynamic";

/**
 * Processing.
 *
 * A fixture scan already has its report on the server, so it is passed
 * straight down. A real scan has nothing yet — the analysis runs client-side
 * inside the processing screen, which is exactly the window its status
 * messages describe.
 */
export default function Processing({
  params,
  searchParams,
}: {
  params: { scanId: string };
  searchParams: { t?: string; a?: string };
}) {
  const trackSlug = decodeScanId(params.scanId);
  if (!trackSlug) notFound();

  const fixture = isFixtureKey(trackSlug)
    ? getFreeReportById(trackSlug)
    : null;
  // A fixture id that names no fixture is a malformed id, not a real song.
  if (isFixtureKey(trackSlug) && !fixture) notFound();

  return (
    <div className="product-shell">
      <SiteHeader showCta={false} />
      <main>
        <ScanProcessing
          report={fixture}
          scanId={params.scanId}
          trackSlug={trackSlug}
          pendingTitle={searchParams.t}
          pendingArtist={searchParams.a}
        />
      </main>
    </div>
  );
}
