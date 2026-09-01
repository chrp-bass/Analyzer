import { notFound, redirect } from "next/navigation";
import { decodeScanId, isFixtureKey } from "@/lib/scan-id";
import { getFreeReportById } from "@/lib/fixtures/tracks";
import { StripeCheckoutForm } from "@/components/scan/StripeCheckoutForm";
import { ProductId } from "@/lib/accounts";
import { TIERS } from "@/lib/payments";

export const dynamic = "force-dynamic";

const VALID_PRODUCTS: ProductId[] = ["artist_catalog"];

export default function CheckoutTier({
  params,
  searchParams,
}: {
  params: { scanId: string };
  searchParams: { product?: string };
}) {
  const trackSlug = decodeScanId(params.scanId);
  if (!trackSlug) notFound();
  // A real ISRC scan has no fixture-backed report; these demo checkout
  // surfaces cannot describe it, and the real Stripe CTAs live on the
  // reveal. Send them there rather than 404 on a legitimate song.
  if (!isFixtureKey(trackSlug)) redirect(`/scan/${params.scanId}/preview`);
  const report = getFreeReportById(trackSlug);
  if (!report) notFound();

  const productParam = (searchParams.product || "artist_catalog") as ProductId;
  // Legacy tier ids (extended_catalog, manager_roster, annual_unlimited)
  // arrive from stale bookmarks or in-flight tabs opened pre-migration —
  // redirect to the current catalog checkout rather than the picker.
  if (!VALID_PRODUCTS.includes(productParam)) {
    redirect(`/scan/${params.scanId}/checkout-tier?product=artist_catalog`);
  }
  if (TIERS[productParam].comingSoon) {
    redirect(`/scan/${params.scanId}/checkout-tier?product=artist_catalog`);
  }

  return (
    <div className="product-shell">
      <StripeCheckoutForm
        scanId={params.scanId}
        mode="tier"
        productSlug={productParam}
        trackTitle={report.track.title}
        trackArtist={report.track.artist}
      />
    </div>
  );
}
