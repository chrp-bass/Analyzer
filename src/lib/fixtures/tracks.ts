export type Mode = "Ready" | "Flow" | "Recharge" | "Recover";

export interface Fingerprint {
  valence: number;
  arousal: number;
  tensionRelease: number;
  motivationalEnergy: number;
  emotionalDrift: number;
  focus: number;
  confidence: number;
  stressModulation: number;
  pacing: number;
  aggression: number;
  recovery: number;
  behavioralResonance: number;
}

export interface BuiltFor {
  title: string;
  body: string;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  albumArt: string;
  mode: Mode;
  fingerprint: Fingerprint;
  signature: string;
  builtFor: BuiltFor[];
  pitchLine: string;
  comparable: string;
  drRhodes: string;
  brandMatches: string[];
  comparisonTracks: string[];
}

export const tracks: Track[] = [
  {
    id: "glasshouse",
    title: "Glasshouse",
    artist: "Mira Wynn",
    albumArt: "/art/glasshouse.svg",
    mode: "Ready",
    fingerprint: {
      valence: 71,
      arousal: 82,
      tensionRelease: 76,
      motivationalEnergy: 88,
      emotionalDrift: 34,
      focus: 79,
      confidence: 91,
      stressModulation: 62,
      pacing: 84,
      aggression: 58,
      recovery: 28,
      behavioralResonance: 86,
    },
    signature:
      "A locked-in confidence anthem with controlled escalation. Builds without breaking composure.",
    builtFor: [
      {
        title: "Pre-game walkout",
        body: "NCAA basketball intro reels, championship-bracket teasers, draft-night packages.",
      },
      {
        title: "Athletic apparel campaigns",
        body: "High-performance footwear launches and training-collection films.",
      },
      {
        title: "Third-act escalation scenes",
        body: "Heist sequences, chase montages, and prestige-sport documentary climaxes.",
      },
    ],
    pitchLine:
      "Delivers the emotional load of a championship walkout with the texture of an alt-pop crossover. Cleared for sync, available for licensing.",
    comparable:
      "Sits adjacent to placements like Apple's recent fitness campaigns and prestige sports documentary opening credits.",
    drRhodes:
      "This track lives in Ready mode at the upper edge. Confidence at 91, motivational energy at 88, focus locked at 79. The signature is escalation without rupture — it climbs the stakes while keeping the listener composed. Lead with this one in athletic and prestige-sport pitches.",
    brandMatches: ["Nike", "Equinox", "Apple"],
    comparisonTracks: [
      "Distant cousin to high-end fitness campaign anchors.",
      "Adjacent to alt-pop sync placements in prestige sport docs.",
      "Shares fingerprint geography with NBA broadcast intro beds.",
    ],
  },
  {
    id: "subway-light",
    title: "Subway Light",
    artist: "River Aoki",
    albumArt: "/art/subway-light.svg",
    mode: "Flow",
    fingerprint: {
      valence: 58,
      arousal: 52,
      tensionRelease: 44,
      motivationalEnergy: 61,
      emotionalDrift: 48,
      focus: 92,
      confidence: 74,
      stressModulation: 81,
      pacing: 68,
      aggression: 18,
      recovery: 51,
      behavioralResonance: 77,
    },
    signature:
      "A focused, drifting groove. Holds attention without demanding it.",
    builtFor: [
      {
        title: "Productivity and work apps",
        body: "Deep-focus playlists, study sessions, knowledge-worker brand films.",
      },
      {
        title: "Tech product reveals",
        body: "Mid-tempo hardware launches and design-tool walkthrough videos.",
      },
      {
        title: "Urban lifestyle commercials",
        body: "Coffee, transit, and creative-class brand spots with cinematic restraint.",
      },
    ],
    pitchLine:
      "Holds the room without filling it. Built for the moment a viewer needs to keep watching but not be told what to feel. Cleared for sync.",
    comparable:
      "Adjacent to the downtempo electronica scoring Apple product reveals and Studio Ghibli end-credit beds.",
    drRhodes:
      "Flow mode at the calm end. Focus dominant at 92, stress modulation high at 81. This is concentration music. Pitch it for situations that need sustained attention without arousal — productivity apps, urban brand films, anywhere the viewer needs to stay with you.",
    brandMatches: ["Apple", "Notion", "Aesop"],
    comparisonTracks: [
      "Sister to downtempo Apple product launch beds.",
      "Same emotional geography as design-tool walkthrough soundtracks.",
      "Pairs with cinematic transit and city-life campaign music.",
    ],
  },
  {
    id: "long-loop",
    title: "Long Loop",
    artist: "Ezra Kane",
    albumArt: "/art/long-loop.svg",
    mode: "Recharge",
    fingerprint: {
      valence: 78,
      arousal: 34,
      tensionRelease: 28,
      motivationalEnergy: 41,
      emotionalDrift: 62,
      focus: 56,
      confidence: 68,
      stressModulation: 89,
      pacing: 38,
      aggression: 12,
      recovery: 84,
      behavioralResonance: 72,
    },
    signature:
      "A gentle restoration. Warm enough to feel like care, slow enough to feel like permission.",
    builtFor: [
      {
        title: "Lifestyle and wellness brand films",
        body: "Skincare, hospitality, slow-living retail. Anything sold by softness.",
      },
      {
        title: "End-credit beds and outros",
        body: "Documentary closing sequences, podcast outros, indie film resolutions.",
      },
      {
        title: "Hotel and hospitality lobbies",
        body: "Premium boutique hotel ambient programming, especially morning and evening hours.",
      },
    ],
    pitchLine:
      "Plays like a slow exhale. Built for moments of recovery and warm landings. Cleared for sync, available for licensing.",
    comparable:
      "Sits in the same neighborhood as boutique hospitality soundtracks and prestige skincare commercial beds.",
    drRhodes:
      "Recharge mode, deep in it. High valence at 78, high stress modulation at 89, recovery at 84. This is a song that gives. Pitch it where the brand or scene needs to feel like a place the viewer can rest. Lifestyle, hospitality, end-credit work.",
    brandMatches: ["Aesop", "Le Labo", "Soho House"],
    comparisonTracks: [
      "Cousin to premium skincare commercial soundtracks.",
      "Same emotional zone as boutique hotel lobby programming.",
      "Pairs with prestige documentary end-credit music.",
    ],
  },
  {
    id: "steel-bend",
    title: "Steel Bend",
    artist: "Vox Patrol",
    albumArt: "/art/steel-bend.svg",
    mode: "Recover",
    fingerprint: {
      valence: 42,
      arousal: 28,
      tensionRelease: 51,
      motivationalEnergy: 32,
      emotionalDrift: 71,
      focus: 64,
      confidence: 58,
      stressModulation: 67,
      pacing: 31,
      aggression: 24,
      recovery: 78,
      behavioralResonance: 81,
    },
    signature:
      "A patient, low-light meditation. Holds weight without insisting on it.",
    builtFor: [
      {
        title: "Slow-cinema film score",
        body: "Independent drama, character studies, films that earn their silences.",
      },
      {
        title: "Long-form documentary beds",
        body: "Investigative pieces and biographical docs that need atmosphere without distraction.",
      },
      {
        title: "Memorial and reflective brand work",
        body: "Anniversary spots, tribute campaigns, and quiet institutional storytelling.",
      },
    ],
    pitchLine:
      "Sits in the room with the viewer. Built for stories that take their time. Cleared for sync, available for licensing.",
    comparable:
      "Adjacent to the ambient indie scores of recent A24 dramas and the institutional reflection pieces brands use for milestone anniversaries.",
    drRhodes:
      "Recover mode. Quiet across the board, but behavioral resonance at 81 says it stays with the listener. Pitch this for prestige film and television that needs weight without overstatement. It will not compete with dialogue. It will not push the viewer. It will hold the room.",
    brandMatches: ["A24", "Criterion", "The New York Times"],
    comparisonTracks: [
      "Cousin to recent A24 ambient indie scores.",
      "Same emotional geography as long-form investigative documentary beds.",
      "Pairs with institutional anniversary and tribute films.",
    ],
  },
  {
    id: "hot-concrete",
    title: "Hot Concrete",
    artist: "Junie Vega",
    albumArt: "/art/hot-concrete.svg",
    mode: "Ready",
    fingerprint: {
      valence: 64,
      arousal: 88,
      tensionRelease: 82,
      motivationalEnergy: 79,
      emotionalDrift: 22,
      focus: 71,
      confidence: 86,
      stressModulation: 48,
      pacing: 91,
      aggression: 74,
      recovery: 18,
      behavioralResonance: 83,
    },
    signature:
      "A streetwise swagger with heat in the low end. All edge, no apology.",
    builtFor: [
      {
        title: "Fashion campaign films",
        body: "Streetwear drops, sneaker reveals, and luxury brand street-styled shoots.",
      },
      {
        title: "Cinematic action and chase",
        body: "Stylized action sequences, third-act pursuits, prestige crime-drama set pieces.",
      },
      {
        title: "Sports highlight reels",
        body: "Mix-tape style highlight cuts for NBA, NFL, and combat-sport content.",
      },
    ],
    pitchLine:
      "Walks into the room like it owns it. Built for the moments a brand needs swagger over sincerity. Cleared for sync.",
    comparable:
      "Sits adjacent to alt-R&B placements in recent luxury streetwear campaign films and prestige crime-drama set pieces.",
    drRhodes:
      "Ready mode with grit. Arousal at 88, pacing at 91, aggression at 74 — the song moves with intent. Pitch it where the brand needs to assert itself, not invite. Fashion, sport highlight work, stylized action. Avoid lifestyle and wellness — this song does not soothe.",
    brandMatches: ["Off-White", "Beats by Dre", "Bottega Veneta"],
    comparisonTracks: [
      "Cousin to alt-R&B placements in luxury streetwear films.",
      "Same emotional zone as prestige crime-drama set-piece music.",
      "Pairs with NBA mix-tape highlight cut scoring.",
    ],
  },
];

export const FINGERPRINT_ORDER: Array<{
  key: keyof Fingerprint;
  label: string;
}> = [
  { key: "valence", label: "Valence" },
  { key: "arousal", label: "Arousal" },
  { key: "tensionRelease", label: "Tension & Release" },
  { key: "motivationalEnergy", label: "Motivational Energy" },
  { key: "emotionalDrift", label: "Emotional Drift" },
  { key: "focus", label: "Focus" },
  { key: "confidence", label: "Confidence" },
  { key: "stressModulation", label: "Stress Modulation" },
  { key: "pacing", label: "Pacing" },
  { key: "aggression", label: "Aggression" },
  { key: "recovery", label: "Recovery" },
  { key: "behavioralResonance", label: "Behavioral Resonance" },
];

export function getTrackById(id: string): Track {
  return tracks.find((t) => t.id === id) ?? tracks[0];
}

export function matchInputToTrack(input: string): Track {
  const normalized = input.toLowerCase().trim();
  if (!normalized) return tracks[0];
  for (const t of tracks) {
    if (
      normalized.includes(t.title.toLowerCase()) ||
      normalized.includes(t.artist.toLowerCase())
    ) {
      return t;
    }
  }
  const hash = Array.from(normalized).reduce(
    (acc, c) => acc + c.charCodeAt(0),
    0,
  );
  return tracks[hash % tracks.length];
}
