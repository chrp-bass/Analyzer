import { TRACK_SLUGS, pickRandomTrackSlug } from "@/lib/fixtures/tracks";

export type Stage = "reveal" | "paywall-preview" | "unlocked" | "creator-profile";
export type Format = "web" | "pdf";

export interface RendererParams {
  track: string;
  stage: Stage;
  embed: boolean;
  artist: string | null;
  scans: number;
  format: Format;
}

const STAGES: Stage[] = ["reveal", "paywall-preview", "unlocked", "creator-profile"];
const FORMATS: Format[] = ["web", "pdf"];

export function parseParams(
  search: URLSearchParams | Record<string, string | string[] | undefined>,
): RendererParams {
  const get = (k: string): string | undefined => {
    if (search instanceof URLSearchParams) {
      return search.get(k) ?? undefined;
    }
    const v = search[k];
    if (Array.isArray(v)) return v[0];
    return v;
  };

  const rawTrack = (get("track") ?? "").toLowerCase();
  const track =
    rawTrack && TRACK_SLUGS.includes(rawTrack) ? rawTrack : pickRandomTrackSlug();

  const rawStage = (get("stage") ?? "unlocked") as Stage;
  const stage: Stage = STAGES.includes(rawStage) ? rawStage : "unlocked";

  const embed = get("embed") === "true";

  const artistRaw = get("artist");
  const artist = artistRaw ? decodeURIComponent(artistRaw) : null;

  const scansRaw = Number(get("scans"));
  const scans = Number.isFinite(scansRaw)
    ? Math.max(0, Math.min(15, Math.floor(scansRaw)))
    : 1;

  const rawFormat = (get("format") ?? "web") as Format;
  const format: Format = FORMATS.includes(rawFormat) ? rawFormat : "web";

  return { track, stage, embed, artist, scans, format };
}
