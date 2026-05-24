import { redirect } from "next/navigation";
import { getReportById } from "@/lib/fixtures/tracks";
import { getCreatorProfile } from "@/lib/fixtures/profile";
import { parseParams } from "@/lib/url-params";
import { RevealStage } from "@/components/stages/RevealStage";
import { PaywallPreviewStage } from "@/components/stages/PaywallPreviewStage";
import { CreatorProfileStage } from "@/components/stages/CreatorProfileStage";
import { ReportPage } from "@/components/ReportPage";
import { EmbedListener } from "@/components/EmbedListener";
import { MarketingLanding } from "@/components/MarketingLanding";

export const dynamic = "force-dynamic";

function hasStageParam(
  searchParams: Record<string, string | string[] | undefined>,
): boolean {
  return (
    typeof searchParams.stage === "string" ||
    typeof searchParams.format === "string"
  );
}

export default function Root({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  // No params -> marketing landing for the closed-loop demo.
  if (!hasStageParam(searchParams)) {
    return <MarketingLanding />;
  }

  // Otherwise, run the V9 URL-param renderer (kept for GHL iframe embedding).
  const params = parseParams(searchParams);

  if (params.format === "pdf") {
    redirect(`/api/report/${params.track}/pdf`);
  }

  // parseParams already validates the slug, so this lookup always resolves.
  const report = getReportById(params.track)!;
  const embedClass = params.embed ? "chrp-embed" : "";

  let body: React.ReactNode;
  switch (params.stage) {
    case "reveal":
      body = (
        <RevealStage
          report={report}
          trackSlug={params.track}
          embed={params.embed}
        />
      );
      break;
    case "paywall-preview":
      body = <PaywallPreviewStage report={report} trackSlug={params.track} />;
      break;
    case "creator-profile": {
      const profile = getCreatorProfile(params.track)!;
      body = (
        <CreatorProfileStage
          report={report}
          profile={profile}
          scans={params.scans}
          artistOverride={params.artist}
        />
      );
      break;
    }
    case "unlocked":
    default:
      body = <ReportPage report={report} id={params.track} />;
      break;
  }

  return (
    <main className={`min-h-screen ${embedClass}`}>
      <EmbedListener />
      {body}
    </main>
  );
}
