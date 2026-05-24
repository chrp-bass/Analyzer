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
    verdict: {
      call: "Pitch now",
      confidence: "High",
      rationale:
        "Extreme Motivation and elevated Focus at the top of the Ready catalog. Strongest active brief alignment in esports broadcast and performance automotive. Pitch this week.",
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
    rhodes:
      "A Ready-mode track operating at the extreme end of the catalog. Motivation at top 1%, Calm at bottom 9% — there is no ambiguity about what this song is for. It is a launch sequence. Built for the ten seconds before everything changes. Lead exclusively with apex performance moments: esports broadcast opens, championship fight-night entrances, performance vehicle reveals. The riff architecture escalates through volume and layering rather than chord progression, which means it holds intensity across extended cuts without telegraphing its ceiling. Do not hand this to anything requiring nuance, emotional complexity, or descent. It does one thing at the top of the catalog and does it with rare conviction.",
    signature:
      "A relentless launch sequence built for the apex moment. No ceiling. No descent.",
    placements: [
      {
        title: "Esports and gaming broadcast",
        body: "Multi-million-viewer broadcast opens, tournament-bracket reveals, championship walkout cues. The mechanical escalation mirrors the rituals of competitive performance without borrowing from them.",
      },
      {
        title: "Performance vehicle reveal",
        body: "Supercar and performance truck launches, race-circuit brand films, track-day campaign hero spots. Pairs with cinematography that worships speed without apologizing for it.",
      },
      {
        title: "Action sports documentary",
        body: "Big-wave surfing, freeride mountain biking, extreme sports documentary opens. The repetition structure works in extended cuts that need to build to a physical climax without a traditional musical peak.",
      },
    ],
    throughline:
      "A song that exists in the red. Built for the moments before ignition — competition, speed, consequence — where the music's only job is to make what's coming feel inevitable.",
    comparable:
      "Lives in the same extreme performance territory as The Prodigy's 'Invaders Must Die' for action-sport brand use, with Gesaffelstein's 'Pursuit' as its closest contemporary sibling in high-end automotive.",
    where_this_music_lives: {
      verticals: [
        { name: "Athletic + sport", pct: 94 },
        { name: "Action + trailer", pct: 86 },
        { name: "Brand + performance", pct: 78 },
        { name: "Drama + intimate", pct: 4 },
      ],
      confidence: "high",
      n_briefs: 211,
      sample_brief:
        "Global performance footwear brand · championship season launch film · high-intensity anthem RFP · active 21 days  //  in-house creative, high-six-figure budget",
    },
    creator: {
      name: "Voss Black",
      tracks_scored: 1,
      tease:
        "your emotional consistency profile and identify your strongest pitch-priority tracks.",
    },
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
    verdict: {
      call: "Pitch now",
      confidence: "High",
      rationale:
        "Top-decile Balance with strong Calm, locked in Recharge. Active demand in wellness brand and luxury travel verticals. Pitch list is ready to act on this week.",
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
    rhodes:
      "A Recharge-mode track with exceptional structural balance. Balance at top 7%, Calm at top 18% — this is a song built to restore without sedating. It operates in the restorative register without crossing into recovery territory: present, warm, unhurried. Lead with wellness brand films, luxury travel, and milestone celebrations where the music is asked to hold a feeling rather than move one. The acoustic arrangement remains accessible across demographic ranges from twenty to seventy-five, which makes it commercially flexible in a way most Recharge tracks are not. Hold this back from athletic, action, and high-tempo contexts where its intimate scale will be crushed. It earns its placement by being the right temperature, not the loudest signal.",
    signature:
      "Warm, restorative, and structurally balanced. Holds a feeling without insisting on it.",
    placements: [
      {
        title: "Wellness and lifestyle brand films",
        body: "Meditation app campaigns, spa and hospitality brand films, organic beauty editorial. Works across static, video, and long-form without losing its center.",
      },
      {
        title: "Luxury travel and destination content",
        body: "Boutique hotel brand films, destination-wedding content, premium travel campaigns. The coastal acoustic texture makes geography feel earned rather than generic.",
      },
      {
        title: "Milestone and anniversary brand spots",
        body: "Family-legacy narrative films, corporate anniversary commemoratives, retirement and tribute montages. Accessible across generations while maintaining emotional specificity.",
      },
    ],
    throughline:
      "A song about returning to yourself. Built for the moments when the music's only job is to hold space — wellness campaigns, travel stories, and the quiet declarations of a life well lived.",
    comparable:
      "Lives in the same restorative territory as Ben Howard's 'Keep Your Head Up' for lifestyle brand use, with Novo Amor as its closest sound sibling in wellness and premium-travel sync markets.",
    where_this_music_lives: {
      verticals: [
        { name: "Wellness + lifestyle", pct: 91 },
        { name: "Luxury + travel", pct: 82 },
        { name: "Wedding + milestone", pct: 74 },
        { name: "Athletic + sport", pct: 8 },
      ],
      confidence: "high",
      n_briefs: 167,
      sample_brief:
        "Premium wellness brand · mindfulness app brand film · restorative acoustic RFP · active 18 days  //  agency-side, mid-five-figure budget",
    },
    creator: {
      name: "Mara Quinn",
      tracks_scored: 1,
      tease:
        "your emotional consistency profile, signature pattern, and creator reliability score.",
    },
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
    verdict: {
      call: "Pitch now",
      confidence: "High",
      rationale:
        "Recovery at top 4%, Rest at top 8%. Exceptional structural balance within Recover mode. Active demand in prestige TV and documentary verticals. Pitch now.",
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
    rhodes:
      "A Recover-mode track operating in the upper register. Recovery at top 4%, Rest at top 8%, Motivation withdrawn to the bottom quartile — this song is built for the aftermath. Not grief exactly, but the long exhale after. Lead with third-act dramatic resolution, end-of-season memorial segments, and long-form brand films that have earned an emotional landing. The string-and-piano arrangement carries sufficient weight to work beneath dialogue and voiceover without competing. What makes this unusual within the Recover mode is the Balance score: it holds emotional complexity without becoming heavy or punishing. That makes it more commercially flexible than most deep-Recover tracks. Hold it back from sport, action, and product-launch contexts — its gravity will read as deflation in those placements.",
    signature:
      "A song that arrives after the hard part. Carries weight without punishment.",
    placements: [
      {
        title: "Prestige drama and season-close sequences",
        body: "Third-act resolution in prestige television, season-finale emotional closes, long-form character-arc payoffs. Works particularly well under dialogue where an orchestral score would overtell the moment.",
      },
      {
        title: "Memorial and tribute broadcast segments",
        body: "League-broadcast memorial segments, end-of-season tribute packages, awards-ceremony in-memoriam montages. The restraint is the virtue — it doesn't perform grief.",
      },
      {
        title: "Long-form brand films with earned emotional arcs",
        body: "Corporate legacy films, charitable-foundation impact campaigns, healthcare brand narratives. Pairs with cinematography that has built to its feeling rather than rushed it.",
      },
    ],
    throughline:
      "A song for after. Built for the emotional exhale — the tribute, the resolution, the long breath out after something real has happened. The music does not cry. It stands with you.",
    comparable:
      "Lives in the same emotional territory as Max Richter's 'On the Nature of Daylight' for prestige drama use, with Ólafur Arnalds as its closest contemporary sibling in memorial and cinematic sync markets.",
    where_this_music_lives: {
      verticals: [
        { name: "Film + television", pct: 94 },
        { name: "Documentary + tribute", pct: 88 },
        { name: "Brand + emotional", pct: 64 },
        { name: "Athletic + sport", pct: 6 },
      ],
      confidence: "high",
      n_briefs: 143,
      sample_brief:
        "Major streaming platform · original series · emotional season-close cue · Recover-mode RFP · active 9 days  //  in-house music supervision, episodic budget",
    },
    creator: {
      name: "Stellan Grey",
      tracks_scored: 1,
      tease:
        "your creator profile — emotional consistency, signature pattern, and catalog reliability score.",
    },
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
    verdict: {
      call: "Pitch now",
      confidence: "High",
      rationale:
        "Balance at top 5%, Flow at top 10%. Sophisticated Flow positioning with strong premium-brand brief alignment. Active demand in tech and fashion verticals.",
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
    rhodes:
      "A Flow-mode track with unusually high structural balance and a refined sense of rhythmic self-possession. Balance at top 5%, Flow at top 10% — this song moves without rushing. It creates momentum through patience rather than propulsion. Lead with premium lifestyle brand films, tech product launches, and fashion editorial where the music is asked to carry cool without broadcasting it. The neo-soul arrangement sits outside genre clichés, extending its commercial range. The mid-range Motivation is intentional: this is not a performance anthem, it is ambient intelligence — it makes the room smarter without making it louder. Hold it back from athletic and action contexts where its subtle authority will read as passivity.",
    signature:
      "Moves without announcing itself. Built for the room that already knows.",
    placements: [
      {
        title: "Premium tech product launches",
        body: "Consumer electronics keynote films, software brand campaigns, AI and design tool editorial. The understated intelligence of the arrangement mirrors brands that don't need to explain themselves.",
      },
      {
        title: "Fashion editorial and lookbook content",
        body: "Designer collection films, high-fashion editorial, luxury retail brand campaigns. Works in both 30-second brand spots and longer editorial formats without losing its identity.",
      },
      {
        title: "Architecture and interior design content",
        body: "Residential architecture brand films, high-end interior design editorial, premium real estate campaigns. The spatial quality of the production makes room for visual breathing.",
      },
    ],
    throughline:
      "A song with something to say and no need to repeat itself. Built for the brand that earns attention rather than demands it — premium tech, fashion, and architecture content that moves through rooms without disturbing them.",
    comparable:
      "Lives in the same sophisticated territory as Hiatus Kaiyote for premium brand use, with Jorja Smith's catalog as its closest sound sibling in fashion and lifestyle sync markets.",
    where_this_music_lives: {
      verticals: [
        { name: "Brand + lifestyle", pct: 88 },
        { name: "Fashion + retail", pct: 81 },
        { name: "Film + television", pct: 67 },
        { name: "Athletic + sport", pct: 14 },
      ],
      confidence: "high",
      n_briefs: 176,
      sample_brief:
        "Global tech company · consumer product launch film · sophisticated Flow-mode RFP · active 14 days  //  agency creative, premium budget tier",
    },
    creator: {
      name: "Nadia Park",
      tracks_scored: 1,
      tease:
        "your creator profile — signature pattern, emotional consistency, and catalog reliability score.",
    },
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
    verdict: {
      call: "Pitch now",
      confidence: "High",
      rationale:
        "Motivation top 8% with mid-range Calm — social-energy Ready with fashion and beauty access. Active demand in fashion-week and lifestyle verticals. Pitch now.",
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
    rhodes:
      "A Ready-mode track with strong Motivation and a higher Calm than most in its mode — which is the distinguishing commercial feature. At Motivation top 8% and Calm mid-range, this is not an apex-performance anthem; it is a social-energy track. The difference matters for placement. Where extreme-Ready tracks are built for competition, this is built for the first hour of a night that hasn't peaked yet. Lead with fashion-week content, club-culture brand campaigns, and summer-season retail activation. The contemporary synth architecture gives it commercial longevity that harder-edged Ready tracks lack. The mid-range Calm specifically opens doors in beauty and fragrance campaigns that avoid low-Calm aggression. This is versatile Ready, not singular Ready.",
    signature:
      "Social-energy Ready mode. Built for the night, not the competition.",
    placements: [
      {
        title: "Fashion week and runway content",
        body: "Collection-reveal films, designer brand campaigns, runway editorial. The contemporary energy sits outside athletic clichés while delivering directional momentum.",
      },
      {
        title: "Beauty and fragrance brand campaigns",
        body: "Prestige fragrance films, makeup brand launch spots, skincare editorial. The mid-range Calm opens placement doors that harder Ready tracks cannot access.",
      },
      {
        title: "Summer retail and seasonal activation",
        body: "Apparel brand summer campaigns, festival-season content, outdoor retail editorial. Works across both short-form digital and longer retail brand films.",
      },
    ],
    throughline:
      "A song for the beginning of the best night. Built for fashion, fragrance, and the moments where culture moves — runway, launch, season — where the energy is high and the aggression is optional.",
    comparable:
      "Lives in the same contemporary fashion territory as Dua Lipa's recent brand campaign work, with Peggy Gou as its closest sound sibling in fashion-house and luxury editorial sync markets.",
    where_this_music_lives: {
      verticals: [
        { name: "Fashion + retail", pct: 92 },
        { name: "Brand + lifestyle", pct: 78 },
        { name: "Film + television", pct: 61 },
        { name: "Athletic + sport", pct: 31 },
      ],
      confidence: "high",
      n_briefs: 194,
      sample_brief:
        "Global fashion house · new collection reveal film · contemporary Ready-mode RFP · active 12 days  //  in-house creative team, mid-six-figure production",
    },
    creator: {
      name: "Juno Riis",
      tracks_scored: 1,
      tease:
        "your creator profile — signature pattern, emotional consistency, and reliability score across your body of work.",
    },
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
    verdict: {
      call: "Develop",
      confidence: "Moderate",
      rationale:
        "Strong Focus and Flow scores with cinematic quality. Mid-Motivation limits active brief matches. Pair with a higher-Motivation track on pitches. Develop the catalog before leading with this one.",
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
    rhodes:
      "A Flow-mode track with exceptional Focus and a cinematic quality that separates it from standard grooves in the mode. Focus at top 9%, Flow at top 8%, with Motivation at mid-range — this is a song with inner stillness rather than outward energy. The result is a track that creates an atmosphere rather than a feeling, which is a specific and valuable commercial quality. Lead with nature documentary, luxury automotive, and architecture brand films where the music must sustain a visual world without directing it. The verdict here is Develop rather than Pitch now: the EPI score is strong but mid-Motivation limits active brief categories. Pair with a higher-Motivation track on pitches to supervisors who need both atmosphere and forward movement. The track earns its placement when it has context alongside it.",
    signature:
      "Cinematic stillness at high resolution. Builds an atmosphere rather than a feeling.",
    placements: [
      {
        title: "Nature and exploration documentary",
        body: "Wilderness documentary sequences, ocean and climate film content, geography and travel documentary. Flexible across both underscore and featured-cue contexts.",
      },
      {
        title: "Luxury automotive brand films",
        body: "Premium vehicle long-form brand films, brand-heritage retrospectives, driving-experience campaigns. Sits outside the typical performance-anthem placement, differentiating on brief.",
      },
      {
        title: "Architecture and high-concept design editorial",
        body: "Architectural brand films, design-week editorial, luxury residential and hospitality campaigns. The restraint is the virtue — presence without direction.",
      },
    ],
    throughline:
      "A song that exists in its own atmosphere. Built for visuals that trust silence — documentary, luxury automotive, and architectural editorial where the music's job is to deepen the world rather than explain it.",
    comparable:
      "Lives in the same cinematic territory as Brian Eno's ambient catalog for luxury and documentary use, with Nils Frahm as its closest contemporary sibling in architectural and high-concept brand markets.",
    where_this_music_lives: {
      verticals: [
        { name: "Documentary + nature", pct: 84 },
        { name: "Brand + luxury", pct: 79 },
        { name: "Film + television", pct: 71 },
        { name: "Athletic + sport", pct: 11 },
      ],
      confidence: "moderate",
      n_briefs: 89,
      sample_brief:
        "Luxury European automotive brand · heritage film · cinematic Flow-mode atmosphere RFP · active 11 days  //  agency-side, premium budget tier",
    },
    creator: {
      name: "The Common Thread",
      tracks_scored: 1,
      tease:
        "your creator profile — emotional consistency, signature pattern, and creator reliability score.",
    },
  },
};

// Order matches the brief's "try one of ours" list on the /scan page.
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

export function getReportById(id: string): ReportPayload | null {
  return reports[id] ?? null;
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
