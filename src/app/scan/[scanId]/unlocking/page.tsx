import { notFound } from "next/navigation";
import { decodeScanId } from "@/lib/scan-id";
import { ScanUnlocking } from "@/components/scan/ScanUnlocking";
import { SiteHeader } from "@/components/SiteHeader";

export const dynamic = "force-dynamic";

export default function UnlockingPage({
  params,
}: {
  params: { scanId: string };
}) {
  const trackSlug = decodeScanId(params.scanId);
  if (!trackSlug) notFound();
  return (
    <div className="product-shell">
      <SiteHeader showCta={false} />
      <main>
        <ScanUnlocking scanId={params.scanId} />
      </main>
    </div>
  );
}
