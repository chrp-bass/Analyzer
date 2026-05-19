import { notFound } from "next/navigation";
import { decodeScanId } from "@/lib/scan-id";
import { getReportById } from "@/lib/fixtures/tracks";
import { StripeCheckoutForm } from "@/components/scan/StripeCheckoutForm";

export const dynamic = "force-dynamic";

export default function CheckoutSingle({
  params,
}: {
  params: { scanId: string };
}) {
  const trackSlug = decodeScanId(params.scanId);
  if (!trackSlug) notFound();
  const report = getReportById(trackSlug);
  if (!report) notFound();
  return (
    <StripeCheckoutForm
      scanId={params.scanId}
      mode="single"
      productSlug="single"
      trackTitle={report.track.title}
      trackArtist={report.track.artist}
    />
  );
}
