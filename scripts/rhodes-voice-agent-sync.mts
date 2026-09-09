#!/usr/bin/env -S npx tsx
/**
 * scripts/rhodes-voice-agent-sync.mts <export.json>
 *
 * Reconcile the repository's governed Dr. Rhodes constants to the LIVE
 * ElevenLabs agent, byte-for-byte, from an export produced by the "Rhodes
 * agent export" workflow (GET /api/health/rhodes-agent).
 *
 * Rewrites RHODES_VOICE_SYSTEM_PROMPT and RHODES_VOICE_FIRST_MESSAGE in
 * src/lib/rhodes-voice/agent-prompt.ts, then regenerate the operations
 * document with scripts/rhodes-voice-agent-config.mts. Prints lengths and
 * SHA-256 fingerprints only — never the text.
 */

import * as fs from "node:fs";
import { createHash } from "node:crypto";
import { applyLiveAgentText, readLiveAgentExport } from "../src/lib/rhodes-voice/agent-prompt-sync.ts";

const TARGET = "src/lib/rhodes-voice/agent-prompt.ts";

function fingerprint(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 12);
}

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: npx tsx scripts/rhodes-voice-agent-sync.mts <rhodes-agent.json>");
    process.exit(2);
  }
  const live = readLiveAgentExport(JSON.parse(fs.readFileSync(file, "utf8")));
  const before = fs.readFileSync(TARGET, "utf8");
  const after = applyLiveAgentText(before, live);
  fs.writeFileSync(TARGET, after);
  console.log(`agent ${live.agentId}: synced ${TARGET}`);
  console.log(`  system prompt  ${live.systemPrompt.length} chars  fp ${fingerprint(live.systemPrompt)}`);
  console.log(`  first message  ${live.firstMessage.length} chars  fp ${fingerprint(live.firstMessage)}`);
  console.log(`  placeholders   ${live.placeholders.join(", ") || "(none declared)"}`);
  console.log(`  changed        ${before === after ? "no" : "yes"}`);
}

main();
