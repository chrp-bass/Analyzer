#!/usr/bin/env node
/**
 * TEMPORARY — remove after EPI V2 validation.
 *
 * Runs the EPI validation during a Vercel PREVIEW build, where the
 * Soundcharts credentials exist as environment variables. Results go to the
 * build log, which is readable with `vercel inspect <url> --logs` by an
 * authenticated user — so the Preview never has to be reachable over HTTP and
 * Vercel Authentication stays fully enabled.
 *
 * Hard-gated three ways:
 *   - preview builds only (never production, never local)
 *   - only when both Soundcharts variables are present
 *   - failures are swallowed; this can never break a build
 *
 * It prints computed audio features and scores. It never prints, logs or
 * writes either credential.
 */
import { execSync } from "node:child_process";

const env = process.env.VERCEL_ENV;

if (env !== "preview") {
  console.log(`[epi-validation] skipped (VERCEL_ENV=${env ?? "unset"})`);
  process.exit(0);
}

if (!process.env.SOUNDCHARTS_API_KEY || !process.env.SOUNDCHARTS_APP_ID) {
  console.log("[epi-validation] skipped: Soundcharts variables not present");
  process.exit(0);
}

console.log("[epi-validation] ===== BEGIN EPI V2 VALIDATION =====");
try {
  execSync("npx tsx scripts/validate-epi.mts", { stdio: "inherit" });
} catch (err) {
  // Never fail the build for a validation run.
  console.log(
    `[epi-validation] run failed: ${err instanceof Error ? err.message : String(err)}`,
  );
}
console.log("[epi-validation] ===== END EPI V2 VALIDATION =====");
