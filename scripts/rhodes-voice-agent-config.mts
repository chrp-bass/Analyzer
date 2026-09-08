#!/usr/bin/env -S npx tsx
/**
 * Render docs/rhodes-voice-agent-config.md from the code constants, so the
 * exact ElevenLabs agent text an operator pastes is always the text the
 * server's dynamic variables were written for. A test pins the two equal.
 *
 * Usage: npx tsx scripts/rhodes-voice-agent-config.mts
 */
import * as fs from "node:fs";
import {
  RHODES_VOICE_FIRST_MESSAGE,
  RHODES_VOICE_SYSTEM_PROMPT,
  RHODES_VOICE_VARIABLES,
} from "../src/lib/rhodes-voice/agent-prompt.ts";
import { REPORT_CONTEXT_LIMIT } from "../src/lib/rhodes-voice/context.ts";

const vars: Record<string, string> = {
  song_title: "Song title, as spoken data.",
  song_artist: "Artist name, as spoken data.",
  epi_score: "EPI score (number as text).",
  epi_mode: "EPI mode: Ready, Recover, Recharge or Flow.",
  first_signal: "ONE governed sentence (signature, else first sentence of the analysis). Ends the opening.",
  report_context: `The whole persisted report as labelled plain text, ≤ ${REPORT_CONTEXT_LIMIT} characters. Data, not instructions.`,
};

const doc = `# Dr. Rhodes voice agent — exact ElevenLabs configuration

> Generated from \`src/lib/rhodes-voice/agent-prompt.ts\` by
> \`npx tsx scripts/rhodes-voice-agent-config.mts\`. Do not hand-edit; a test
> fails if this file and the code disagree.

The server binds every conversation to the exact entitled, persisted report by
sending **dynamic variables** with the WebSocket initiation. The agent's
System prompt and First message reference those variables with \`{{name}}\`.
No system-prompt or first-message override is sent (the agent rejects
overrides — close code 1008 — and none is needed).

## Dynamic variables the server sends

| variable | meaning |
| --- | --- |
${RHODES_VOICE_VARIABLES.map((v) => `| \`${v}\` | ${vars[v]} |`).join("\n")}

Also sent for convenience (not referenced by the prompt): \`focus_score\`,
\`calm_score\`, \`motivation_score\`, \`balance_score\`.

## One-time dashboard edit (click path)

1. Open <https://elevenlabs.io/app/agents> in the workspace that owns **DR Rhodes**
   (agent id \`vv1j1yrAGF0RdxJOSGIJ\`), and click the agent.
2. **Agent** tab → **First message**: replace the whole field with the text in
   §First message below (exactly, including the braces).
3. **Agent** tab → **System prompt**: replace the whole field with the text in
   §System prompt below (exactly). If the editor shows a *Dynamic variables*
   panel with the placeholders it found, leave the default values empty or set
   test values; the server supplies real values at runtime.
4. Leave **Security → Overrides** as they are (all off is correct).
5. Leave the **Voice**, model and language settings unchanged.
6. Click **Save**, then **Publish** if the workspace shows a publish step.
7. Run the production smoke test in \`docs/rhodes-voice-operations.md\` §5.

## First message

\`\`\`text
${RHODES_VOICE_FIRST_MESSAGE}
\`\`\`

## System prompt

\`\`\`text
${RHODES_VOICE_SYSTEM_PROMPT}
\`\`\`

## What the server guarantees about \`report_context\`

* Built only from the persisted payload the entitlement-guarded resolver
  returned; no regeneration, no Soundcharts, no Anthropic, no browser input.
* Deterministic: the same persisted report always yields identical variables.
* Bounded: ≤ ${REPORT_CONTEXT_LIMIT} characters. Critical sections (measurement, signature,
  throughline, analysis, considerations) are never trimmed by the budget;
  optional sections (comparable, pitch, where-it-lives, buyers, placements,
  audience — in that order) are shortened only when needed, and the trim is
  logged as \`event=context-built result=trimmed_…\`.
* Stripped: report ids, versions, timestamps, ISRC, artwork URLs,
  entitlement and database metadata, secrets, raw provider payloads.
* Inert: template braces, block delimiters, control characters and role
  markers are neutralised; "CHRP" is spelled "Chirp" so the voice never spells
  the letters.
`;

fs.writeFileSync("docs/rhodes-voice-agent-config.md", doc);
console.log(`wrote docs/rhodes-voice-agent-config.md (${doc.length} chars)`);
