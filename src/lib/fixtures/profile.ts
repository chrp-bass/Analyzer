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

export const creatorProfiles: Record<string, CreatorProfilePayload> = {
  glasshouse: {
    creator: {
      name: "Mira Wynn",
      tracks_scored: 12,
      scanned_at_range: ["2026-05-17", "2026-09-22"],
      generated_display: "2026.09.22",
    },
    signature: {
      polygon: { focus: 76, balance: 73, motivation: 81, calm: 49 },
      dominant_mode: "Ready",
    },
    metrics: {
      emotional_consistency: { score: 84, label: "Highly consistent" },
      signature_strength: { score: 78, label: "Distinctive" },
      reliability_index: { score: 81, label: "Highly reliable" },
    },
    mode_distribution: { Flow: 8, Ready: 67, Recharge: 17, Recover: 8 },
    pitch_priorities: [
      {
        scan_id: "scn_glasshouse",
        track_title: "Glasshouse",
        epi_score: 84,
        mode: "Ready",
        polygon: { focus: 79, balance: 71, motivation: 88, calm: 42 },
        reason:
          "Top-decile Motivation, active demand in athletic + sport. Lead pitch this week.",
      },
      {
        scan_id: "scn_sodium-lamps",
        track_title: "Sodium Lamps",
        epi_score: 81,
        mode: "Ready",
        polygon: { focus: 74, balance: 78, motivation: 82, calm: 46 },
        reason:
          "Second-strongest Ready-mode candidate. Pairs with auto and lifestyle-fitness briefs.",
      },
      {
        scan_id: "scn_tonepad",
        track_title: "Tonepad",
        epi_score: 76,
        mode: "Flow",
        polygon: { focus: 81, balance: 75, motivation: 64, calm: 58 },
        reason:
          "Strongest Flow-mode track in the catalog. Aligns with kinetic-comedy and editorial briefs.",
      },
    ],
  },

  thunderstruck: {
    creator: {
      name: "AC/DC",
      tracks_scored: 14,
      scanned_at_range: ["2026-05-17", "2026-09-22"],
      generated_display: "2026.09.22",
    },
    signature: {
      polygon: { focus: 79, balance: 64, motivation: 92, calm: 22 },
      dominant_mode: "Ready",
    },
    metrics: {
      emotional_consistency: { score: 91, label: "Exceptionally consistent" },
      signature_strength: { score: 94, label: "Catalog-defining" },
      reliability_index: { score: 89, label: "Highly reliable" },
    },
    mode_distribution: { Flow: 11, Ready: 81, Recharge: 2, Recover: 6 },
    pitch_priorities: [
      {
        scan_id: "scn_thunderstruck",
        track_title: "Thunderstruck",
        epi_score: 91,
        mode: "Ready",
        polygon: { focus: 84, balance: 62, motivation: 96, calm: 18 },
        reason:
          "Reference Ready song. Lead with this in every athletic, automotive, or stadium brief.",
      },
      {
        scan_id: "scn_back-in-black",
        track_title: "Back in Black",
        epi_score: 88,
        mode: "Ready",
        polygon: { focus: 78, balance: 68, motivation: 91, calm: 24 },
        reason:
          "Second anchor track. Especially strong for fight-sport and entrance-cue placements.",
      },
      {
        scan_id: "scn_highway-to-hell",
        track_title: "Highway to Hell",
        epi_score: 86,
        mode: "Ready",
        polygon: { focus: 76, balance: 71, motivation: 89, calm: 26 },
        reason:
          "Road-trip and drive-time programming. Active demand in automotive + lifestyle.",
      },
    ],
  },

  "nothing-else-matters": {
    creator: {
      name: "Metallica",
      tracks_scored: 18,
      scanned_at_range: ["2026-05-17", "2026-09-22"],
      generated_display: "2026.09.22",
    },
    signature: {
      polygon: { focus: 71, balance: 74, motivation: 58, calm: 51 },
      dominant_mode: "Recover",
    },
    metrics: {
      emotional_consistency: { score: 72, label: "Range across modes" },
      signature_strength: { score: 88, label: "Catalog-defining" },
      reliability_index: { score: 79, label: "Highly reliable" },
    },
    mode_distribution: { Flow: 14, Ready: 44, Recharge: 6, Recover: 36 },
    pitch_priorities: [
      {
        scan_id: "scn_nothing-else-matters",
        track_title: "Nothing Else Matters",
        epi_score: 86,
        mode: "Recover",
        polygon: { focus: 68, balance: 81, motivation: 36, calm: 74 },
        reason:
          "Reference Recover track. Lead pitch for memorial, tribute, and institutional briefs.",
      },
      {
        scan_id: "scn_one",
        track_title: "One",
        epi_score: 84,
        mode: "Recover",
        polygon: { focus: 72, balance: 76, motivation: 48, calm: 64 },
        reason:
          "Secondary Recover candidate. Pairs with long-form documentary and reflective film.",
      },
      {
        scan_id: "scn_master-of-puppets",
        track_title: "Master of Puppets",
        epi_score: 82,
        mode: "Ready",
        polygon: { focus: 81, balance: 64, motivation: 84, calm: 34 },
        reason:
          "Strongest catalog-Ready track. Pitch for high-stakes sport and gaming briefs.",
      },
    ],
  },

  "youre-still-the-one": {
    creator: {
      name: "Shania Twain",
      tracks_scored: 9,
      scanned_at_range: ["2026-05-17", "2026-09-22"],
      generated_display: "2026.09.22",
    },
    signature: {
      polygon: { focus: 58, balance: 81, motivation: 54, calm: 78 },
      dominant_mode: "Recharge",
    },
    metrics: {
      emotional_consistency: { score: 86, label: "Highly consistent" },
      signature_strength: { score: 74, label: "Distinctive" },
      reliability_index: { score: 83, label: "Highly reliable" },
    },
    mode_distribution: { Flow: 16, Ready: 12, Recharge: 58, Recover: 14 },
    pitch_priorities: [
      {
        scan_id: "scn_youre-still-the-one",
        track_title: "You're Still The One",
        epi_score: 79,
        mode: "Recharge",
        polygon: { focus: 54, balance: 78, motivation: 48, calm: 82 },
        reason:
          "Reference Recharge track. Lead for hospitality, lifestyle, and anniversary briefs.",
      },
      {
        scan_id: "scn_from-this-moment-on",
        track_title: "From This Moment On",
        epi_score: 76,
        mode: "Recharge",
        polygon: { focus: 56, balance: 81, motivation: 51, calm: 79 },
        reason:
          "Secondary Recharge candidate. Pairs with wedding, retail, and seasonal campaigns.",
      },
      {
        scan_id: "scn_man-i-feel-like-a-woman",
        track_title: "Man! I Feel Like a Woman!",
        epi_score: 74,
        mode: "Ready",
        polygon: { focus: 64, balance: 72, motivation: 78, calm: 41 },
        reason:
          "Strongest catalog-Ready track. Pitch for empowerment-anthem and beauty briefs.",
      },
    ],
  },

  "soul-bossa-nova": {
    creator: {
      name: "Quincy Jones",
      tracks_scored: 22,
      scanned_at_range: ["2026-05-17", "2026-09-22"],
      generated_display: "2026.09.22",
    },
    signature: {
      polygon: { focus: 74, balance: 86, motivation: 62, calm: 54 },
      dominant_mode: "Flow",
    },
    metrics: {
      emotional_consistency: { score: 79, label: "Range across modes" },
      signature_strength: { score: 92, label: "Catalog-defining" },
      reliability_index: { score: 84, label: "Highly reliable" },
    },
    mode_distribution: { Flow: 52, Ready: 18, Recharge: 22, Recover: 8 },
    pitch_priorities: [
      {
        scan_id: "scn_soul-bossa-nova",
        track_title: "Soul Bossa Nova",
        epi_score: 83,
        mode: "Flow",
        polygon: { focus: 76, balance: 89, motivation: 64, calm: 51 },
        reason:
          "Reference Flow track. Lead pitch for food, travel, and stylized-comedy briefs.",
      },
      {
        scan_id: "scn_ai-no-corrida",
        track_title: "Ai No Corrida",
        epi_score: 78,
        mode: "Flow",
        polygon: { focus: 74, balance: 84, motivation: 68, calm: 49 },
        reason:
          "Secondary Flow candidate. Pairs with fashion-film and editorial brand work.",
      },
      {
        scan_id: "scn_summer-in-the-city",
        track_title: "Summer in the City",
        epi_score: 76,
        mode: "Flow",
        polygon: { focus: 71, balance: 81, motivation: 72, calm: 47 },
        reason:
          "Strong urban-editorial Flow placement. Travel, transit, and city-life briefs.",
      },
    ],
  },
};

export function getCreatorProfile(
  trackSlug: string,
): CreatorProfilePayload | null {
  return creatorProfiles[trackSlug] ?? null;
}
