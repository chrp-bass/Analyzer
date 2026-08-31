import { redirect } from "next/navigation";
import { getFreeReportById } from "@/lib/fixtures/tracks";
import { getCreatorProfile } from "@/lib/fixtures/profile";
import { parseParams } from "@/lib/url-params";
import { RevealStage } from "@/components/stages/RevealStage";
import { PaywallPreviewStage } from "@/components/stages/PaywallPreviewStage";
import { CreatorProfileStage } from "@/components/stages/CreatorProfileStage";
import { ReportPage } from "@/components/ReportPage";
import { EmbedListener } from "@/components/EmbedListener";
import { MarketingLanding } from "@/components/MarketingLanding";
import { getFullReport } from "@/lib/fixtures/report.server";

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
  const report = getFreeReportById(params.track)!;
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
    default: {
      // The "unlocked" stage renders the PAID report. It is a development and
      // embed-preview affordance, not a public product surface: serving it
      // from an unauthenticated query parameter would hand the paid product
      // to anyone who guessed the URL. In production it is refused and the
      // visitor gets the marketing landing instead.
      const assembled = getFullReport(params.track);
      if (!assembled) return <MarketingLanding />;
      body = <ReportPage report={assembled.report} id={params.track} />;
      break;
    }
  }

  return (
    <main className={`min-h-screen ${embedClass}`}>
      <EmbedListener />
      {body}
    </main>
  );
}
