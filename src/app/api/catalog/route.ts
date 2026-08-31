import { NextResponse } from "next/server";
import { createAdminClient, adminConfigured } from "@/lib/supabase/admin";
import {
  currentUserId,
  currentCreditSummary,
} from "@/lib/commerce/entitlements";
import { getCatalog } from "@/lib/memory/catalog.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/catalog — the caller's own songs and their authoritative balance.
 *
 * This is what makes the memory layer invisible: after a magic link on a new
 * browser, the dashboard calls this and everything the creator has ever
 * analysed is simply there. No re-entry, no re-scan, no questions.
 *
 * The identity comes from the session cookie and nothing else. There is no
 * user id parameter to tamper with, so one creator can never read another's
 * catalog — the query is filtered by the id the cookie proved, and RLS backs
 * that up underneath.
 */
export async function GET() {
  if (!adminConfigured()) {
    return NextResponse.json(
      { error: "catalog_unavailable" },
      { status: 503 },
    );
  }

  const userId = await currentUserId();
  if (!userId) {
    // No session: an empty catalog, not an error. A first-time visitor has
    // nothing to remember yet.
    return NextResponse.json(
      { catalog: [], credits: null, identified: false },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  try {
    const db = createAdminClient();
    const [catalog, credits] = await Promise.all([
      getCatalog(db, userId),
      currentCreditSummary(),
    ]);

    return NextResponse.json(
      { catalog, credits, identified: true },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err) {
    console.error("[api/catalog] read failed:", err);
    return NextResponse.json({ error: "catalog_unavailable" }, { status: 503 });
  }
}
