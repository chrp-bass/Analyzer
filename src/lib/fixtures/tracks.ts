export type Mode = "Ready" | "Recover" | "Recharge" | "Flow";
export type RankClass = "high" | "mid" | "low";
export type Confidence = "High" | "Moderate" | "Preliminary" | null;

export interface ScoreRow {
  name: string;
  score: number;
  rank: string;
  rank_class: RankClass;
  anchor: string;
}

export interface Placement {
  title: string;
  body: string;
}

export interface Vertical {
  name: string;
  pct: number;
}

/**
 * The free reveal payload. This is the ONLY report data permitted in the
 * public client bundle: EPI score, mode, the four dimensions, the human
 * performance variables and one emotional-signature statement.
 *
 * Everything a customer pays for lives in PaidSections, in a server-only
 * module, and reaches the browser only after the server has verified an
 * entitlement.
 */
export interface FreeReport {
  report_meta: {
    id: string;
    version: string;
    scanned_at: string;
    scanned_at_display: string;
  };
  track: {
    title: string;
    artist: string;
    isrc: string;
    /**
     * Cover art for the resolved song, when the engine supplied one.
     * Optional: the bundled demo tracks have no artwork, and a real song
     * may legitimately have none. Absent means "show nothing", never
     * "substitute something that looks real".
     */
    artworkUrl?: string | null;
  };
  epi: {
    score: number;
    mode: Mode;
    rank_in_mode: string;
    rank_overall: string;
  };
  chrp_scores: ScoreRow[];
  hpv: ScoreRow[];
  creator: {
    name: string;
    tracks_scored: number;
    tease: string;
  };
  /** One concise statement — the free tier's share of the signature. */
  free_statement: string;
}

/** Paid intelligence. Server-only; see fixtures/tracks.paid.ts. */
export interface PaidSections {
  rhodes: string;
  signature: string;
  placements: Placement[];
  throughline: string;
  comparable: string;
  where_this_music_lives: {
    verticals: Vertical[];
    confidence: "high" | "moderate" | "preliminary" | null;
    n_briefs: number | null;
    sample_brief: string | null;
  };
}

/** The complete report: free reveal plus paid intelligence. */
export type ReportPayload = FreeReport & PaidSections;

export const freeReports: Record<string, FreeReport> = {
  redline: {
    report_meta: {
      id: "RDL-052026-VB",
      version: "v1.0",
      scanned_at: "2026-05-20T09:14:00-06:00",
      scanned_at_display: "2026.05.20  //  09:14 CST",
    },
    track: {
      title: "Redline",
      artist: "Voss Black",
      isrc: "GBUM72600412",
    },
    epi: {
      score: 91,
      mode: "Ready",
      rank_in_mode: "Top 4%",
      rank_overall: "Top 3%",
    },
    chrp_scores: [
      { name: "Focus", score: 84, rank: "Top 11%", rank_class: "high", anchor: "sustained-intensity cues" },
      { name: "Balance", score: 52, rank: "Top 44%", rank_class: "mid", anchor: "single-use placements" },
      { name: "Motivation", score: 96, rank: "Top 1%", rank_class: "high", anchor: "apex performance only" },
      { name: "Calm", score: 21, rank: "Btm 9%", rank_class: "low", anchor: "avoid all restorative use" },
    ],
    hpv: [
      { name: "Focus", score: 84, rank: "Top 11%", rank_class: "high", anchor: "high-stakes execution" },
      { name: "Recovery", score: 14, rank: "Btm 6%", rank_class: "low", anchor: "not for recovery use" },
      { name: "Flow", score: 71, rank: "Top 22%", rank_class: "high", anchor: "competitive flow states" },
      { name: "Rest", score: 9, rank: "Btm 4%", rank_class: "low", anchor: "not for wind-down" },
    ],
    creator: {
      name: "Voss Black",
      tracks_scored: 1,
      tease:
        "your emotional consistency profile and identify your strongest pitch-priority tracks.",
    },
    free_statement:
      "A relentless launch sequence built for the apex moment.",
  },
  "sea-glass": {
    report_meta: {
      id: "SGL-052026-MQ",
      version: "v1.0",
      scanned_at: "2026-05-20T10:22:00-06:00",
      scanned_at_display: "2026.05.20  //  10:22 CST",
    },
    track: {
      title: "Sea Glass",
      artist: "Mara Quinn",
      isrc: "USWD12600089",
    },
    epi: {
      score: 76,
      mode: "Recharge",
      rank_in_mode: "Top 11%",
      rank_overall: "Top 14%",
    },
    chrp_scores: [
      { name: "Focus", score: 61, rank: "Top 38%", rank_class: "mid", anchor: "gentle attention" },
      { name: "Balance", score: 88, rank: "Top 7%", rank_class: "high", anchor: "multi-context flexible" },
      { name: "Motivation", score: 49, rank: "Btm 45%", rank_class: "low", anchor: "avoid performance contexts" },
      { name: "Calm", score: 82, rank: "Top 18%", rank_class: "high", anchor: "wellness + intimate + travel" },
    ],
    hpv: [
      { name: "Focus", score: 61, rank: "Top 38%", rank_class: "mid", anchor: "soft focus, reflective" },
      { name: "Recovery", score: 74, rank: "Top 26%", rank_class: "high", anchor: "restorative contexts" },
      { name: "Flow", score: 58, rank: "Top 40%", rank_class: "mid", anchor: "gentle rhythm" },
      { name: "Rest", score: 78, rank: "Top 21%", rank_class: "high", anchor: "sleep + wind-down" },
    ],
    creator: {
      name: "Mara Quinn",
      tracks_scored: 1,
      tease:
        "your emotional consistency profile, signature pattern, and creator reliability score.",
    },
    free_statement:
      "Warm, restorative, and structurally balanced.",
  },
  "after-the-fire": {
    report_meta: {
      id: "ATF-052026-SG",
      version: "v1.0",
      scanned_at: "2026-05-20T11:08:00-06:00",
      scanned_at_display: "2026.05.20  //  11:08 CST",
    },
    track: {
      title: "After the Fire",
      artist: "Stellan Grey",
      isrc: "GBUM72600588",
    },
    epi: {
      score: 88,
      mode: "Recover",
      rank_in_mode: "Top 6%",
      rank_overall: "Top 7%",
    },
    chrp_scores: [
      { name: "Focus", score: 58, rank: "Top 42%", rank_class: "mid", anchor: "works under dialogue" },
      { name: "Balance", score: 77, rank: "Top 16%", rank_class: "high", anchor: "emotionally flexible" },
      { name: "Motivation", score: 34, rank: "Btm 28%", rank_class: "low", anchor: "avoid performance use" },
      { name: "Calm", score: 84, rank: "Top 14%", rank_class: "high", anchor: "prestige + memorial" },
    ],
    hpv: [
      { name: "Focus", score: 58, rank: "Top 42%", rank_class: "mid", anchor: "contemplative attention" },
      { name: "Recovery", score: 91, rank: "Top 4%", rank_class: "high", anchor: "deep recovery" },
      { name: "Flow", score: 29, rank: "Btm 32%", rank_class: "low", anchor: "not for rhythmic use" },
      { name: "Rest", score: 86, rank: "Top 8%", rank_class: "high", anchor: "sleep + deep rest" },
    ],
    creator: {
      name: "Stellan Grey",
      tracks_scored: 1,
      tease:
        "your creator profile — emotional consistency, signature pattern, and catalog reliability score.",
    },
    free_statement:
      "A song that arrives after the hard part.",
  },
  "copper-static": {
    report_meta: {
      id: "CST-052026-NP",
      version: "v1.0",
      scanned_at: "2026-05-20T13:41:00-06:00",
      scanned_at_display: "2026.05.20  //  13:41 CST",
    },
    track: {
      title: "Copper Static",
      artist: "Nadia Park",
      isrc: "USWD12600214",
    },
    epi: {
      score: 82,
      mode: "Flow",
      rank_in_mode: "Top 10%",
      rank_overall: "Top 9%",
    },
    chrp_scores: [
      { name: "Focus", score: 78, rank: "Top 17%", rank_class: "high", anchor: "sustained attention" },
      { name: "Balance", score: 91, rank: "Top 5%", rank_class: "high", anchor: "multi-context premium" },
      { name: "Motivation", score: 62, rank: "Top 34%", rank_class: "mid", anchor: "not for performance use" },
      { name: "Calm", score: 55, rank: "Top 42%", rank_class: "mid", anchor: "premium lifestyle range" },
    ],
    hpv: [
      { name: "Focus", score: 78, rank: "Top 17%", rank_class: "high", anchor: "creative deep work" },
      { name: "Recovery", score: 52, rank: "Top 44%", rank_class: "mid", anchor: "moderate restoration" },
      { name: "Flow", score: 88, rank: "Top 10%", rank_class: "high", anchor: "creative flow states" },
      { name: "Rest", score: 44, rank: "Btm 44%", rank_class: "low", anchor: "not for wind-down" },
    ],
    creator: {
      name: "Nadia Park",
      tracks_scored: 1,
      tease:
        "your creator profile — signature pattern, emotional consistency, and catalog reliability score.",
    },
    free_statement:
      "Moves without announcing itself.",
  },
  "white-heat": {
    report_meta: {
      id: "WHT-052026-JR",
      version: "v1.0",
      scanned_at: "2026-05-20T14:55:00-06:00",
      scanned_at_display: "2026.05.20  //  14:55 CST",
    },
    track: {
      title: "White Heat",
      artist: "Juno Riis",
      isrc: "GBUM72600741",
    },
    epi: {
      score: 87,
      mode: "Ready",
      rank_in_mode: "Top 8%",
      rank_overall: "Top 6%",
    },
    chrp_scores: [
      { name: "Focus", score: 74, rank: "Top 21%", rank_class: "high", anchor: "directional attention" },
      { name: "Balance", score: 68, rank: "Top 28%", rank_class: "mid", anchor: "cross-context ready" },
      { name: "Motivation", score: 89, rank: "Top 8%", rank_class: "high", anchor: "fashion + lifestyle energy" },
      { name: "Calm", score: 39, rank: "Btm 38%", rank_class: "low", anchor: "avoid wellness use" },
    ],
    hpv: [
      { name: "Focus", score: 74, rank: "Top 21%", rank_class: "high", anchor: "social presence" },
      { name: "Recovery", score: 22, rank: "Btm 14%", rank_class: "low", anchor: "not for restoration" },
      { name: "Flow", score: 84, rank: "Top 14%", rank_class: "high", anchor: "social flow states" },
      { name: "Rest", score: 18, rank: "Btm 11%", rank_class: "low", anchor: "not for wind-down" },
    ],
    creator: {
      name: "Juno Riis",
      tracks_scored: 1,
      tease:
        "your creator profile — signature pattern, emotional consistency, and reliability score across your body of work.",
    },
    free_statement:
      "Social-energy Ready mode.",
  },
  "hollow-meridian": {
    report_meta: {
      id: "HMD-052026-TC",
      version: "v1.0",
      scanned_at: "2026-05-20T16:18:00-06:00",
      scanned_at_display: "2026.05.20  //  16:18 CST",
    },
    track: {
      title: "Hollow Meridian",
      artist: "The Common Thread",
      isrc: "USWD12600367",
    },
    epi: {
      score: 79,
      mode: "Flow",
      rank_in_mode: "Top 18%",
      rank_overall: "Top 16%",
    },
    chrp_scores: [
      { name: "Focus", score: 86, rank: "Top 9%", rank_class: "high", anchor: "sustained deep attention" },
      { name: "Balance", score: 84, rank: "Top 11%", rank_class: "high", anchor: "luxury + premium contexts" },
      { name: "Motivation", score: 55, rank: "Top 42%", rank_class: "mid", anchor: "avoid performance use" },
      { name: "Calm", score: 62, rank: "Top 34%", rank_class: "mid", anchor: "documentary + design" },
    ],
    hpv: [
      { name: "Focus", score: 86, rank: "Top 9%", rank_class: "high", anchor: "deep focus states" },
      { name: "Recovery", score: 49, rank: "Btm 48%", rank_class: "low", anchor: "moderate recovery only" },
      { name: "Flow", score: 91, rank: "Top 8%", rank_class: "high", anchor: "creative flow states" },
      { name: "Rest", score: 56, rank: "Top 42%", rank_class: "mid", anchor: "light rest contexts" },
    ],
    creator: {
      name: "The Common Thread",
      tracks_scored: 1,
      tease:
        "your creator profile — emotional consistency, signature pattern, and creator reliability score.",
    },
    free_statement:
      "Cinematic stillness at high resolution.",
  },
};

export const trackOptions: Array<{
  id: string;
  label: string;
  hint: string;
}> = [
  { id: "redline", label: "Redline", hint: "Voss Black  //  Ready" },
  { id: "sea-glass", label: "Sea Glass", hint: "Mara Quinn  //  Recharge" },
  { id: "after-the-fire", label: "After the Fire", hint: "Stellan Grey  //  Recover" },
  { id: "copper-static", label: "Copper Static", hint: "Nadia Park  //  Flow" },
  { id: "white-heat", label: "White Heat", hint: "Juno Riis  //  Ready" },
  { id: "hollow-meridian", label: "Hollow Meridian", hint: "The Common Thread  //  Flow" },
];

export const TRACK_SLUGS = trackOptions.map((t) => t.id);

/**
 * Free-tier lookup. Returns only what the free reveal is entitled to.
 * The paid report is assembled server-side by getFullReport() in
 * @/lib/fixtures/report.server.
 */
export function getFreeReportById(id: string): FreeReport | null {
  return freeReports[id] ?? null;
}

export function pickRandomTrackSlug(): string {
  return TRACK_SLUGS[Math.floor(Math.random() * TRACK_SLUGS.length)];
}

// Keyword → slug map used by the scan input parser. Order doesn't matter;
// the longest-match-wins behavior comes from how resolveTrackSlug iterates.
export const TRACK_KEYWORD_MAP: Record<string, string> = {
  redline: "redline",
  voss: "redline",
  esports: "redline",
  gaming: "redline",
  sea: "sea-glass",
  glass: "sea-glass",
  mara: "sea-glass",
  quinn: "sea-glass",
  wellness: "sea-glass",
  folk: "sea-glass",
  after: "after-the-fire",
  fire: "after-the-fire",
  stellan: "after-the-fire",
  grey: "after-the-fire",
  cinematic: "after-the-fire",
  copper: "copper-static",
  static: "copper-static",
  nadia: "copper-static",
  park: "copper-static",
  soul: "copper-static",
  groove: "copper-static",
  white: "white-heat",
  heat: "white-heat",
  juno: "white-heat",
  riis: "white-heat",
  fashion: "white-heat",
  pop: "white-heat",
  hollow: "hollow-meridian",
  meridian: "hollow-meridian",
  common: "hollow-meridian",
  thread: "hollow-meridian",
  ambient: "hollow-meridian",
  documentary: "hollow-meridian",
};

export function resolveTrackSlug(input: string): string {
  const lower = input.toLowerCase().trim();
  if (!lower) return pickRandomTrackSlug();
  for (const [keyword, slug] of Object.entries(TRACK_KEYWORD_MAP)) {
    if (lower.includes(keyword)) return slug;
  }
  return pickRandomTrackSlug();
}

// Back-compat alias for older call sites.
export const matchInputToReportId = resolveTrackSlug;

// mychrp.ai mode palette. chipBg + polygonFill share the same hue per mode
// so the badge and the radar fill always match.
export const MODE_COLORS: Record<
  Mode,
  { chipBg: string; chipText: string; polygonFill: string }
> = {
  Ready: {
    chipBg: "var(--mode-ready-bg)",
    chipText: "var(--mode-ready-fg)",
    polygonFill: "var(--mode-ready-fill)",
  },
  Flow: {
    chipBg: "var(--mode-flow-bg)",
    chipText: "var(--mode-flow-fg)",
    polygonFill: "var(--mode-flow-fill)",
  },
  Recharge: {
    chipBg: "var(--mode-recharge-bg)",
    chipText: "var(--mode-recharge-fg)",
    polygonFill: "var(--mode-recharge-fill)",
  },
  Recover: {
    chipBg: "var(--mode-recover-bg)",
    chipText: "var(--mode-recover-fg)",
    polygonFill: "var(--mode-recover-fill)",
  },
};
