import { getScanById, updateScan } from "@/lib/scan-id";
import { TRACK_SLUGS } from "@/lib/fixtures/tracks";

export const MODE: "demo" | "production" =
  (typeof process !== "undefined" &&
    (process.env.NEXT_PUBLIC_MODE as "demo" | "production")) ||
  "demo";

export type ProductId =
  | "single"
  | "artist_catalog"
  | "extended_catalog"
  | "manager_roster"
  | "annual_unlimited";

export interface User {
  id: string;
  email: string | null;
  createdAt: string;
}

export interface CatalogPurchase {
  tier: ProductId;
  trackLimit: number | null; // null = unlimited
  tracksUsed: number;
  artistLimit: number | null; // null = unlimited
  expiresAt: string;
  purchasedAt: string;
}

export interface ScanRecordOnAccount {
  id: string;
  trackSlug: string;
  paid: boolean;
  scannedAt: string;
}

const USER_KEY = "chrp_user";
const SCANS_KEY = (uid: string) => `chrp_scans_${uid}`;
const CATALOG_KEY = (uid: string) => `chrp_catalog_${uid}`;
const PROFILE_SEEN_KEY = (uid: string) => `chrp_profile_seen_${uid}`;
const CATALOG_COMPLETE_SEEN_KEY = (uid: string) =>
  `chrp_catalog_complete_seen_${uid}`;

function ls(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<User | null> {
  if (MODE === "demo") {
    const s = ls();
    if (!s) return null;
    const raw = s.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  throw new Error("Production auth not yet connected");
}

export async function createUser(email: string | null): Promise<User> {
  if (MODE === "demo") {
    const s = ls();
    const user: User = {
      id: `usr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      email,
      createdAt: new Date().toISOString(),
    };
    s?.setItem(USER_KEY, JSON.stringify(user));
    return user;
  }
  throw new Error("Production auth not yet connected");
}

export async function setUserEmail(email: string): Promise<User | null> {
  if (MODE === "demo") {
    const s = ls();
    if (!s) return null;
    const user = await getCurrentUser();
    if (!user) return createUser(email);
    const updated: User = { ...user, email };
    s.setItem(USER_KEY, JSON.stringify(updated));
    return updated;
  }
  throw new Error("Production auth not yet connected");
}

export async function getOrCreateGuestUser(): Promise<User | null> {
  if (typeof window === "undefined") return null;
  const existing = await getCurrentUser();
  if (existing) return existing;
  return createUser(null);
}

// Deterministic remap of unknown track slugs to one of the current six. The
// scanId seeds the hash so a given scan record always lands on the same new
// slug across reloads. Used to migrate scans saved before the track-fixture
// rewrite without wiping user data.
function migrateUnknownSlug(scanId: string): string {
  const hash = Array.from(scanId).reduce(
    (acc, c) => (acc * 31 + c.charCodeAt(0)) >>> 0,
    0,
  );
  return TRACK_SLUGS[hash % TRACK_SLUGS.length];
}

function migrateScans(raw: ScanRecordOnAccount[]): {
  scans: ScanRecordOnAccount[];
  changed: boolean;
} {
  let changed = false;
  const scans = raw.map((s) => {
    if (TRACK_SLUGS.includes(s.trackSlug)) return s;
    changed = true;
    return { ...s, trackSlug: migrateUnknownSlug(s.id) };
  });
  return { scans, changed };
}

export async function getUserScans(userId: string): Promise<ScanRecordOnAccount[]> {
  if (MODE === "demo") {
    const s = ls();
    if (!s) return [];
    try {
      const raw: ScanRecordOnAccount[] = JSON.parse(
        s.getItem(SCANS_KEY(userId)) || "[]",
      );
      const { scans, changed } = migrateScans(raw);
      if (changed) {
        s.setItem(SCANS_KEY(userId), JSON.stringify(scans));
      }
      return scans;
    } catch {
      return [];
    }
  }
  throw new Error("Production accounts not yet connected");
}

export async function recordScan(
  userId: string,
  trackSlug: string,
  paid: boolean,
  scanId: string,
): Promise<ScanRecordOnAccount> {
  if (MODE === "demo") {
    const s = ls();
    const scan: ScanRecordOnAccount = {
      id: scanId,
      trackSlug,
      paid,
      scannedAt: new Date().toISOString(),
    };
    if (s) {
      const existing = await getUserScans(userId);
      // Deduplicate by scanId: replace if exists.
      const next = [...existing.filter((x) => x.id !== scanId), scan];
      s.setItem(SCANS_KEY(userId), JSON.stringify(next));
    }
    return scan;
  }
  throw new Error("Production accounts not yet connected");
}

export async function markScanPaid(
  userId: string,
  scanId: string,
): Promise<void> {
  if (MODE === "demo") {
    const s = ls();
    if (!s) return;
    const scans = await getUserScans(userId);
    const next = scans.map((x) => (x.id === scanId ? { ...x, paid: true } : x));
    s.setItem(SCANS_KEY(userId), JSON.stringify(next));
    const rec = getScanById(scanId);
    if (rec) updateScan(scanId, { paid: true });
    return;
  }
  throw new Error("Production accounts not yet connected");
}

export async function getUserCredits(
  userId: string,
): Promise<CatalogPurchase | null> {
  if (MODE === "demo") {
    const s = ls();
    if (!s) return null;
    try {
      return JSON.parse(s.getItem(CATALOG_KEY(userId)) || "null");
    } catch {
      return null;
    }
  }
  throw new Error("Production accounts not yet connected");
}

export async function setUserCatalogPurchase(
  userId: string,
  purchase: CatalogPurchase,
): Promise<void> {
  if (MODE === "demo") {
    const s = ls();
    s?.setItem(CATALOG_KEY(userId), JSON.stringify(purchase));
    return;
  }
  throw new Error("Production accounts not yet connected");
}

export async function consumeCatalogCredit(userId: string): Promise<boolean> {
  if (MODE === "demo") {
    const s = ls();
    if (!s) return false;
    const purchase = await getUserCredits(userId);
    if (!purchase) return false;
    if (purchase.trackLimit !== null && purchase.tracksUsed >= purchase.trackLimit) {
      return false;
    }
    const next: CatalogPurchase = {
      ...purchase,
      tracksUsed: purchase.tracksUsed + 1,
    };
    s.setItem(CATALOG_KEY(userId), JSON.stringify(next));
    return true;
  }
  throw new Error("Production accounts not yet connected");
}

export async function hasSeenProfileUnlock(userId: string): Promise<boolean> {
  const s = ls();
  if (!s) return true;
  return s.getItem(PROFILE_SEEN_KEY(userId)) === "1";
}

export async function markProfileUnlockSeen(userId: string): Promise<void> {
  const s = ls();
  s?.setItem(PROFILE_SEEN_KEY(userId), "1");
}

export async function hasSeenCatalogComplete(userId: string): Promise<boolean> {
  const s = ls();
  if (!s) return true;
  return s.getItem(CATALOG_COMPLETE_SEEN_KEY(userId)) === "1";
}

export async function markCatalogCompleteSeen(userId: string): Promise<void> {
  const s = ls();
  s?.setItem(CATALOG_COMPLETE_SEEN_KEY(userId), "1");
}

export async function clearAllUserData(): Promise<void> {
  const s = ls();
  if (!s) return;
  const user = await getCurrentUser();
  if (user) {
    s.removeItem(SCANS_KEY(user.id));
    s.removeItem(CATALOG_KEY(user.id));
    s.removeItem(PROFILE_SEEN_KEY(user.id));
    s.removeItem(CATALOG_COMPLETE_SEEN_KEY(user.id));
  }
  s.removeItem(USER_KEY);
}
