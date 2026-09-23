import { NextResponse } from "next/server";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";
import { currentUserId } from "@/lib/commerce/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/scan/insight   { scanId, questionKey, answer }
 *
 * Stores a creator's answer from the interstitial moment screen.
 *
 * Best-effort, fire-and-forget from the client. The answer is stored on the
 * creator's row as JSONB so it can inform future features (creator role,
 * discovery source, intent) without a new table or migration.
 *
 * If the `context` column does not exist yet the upsert fails silently —
 * the interstitial still works, it just does not persist the answer until
 * the migration runs.
 */
export async function POST(req: Request) {
  if (!adminConfigured()) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  let body: { scanId?: unknown; questionKey?: unknown; answer?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const { scanId, questionKey, answer } = body;
  if (
    typeof scanId !== "string" ||
    typeof questionKey !== "string" ||
    typeof answer !== "string"
  ) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const db = createAdminClient();

  try {
    // Merge into the creator's context JSONB, preserving any existing keys.
    // The column may not exist yet (pre-migration); the catch handles that.
    const { error } = await db.rpc("merge_creator_context", {
      p_user_id: userId,
      p_context: { [questionKey]: answer, [`${questionKey}_scan`]: scanId },
    });

    if (error) {
      // Fallback: try a direct update. If the column doesn't exist, this
      // also fails — and that's fine. The interstitial still did its job.
      console.warn(`[api/scan/insight] rpc failed, trying direct update:`, error.message);
      await db
        .from("creators")
        .update({
          context: { [questionKey]: answer, [`${questionKey}_scan`]: scanId },
        } as Record<string, unknown>)
        .eq("id", userId);
    }
  } catch (err) {
    // Never blocks the experience. Log and move on.
    console.warn(`[api/scan/insight] could not store insight for ${userId}:`, err);
  }

  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
