import { Mode, getReportById, MODE_COLORS } from "@/lib/fixtures/tracks";
import { ScanRecordOnAccount } from "@/lib/accounts";

const CORPUS_NORM = { focus: 64, balance: 67, motivation: 71, calm: 58 };

const VERTICAL_BY_DIMENSION: Record<keyof typeof CORPUS_NORM, string> = {
  focus: "sustained-attention",
  balance: "multi-cut and extended-format",
  motivation: "athletic and performance",
  calm: "wellness, hospitality, and intimate",
};

export interface CatalogIntelligence {
  scanCount: number;
  dominantMode: Mode | null;
  dominantModeCount: number;
  modesPresent: number;
  signatureDescriptor: string;
  averages: { focus: number; balance: number; motivation: number; calm: number };
  modeVersatility: string;
  crossTrackObservation: string;
  catalogVsCorpus: string;
  comparable: CatalogComparable;
}

export interface CatalogComparable {
  artist: string;
  placements: string;
  demand: string;
  vertical: string;
}

function modeCountsFor(scans: ScanRecordOnAccount[]): Record<Mode, number> {
  const counts: Record<Mode, number> = {
    Ready: 0,
    Recover: 0,
    Recharge: 0,
    Flow: 0,
  };
  for (const s of scans) {
    const r = getReportById(s.trackSlug);
    if (r) counts[r.epi.mode] += 1;
  }
  return counts;
}

function averageScoresFor(
  scans: ScanRecordOnAccount[],
): { focus: number; balance: number; motivation: number; calm: number } {
  if (scans.length === 0) return { focus: 0, balance: 0, motivation: 0, calm: 0 };
  const sum = { focus: 0, balance: 0, motivation: 0, calm: 0 };
  let n = 0;
  for (const s of scans) {
    const r = getReportById(s.trackSlug);
    if (!r) continue;
    for (const cs of r.chrp_scores) {
      const k = cs.name.toLowerCase() as keyof typeof sum;
      if (k in sum) sum[k] += cs.score;
    }
    n += 1;
  }
  if (n === 0) return { focus: 0, balance: 0, motivation: 0, calm: 0 };
  return {
    focus: Math.round(sum.focus / n),
    balance: Math.round(sum.balance / n),
    motivation: Math.round(sum.motivation / n),
    calm: Math.round(sum.calm / n),
  };
}

function pickDominantMode(
  counts: Record<Mode, number>,
): { mode: Mode | null; count: number } {
  let best: Mode | null = null;
  let bestCount = 0;
  (Object.keys(counts) as Mode[]).forEach((m) => {
    if (counts[m] > bestCount) {
      best = m;
      bestCount = counts[m];
    }
  });
  return { mode: best, count: bestCount };
}

function computeSignatureDescriptor(
  averages: { focus: number; balance: number; motivation: number; calm: number },
  scans: ScanRecordOnAccount[],
): string {
  if (averages.motivation > 75) return "high Motivation";
  if (averages.calm > 65) return "restorative consistency";
  if (averages.balance > 80) return "structural composure";
  if (averages.focus > 80) return "sustained attention";
  // Variance check across the four dimensions, across scans
  const vals = scans
    .map((s) => getReportById(s.trackSlug))
    .filter(Boolean)
    .flatMap((r) => r!.chrp_scores.map((c) => c.score));
  if (vals.length >= 4) {
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const variance =
      vals.reduce((a, b) => a + (b - mean) * (b - mean), 0) / vals.length;
    if (variance < 200) return "tight emotional center";
  }
  return "emerging artistic range";
}

// Percentage-based branches per the cleanup brief:
//   one mode >= 80% of tracks  -> single-mode commit copy
//   one mode 50-79%            -> dominant-but-not-exclusive copy
//   no mode > 50%              -> multi-mode copy keyed on modes-present count
function modeVersatilityCallout(
  modesPresent: number,
  dominantMode: Mode | null,
  dominantPct: number,
): string {
  if (dominantPct >= 80 && dominantMode) {
    return `Your catalog commits to a single mode. This is rare consistency. ${dominantMode}-only artists develop dedicated supervisor relationships and own their lane decisively.`;
  }
  if (dominantPct >= 50 && dominantMode) {
    return `Your catalog has a dominant mode — ${dominantMode} leads at ${dominantPct}% — with deliberate range around it. This combination of signature and versatility is commercially strong: supervisors learn your sound while knowing you can adapt to brief.`;
  }
  if (modesPresent >= 4) {
    return "Your catalog spans 4 distinct modes. Top 8% versatility across the CHRP corpus. Multi-mode artists place broader than single-mode performers and serve a wider range of active briefs.";
  }
  if (modesPresent === 3) {
    return "Your catalog spans 3 distinct modes. Top 18% versatility across the CHRP corpus. Multi-mode artists place broader than single-mode performers and serve a wider range of active briefs.";
  }
  if (modesPresent === 2) {
    return "Your catalog spans 2 distinct modes. Multi-mode artists place broader than single-mode performers and serve a wider range of active briefs.";
  }
  return "Your catalog is still emerging. Scan a wider range of tracks to position across modes.";
}

function polygonDistance(
  a: { focus: number; balance: number; motivation: number; calm: number },
  b: { focus: number; balance: number; motivation: number; calm: number },
): number {
  return (
    Math.abs(a.focus - b.focus) +
    Math.abs(a.balance - b.balance) +
    Math.abs(a.motivation - b.motivation) +
    Math.abs(a.calm - b.calm)
  );
}

function getPolygonFor(scan: ScanRecordOnAccount) {
  const r = getReportById(scan.trackSlug);
  if (!r) return null;
  const out = { focus: 0, balance: 0, motivation: 0, calm: 0 };
  for (const cs of r.chrp_scores) {
    const k = cs.name.toLowerCase() as keyof typeof out;
    if (k in out) out[k] = cs.score;
  }
  return out;
}

function crossTrackObservation(scans: ScanRecordOnAccount[]): string {
  if (scans.length < 2) {
    return "Your catalog shows intentional emotional range rather than clustering. This breadth is a working artist's signature — deliberate variety across releases rather than one repeating pattern. Lean into this in pitches: you adapt to brief, you don't force one sound onto every placement.";
  }
  let closestPair: [number, number] | null = null;
  let closestDist = Infinity;
  for (let i = 0; i < scans.length; i++) {
    for (let j = i + 1; j < scans.length; j++) {
      const pi = getPolygonFor(scans[i]);
      const pj = getPolygonFor(scans[j]);
      if (!pi || !pj) continue;
      const d = polygonDistance(pi, pj);
      if (d < closestDist) {
        closestDist = d;
        closestPair = [i, j];
      }
    }
  }
  // Distance < 30 across four 0-100 dimensions counts as "tight"
  if (closestPair && closestDist < 30) {
    const [i, j] = closestPair;
    const a = getReportById(scans[i].trackSlug)!.track.title;
    const b = getReportById(scans[j].trackSlug)!.track.title;
    return `${a} and ${b} share an unusually tight signature — your strongest cross-pitchable pair. These two work as a package for supervisors who need consistency across two cues in the same scene or campaign.`;
  }
  return "Your catalog shows intentional emotional range rather than clustering. This breadth is a working artist's signature — deliberate variety across releases rather than one repeating pattern. Lean into this in pitches: you adapt to brief, you don't force one sound onto every placement.";
}

function catalogVsCorpusCallout(averages: {
  focus: number;
  balance: number;
  motivation: number;
  calm: number;
}): string {
  let bestDim: keyof typeof CORPUS_NORM = "focus";
  let bestDelta = -Infinity;
  (Object.keys(CORPUS_NORM) as (keyof typeof CORPUS_NORM)[]).forEach((dim) => {
    const delta = averages[dim] - CORPUS_NORM[dim];
    if (delta > bestDelta) {
      bestDelta = delta;
      bestDim = dim;
    }
  });
  if (bestDelta <= 0) {
    return "Your catalog sits inside the CHRP corpus norms across all dimensions. Tracks behave like the median — no single dimension yet defines your positioning. Keep scanning to sharpen the signal.";
  }
  const dimName =
    bestDim.charAt(0).toUpperCase() + bestDim.slice(1);
  return `Your catalog's average ${dimName} score sits ${bestDelta} points above the CHRP corpus norm for artists in your mode mix. This is a structural advantage in ${VERTICAL_BY_DIMENSION[bestDim]} placements — the kind of positioning that supervisors learn to expect from you.`;
}

function pickComparable(
  dominantMode: Mode | null,
  averages: { focus: number; balance: number; motivation: number; calm: number },
): CatalogComparable {
  // Primary match: dominant mode + high score in the matching dimension.
  if (dominantMode === "Ready" && averages.motivation >= 70) {
    return {
      artist: "Sia",
      placements: "athletic anthems, performance campaigns, sport documentary",
      demand: "strong",
      vertical: "athletic + sport",
    };
  }
  if (dominantMode === "Recharge" && averages.balance >= 70) {
    return {
      artist: "Norah Jones",
      placements: "wedding and milestone campaigns, romantic drama, family lifestyle",
      demand: "moderate-strong",
      vertical: "wedding + milestone",
    };
  }
  if (dominantMode === "Recover" && averages.calm >= 60) {
    return {
      artist: "Sufjan Stevens",
      placements: "in-memoriam, third-act resolution, prestige drama close",
      demand: "moderate",
      vertical: "film + television",
    };
  }
  if (dominantMode === "Flow" && averages.focus >= 70) {
    return {
      artist: "Bonobo",
      placements: "kinetic montages, retro-cool brand films, travel sequences",
      demand: "moderate-strong",
      vertical: "comedy + retro-cool",
    };
  }
  // Fallback: closest dominant-mode match without the secondary-dimension floor.
  switch (dominantMode) {
    case "Ready":
      return {
        artist: "Sia",
        placements: "athletic anthems, performance campaigns, sport documentary",
        demand: "strong",
        vertical: "athletic + sport",
      };
    case "Recharge":
      return {
        artist: "Norah Jones",
        placements: "wedding and milestone campaigns, romantic drama, family lifestyle",
        demand: "moderate-strong",
        vertical: "wedding + milestone",
      };
    case "Recover":
      return {
        artist: "Sufjan Stevens",
        placements: "in-memoriam, third-act resolution, prestige drama close",
        demand: "moderate",
        vertical: "film + television",
      };
    case "Flow":
    default:
      return {
        artist: "Bonobo",
        placements: "kinetic montages, retro-cool brand films, travel sequences",
        demand: "moderate-strong",
        vertical: "comedy + retro-cool",
      };
  }
}

// crossTrackObservation copy must stay consistent with the mode-versatility
// verdict. When the catalog clearly spans multiple modes (dominant < 80%),
// the named-pair phrasing is misleading even if two polygons happen to be
// close, so we suppress it and use the multi-mode range copy.
function crossTrackForMulti(scans: ScanRecordOnAccount[]): string {
  if (scans.length < 2) {
    return multiModeRangeCopy();
  }
  return crossTrackObservation(scans);
}

function multiModeRangeCopy(): string {
  return "Your catalog shows intentional emotional range rather than clustering. This breadth is a working artist's signature — deliberate variety across releases rather than one repeating pattern. Lean into this in pitches: you adapt to brief, you don't force one sound onto every placement.";
}

export function getCatalogIntelligence(
  scans: ScanRecordOnAccount[],
): CatalogIntelligence {
  const counts = modeCountsFor(scans);
  const { mode: dominantMode, count: dominantModeCount } = pickDominantMode(counts);
  const modesPresent = (Object.values(counts) as number[]).filter((n) => n > 0).length;
  const totalCounted = (Object.values(counts) as number[]).reduce((a, b) => a + b, 0);
  const dominantPct =
    totalCounted > 0 ? Math.round((dominantModeCount / totalCounted) * 100) : 0;
  const averages = averageScoresFor(scans);
  const signatureDescriptor = computeSignatureDescriptor(averages, scans);
  const multiMode = dominantPct < 80;
  return {
    scanCount: scans.length,
    dominantMode,
    dominantModeCount,
    modesPresent,
    signatureDescriptor,
    averages,
    modeVersatility: modeVersatilityCallout(modesPresent, dominantMode, dominantPct),
    crossTrackObservation: multiMode ? multiModeRangeCopy() : crossTrackForMulti(scans),
    catalogVsCorpus: catalogVsCorpusCallout(averages),
    comparable: pickComparable(dominantMode, averages),
  };
}

// Fallback intelligence for the public URL-param route where the viewer
// doesn't carry the underlying scan list. Derives mode versatility from the
// profile's mode_distribution and the rest from the signature polygon.
export function getCatalogIntelligenceFromProfile(profile: {
  signature: { polygon: { focus: number; balance: number; motivation: number; calm: number }; dominant_mode: Mode };
  mode_distribution: { Flow: number; Ready: number; Recharge: number; Recover: number };
}): CatalogIntelligence {
  const dominantMode = profile.signature.dominant_mode;
  const dist = profile.mode_distribution;
  const modesPresent = (Object.values(dist) as number[]).filter((n) => n > 0).length;
  const dominantPct = Math.max(...(Object.values(dist) as number[]));
  const averages = profile.signature.polygon;
  return {
    scanCount: 0,
    dominantMode,
    dominantModeCount: 0,
    modesPresent,
    signatureDescriptor: computeSignatureDescriptor(averages, []),
    averages,
    modeVersatility: modeVersatilityCallout(modesPresent, dominantMode, dominantPct),
    crossTrackObservation: multiModeRangeCopy(),
    catalogVsCorpus: catalogVsCorpusCallout(averages),
    comparable: pickComparable(dominantMode, averages),
  };
}

export function getModeChip(mode: Mode | null) {
  if (!mode) return null;
  return MODE_COLORS[mode];
}
