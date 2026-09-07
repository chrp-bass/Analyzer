#!/usr/bin/env -S npx tsx
/**
 * scripts/inventory-incomplete-reports.mts
 *
 * READ-ONLY inventory of entitled scans whose persisted paid report is
 * missing, incomplete, or on a superseded methodology version. This is the
 * pre-deployment census the migration plan calls for: it tells you exactly
 * which already-purchased reports the offline backfill will need to
 * regenerate, WITHOUT the buyer's first paid read ever performing that work.
 *
 * It writes nothing and calls no upstream service (no Soundcharts, no
 * Anthropic). It reads three tables with the service-role key:
 *   entitlements  — who is entitled to what (song + creator tiers)
 *   entitlement_tracks — the scans a creator entitlement covers
 *   reports       — the persisted report for each (creator, scan)
 *
 * Run where the service-role credentials already are:
 *
 *   NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
 *     npx tsx scripts/inventory-incomplete-reports.mts
 *
 * Output is a per-scan classification and a summary. `--json` prints the raw
 * rows instead, for piping into the backfill.
 */

import { createClient } from "@supabase/supabase-js";
import { isCompletePaidPayload } from "../src/lib/reports/store";

// The current report/methodology version. Keep in step with
// RHODES_VERSION / GENERATOR_VERSION. A report on an older version is not a
// defect — it still serves — but it is listed so an operator can decide
// whether to refresh it. Only MISSING and INCOMPLETE force a backfill.
const CURRENT_VERSION = "chrp-rhodes-v2";

type Classification = "missing" | "incomplete" | "stale_version" | "ok";

interface EntitledScan {
  creatorId: string;
  scanId: string;
  offer: string;
}

interface Finding extends EntitledScan {
  classification: Classification;
  reportId: string | null;
  reportVersion: string | null;
}

function env(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var ${name}.`);
    process.exit(2);
  }
  return v;
}

async function main() {
  const asJson = process.argv.includes("--json");
  const db = createClient(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // Every entitled (creator, scan): song entitlements carry their own
  // scan_id; creator entitlements cover the scans attached to them.
  const entitled: EntitledScan[] = [];

  const { data: songEnts, error: songErr } = await db
    .from("entitlements")
    .select("user_id,scan_id,offer,status")
    .eq("offer", "song_intelligence")
    .eq("status", "active");
  if (songErr) throw songErr;
  for (const e of (songEnts ?? []) as Array<{ user_id: string; scan_id: string | null }>) {
    if (e.scan_id) entitled.push({ creatorId: e.user_id, scanId: e.scan_id, offer: "song_intelligence" });
  }

  const { data: creatorEnts, error: creatorErr } = await db
    .from("entitlements")
    .select("id,user_id,status")
    .eq("offer", "creator_intelligence")
    .eq("status", "active");
  if (creatorErr) throw creatorErr;
  for (const e of (creatorEnts ?? []) as Array<{ id: string; user_id: string }>) {
    const { data: tracks, error: trErr } = await db
      .from("entitlement_tracks")
      .select("scan_id")
      .eq("entitlement_id", e.id);
    if (trErr) throw trErr;
    for (const t of (tracks ?? []) as Array<{ scan_id: string | null }>) {
      if (t.scan_id) entitled.push({ creatorId: e.user_id, scanId: t.scan_id, offer: "creator_intelligence" });
    }
  }

  // De-dupe (a scan could be covered twice).
  const seen = new Set<string>();
  const findings: Finding[] = [];
  for (const es of entitled) {
    const key = `${es.creatorId}:${es.scanId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const { data: reps, error: repErr } = await db
      .from("reports")
      .select("id,payload,generator_version")
      .eq("creator_id", es.creatorId)
      .eq("scan_id", es.scanId)
      .limit(1);
    if (repErr) throw repErr;
    const row = (reps ?? [])[0] as
      | { id: string; payload: unknown; generator_version: string }
      | undefined;

    let classification: Classification;
    if (!row) classification = "missing";
    else if (!isCompletePaidPayload(row.payload)) classification = "incomplete";
    else if (row.generator_version !== CURRENT_VERSION) classification = "stale_version";
    else classification = "ok";

    findings.push({
      ...es,
      classification,
      reportId: row?.id ?? null,
      reportVersion: row?.generator_version ?? null,
    });
  }

  const counts = findings.reduce<Record<Classification, number>>(
    (acc, f) => ((acc[f.classification] = (acc[f.classification] ?? 0) + 1), acc),
    { missing: 0, incomplete: 0, stale_version: 0, ok: 0 },
  );

  // The scans a backfill MUST fix (a buyer would otherwise hit a 503 on read).
  const needsBackfill = findings.filter(
    (f) => f.classification === "missing" || f.classification === "incomplete",
  );

  if (asJson) {
    console.log(JSON.stringify({ counts, findings, needsBackfill }, null, 2));
    return;
  }

  console.log("CHRP paid-report inventory");
  console.log("==========================");
  console.log(`entitled scans:      ${findings.length}`);
  console.log(`  ok (current):      ${counts.ok}`);
  console.log(`  stale version:     ${counts.stale_version}  (still serve; refresh optional)`);
  console.log(`  MISSING:           ${counts.missing}  (backfill required)`);
  console.log(`  INCOMPLETE:        ${counts.incomplete}  (backfill required)`);
  console.log("");
  if (needsBackfill.length === 0) {
    console.log("No reports require backfill. Safe to deploy the read-only path.");
  } else {
    console.log("Scans requiring backfill BEFORE deploy (else these buyers see 'still being prepared'):");
    for (const f of needsBackfill) {
      console.log(`  ${f.classification.padEnd(10)} ${f.creatorId}  ${f.scanId}`);
    }
    console.log("");
    console.log("Regenerate them out-of-band with:");
    console.log("  NODE_OPTIONS='--conditions=react-server' \\");
    console.log("    <all app env vars> npx tsx scripts/backfill-reports.mts");
  }
}

main().catch((err) => {
  console.error("[inventory] failed:", err);
  process.exit(1);
});
