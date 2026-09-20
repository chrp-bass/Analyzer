import "server-only";
import { MODES, type Dimension, type Mode } from "./profile.server";

export type Range = { min: number; max: number };
export type OpportunityTarget = {
  modes?: Mode[];
  dimensions?: Partial<Record<Dimension, Range>>;
  valence?: Range;
  arousal?: Range;
  epiFloor?: number;
};

const DIMENSIONS: Dimension[] = ["focus", "calm", "motivation", "balance"];

function range(value: unknown, ceiling: number): Range | null {
  if (!value || typeof value !== "object") return null;
  const { min, max } = value as Record<string, unknown>;
  return typeof min === "number" && typeof max === "number" &&
    Number.isFinite(min) && Number.isFinite(max) && 0 <= min && min <= max && max <= ceiling
    ? { min, max } : null;
}

/** Only explicit structured brief fields become matching claims. */
export function normalizeTarget(input: unknown): OpportunityTarget | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const result: OpportunityTarget = {};
  if (Array.isArray(raw.modes)) {
    const modes = raw.modes.filter((x): x is Mode => MODES.includes(x as Mode));
    if (modes.length) result.modes = Array.from(new Set(modes));
  }
  if (raw.dimensions && typeof raw.dimensions === "object") {
    const dimensions: OpportunityTarget["dimensions"] = {};
    for (const key of DIMENSIONS) {
      const parsed = range((raw.dimensions as Record<string, unknown>)[key], 100);
      if (parsed) dimensions[key] = parsed;
    }
    if (Object.keys(dimensions).length) result.dimensions = dimensions;
  }
  const valence = range(raw.valence, 1);
  const arousal = range(raw.arousal, 1);
  if (valence) result.valence = valence;
  if (arousal) result.arousal = arousal;
  if (typeof raw.epiFloor === "number" && raw.epiFloor >= 0 && raw.epiFloor <= 100) {
    result.epiFloor = raw.epiFloor;
  }
  return Object.keys(result).length ? result : null;
}
