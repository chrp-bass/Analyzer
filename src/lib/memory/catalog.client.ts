"use client";

import type { CatalogPurchase, ScanRecordOnAccount } from "@/lib/accounts";

/**
 * Client-side reader for the server's memory layer.
 *
 * The server is the authority. This module only asks it what it knows and
 * translates the answer into the shapes the existing dashboard renders — it
 * computes nothing, and it never lets a browser value stand in for a balance.
 *
 * localStorage survives strictly as a development convenience: when Supabase
 * is not configured (local demo work), the old browser-backed catalog still
 * renders so the flow is exercisable. In production that fallback is
 * unreachable, so a cleared or forged localStorage cannot manufacture a
 * credit, a scan, or an entitlement.
 */

export interface ServerCatalogEntry {
  scanId: string;
  trackKey: string;
  title: string;
  artistName: string | null;
  epiScore: number | null;
  mode: string | null;
  /** The four measured dimensions, as persisted with the analysis. */
  scores?: unknown;
  analyzedAt: string | null;
  status: "pending" | "complete" | "failed";
  /**
   * Will the full report open for this caller? Decided on the server by the
   * same rules the report route applies. Absent reads as locked.
   */
  entitled?: boolean;
}

/** The offer a locked song is unlocked with, as the server prices it. */
export interface ServerUnlockOffer {
  offer: "song_intelligence";
  amountCents: number;
  currency: string;
}

/** "$19" from the server's offer. Null when it cannot be stated honestly. */
export function formatUnlockPrice(
  unlock: ServerUnlockOffer | null | undefined,
): string | null {
  if (
    !unlock ||
    typeof unlock.amountCents !== "number" ||
    !Number.isFinite(unlock.amountCents) ||
    unlock.amountCents <= 0 ||
    `${unlock.currency}`.toLowerCase() !== "usd"
  ) {
    return null;
  }
  const dollars = unlock.amountCents / 100;
  return `$${Number.isInteger(dollars) ? dollars : dollars.toFixed(2)}`;
}

export interface ServerCredits {
  limit: number;
  used: number;
  remaining: number;
  expiresAt: string;
  expired: boolean;
}

export interface CatalogState {
  /** True when the server answered for a verified identity. */
  identified: boolean;
  scans: ScanRecordOnAccount[];
  credits: CatalogPurchase | null;
  /**
   * What the server knows about each song, by scan id. A real song is not in
   * the bundled fixture catalogue, so this — not a fixture lookup — is the
   * only source of its title, artist, EPI, mode and shape in My Songs.
   */
  entries: Record<string, ServerCatalogEntry>;
  /** Display price for unlocking one song, e.g. "$19". */
  unlockPrice: string | null;
}

/** True only in local development, where the demo fallback is permitted. */
export function demoFallbackAllowed(): boolean {
  return process.env.NODE_ENV !== "production";
}

const EMPTY: CatalogState = {
  identified: false,
  scans: [],
  credits: null,
  entries: {},
  unlockPrice: null,
};

/**
 * Fetch the caller's catalog and authoritative balance.
 *
 * Returns `identified: false` when there is no server-verified session or the
 * memory layer is unconfigured — the caller then decides whether the demo
 * fallback is permitted.
 */
export async function fetchServerCatalog(): Promise<CatalogState> {
  try {
    const res = await fetch("/api/catalog", { cache: "no-store" });
    if (!res.ok) return EMPTY;

    const body = (await res.json()) as {
      catalog?: ServerCatalogEntry[];
      credits?: ServerCredits | null;
      identified?: boolean;
      unlock?: ServerUnlockOffer | null;
    };

    if (!body.identified) return EMPTY;

    const complete = (body.catalog ?? []).filter((e) => e.status === "complete");
    const entries: Record<string, ServerCatalogEntry> = {};
    for (const e of complete) entries[e.scanId] = e;

    const scans: ScanRecordOnAccount[] = complete
      .map((e) => ({
        id: e.scanId,
        trackSlug: e.trackKey,
        // Every scanned song is in the catalog, paid for or not, so presence
        // is not the paid signal — the server's `entitled` is. It gates
        // nothing here: opening a row asks /api/report, which answers from
        // entitlements alone.
        paid: e.entitled === true,
        scannedAt: e.analyzedAt ?? new Date(0).toISOString(),
      }));

    const c = body.credits;
    const credits: CatalogPurchase | null = c
      ? {
          tier: "artist_catalog",
          trackLimit: c.limit,
          tracksUsed: c.used,
          artistLimit: 1,
          expiresAt: c.expiresAt,
          purchasedAt: "",
        }
      : null;

    return {
      identified: true,
      scans,
      credits,
      entries,
      unlockPrice: formatUnlockPrice(body.unlock),
    };
  } catch {
    return EMPTY;
  }
}
