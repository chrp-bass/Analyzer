import { TRACK_SLUGS } from "@/lib/fixtures/tracks";

export interface ScanRecord {
  scanId: string;
  trackSlug: string;
  paid: boolean;
  scannedAt: string;
}

/**
 * Scan identifiers.
 *
 * A scan id is a URL path segment (`/scan/[scanId]/preview`), so it must be
 * URL-safe with no escaping. Two forms exist:
 *
 *   scn_redline_a1b2c3            fixture track  (the six demo songs)
 *   scn_isrc-usjt11700482_a1b2c3  real track     (identified by ISRC)
 *
 * `decodeScanId` returns the SONG KEY, not the raw id. That key is what the
 * credit ledger counts distinctness on, so it must identify the song rather
 * than the scan — two scans of one ISRC yield the same key and therefore
 * cost one credit. For real songs the ISRC is that identity.
 *
 * Validation stays strict: an id decodes only to a known fixture slug or a
 * well-formed ISRC key. Arbitrary path input is still rejected, which is
 * what keeps the scan routes from becoming an open lookup surface.
 */

const SCAN_KEY = (id: string) => `chrp_scan_${id}`;
const SCAN_ID_RE = /^scn_([a-z0-9-]+)_[a-z0-9]{6}$/;

/** `isrc-usjt11700482` — the song-key form of a real ISRC. */
const ISRC_KEY_RE = /^isrc-([a-z0-9]{5,20})$/;

const ISRC_KEY_PREFIX = "isrc-";

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

/**
 * Normalize an ISRC the same way /api/song-api/analyze does: strip dashes
 * and spaces, uppercase, then require 5–20 alphanumerics. Keeping the two in
 * step means an id this module accepts is one the analyze route accepts.
 */
export function normalizeIsrc(input: string): string | null {
  const cleaned = input.replace(/[\s-]/g, "").toUpperCase();
  if (!/^[A-Z0-9]+$/.test(cleaned)) return null;
  if (cleaned.length < 5 || cleaned.length > 20) return null;
  return cleaned;
}

/** Fixture scan id for one of the six demo tracks. */
export function encodeScanId(trackSlug: string): string {
  return `scn_${trackSlug}_${rand6()}`;
}

/** Real scan id for a song identified by ISRC. Returns null if malformed. */
export function encodeIsrcScanId(isrc: string): string | null {
  const normalized = normalizeIsrc(isrc);
  if (!normalized) return null;
  return `scn_${ISRC_KEY_PREFIX}${normalized.toLowerCase()}_${rand6()}`;
}

/** True when this song key names one of the six bundled demo tracks. */
export function isFixtureKey(key: string): boolean {
  return TRACK_SLUGS.includes(key);
}

/**
 * The song key a scan id refers to, or null if the id is not well-formed.
 * Fixture ids yield their slug; real ids yield `isrc-<lowercased isrc>`.
 */
export function decodeScanId(scanId: string): string | null {
  const m = SCAN_ID_RE.exec(scanId);
  if (!m) return null;
  const key = m[1];
  if (isFixtureKey(key)) return key;
  if (ISRC_KEY_RE.test(key)) return key;
  return null;
}

/** The ISRC behind a real scan id, uppercased. Null for fixture scans. */
export function isrcFromScanId(scanId: string): string | null {
  const key = decodeScanId(scanId);
  if (!key) return null;
  return isrcFromKey(key);
}

/** The ISRC behind a song key, uppercased. Null for fixture keys. */
export function isrcFromKey(key: string): string | null {
  const m = ISRC_KEY_RE.exec(key);
  return m ? m[1].toUpperCase() : null;
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
