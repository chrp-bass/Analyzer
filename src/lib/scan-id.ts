import { TRACK_SLUGS } from "@/lib/fixtures/tracks";

export interface ScanRecord {
  scanId: string;
  trackSlug: string;
  paid: boolean;
  scannedAt: string;
}

const SCAN_KEY = (id: string) => `chrp_scan_${id}`;
const SCAN_ID_RE = /^scn_([a-z0-9-]+)_[a-z0-9]{6}$/;

function rand6() {
  return Math.random().toString(36).slice(2, 8).padEnd(6, "0");
}

function ls(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function encodeScanId(trackSlug: string): string {
  return `scn_${trackSlug}_${rand6()}`;
}

export function decodeScanId(scanId: string): string | null {
  const m = SCAN_ID_RE.exec(scanId);
  if (!m) return null;
  const slug = m[1];
  if (!TRACK_SLUGS.includes(slug)) return null;
  return slug;
}

export function saveScan(
  scanId: string,
  data: Omit<ScanRecord, "scanId">,
): ScanRecord {
  const record: ScanRecord = { scanId, ...data };
  const s = ls();
  s?.setItem(SCAN_KEY(scanId), JSON.stringify(record));
  return record;
}

export function getScanById(scanId: string): ScanRecord | null {
  const s = ls();
  if (!s) {
    // Server-side: synthesize a record from the scanId itself so SSR can
    // still render the report shell.
    const slug = decodeScanId(scanId);
    if (!slug) return null;
    return {
      scanId,
      trackSlug: slug,
      paid: false,
      scannedAt: new Date().toISOString(),
    };
  }
  const raw = s.getItem(SCAN_KEY(scanId));
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      // fall through to id decode
    }
  }
  const slug = decodeScanId(scanId);
  if (!slug) return null;
  return {
    scanId,
    trackSlug: slug,
    paid: false,
    scannedAt: new Date().toISOString(),
  };
}

export function updateScan(
  scanId: string,
  patch: Partial<Omit<ScanRecord, "scanId">>,
): ScanRecord | null {
  const existing = getScanById(scanId);
  if (!existing) return null;
  const next: ScanRecord = { ...existing, ...patch };
  const s = ls();
  s?.setItem(SCAN_KEY(scanId), JSON.stringify(next));
  return next;
}
