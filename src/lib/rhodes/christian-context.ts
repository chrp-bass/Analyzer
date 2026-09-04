/**
 * Christian / Worship / Gospel context lens.
 *
 * ONE JOB: read Soundcharts genre metadata and answer whether that metadata,
 * on its own, clearly establishes the song's context as Christian, Worship,
 * CCM or Gospel. If it does, downstream interpretation may include AT MOST
 * one restrained sentence about how the song's measured emotional-performance
 * posture may function within that already-established context.
 *
 * WHAT THIS MODULE DOES NOT DO:
 *
 *   - It does not read the artist name, song title, audio features, EPI,
 *     mode, arousal, valence, or any CHRP dimension. Christian context is
 *     established by trusted source metadata alone.
 *   - It does not classify musical tradition. If Soundcharts says the root
 *     is "Christian & Gospel" with no sub, this returns the broad label; it
 *     does not decide the song is Worship or Gospel or CCM on its own.
 *   - It does not diagnose denomination, race, demographic, artist faith or
 *     spiritual intent. None of that is measurable and none of that is here.
 *
 * A false negative — Soundcharts had no Christian genre and we said nothing —
 * is acceptable. A false positive — inferring Christian context from
 * something other than Soundcharts genre metadata — is not.
 */

/**
 * The four traditions the Rhodes lens is allowed to respect. Only what the
 * metadata specifically names.
 *
 *   - "worship"   — Soundcharts explicitly identified Worship / Praise &
 *                   Worship.
 *   - "gospel"    — Soundcharts explicitly identified Gospel / Contemporary
 *                   Gospel / Traditional Gospel.
 *   - "ccm"       — Soundcharts explicitly identified CCM / Contemporary
 *                   Christian.
 *   - "christian" — Soundcharts identified the broad category (Christian &
 *                   Gospel or Christian) without narrowing further. Rhodes
 *                   stays broad in the same way.
 */
export type ChristianTradition = "worship" | "gospel" | "ccm" | "christian";

export interface ChristianContext {
  /** Which tradition Soundcharts specifically named. */
  tradition: ChristianTradition;
  /**
   * The exact raw strings from Soundcharts that established the gate — kept
   * so a later audit can answer "which supplied fact opened this?" without
   * re-reading the payload.
   */
  evidence: string[];
}

/**
 * Case-insensitive exact match against the specific labels Soundcharts uses.
 * Order matters only for readability; the resolver below picks the most
 * specific tradition present, so a song with root "Christian & Gospel" and
 * sub "Worship" resolves to "worship", not to "christian".
 */
const WORSHIP_LABELS = new Set([
  "worship",
  "praise & worship",
  "praise and worship",
]);
const GOSPEL_LABELS = new Set([
  "gospel",
  "contemporary gospel",
  "traditional gospel",
  "urban contemporary gospel",
  "southern gospel",
]);
const CCM_LABELS = new Set([
  "ccm",
  "contemporary christian",
  "contemporary christian music",
]);
const BROAD_CHRISTIAN_LABELS = new Set([
  "christian",
  "christian & gospel",
  "christian and gospel",
  "christian rock",
  "christian pop",
  "christian hip-hop",
  "christian hip hop",
]);

function normalize(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * A defensive walker over the Soundcharts payload.
 *
 * The v2.25 `by-isrc` endpoint documents `song.genres` as an array of
 * `{ root: string, sub: string[] }`, and that is what we read. The walker
 * also tolerates a genre appearing as a bare string, a single object, or an
 * array of strings — the payload occasionally arrives with only `root` set,
 * or a single top-level string, and rejecting a valid Christian classifier
 * because its shape wobbled would be silly. Nothing else is treated as
 * signal: no artist genre, no album genre, no title, no audio.
 */
function collectGenreStrings(source: unknown): string[] {
  const collected: string[] = [];
  const genres = (source as { genres?: unknown } | null)?.genres;
  if (!genres) return collected;

  const push = (v: unknown) => {
    const n = normalize(v);
    if (n) collected.push(n);
  };

  if (Array.isArray(genres)) {
    for (const g of genres) {
      if (typeof g === "string") {
        push(g);
      } else if (g && typeof g === "object") {
        const obj = g as { root?: unknown; sub?: unknown };
        push(obj.root);
        if (Array.isArray(obj.sub)) {
          for (const s of obj.sub) push(s);
        } else if (typeof obj.sub === "string") {
          push(obj.sub);
        }
      }
    }
  } else if (typeof genres === "string") {
    push(genres);
  } else if (typeof genres === "object") {
    // A defensive path for a single-object genres field. Same shape.
    const obj = genres as { root?: unknown; sub?: unknown };
    push(obj.root);
    if (Array.isArray(obj.sub)) {
      for (const s of obj.sub) push(s);
    } else if (typeof obj.sub === "string") {
      push(obj.sub);
    }
  }

  return collected;
}

/**
 * Decide the tradition from what the metadata specifically named.
 *
 * Specificity wins. If the payload contains both the broad "Christian &
 * Gospel" root and a specific "Worship" sub, we respect "worship". If the
 * payload is only the broad root, we stay broad. Gospel and CCM are never
 * rewritten as Worship, and vice versa.
 */
export function extractChristianContext(
  soundchartsObject: unknown,
): ChristianContext | null {
  const labels = collectGenreStrings(soundchartsObject);
  if (labels.length === 0) return null;

  const evidence = Array.from(new Set(labels));

  const hasWorship = evidence.some((l) => WORSHIP_LABELS.has(l));
  const hasGospel = evidence.some((l) => GOSPEL_LABELS.has(l));
  const hasCcm = evidence.some((l) => CCM_LABELS.has(l));
  const hasBroad = evidence.some((l) => BROAD_CHRISTIAN_LABELS.has(l));

  // Prefer the most specific tradition the metadata actually named. Only one
  // may fire; a song labelled both Worship and Gospel is unusual enough that
  // the more musically specific tradition (Gospel) wins so Rhodes does not
  // rewrite the identity as Worship.
  let tradition: ChristianTradition | null = null;
  if (hasGospel) tradition = "gospel";
  else if (hasWorship) tradition = "worship";
  else if (hasCcm) tradition = "ccm";
  else if (hasBroad) tradition = "christian";

  if (!tradition) return null;

  return { tradition, evidence };
}

/**
 * The lowercase words / phrases that must never appear in a report unless
 * the Christian-context gate opened, and — even when the gate opened — must
 * never appear at all in the specifically prohibited forms (theology,
 * ministry effectiveness, congregational prediction, lyric interpretation).
 *
 * Kept here so the governor can import one canonical list.
 */
export const CHRISTIAN_CONTEXT_TERMS = [
  "christian",
  "worship",
  "gospel",
  "ccm",
  "contemporary christian",
  "devotional",
  "personal devotion",
  "ministry",
  "church",
  "congregational",
  "faith-forward",
] as const;

/**
 * Language that is ALWAYS prohibited — a theological claim, a divine-
 * activity prediction, a ministry-effectiveness prediction, or a
 * congregational-adoption prediction — regardless of whether the Christian
 * context gate has opened. The gate permits interpretation of measured
 * posture; it never permits theology.
 */
export const CHRISTIAN_PROHIBITED_PATTERNS: Array<{
  pattern: RegExp;
  rule: string;
  why: string;
}> = [
  {
    pattern: /\b(god|the\s+lord|jesus)\s+will\b/i,
    rule: "christian-divine-activity",
    why: "Predicts what God will do. CHRP does not.",
  },
  {
    pattern: /\bholy\s+spirit\b/i,
    rule: "christian-divine-activity",
    why: "Claims the Holy Spirit is present or invoked. CHRP does not.",
  },
  {
    pattern: /\banointed\b/i,
    rule: "christian-divine-activity",
    why: "Anointing is a theological claim, not a measurement.",
  },
  {
    pattern: /\bbiblically\s+sound\b/i,
    rule: "christian-doctrinal-claim",
    why: "Biblical correctness is a doctrinal claim CHRP cannot make.",
  },
  {
    pattern: /\btheologically\s+correct\b/i,
    rule: "christian-doctrinal-claim",
    why: "Theological correctness is a doctrinal claim CHRP cannot make.",
  },
  {
    pattern: /\bspiritually\s+(powerful|anointed)\b/i,
    rule: "christian-spiritual-claim",
    why: "Spiritual power is not a CHRP measurement.",
  },
  {
    pattern: /\bthis\s+will\s+minister\b/i,
    rule: "christian-ministry-prediction",
    why: "Predicts ministry effect. CHRP does not.",
  },
  {
    pattern: /\b(perfect|great)\s+for\s+(your\s+)?sunday\s+(worship|service|set)\b/i,
    rule: "christian-congregational-prediction",
    why: "Predicts congregational adoption. CHRP does not.",
  },
  {
    pattern: /\bworship\s+set\b/i,
    rule: "christian-liturgical-setting",
    why: "Assigns a liturgical slot. CHRP interprets posture, not liturgy.",
  },
  {
    pattern: /\baltar\s+call\b/i,
    rule: "christian-liturgical-setting",
    why: "Assigns a liturgical slot. CHRP interprets posture, not liturgy.",
  },
  {
    pattern: /\bshould\s+be\s+sung\s+(on|in|at)\b/i,
    rule: "christian-congregational-prediction",
    why: "Prescribes where the song should be sung. CHRP does not.",
  },
  {
    pattern: /\bthis\s+belongs\s+in\s+church\b/i,
    rule: "christian-congregational-prediction",
    why: "Assigns the song a venue. CHRP does not.",
  },
  {
    pattern: /\b(young\s+life|hillsong|bethel|elevation)\b/i,
    rule: "christian-named-organization",
    why: "Names a specific ministry organization. CHRP does not target one.",
  },
];
