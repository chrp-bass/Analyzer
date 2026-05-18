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

export interface ReportPayload {
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
  };
  epi: {
    score: number;
    mode: Mode;
    rank_in_mode: string;
    rank_overall: string;
  };
  verdict: {
    call: "Pitch now" | "Develop" | "Hold";
    confidence: Confidence;
    rationale: string;
  };
  chrp_scores: ScoreRow[];
  hpv: ScoreRow[];
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
  creator: {
    name: string;
    tracks_scored: number;
    tease: string;
  };
}

export const reports: Record<string, ReportPayload> = {
  glasshouse: {
    report_meta: {
      id: "GLS-051726-MW",
      version: "v1.0",
      scanned_at: "2026-05-17T14:32:00-06:00",
      scanned_at_display: "2026.05.17  //  14:32 CST",
    },
    track: {
      title: "Glasshouse",
      artist: "Mira Wynn",
      isrc: "USA2P2614301",
    },
    epi: {
      score: 84,
      mode: "Ready",
      rank_in_mode: "Top 12%",
      rank_overall: "Top 8%",
    },
    verdict: {
      call: "Pitch now",
      confidence: "High",
      rationale:
        "Top-decile Motivation and Focus, locked in Ready mode. Active emotional demand in athletic + sport. Pitch list is ready to act on this week.",
    },
    chrp_scores: [
      { name: "Focus", score: 79, rank: "Top 15%", rank_class: "high", anchor: "sustained-focus cues" },
      { name: "Balance", score: 71, rank: "Top 28%", rank_class: "mid", anchor: "multi-cut friendly" },
      { name: "Motivation", score: 88, rank: "Top 6%", rank_class: "high", anchor: "launch / performance" },
      { name: "Calm", score: 42, rank: "Btm 38%", rank_class: "low", anchor: "avoid wellness, intimate" },
    ],
    hpv: [
      { name: "Focus", score: 79, rank: "Top 15%", rank_class: "high", anchor: "deep work, training" },
      { name: "Recovery", score: 28, rank: "Btm 28%", rank_class: "low", anchor: "not for restoration" },
      { name: "Flow", score: 65, rank: "Top 25%", rank_class: "mid", anchor: "rhythmic engagement" },
      { name: "Rest", score: 38, rank: "Btm 35%", rank_class: "low", anchor: "not for wind-down" },
    ],
    rhodes:
      "A Ready-mode anthem in the upper register. Confidence at top 4%, Motivation at top 6% — these are the dimensions that command attention in performance and athletic contexts. Calm and Rest sit in the bottom third, which means this is not a recovery song; do not treat it as one. Hold this back from quieter, more reflective contexts where the low Calm score will read against you. Your craft is escalation without rupture. Keep building in this register.",
    signature:
      "A locked-in confidence anthem with controlled escalation. Builds without breaking composure.",
    placements: [
      {
        title: "Pre-game walkout",
        body: "NCAA basketball intro reels, championship-bracket teasers, draft-night packages. The song's controlled aggression lets the visual carry the moment without competing for it.",
      },
      {
        title: "Athletic apparel campaigns",
        body: "High-performance footwear launches, training-collection films, elite-athlete brand spots. Pairs with imagery that rewards stillness inside motion.",
      },
      {
        title: "Third-act escalation scenes",
        body: "Heist sequences, chase montages, prestige-sport documentary climaxes. Builds without rupture, which lets editors cut to the beat without telegraphing the resolution.",
      },
    ],
    throughline:
      "Delivers the emotional load of a championship walkout with the texture of an alt-pop crossover. Built for moments that need readiness without aggression.",
    comparable:
      "Sits adjacent to placements like Apple's recent fitness campaigns and prestige sports documentary opening credits.",
    where_this_music_lives: {
      verticals: [
        { name: "Athletic + sport", pct: 88 },
        { name: "Film + television", pct: 73 },
        { name: "Fashion + retail", pct: 58 },
        { name: "Lifestyle + wellness", pct: 12 },
      ],
      confidence: "high",
      n_briefs: 148,
      sample_brief:
        "Major SUV launch · Q4 hero spot · athletic-anthem RFP · active 14 days  //  agency-side, mid-six-figure tier",
    },
    creator: {
      name: "Mira Wynn",
      tracks_scored: 1,
      tease:
        "your emotional consistency profile, flow patterns, and creator reliability score.",
    },
  },

  "thunderstruck-acdc": {
    report_meta: {
      id: "THU-051726-AC",
      version: "v1.0",
      scanned_at: "2026-05-17T14:35:00-06:00",
      scanned_at_display: "2026.05.17  //  14:35 CST",
    },
    track: {
      title: "Thunderstruck",
      artist: "AC/DC",
      isrc: "AUAP09000001",
    },
    epi: {
      score: 91,
      mode: "Ready",
      rank_in_mode: "Top 3%",
      rank_overall: "Top 2%",
    },
    verdict: {
      call: "Pitch now",
      confidence: "High",
      rationale:
        "Catalog benchmark for the Ready mode. Sport, automotive, and stadium briefs cluster here. Use the comp aggressively in pitch language.",
    },
    chrp_scores: [
      { name: "Focus", score: 84, rank: "Top 7%", rank_class: "high", anchor: "high-arousal lock-in" },
      { name: "Balance", score: 62, rank: "Top 35%", rank_class: "mid", anchor: "single-cut anchor" },
      { name: "Motivation", score: 96, rank: "Top 1%", rank_class: "high", anchor: "stadium ignition" },
      { name: "Calm", score: 18, rank: "Btm 12%", rank_class: "low", anchor: "do not place against rest" },
    ],
    hpv: [
      { name: "Focus", score: 84, rank: "Top 7%", rank_class: "high", anchor: "execution states" },
      { name: "Recovery", score: 14, rank: "Btm 8%", rank_class: "low", anchor: "actively works against rest" },
      { name: "Flow", score: 78, rank: "Top 12%", rank_class: "high", anchor: "drive-time, training" },
      { name: "Rest", score: 12, rank: "Btm 7%", rank_class: "low", anchor: "do not pair with wind-down" },
    ],
    rhodes:
      "This is the reference Ready song. Motivation at 96 places it in the top one percent of the catalog. You should treat the song's profile as a definition, not a data point. The flattening near Calm and Rest tells you exactly where it must not be placed: anywhere a viewer is being asked to settle. The riff is the brief.",
    signature:
      "A pure ignition signal. Sharp, motoric, unapologetic — built to summon attention, not invite it.",
    placements: [
      {
        title: "Arena walk-on",
        body: "Stadium opens, pre-fight entries, championship-fight pre-roll. The song does the announcement work for you.",
      },
      {
        title: "Automotive performance launches",
        body: "Muscle car reveals, high-performance trim film, motorsport sponsor campaigns. Built for kinetic, mechanical imagery.",
      },
      {
        title: "Drive-time radio + workout playlists",
        body: "Programmatic placement in high-arousal commute and training programming. Predictable behavioral lift.",
      },
    ],
    throughline:
      "Three notes and the room is yours. Built for moments where the brand or scene needs to take the temperature up, not soothe it.",
    comparable:
      "Anchors the Ready mode for the full catalog. Most adjacent tracks in this fingerprint cluster around late-90s/2000s arena rock and modern stadium hip-hop.",
    where_this_music_lives: {
      verticals: [
        { name: "Athletic + sport", pct: 94 },
        { name: "Automotive + motorsport", pct: 86 },
        { name: "Film + television", pct: 64 },
        { name: "Lifestyle + wellness", pct: 4 },
      ],
      confidence: "high",
      n_briefs: 312,
      sample_brief:
        "Top-tier NBA franchise · season-opener intro reel · stadium-anthem RFP · active 9 days  //  in-house creative",
    },
    creator: {
      name: "AC/DC",
      tracks_scored: 1,
      tease:
        "the band's full catalog fingerprint, mode distribution, and brief-fit ranking across active emotional demand.",
    },
  },

  "nothing-else-matters-metallica": {
    report_meta: {
      id: "NEM-051726-MT",
      version: "v1.0",
      scanned_at: "2026-05-17T14:38:00-06:00",
      scanned_at_display: "2026.05.17  //  14:38 CST",
    },
    track: {
      title: "Nothing Else Matters",
      artist: "Metallica",
      isrc: "USEE19200172",
    },
    epi: {
      score: 86,
      mode: "Recover",
      rank_in_mode: "Top 6%",
      rank_overall: "Top 9%",
    },
    verdict: {
      call: "Pitch now",
      confidence: "High",
      rationale:
        "Reference Recover-mode track with broad cultural recognition. High behavioral resonance pairs with low arousal — built for memorial, retrospective, and reflective brief slates.",
    },
    chrp_scores: [
      { name: "Focus", score: 68, rank: "Top 25%", rank_class: "mid", anchor: "sustained attention" },
      { name: "Balance", score: 81, rank: "Top 11%", rank_class: "high", anchor: "wide editorial pairing" },
      { name: "Motivation", score: 36, rank: "Btm 32%", rank_class: "low", anchor: "not for activation" },
      { name: "Calm", score: 74, rank: "Top 18%", rank_class: "high", anchor: "reflective, weighted" },
    ],
    hpv: [
      { name: "Focus", score: 68, rank: "Top 25%", rank_class: "mid", anchor: "long-form attention" },
      { name: "Recovery", score: 79, rank: "Top 14%", rank_class: "high", anchor: "emotional decompression" },
      { name: "Flow", score: 52, rank: "Top 45%", rank_class: "mid", anchor: "linear time" },
      { name: "Rest", score: 64, rank: "Top 31%", rank_class: "mid", anchor: "wind-down, evening" },
    ],
    rhodes:
      "Recover mode at its most legible. Calm at 74 with Balance at 81 explains the song's durability in editorial use: it gives weight without pulling focus. Place it where the viewer is being asked to stay and feel, not to act. The behavioral resonance score is what makes this a catalog reference — listeners stay with it.",
    signature:
      "A patient, monumental ballad. Carries weight without raising its voice.",
    placements: [
      {
        title: "Memorial and tribute spots",
        body: "Institutional anniversary films, in memoriam segments, retrospective brand storytelling. Built to honor without overstating.",
      },
      {
        title: "Long-form documentary beds",
        body: "Biographical and historical documentary scoring where dialogue and image carry the moment and the music holds the room.",
      },
      {
        title: "Reflective film score moments",
        body: "Coming-of-age resolutions, character-arc closings, and slow-cinema dramatic beats that earn their pace.",
      },
    ],
    throughline:
      "A song that lets the viewer sit with the moment. Built for storytelling that doesn't need to push.",
    comparable:
      "Anchors a cluster of reference Recover tracks adjacent to prestige documentary scoring and high-stakes institutional film.",
    where_this_music_lives: {
      verticals: [
        { name: "Film + television", pct: 84 },
        { name: "Institutional + tribute", pct: 71 },
        { name: "Lifestyle + wellness", pct: 42 },
        { name: "Athletic + sport", pct: 9 },
      ],
      confidence: "high",
      n_briefs: 196,
      sample_brief:
        "Network sports broadcaster · 50-year anniversary film · reflective-anthem RFP · active 21 days  //  agency-side, six-figure tier",
    },
    creator: {
      name: "Metallica",
      tracks_scored: 1,
      tease:
        "the band's full catalog fingerprint, mode distribution, and brief-fit ranking across active emotional demand.",
    },
  },

  "youre-still-the-one-shania-twain": {
    report_meta: {
      id: "YST-051726-ST",
      version: "v1.0",
      scanned_at: "2026-05-17T14:41:00-06:00",
      scanned_at_display: "2026.05.17  //  14:41 CST",
    },
    track: {
      title: "You're Still The One",
      artist: "Shania Twain",
      isrc: "USMC19700066",
    },
    epi: {
      score: 79,
      mode: "Recharge",
      rank_in_mode: "Top 14%",
      rank_overall: "Top 18%",
    },
    verdict: {
      call: "Pitch now",
      confidence: "Moderate",
      rationale:
        "Strong Recharge profile with warm valence and high stress-modulation. Active demand in lifestyle and hospitality. Pitch with care toward cluttered romantic-comedy slates.",
    },
    chrp_scores: [
      { name: "Focus", score: 54, rank: "Top 42%", rank_class: "mid", anchor: "soft attention" },
      { name: "Balance", score: 78, rank: "Top 16%", rank_class: "high", anchor: "warm pairing range" },
      { name: "Motivation", score: 48, rank: "Top 45%", rank_class: "mid", anchor: "gentle uplift" },
      { name: "Calm", score: 82, rank: "Top 9%", rank_class: "high", anchor: "reassurance, intimacy" },
    ],
    hpv: [
      { name: "Focus", score: 54, rank: "Top 42%", rank_class: "mid", anchor: "background-friendly" },
      { name: "Recovery", score: 72, rank: "Top 21%", rank_class: "high", anchor: "warm landings" },
      { name: "Flow", score: 58, rank: "Top 38%", rank_class: "mid", anchor: "domestic rhythm" },
      { name: "Rest", score: 69, rank: "Top 24%", rank_class: "mid", anchor: "evening, hospitality" },
    ],
    rhodes:
      "A Recharge song in the warm, intimate range. Calm at 82 with Balance at 78 — this is the geography of reassurance. It plays as soft permission rather than uplift, which is why it has held up so well across lifestyle, hospitality, and wedding contexts for nearly thirty years. Trust the song's poise; do not over-pitch it.",
    signature:
      "A gentle declaration. Warm enough to feel like home, durable enough to keep meaning it.",
    placements: [
      {
        title: "Hospitality + boutique retail",
        body: "Hotel and lifestyle brand films, boutique-retail seasonal campaigns, premium grocery and gifting spots. Pairs naturally with imagery of warmth and small rituals.",
      },
      {
        title: "Anniversary and milestone storytelling",
        body: "Long-tenure brand spots, anniversary commemorations, and customer-loyalty films. The song lends institutional warmth without sentimentality.",
      },
      {
        title: "End-credit + emotional resolution beds",
        body: "Romantic comedy outros, soft-resolution feature endings, and lifestyle-documentary closings.",
      },
    ],
    throughline:
      "Quiet conviction with a melody that has aged into a standard. Built for moments that need warmth without demanding sentimentality.",
    comparable:
      "Sits alongside late-90s adult-contemporary standards and contemporary brand-anchor ballads in hospitality and retail.",
    where_this_music_lives: {
      verticals: [
        { name: "Lifestyle + wellness", pct: 81 },
        { name: "Hospitality + retail", pct: 76 },
        { name: "Film + television", pct: 54 },
        { name: "Athletic + sport", pct: 7 },
      ],
      confidence: "moderate",
      n_briefs: 84,
      sample_brief:
        "International hotel group · spring brand-refresh film · warm-anthem RFP · active 7 days  //  agency-side, mid-tier",
    },
    creator: {
      name: "Shania Twain",
      tracks_scored: 1,
      tease:
        "the artist's full catalog fingerprint, mode distribution, and brief-fit ranking across active emotional demand.",
    },
  },

  "soul-bossa-nova-quincy-jones": {
    report_meta: {
      id: "SBN-051726-QJ",
      version: "v1.0",
      scanned_at: "2026-05-17T14:44:00-06:00",
      scanned_at_display: "2026.05.17  //  14:44 CST",
    },
    track: {
      title: "Soul Bossa Nova",
      artist: "Quincy Jones",
      isrc: "USUM71601241",
    },
    epi: {
      score: 83,
      mode: "Flow",
      rank_in_mode: "Top 9%",
      rank_overall: "Top 12%",
    },
    verdict: {
      call: "Pitch now",
      confidence: "High",
      rationale:
        "Reference Flow-mode track with high Focus and Balance, low aggression. Strong demand in food + travel and stylized comedy. Comp-friendly across editorial.",
    },
    chrp_scores: [
      { name: "Focus", score: 76, rank: "Top 17%", rank_class: "high", anchor: "playful attention" },
      { name: "Balance", score: 89, rank: "Top 5%", rank_class: "high", anchor: "broad editorial pairing" },
      { name: "Motivation", score: 64, rank: "Top 28%", rank_class: "mid", anchor: "kinetic, light" },
      { name: "Calm", score: 51, rank: "Top 47%", rank_class: "mid", anchor: "bright neutral" },
    ],
    hpv: [
      { name: "Focus", score: 76, rank: "Top 17%", rank_class: "high", anchor: "creative play states" },
      { name: "Recovery", score: 38, rank: "Btm 36%", rank_class: "low", anchor: "not for restoration" },
      { name: "Flow", score: 92, rank: "Top 3%", rank_class: "high", anchor: "movement, momentum" },
      { name: "Rest", score: 22, rank: "Btm 18%", rank_class: "low", anchor: "not for wind-down" },
    ],
    rhodes:
      "Flow mode at the canonical end. Flow at 92 and Balance at 89 explain the song's editorial versatility — it slots into a remarkable range of contexts without losing its identity. This is a song that gives the editor permission to be playful. Pitch it confidently into stylized comedy, food, travel, and any brief that needs movement with personality.",
    signature:
      "A bright, kinetic motif with unmistakable personality. Moves a scene without demanding the room.",
    placements: [
      {
        title: "Food + travel editorial",
        body: "Cooking-show beds, travel-network openings, premium food-brand films, and cinematic culinary documentary.",
      },
      {
        title: "Stylized comedy + brand humor",
        body: "Comedic sting cues, retro-stylized brand films, and tongue-in-cheek tech and apparel campaigns.",
      },
      {
        title: "Title sequences + transitional editorial",
        body: "Film and TV title sequences, talk-show stings, and intercut transitions where the music carries the personality of the cut.",
      },
    ],
    throughline:
      "An iconic motif that adds personality to every cut it touches. Built for moments that need motion, taste, and a knowing smile.",
    comparable:
      "Anchors a cluster of high-personality Flow-mode tracks adjacent to retro-stylized comedy and prestige food-and-travel editorial.",
    where_this_music_lives: {
      verticals: [
        { name: "Food + travel", pct: 87 },
        { name: "Film + television", pct: 78 },
        { name: "Fashion + retail", pct: 61 },
        { name: "Athletic + sport", pct: 14 },
      ],
      confidence: "high",
      n_briefs: 167,
      sample_brief:
        "Streaming food network · flagship documentary series · Flow-mode title-bed RFP · active 11 days  //  in-house creative",
    },
    creator: {
      name: "Quincy Jones",
      tracks_scored: 1,
      tease:
        "the artist's full catalog fingerprint, mode distribution, and brief-fit ranking across active emotional demand.",
    },
  },
};

export const trackOptions: Array<{
  id: string;
  label: string;
  hint: string;
}> = [
  { id: "glasshouse", label: "Glasshouse", hint: "Mira Wynn  //  Ready" },
  { id: "thunderstruck-acdc", label: "Thunderstruck", hint: "AC/DC  //  Ready" },
  {
    id: "nothing-else-matters-metallica",
    label: "Nothing Else Matters",
    hint: "Metallica  //  Recover",
  },
  {
    id: "youre-still-the-one-shania-twain",
    label: "You're Still The One",
    hint: "Shania Twain  //  Recharge",
  },
  {
    id: "soul-bossa-nova-quincy-jones",
    label: "Soul Bossa Nova",
    hint: "Quincy Jones  //  Flow",
  },
];

export function getReportById(id: string): ReportPayload | null {
  return reports[id] ?? null;
}

export function matchInputToReportId(input: string): string {
  const n = input.toLowerCase().trim();
  if (!n) return "glasshouse";
  const map: Array<[string[], string]> = [
    [["glasshouse", "mira wynn"], "glasshouse"],
    [["thunderstruck", "ac/dc", "acdc"], "thunderstruck-acdc"],
    [
      ["nothing else matters", "metallica"],
      "nothing-else-matters-metallica",
    ],
    [
      ["still the one", "shania", "twain"],
      "youre-still-the-one-shania-twain",
    ],
    [
      ["soul bossa", "bossa nova", "quincy"],
      "soul-bossa-nova-quincy-jones",
    ],
  ];
  for (const [needles, id] of map) {
    if (needles.some((needle) => n.includes(needle))) return id;
  }
  const ids = Object.keys(reports);
  const hash = Array.from(n).reduce(
    (acc, c) => acc + c.charCodeAt(0),
    0,
  );
  return ids[hash % ids.length];
}

export const MODE_COLORS: Record<
  Mode,
  { chipBg: string; chipText: string; polygonFill: string }
> = {
  Ready: {
    chipBg: "var(--chrp-yellow)",
    chipText: "var(--chrp-black)",
    polygonFill: "rgba(230,215,79,0.55)",
  },
  Recover: {
    chipBg: "var(--plum)",
    chipText: "var(--chrp-white)",
    polygonFill: "rgba(89,23,57,0.45)",
  },
  Recharge: {
    chipBg: "var(--pistachio)",
    chipText: "var(--chrp-black)",
    polygonFill: "rgba(190,226,168,0.65)",
  },
  Flow: {
    chipBg: "var(--french-blue)",
    chipText: "var(--chrp-white)",
    polygonFill: "rgba(64,107,214,0.45)",
  },
};
