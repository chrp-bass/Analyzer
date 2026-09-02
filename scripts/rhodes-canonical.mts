#!/usr/bin/env -S npx tsx
/**
 * scripts/rhodes-canonical.mts
 *
 * Real-output validation for the Rhodes interpretation layer.
 *
 * The engine truth below is the LOCKED, already-validated output of the CHRP
 * engine for these recordings — the same values the EPI regression asserts.
 * They are stated here rather than fetched so this runner needs no Soundcharts
 * or Spotify credentials: it validates the INTERPRETATION layer against known
 * computational truth, which is the only thing under test. Nothing here
 * recomputes a score, and nothing here may be edited to make prose read better.
 *
 *   ANTHROPIC_API_KEY is the only credential required.
 *
 * Usage:
 *   npx tsx scripts/rhodes-canonical.mts              # the four canonical songs
 *   npx tsx scripts/rhodes-canonical.mts adversarial  # the synthetic profiles
 *   npx tsx scripts/rhodes-canonical.mts all
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");

function loadDotEnvLocal() {
  const p = path.join(REPO_ROOT, ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadDotEnvLocal();

import {
  generateSongIntelligence,
  auditSections,
  auditContextFor,
  factSheetFor,
  deriveRelationships,
  type SongIntelligenceInput,
} from "../src/lib/rhodes/index.ts";

interface Case {
  label: string;
  /** Why this case exists — printed so a reviewer knows what to look for. */
  looking_for: string;
  input: SongIntelligenceInput;
}

// ── The canonical songs. Engine truth is locked; do not edit. ───────────────
const CANONICAL: Case[] = [
  {
    label: "Highway to Hell — AC/DC  [AUAP07900028]",
    looking_for:
      "Ready mode with NO commercial-readiness language. Motivation leads Focus by 41.",
    input: {
      identity: {
        title: "Highway to Hell",
        artist: "AC/DC",
        isrc: "AUAP07900028",
      },
      engine: {
        epiScore: 59.5,
        mode: "Ready",
        dimensions: {
          focus: 33.4,
          calm: 38.2,
          motivation: 74.4,
          balance: 56.3,
        },
        arousal: 0.7696,
        valence: 0.42,
      },
    },
  },
  {
    label: "Livin' On A Prayer — Bon Jovi  [USPR38619998]",
    looking_for:
      "Same mode and same Motivation as AC/DC, but EPI 78.7 vs 59.5 and Calm 53.8 vs 38.2. The reading must NOT be swappable with the AC/DC one, and the higher EPI must not read as the better song.",
    input: {
      identity: {
        title: "Livin' On A Prayer",
        artist: "Bon Jovi",
        isrc: "USPR38619998",
      },
      engine: {
        epiScore: 78.7,
        mode: "Ready",
        dimensions: {
          focus: 34.5,
          calm: 53.8,
          motivation: 74.4,
          balance: 35.3,
        },
        arousal: 0.7742,
        valence: 0.8,
      },
    },
  },
  {
    label: "Stick Season — Noah Kahan  [USUM72212470]",
    looking_for:
      "Focus at the ceiling with Calm 92.2 alongside it. Regulation without inactivity; no superlative about how rare a 99 is.",
    input: {
      identity: {
        title: "Stick Season",
        artist: "Noah Kahan",
        isrc: "USUM72212470",
      },
      engine: {
        epiScore: 67.9,
        mode: "Flow",
        dimensions: {
          focus: 99,
          calm: 92.2,
          motivation: 33.9,
          balance: 79.6,
        },
        arousal: 0.5585,
        valence: 0.8,
      },
    },
  },
  {
    label: "Blinding Lights — The Weeknd  [USUG11904206]",
    looking_for:
      "Arousal and valence deliberately NOT supplied — adversarial case G. Rhodes must stay useful without inventing them.",
    input: {
      identity: {
        title: "Blinding Lights",
        artist: "The Weeknd",
        isrc: "USUG11904206",
      },
      engine: {
        epiScore: 57.9,
        mode: "Ready",
        dimensions: {
          focus: 30,
          calm: 44.6,
          motivation: 79.1,
          balance: 46.8,
        },
      },
    },
  },
];

// ── Adversarial synthetic profiles (§27 A-F, I, J). ────────────────────────
const synth = (
  label: string,
  looking_for: string,
  d: { focus: number; calm: number; motivation: number; balance: number },
  mode: SongIntelligenceInput["engine"]["mode"],
  epiScore: number,
): Case => ({
  label,
  looking_for,
  input: {
    identity: { title: label.split(" — ")[0], artist: "Test Profile" },
    engine: { epiScore, mode, dimensions: d },
  },
});

const ADVERSARIAL: Case[] = [
  synth(
    "A. Ignition — high Motivation, low Focus",
    "Must distinguish activation from directional concentration.",
    { focus: 31, calm: 36, motivation: 95, balance: 44 },
    "Ready",
    62,
  ),
  synth(
    "B. Concentration — high Focus, low Motivation",
    "Must distinguish sustained concentration from ignition.",
    { focus: 96, calm: 58, motivation: 32, balance: 61 },
    "Flow",
    48,
  ),
  synth(
    "C. Regulation — meaningful Calm alongside meaningful activation",
    "Must NOT call it contradictory. Calm is not inactivity.",
    { focus: 62, calm: 84, motivation: 78, balance: 66 },
    "Recharge",
    71,
  ),
  synth(
    "D. Prominent Balance",
    "Must read Balance relative to the profile only. Zero wellness or moral inference.",
    { focus: 55, calm: 52, motivation: 49, balance: 93 },
    "Recover",
    54,
  ),
  synth(
    "F. High EPI",
    "EPI 96 must carry ZERO implication that this is a better song.",
    { focus: 71, calm: 44, motivation: 88, balance: 58 },
    "Ready",
    96,
  ),
];

function bar(ch = "─", n = 78) {
  return ch.repeat(n);
}

async function runCase(c: Case) {
  const rel = deriveRelationships(c.input.engine.dimensions);
  console.log(`\n${bar("═")}`);
  console.log(c.label);
  console.log(`LOOKING FOR: ${c.looking_for}`);
  console.log(bar());
  console.log(
    `ENGINE  EPI ${c.input.engine.epiScore} · mode ${c.input.engine.mode} · ` +
      rel.ranked.map((r) => `${r.name} ${r.score}`).join(" · "),
  );
  console.log(`WIDEST GAP  ${rel.pairs[0].higher} over ${rel.pairs[0].lower}: ${rel.pairs[0].gap}`);

  const started = Date.now();
  const result = await generateSongIntelligence(c.input);
  const ms = Date.now() - started;

  if (!result.ok) {
    console.log(`\n✖ GENERATION FAILED (${result.reason}): ${result.detail}`);
    return { label: c.label, ok: false as const };
  }

  const s = result.sections;
  console.log(`\nattempts ${result.attempts} · ${ms}ms`);
  console.log(`\nSIGNATURE\n  ${s.signature}`);
  console.log(`\nTHE READING\n  ${s.rhodes}`);
  console.log(`\nWHAT IT'S BUILT FOR`);
  s.placements.forEach((p, i) =>
    console.log(
      `  ${String(i + 1).padStart(2, "0")}  ${p.family ?? "—"}\n      ${p.title}\n      ${p.body}`,
    ),
  );
  console.log(`\nWHO TO PUT IT IN FRONT OF`);
  s.buyers.forEach((b) =>
    console.log(`  ${b.category}\n      LEAD WITH: ${b.lead}\n      ${b.why}`),
  );
  console.log(`\nWHO RESPONDS, AND WHEN\n  ${s.audience}`);
  console.log(`\nTHROUGHLINE\n  ${s.throughline}`);
  console.log(`\nPITCH — SYNC\n  ${s.pitch.sync}`);
  console.log(`\nPITCH — POSITIONING\n  ${s.pitch.promotion}`);
  console.log(`\nWORTH CONSIDERING\n  ${s.consider}`);

  const violations = auditSections(
    s as unknown as Record<string, unknown>,
    auditContextFor(c.input),
    factSheetFor(c.input),
  );
  console.log(`\nGOVERNOR: ${violations.length === 0 ? "CLEAN" : `${violations.length} residual`}`);
  for (const v of violations) {
    console.log(`  [${v.severity}] ${v.rule} — "${v.match}"`);
  }
  return { label: c.label, ok: true as const, violations, text: s };
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is required (put it in .env.local).");
    process.exit(1);
  }
  const which = (process.argv[2] ?? "canonical").toLowerCase();
  const cases =
    which === "adversarial"
      ? ADVERSARIAL
      : which === "all"
        ? [...CANONICAL, ...ADVERSARIAL]
        : CANONICAL;

  const results = [];
  for (const c of cases) results.push(await runCase(c));

  console.log(`\n${bar("═")}\nSUMMARY`);
  let fabrications = 0;
  for (const r of results) {
    if (!r.ok) {
      console.log(`  ✖ ${r.label} — generation failed`);
      continue;
    }
    const fab = r.violations.filter((v) => v.severity === "fabrication").length;
    fabrications += fab;
    console.log(
      `  ${fab === 0 ? "✓" : "✖"} ${r.label} — ${r.violations.length} residual (${fab} fabrication)`,
    );
  }
  console.log(`\nFABRICATIONS ACROSS ALL CASES: ${fabrications}`);
}

main().catch((err) => {
  console.error("\n✖ FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
