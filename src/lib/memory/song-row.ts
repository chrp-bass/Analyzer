import {
  getFreeReportById,
  MODE_COLORS,
  type Mode,
} from "@/lib/fixtures/tracks";
import { polygonFromChrpScores, type PolygonVertices } from "@/lib/polygon";
import type { ScanRecordOnAccount } from "@/lib/accounts";
import type { ServerCatalogEntry } from "@/lib/memory/catalog.client";

/**
 * What one row of My Songs displays.
 *
 * The list used to resolve every song through the bundled fixture catalogue
 * and silently drop whatever it could not find. A real song is keyed by its
 * ISRC and is never in that catalogue — so a real creator's real songs were
 * all dropped, and My Songs was empty no matter what the server returned.
 *
 * The server's own record of the song is now the source. The fixture lookup
 * survives only for the six bundled demo tracks in local development.
 */
export interface SongRow {
  title: string;
  artist: string | null;
  /** Rounded for display, the same way the reveal shows it. */
  epiScore: number | null;
  mode: Mode | null;
  /** The measured shape, when all four dimensions are on file. */
  vertices: PolygonVertices | null;
}

function isMode(value: unknown): value is Mode {
  return typeof value === "string" && value in MODE_COLORS;
}

function verticesFrom(scores: unknown): PolygonVertices | null {
  if (!scores || typeof scores !== "object") return null;
  const s = scores as Record<string, unknown>;
  const pick = (k: string) =>
    typeof s[k] === "number" && Number.isFinite(s[k] as number)
      ? (s[k] as number)
      : null;
  const focus = pick("focus");
  const balance = pick("balance");
  const motivation = pick("motivation");
  const calm = pick("calm");
  if (focus === null || balance === null || motivation === null || calm === null) {
    return null;
  }
  return { focus, balance, motivation, calm };
}

export function songRowFor(
  scan: Pick<ScanRecordOnAccount, "id" | "trackSlug">,
  entries: Record<string, ServerCatalogEntry>,
): SongRow | null {
  const entry = entries[scan.id];
  if (entry) {
    return {
      title: entry.title,
      artist: entry.artistName,
      epiScore:
        typeof entry.epiScore === "number" ? Math.round(entry.epiScore) : null,
      mode: isMode(entry.mode) ? entry.mode : null,
      vertices: verticesFrom(entry.scores),
    };
  }

  const fixture = getFreeReportById(scan.trackSlug);
  if (fixture) {
    return {
      title: fixture.track.title,
      artist: fixture.track.artist,
      epiScore: fixture.epi.score,
      mode: fixture.epi.mode,
      vertices: polygonFromChrpScores(fixture.chrp_scores),
    };
  }

  return null;
}
