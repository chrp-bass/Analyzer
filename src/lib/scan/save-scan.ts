/**
 * Saving a free reveal to My Songs — the browser half.
 *
 * The server decides everything that matters: who is saving (the session
 * cookie) and what is saved (its own analysis of the song). This module only
 * asks, and remembers one thing across a sign-in.
 *
 * THE ONE THING IT REMEMBERS. When the address a creator types already
 * belongs to an existing identity, `linkEmail` does not attach it to the
 * anonymous identity in this browser — it emails a sign-in link for the
 * existing one, so two histories are never merged. The song was just saved
 * under the anonymous identity, which the creator is about to leave behind.
 * The pending marker lets My Songs finish the job under the identity they
 * actually arrive as. It carries a scan id and nothing else: no score, no
 * identity, no authority. The server re-derives everything from its own
 * analysis, and the save is idempotent, so a stale or forged marker can do
 * no more than add a song to the caller's own list.
 */

const PENDING_KEY = "chrp_pending_save";
const SCAN_ID_RE = /^scn_[a-z0-9-]+_[a-z0-9]{6}$/;
const MAX_PENDING = 10;

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readPending(): string[] {
  try {
    const raw = storage()?.getItem(PENDING_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list)
      ? list.filter((s): s is string => typeof s === "string" && SCAN_ID_RE.test(s))
      : [];
  } catch {
    return [];
  }
}

function writePending(list: string[]): void {
  try {
    const s = storage();
    if (!s) return;
    if (list.length === 0) s.removeItem(PENDING_KEY);
    else s.setItem(PENDING_KEY, JSON.stringify(list.slice(-MAX_PENDING)));
  } catch {
    // Storage unavailable — the save under the current identity still stands.
  }
}

export type SaveScanResult =
  | { ok: true }
  | { ok: false; reason: "no_identity" | "unavailable" };

/** Persist this scan's free analysis under the current identity. Never throws. */
export async function saveScanToMySongs(scanId: string): Promise<SaveScanResult> {
  try {
    const res = await fetch("/api/scan/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scanId }),
    });
    if (res.status === 401) return { ok: false, reason: "no_identity" };
    if (!res.ok) return { ok: false, reason: "unavailable" };
    const body = (await res.json()) as { status?: string };
    // A bundled sample track is not a creator's song; there is nothing to
    // save and nothing wrong.
    return body.status === "saved" || body.status === "not_eligible"
      ? { ok: true }
      : { ok: false, reason: "unavailable" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

/** Remember a save that must be completed after the creator signs in. */
export function rememberPendingSave(scanId: string): void {
  if (!SCAN_ID_RE.test(scanId)) return;
  const list = readPending().filter((s) => s !== scanId);
  list.push(scanId);
  writePending(list);
}

/**
 * Complete any remembered saves under whoever this browser is NOW. Called by
 * My Songs before it reads the catalog. A save that fails for want of an
 * identity is kept for the next visit; anything else is dropped rather than
 * retried forever.
 */
export async function flushPendingSaves(): Promise<void> {
  const pending = readPending();
  if (pending.length === 0) {
    // Nothing valid to do — and clear anything invalid that was sitting there.
    if (storage()?.getItem(PENDING_KEY) != null) writePending([]);
    return;
  }
  const keep: string[] = [];
  for (const scanId of pending) {
    const result = await saveScanToMySongs(scanId);
    if (!result.ok && result.reason === "no_identity") keep.push(scanId);
  }
  writePending(keep);
}
