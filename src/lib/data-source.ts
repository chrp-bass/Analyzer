import {
  MODE,
  getOrCreateGuestUser,
  recordScan as accountsRecordScan,
} from "@/lib/accounts";
import { encodeScanId, decodeScanId, ScanRecord, getScanById, saveScan } from "@/lib/scan-id";
import {
  getReportById,
  matchInputToReportId,
  ReportPayload,
} from "@/lib/fixtures/tracks";
import {
  getCreatorProfile as getCreatorProfileFixture,
  CreatorProfilePayload,
} from "@/lib/fixtures/profile";

export type { ReportPayload, CreatorProfilePayload };

export async function initiateScan(
  input: string,
): Promise<{ scanId: string; trackSlug: string }> {
  if (MODE === "demo") {
    const trackSlug = matchInputToReportId(input);
    const scanId = encodeScanId(trackSlug);
    const user = await getOrCreateGuestUser();
    saveScan(scanId, { trackSlug, paid: false, scannedAt: new Date().toISOString() });
    if (user) {
      await accountsRecordScan(user.id, trackSlug, false, scanId);
    }
    return { scanId, trackSlug };
  }
  throw new Error("Production CHRP engine not yet connected");
  // Production: POST to ${process.env.CHRP_ENGINE_URL}/api/scan with input
}

export async function getScanReport(scanId: string): Promise<ReportPayload | null> {
  if (MODE === "demo") {
    const trackSlug = decodeScanId(scanId);
    if (!trackSlug) return null;
    return getReportById(trackSlug);
  }
  throw new Error("Production CHRP engine not yet connected");
  // Production: fetch(`${process.env.CHRP_ENGINE_URL}/api/scan/${scanId}`)
}

export async function getScanRecord(scanId: string): Promise<ScanRecord | null> {
  if (MODE === "demo") {
    return getScanById(scanId);
  }
  throw new Error("Production CHRP engine not yet connected");
}

export async function getCreatorProfileForUser(
  trackSlug: string,
): Promise<CreatorProfilePayload | null> {
  if (MODE === "demo") {
    return getCreatorProfileFixture(trackSlug);
  }
  throw new Error("Production CHRP engine not yet connected");
}
