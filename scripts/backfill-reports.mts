#!/usr/bin/env -S npx tsx
/**
 * scripts/backfill-reports.mts
 *
 * The EXPLICIT, CONTROLLED, OFFLINE recovery for entitled reports whose
 * persisted payload is missing or incomplete. This is the only place, other
 * than a buyer's own pre-checkout preparation, that regenerates a report —
 * and it runs OUT OF BAND, operated by a human before deployment, so that no
 * buyer's first paid read ever performs upstream work.
 *
 * It reuses the exact production preparer (`prepareReportForScan`), so it is
 * idempotent and concurrency-safe by the same durable claim: run it twice, or
 * alongside a buyer, and still exactly one generation happens per scan.
 *
 * Because it goes through the server preparation chain (Soundcharts, the
 * enrichment endpoints, Anthropic), it must run with the `react-server`
 * import condition so the `server-only` guard resolves to its no-op, exactly
 * as it does inside Next on the server:
 *
 *   NODE_OPTIONS='--conditions=react-server' \
 *     NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
 *     SOUNDCHARTS_API_KEY=… SOUNDCHARTS_APP_ID=… \
 *     SPOTIFY_CLIENT_ID=… SPOTIFY_CLIENT_SECRET=… ANTHROPIC_API_KEY=… \
 *     npx tsx scripts/backfill-reports.mts            # backfill all incomplete
 *     npx tsx scripts/backfill-reports.mts <creatorId> <scanId>   # one scan
 *     npx tsx scripts/backfill-reports.mts --dry-run  # list, generate nothing
 *
 * With no arguments it re-derives the same MISSING/INCOMPLETE census the
 * inventory script produces and regenerates each. Pass a single
 * (creatorId, scanId) to backfill exactly one.
 */

import { createClient } from "@supabase/supabase-js";
import { isCompletePaidPayload } from "@/lib/reports/store";
import { prepareReportForScan } from "@/lib/reports/prepare.server";

const CURRENT_VERSION = "chrp-rhodes-v2";

function env(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var ${name}.`);
    process.exit(2);
  }
  return v;
}

interface Target {
  creatorId: string;
  scanId: string;
}

async function incompleteTargets(): Promise<Target[]> {
  const db = createClient(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const entitled: Target[] = [];
  const { data: songEnts } = await db
    .from("entitlements")
    .select("user_id,scan_id")
    .eq("offer", "song_intelligence")
    .eq("status", "active");
  for (const e of (songEnts ?? []) as Array<{ user_id: string; scan_id: string | null }>) {
    if (e.scan_id) entitled.push({ creatorId: e.user_id, scanId: e.scan_id });
  }
  const { data: creatorEnts } = await db
    .from("entitlements")
    .select("id,user_id")
    .eq("offer", "creator_intelligence")
    .eq("status", "active");
  for (const e of (creatorEnts ?? []) as Array<{ id: string; user_id: string }>) {
    const { data: tracks } = await db
      .from("entitlement_tracks")
      .select("scan_id")
      .eq("entitlement_id", e.id);
    for (const t of (tracks ?? []) as Array<{ scan_id: string | null }>) {
      if (t.scan_id) entitled.push({ creatorId: e.user_id, scanId: t.scan_id });
    }
  }

  const seen = new Set<string>();
  const targets: Target[] = [];
  for (const es of entitled) {
    const key = `${es.creatorId}:${es.scanId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const { data: reps } = await db
      .from("reports")
      .select("payload,generator_version")
      .eq("creator_id", es.creatorId)
      .eq("scan_id", es.scanId)
      .limit(1);
    const row = (reps ?? [])[0] as { payload: unknown; generator_version: string } | undefined;
    // Only MISSING or INCOMPLETE force regeneration. A complete report on an
    // older version still serves and is left alone unless an operator asks
    // for it by (creatorId, scanId) explicitly.
    const incomplete = !row || !isCompletePaidPayload(row.payload);
    if (incomplete) targets.push(es);
    else if (row && row.generator_version !== CURRENT_VERSION) {
      // Informational: complete but stale. Not backfilled by default.
      console.log(`[backfill] skip (complete, stale ${row.generator_version}): ${key}`);
    }
  }
  return targets;
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--dry-run");
  const dryRun = process.argv.includes("--dry-run");

  let targets: Target[];
  if (args.length === 2) {
    targets = [{ creatorId: args[0], scanId: args[1] }];
  } else if (args.length === 0) {
    targets = await incompleteTargets();
  } else {
    console.error("Usage: backfill-reports.mts [<creatorId> <scanId>] [--dry-run]");
    process.exit(2);
  }

  console.log(`[backfill] ${targets.length} scan(s) to prepare${dryRun ? " (dry run)" : ""}.`);
  if (dryRun) {
    for (const t of targets) console.log(`  ${t.creatorId}  ${t.scanId}`);
    return;
  }

  let ok = 0;
  let failed = 0;
  for (const t of targets) {
    // Sequential on purpose: a burst of concurrent generations against
    // Anthropic and Soundcharts is worse than a slow, legible backfill. The
    // durable claim means a buyer arriving mid-backfill still causes only one
    // generation.
    const result = await prepareReportForScan(t.creatorId, t.scanId);
    if (result.status === "ready") {
      ok += 1;
      console.log(`[backfill] ok    ${t.creatorId} ${t.scanId} report=${result.readiness.reportId} reused=${result.reused}`);
    } else if (result.status === "preparing") {
      // Someone else (a buyer, or a parallel backfill) holds the claim.
      console.log(`[backfill] held  ${t.creatorId} ${t.scanId} (another worker is preparing it)`);
    } else {
      failed += 1;
      console.error(`[backfill] FAIL  ${t.creatorId} ${t.scanId} reason=${result.reason} ${result.detail ?? ""}`);
    }
  }
  console.log(`[backfill] done. ready=${ok} failed=${failed} of ${targets.length}.`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[backfill] failed:", err);
  process.exit(1);
});
