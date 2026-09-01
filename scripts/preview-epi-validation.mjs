#!/usr/bin/env node
/** TEMPORARY — removed immediately after validation. */
import { execSync } from "node:child_process";
if (process.env.VERCEL_ENV !== "preview") {
  console.log(`[epi-validation] skipped (VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"})`);
  process.exit(0);
}
console.log("[epi-validation] ===== BEGIN VALIDATION =====");
try {
  // react-server condition resolves the `server-only` guard to a no-op so the
  // real analyze.server module can be imported here.
  execSync("npx tsx --conditions=react-server scripts/validate-epi.mts", { stdio: "inherit" });
} catch (err) {
  console.log(`[epi-validation] run failed: ${err instanceof Error ? err.message : String(err)}`);
}
console.log("[epi-validation] ===== END VALIDATION =====");
