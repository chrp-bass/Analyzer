import { notFound } from "next/navigation";
import { decodeScanId } from "@/lib/scan-id";
import { ScanUnlocking } from "@/components/scan/ScanUnlocking";

export const dynamic = "force-dynamic";

export default function UnlockingPage({
  params,
}: {
  params: { scanId: string };
}) {
  const trackSlug = decodeScanId(params.scanId);
  if (!trackSlug) notFound();
  return <ScanUnlocking scanId={params.scanId} />;
}
