import { NextResponse } from "next/server";
import { soundchartsSongByIsrcSafe } from "@/lib/engine/analyze.server";
import { normalizeIsrc } from "@/lib/engine/analyze.server";
import { extractChristianContext } from "@/lib/rhodes/christian-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * TEMPORARY — Christian / Worship / Gospel context lens diagnostic.
 *
 * Read-only. Given an ISRC, this route fetches the same Soundcharts payload
 * the scan pipeline already consumes and returns two pieces of information:
 *
 *   - the raw genre root strings Soundcharts supplied for the song,
 *   - the derived tradition (worship / gospel / ccm / christian) or null.
 *
 * It exposes no CHRP measurement, no Rhodes output, no persisted data. Its
 * only purpose is to prove — on the actual production Soundcharts path —
 * that the gate opens on a known-Christian song and stays closed on a known
 * non-Christian song. It exists for the partition test in the shipping
 * brief and is removed as soon as that test passes.
 */
export async function GET(
  _req: Request,
  { params }: { params: { isrc: string } },
) {
  const isrc = normalizeIsrc(params.isrc);
  if (!isrc) {
    return NextResponse.json({ error: "invalid isrc" }, { status: 400 });
  }

  const song = await soundchartsSongByIsrcSafe(isrc);
  if (!song) {
    return NextResponse.json(
      { error: "soundcharts unavailable or not found for isrc", isrc },
      { status: 502 },
    );
  }

  const roots: string[] = [];
  const rawGenres = (song as { genres?: unknown }).genres;
  if (Array.isArray(rawGenres)) {
    for (const g of rawGenres) {
      if (g && typeof g === "object") {
        const root = (g as { root?: unknown }).root;
        if (typeof root === "string" && root.trim().length > 0) {
          roots.push(root.trim());
        }
      } else if (typeof g === "string" && g.trim().length > 0) {
        roots.push(g.trim());
      }
    }
  }

  const context = extractChristianContext(song);
  return NextResponse.json({
    isrc,
    songName: typeof song.name === "string" ? song.name : null,
    genres: rawGenres ?? null,
    genreRoots: roots,
    christianContext: context,
    gate: context ? "high" : "low",
  });
}
