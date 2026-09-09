#!/usr/bin/env -S npx tsx
/**
 * scripts/health-production.mts — `npm run health:production`
 *
 * Deterministic, read-only production health check for CHRP Analyzer.
 * Probes https://scan.chrp.ai from outside, calls the protected Vercel-side
 * health surface for the vendor boundaries, and emits a human summary plus
 * versioned JSON with an overall GREEN / YELLOW / RED.
 *
 * Environment
 *   HEALTH_MONITOR_SECRET   required for boundaries 2–5 (the only secret needed)
 *   HEALTH_BASE_URL         default https://scan.chrp.ai
 *
 * Flags
 *   --base-url <url>        override the target
 *   --expect-sha <sha>      FAIL unless the alias serves this deployment
 *   --json-out <path>       write the JSON report here
 *   --summary <path>        append a Markdown summary (e.g. $GITHUB_STEP_SUMMARY)
 *   --json                  print JSON instead of the human summary
 *   --strict                YELLOW exits non-zero as well
 *
 * Exit codes: 0 GREEN (or YELLOW), 1 RED (or YELLOW with --strict), 2 the
 * sentinel itself could not run.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { exitCodeFor, runSentinel } from "../src/lib/sentinel/client.ts";
import { formatHuman, formatMarkdown } from "../src/lib/sentinel/format.ts";

interface Args {
  baseUrl: string;
  expectSha: string | null;
  jsonOut: string | null;
  summary: string | null;
  json: boolean;
  strict: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    baseUrl: process.env.HEALTH_BASE_URL?.trim() || "https://scan.chrp.ai",
    expectSha: null,
    jsonOut: null,
    summary: null,
    json: false,
    strict: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) throw new Error(`${a} requires a value`);
      i += 1;
      return v;
    };
    switch (a) {
      case "--base-url":
        args.baseUrl = next();
        break;
      case "--expect-sha":
        args.expectSha = next();
        break;
      case "--json-out":
        args.jsonOut = next();
        break;
      case "--summary":
        args.summary = next();
        break;
      case "--json":
        args.json = true;
        break;
      case "--strict":
        args.strict = true;
        break;
      default:
        throw new Error(`unknown argument ${a}`);
    }
  }
  if (!/^https:\/\//.test(args.baseUrl)) throw new Error("--base-url must be https");
  if (args.expectSha && !/^[0-9a-fA-F]{7,40}$/.test(args.expectSha)) throw new Error("--expect-sha must be a git SHA");
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const secret = process.env.HEALTH_MONITOR_SECRET?.trim() || null;

  const report = await runSentinel({
    baseUrl: args.baseUrl,
    monitorSecret: secret,
    expectedSha: args.expectSha,
    fetchImpl: (input, init) => fetch(input, init),
  });

  if (args.jsonOut) {
    fs.mkdirSync(path.dirname(path.resolve(args.jsonOut)), { recursive: true });
    fs.writeFileSync(args.jsonOut, `${JSON.stringify(report, null, 2)}\n`);
  }
  if (args.summary) {
    fs.appendFileSync(args.summary, `${formatMarkdown(report)}\n`);
  }
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else console.log(formatHuman(report));

  process.exitCode = exitCodeFor(report, args.strict);
}

main().catch((err) => {
  console.error(`[health:production] could not run: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 2;
});
