import { NextResponse } from "next/server";
import { createAdminClient, adminConfigured } from "@/lib/supabase/admin";
import {
  currentUserId,
  currentCreditSummary,
  unlockedScansFor,
} from "@/lib/commerce/entitlements";
import { getCatalog } from "@/lib/memory/catalog.server";
import { OFFERS } from "@/lib/commerce/offers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/catalog — the caller's own songs and their authoritative balance.
 *
 * This is what makes the memory layer invisible: after a magic link on a new
 * browser, the dashboard calls this and everything the creator has ever
 * analysed is simply there. No re-entry, no re-scan, no questions.
 *
 * Every scanned song is here, paid for or not. Each entry carries
 * `entitled`: whether the full report will open for this caller, decided by
 * the same rules the report route applies. A locked entry exposes only what
 * the free reveal already showed (song, EPI, mode, the four dimensions, the
 * circumplex) — no report content is read, let alone returned, by this
 * route. `unlock` names the offer and its price so the library's "Unlock"
 * action shows the server's price rather than a number typed into the UI.
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
    const [songs, credits] = await Promise.all([
      getCatalog(db, userId),
      currentCreditSummary(),
    ]);
    const unlocked = await unlockedScansFor(userId, songs);
    const catalog = songs.map((song) => ({
      ...song,
      entitled: unlocked.has(song.scanId),
    }));
    const offer = OFFERS.song_intelligence;

    return NextResponse.json(
      {
        catalog,
        credits,
        identified: true,
        unlock: {
          offer: offer.key,
          amountCents: offer.expectedAmountCents,
          currency: offer.expectedCurrency,
        },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err) {
    console.error("[api/catalog] read failed:", err);
    return NextResponse.json({ error: "catalog_unavailable" }, { status: 503 });
  }
}
