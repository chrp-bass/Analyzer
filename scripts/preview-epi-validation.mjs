#!/usr/bin/env node
/** TEMPORARY — removed immediately after validation. See prior commit. */
import { execSync } from "node:child_process";
if (process.env.VERCEL_ENV !== "preview") {
  console.log(`[epi-validation] skipped (VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"})`);
  process.exit(0);
}
if (!process.env.SOUNDCHARTS_API_KEY || !process.env.SOUNDCHARTS_APP_ID) {
  console.log("[epi-validation] skipped: Soundcharts variables not present");
  process.exit(0);
}
console.log("[epi-validation] ===== BEGIN EPI V2 VALIDATION =====");
try { execSync("npx tsx scripts/validate-epi.mts", { stdio: "inherit" }); }
catch (err) { console.log(`[epi-validation] run failed: ${err instanceof Error ? err.message : String(err)}`); }
console.log("[epi-validation] ===== END EPI V2 VALIDATION =====");
