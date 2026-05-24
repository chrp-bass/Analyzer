import { Mode } from "@/lib/fixtures/tracks";

export interface CreatorMetric {
  score: number;
  label: string;
}

export interface PitchPriority {
  scan_id: string;
  track_title: string;
  epi_score: number;
  mode: Mode;
  polygon: { focus: number; balance: number; motivation: number; calm: number };
  reason: string;
}

export interface CreatorProfilePayload {
  creator: {
    name: string;
    tracks_scored: number;
    scanned_at_range: [string, string];
    generated_display: string;
  };
  signature: {
    polygon: { focus: number; balance: number; motivation: number; calm: number };
    dominant_mode: Mode;
  };
  metrics: {
    emotional_consistency: CreatorMetric | null;
    signature_strength: CreatorMetric | null;
    reliability_index: CreatorMetric | null;
  };
  mode_distribution: {
    Flow: number;
    Ready: number;
    Recharge: number;
    Recover: number;
  };
  pitch_priorities: PitchPriority[];
}

// Single shared default creator profile per the demo brief. Every track slug
// resolves to this profile in the closed-loop demo, with the live scan count
// overridden from the user's actual scan history at render time.
const DEFAULT_PROFILE: CreatorProfilePayload = {
  creator: {
    name: "Your catalog",
    tracks_scored: 8,
    scanned_at_range: ["2026-05-17", "2026-05-20"],
    generated_display: "2026.05.20",
  },
  signature: {
    polygon: { focus: 78, balance: 81, motivation: 73, calm: 54 },
    dominant_mode: "Flow",
  },
  metrics: {
    emotional_consistency: { score: 81, label: "Highly consistent" },
    signature_strength: { score: 76, label: "Distinctive" },
    reliability_index: { score: 83, label: "Highly reliable" },
  },
  mode_distribution: { Flow: 42, Ready: 33, Recharge: 17, Recover: 8 },
  pitch_priorities: [
    {
      scan_id: "scn_copper-static",
      track_title: "Copper Static",
      epi_score: 82,
      mode: "Flow",
      polygon: { focus: 78, balance: 91, motivation: 62, calm: 55 },
      reason:
        "Balance top 5% — strongest brief alignment in premium brand this week.",
    },
    {
      scan_id: "scn_white-heat",
      track_title: "White Heat",
      epi_score: 87,
      mode: "Ready",
      polygon: { focus: 74, balance: 68, motivation: 89, calm: 39 },
      reason:
        "Fashion-week RFP active — Motivation + contemporary production match.",
    },
    {
      scan_id: "scn_redline",
      track_title: "Redline",
      epi_score: 91,
      mode: "Ready",
      polygon: { focus: 84, balance: 52, motivation: 96, calm: 21 },
      reason:
        "Esports broadcast cycle opening — peak Motivation ready for competition.",
    },
  ],
};

// Profile lookup keyed by track slug. All six tracks share the default
// profile so any dominant-track resolution path returns valid demo data.
export const creatorProfiles: Record<string, CreatorProfilePayload> = {
  redline: DEFAULT_PROFILE,
  "sea-glass": DEFAULT_PROFILE,
  "after-the-fire": DEFAULT_PROFILE,
  "copper-static": DEFAULT_PROFILE,
  "white-heat": DEFAULT_PROFILE,
  "hollow-meridian": DEFAULT_PROFILE,
};

export const DEFAULT_CREATOR_PROFILE = DEFAULT_PROFILE;

// Catalog-comparable copy used by the Creator Profile reveal at scan 8.
// Wired through getCatalogIntelligenceFromProfile / explicit override.
export const DEFAULT_CATALOG_COMPARABLE = {
  artist: "MUNA",
  placements:
    "fashion campaigns, premium tech brand films, and contemporary drama soundtrack",
  demand: "strong",
  vertical: "brand + lifestyle and film + television",
};

export function getCreatorProfile(
  trackSlug: string,
): CreatorProfilePayload | null {
  return creatorProfiles[trackSlug] ?? DEFAULT_PROFILE;
}
