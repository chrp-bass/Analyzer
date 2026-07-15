import { notFound, redirect } from "next/navigation";
import { decodeScanId } from "@/lib/scan-id";
import { getReportById } from "@/lib/fixtures/tracks";
import { StripeCheckoutForm } from "@/components/scan/StripeCheckoutForm";
import { ProductId } from "@/lib/accounts";
import { TIERS } from "@/lib/payments";

export const dynamic = "force-dynamic";

const VALID_PRODUCTS: ProductId[] = [
  "artist_catalog",
  "extended_catalog",
  "manager_roster",
  "annual_unlimited",
];

export default function CheckoutTier({
  params,
  searchParams,
}: {
  params: { scanId: string };
  searchParams: { product?: string };
}) {
  const trackSlug = decodeScanId(params.scanId);
  if (!trackSlug) notFound();
  const report = getReportById(trackSlug);
  if (!report) notFound();

  const productParam = (searchParams.product || "artist_catalog") as ProductId;
  if (!VALID_PRODUCTS.includes(productParam)) {
    redirect(`/scan/${params.scanId}/tiers`);
  }
  if (TIERS[productParam].comingSoon) {
    redirect(`/scan/${params.scanId}/tiers`);
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
