import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { unlockedScansFor } from "@/lib/commerce/entitlements";
import { isCompletePaidPayload } from "@/lib/reports/store";
import { isFixtureKey } from "@/lib/scan-id";
import { profileFromAnalysis } from "./profile.server";
import { matchSong, MATCHER_VERSION } from "./match.server";
import { classifySpecificity, songMatchable } from "./specificity.server";
import { publicHttpsUrl } from "./sources/public-url.server";
import { verifySubmissionRoute } from "./quality.server";

type Db = ReturnType<typeof createAdminClient>;
type Criterion = "mood" | "energy" | "genre" | "vocal" | "tempo" | "usage";
const LABELS: Criterion[] = ["mood", "energy", "genre", "vocal", "tempo", "usage"];

/** Briefs are untrusted data. No HTML, instructions, or unlabelled guesses are retained. */
export function parseCreatorBrief(input: { subject: string; text: string }, now = new Date()) {
  if (!input.subject?.trim() || input.subject.length > 250 || !input.text || input.text.length > 30_000)
    return null;
  const cleaned = input.text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
  const field = (label: string, max = 250) => cleaned.match(new RegExp(`^${label}:\\s*(.+)$`, "im"))?.[1]?.trim().slice(0, max) ?? null;
  const rawUrl = field("(?:Submission URL|Apply URL|Application URL)", 2000);
  const destination = rawUrl ? publicHttpsUrl(rawUrl) : null;
  const deadlineRaw = field("(?:Deadline|Submit by|Apply by)", 80);
  const deadlineTime = deadlineRaw ? Date.parse(deadlineRaw) : NaN;
  if (!destination || !Number.isFinite(deadlineTime) || deadlineTime <= now.getTime()) return null;
  const criteria: Partial<Record<Criterion, string>> = {};
  for (const label of LABELS) {
    const value = field(label, 120);
    if (value) criteria[label] = value;
  }
  const tier = classifySpecificity({ criteria });
  const energy = criteria.energy?.toLowerCase() ?? "";
  const mood = criteria.mood?.toLowerCase() ?? "";
  // Only explicit emotional terms map to approved, persisted CHRP outputs.
  const target: { valence?: { min: number; max: number }; arousal?: { min: number; max: number } } = {};
  if (/\b(?:high.energy|energetic|upbeat)\b/.test(energy)) target.arousal = { min: 0.7, max: 1 };
  if (/\b(?:low.energy|calm|gentle)\b/.test(energy)) target.arousal = { min: 0, max: 0.35 };
  if (/\b(?:uplifting|hopeful|joyful|positive)\b/.test(mood)) target.valence = { min: 0.65, max: 1 };
  if (/\b(?:melancholic|somber|sad)\b/.test(mood)) target.valence = { min: 0, max: 0.35 };
  const requirement = field("Submission requirement", 40)?.toLowerCase();
  const submissionRequirement = ["free", "paid", "membership", "credits"].includes(requirement ?? "")
    ? requirement! : "unknown";
  const source = field("Source URL", 2000);
  const provenance = source ? publicHttpsUrl(source) : null;
  return {
    title: input.subject.trim(), destination: destination.href,
    deadline: new Date(deadlineTime).toISOString(), criteria, tier, target,
    matchable: songMatchable(tier, target), sourceUrl: provenance?.href ?? null,
    submissionRequirement, submissionCost: field("Submission cost", 80),
  };
}

/** This path never makes creator-supplied content global inventory. */
export async function ingestCreatorBrief(db: Db, creatorId: string,
  input: { messageId: string; subject: string; text: string; receivedAt?: string }) {
  const parsed = parseCreatorBrief(input);
  if (!parsed || !input.messageId || input.messageId.length > 255) return { status: "quarantined" as const };
  const verifiedAt = await verifySubmissionRoute(parsed.destination);
  if (!verifiedAt) return { status: "quarantined" as const };
  const { data: source, error: sourceError } = await db.from("opportunity_sources")
    .upsert({ name: "creator-forwarded", kind: "creator", trust_level: "verified",
      access_type: "creator", terms_status: "private_to_creator", robots_status: "not_applicable",
      auth_scope: "verified_sender", active: true }, { onConflict: "name" }).select("id").single();
  if (sourceError || !source) throw sourceError ?? new Error("private source unavailable");
  const snapshot = new Date().toISOString();
  const { data: opportunity, error } = await db.from("opportunities").upsert({
    source_id: source.id, external_ref: `${creatorId}:${input.messageId}`,
    owner_creator_id: creatorId, access_class: "PRIVATE_TO_CREATOR",
    title: parsed.title, raw_text: null, status: "open", deadline: parsed.deadline,
    submission_url: parsed.destination, provenance_url: parsed.sourceUrl ?? parsed.destination,
    target: parsed.target, explicit_criteria: parsed.criteria, normalizer_version: "creator-explicit-v1",
    specificity_tier: parsed.tier, song_matchable: parsed.matchable,
    submission_requirement: parsed.submissionRequirement, submission_cost: parsed.submissionCost,
    content_hash: createHash("sha256").update(`${creatorId}:${input.messageId}:${parsed.deadline}`).digest("hex"),
    synthetic: false, verification_status: "creator_supplied", fetched_at: snapshot,
    source_snapshot_at: snapshot, route_verified_at: verifiedAt,
    eligibility_requirements: {}, last_seen_at: snapshot,
  }, { onConflict: "source_id,external_ref" }).select("id").single();
  if (error || !opportunity) throw error ?? new Error("private opportunity unavailable");
  if (!parsed.matchable) return { status: "stored" as const, matches: 0 };
  const { data: analyses, error: analysisError } = await db.from("analyses")
    .select("id,scan_id,status,epi_score,mode,scores,circumplex,songs!inner(track_key,title),reports!inner(payload)")
    .eq("creator_id", creatorId).eq("status", "complete").limit(100);
  if (analysisError) throw analysisError;
  const rows = (analyses ?? []) as unknown as Array<{
    id: string; scan_id: string; status: string; epi_score: number; mode: string;
    scores: unknown; circumplex: unknown; songs: { track_key: string; title: string };
    reports: { payload: unknown };
  }>;
  const unlocked = await unlockedScansFor(creatorId,
    rows.map((row) => ({ scanId: row.scan_id, trackKey: row.songs.track_key })));
  let matches = 0;
  for (const row of rows) {
    if (!unlocked.has(row.scan_id) || isFixtureKey(row.songs.track_key) ||
        !isCompletePaidPayload(row.reports.payload)) continue;
    const profile = profileFromAnalysis(row);
    const fit = profile ? matchSong(profile, parsed.target) : null;
    if (!fit) continue;
    const { data: existing, error: existingError } = await db.from("song_opportunity_matches")
      .select("id,match_score,fit_band").eq("analysis_id", row.id)
      .eq("opportunity_id", opportunity.id).limit(1);
    if (existingError) throw existingError;
    // Unmeasured genre, vocals, instrumentation and rights cannot become fit claims.
    const band = "worth_exploring";
    if (existing?.[0] && Number(existing[0].match_score) === fit.score &&
        existing[0].fit_band === band) { matches++; continue; }
    const { error: matchError } = await db.from("song_opportunity_matches").upsert({
      analysis_id: row.id, opportunity_id: opportunity.id, match_score: fit.score,
      fit_band: band, trust_rank: 3, matcher_version: MATCHER_VERSION,
      matched_at: snapshot,
    }, { onConflict: "analysis_id,opportunity_id" });
    if (matchError) throw matchError;
    const { error: historyError } = await db.from("song_opportunity_match_history").insert({
      analysis_id: row.id, opportunity_id: opportunity.id, match_score: fit.score,
      fit_band: band, matcher_version: MATCHER_VERSION,
      event: existing?.length ? "rescored" : "created",
    });
    if (historyError) throw historyError;
    matches++;
  }
  return { status: "stored" as const, matches };
}
