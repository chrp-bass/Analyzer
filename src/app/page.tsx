import { redirect } from "next/navigation";
import { getReportById, reports } from "@/lib/fixtures/tracks";
import { getCreatorProfile } from "@/lib/fixtures/profile";
import { parseParams } from "@/lib/url-params";
import { RevealStage } from "@/components/stages/RevealStage";
import { PaywallPreviewStage } from "@/components/stages/PaywallPreviewStage";
import { CreatorProfileStage } from "@/components/stages/CreatorProfileStage";
import { ReportPage } from "@/components/ReportPage";
import { EmbedListener } from "@/components/EmbedListener";

export const dynamic = "force-dynamic";

export default function Renderer({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const params = parseParams(searchParams);

  if (params.format === "pdf") {
    redirect(`/api/report/${params.track}/pdf`);
  }

  const report =
    getReportById(params.track) ??
    getReportById(Object.keys(reports)[0])!;

  const embedClass = params.embed ? "chrp-embed" : "";

  let body: React.ReactNode;
  switch (params.stage) {
    case "reveal":
      body = (
        <RevealStage report={report} trackSlug={params.track} embed={params.embed} />
      );
      break;
    case "paywall-preview":
      body = <PaywallPreviewStage report={report} trackSlug={params.track} />;
      break;
    case "creator-profile": {
      const profile =
        getCreatorProfile(params.track) ?? getCreatorProfile("glasshouse")!;
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
