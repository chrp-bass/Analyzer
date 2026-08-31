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
  analyzedAt: string | null;
  status: "pending" | "complete" | "failed";
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
}

/** True only in local development, where the demo fallback is permitted. */
export function demoFallbackAllowed(): boolean {
  return process.env.NODE_ENV !== "production";
}

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
    if (!res.ok) return { identified: false, scans: [], credits: null };

    const body = (await res.json()) as {
      catalog?: ServerCatalogEntry[];
      credits?: ServerCredits | null;
      identified?: boolean;
    };

    if (!body.identified) return { identified: false, scans: [], credits: null };

    const scans: ScanRecordOnAccount[] = (body.catalog ?? [])
      .filter((e) => e.status === "complete")
      .map((e) => ({
        id: e.scanId,
        trackSlug: e.trackKey,
        // Every persisted analysis reached the catalog through an entitlement,
        // so presence here IS the paid signal — not a browser flag.
        paid: true,
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

    return { identified: true, scans, credits };
  } catch {
    return { identified: false, scans: [], credits: null };
  }
}
