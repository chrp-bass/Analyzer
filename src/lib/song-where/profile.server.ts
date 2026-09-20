import "server-only";

export const MODES = ["Flow", "Ready", "Recharge", "Recover"] as const;
export type Mode = (typeof MODES)[number];
export type Dimension = "focus" | "calm" | "motivation" | "balance";

export type SongProfile = {
  analysisId: string;
  mode: Mode;
  epi: number;
  scores: Record<Dimension, number>;
  valence: number;
  arousal: number;
};

function numberIn(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max
    ? value : null;
}

export function profileFromAnalysis(row: {
  id: string;
  status: string;
  epi_score: unknown;
  mode: unknown;
  scores: unknown;
  circumplex: unknown;
}): SongProfile | null {
  if (row.status !== "complete" || !MODES.includes(row.mode as Mode)) return null;
  const s = row.scores as Record<string, unknown> | null;
  const c = row.circumplex as Record<string, unknown> | null;
  if (!s || !c) return null;
  const epi = numberIn(row.epi_score, 0, 100);
  const focus = numberIn(s.focus, 30, 99);
  const calm = numberIn(s.calm, 30, 99);
  const motivation = numberIn(s.motivation, 30, 99);
  const balance = numberIn(s.balance, 30, 99);
  const valence = numberIn(c.valence, 0, 1);
  const arousal = numberIn(c.arousal, 0, 1);
  if ([epi, focus, calm, motivation, balance, valence, arousal].some((v) => v === null)) return null;
  return {
    analysisId: row.id,
    mode: row.mode as Mode,
    epi: epi!,
    scores: { focus: focus!, calm: calm!, motivation: motivation!, balance: balance! },
    valence: valence!,
    arousal: arousal!,
  };
}
