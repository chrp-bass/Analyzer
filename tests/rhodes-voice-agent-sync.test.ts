/**
 * The sync that reconciles `agent-prompt.ts` to the live agent must be exact:
 * whatever text the export carries evaluates back to the same bytes.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { applyLiveAgentText, escapeTemplateLiteral, readLiveAgentExport } from "@/lib/rhodes-voice/agent-prompt-sync";
import { RHODES_VOICE_FIRST_MESSAGE, RHODES_VOICE_SYSTEM_PROMPT } from "@/lib/rhodes-voice/agent-prompt";

const SOURCE = readFileSync("src/lib/rhodes-voice/agent-prompt.ts", "utf8");

/** Pull a template literal out of the rewritten source and evaluate it. */
function evaluate(source: string, name: string): string {
  const m = new RegExp(`export const ${name} =\\s*(\`(?:[^\`\\\\]|\\\\[\\s\\S])*\`);`).exec(source);
  if (!m) throw new Error(`${name} not found`);
  return new Function(`return ${m[1]};`)() as string;
}

const TRICKY = [
  "plain",
  "back`tick and ${dollar} and \\backslash",
  "crlf\r\nlines\r\n\r\nand a trailing newline\n",
  "unicode — arrows → quotes “smart” and emoji 🎵",
  "{{song_title}} <<<REPORT\n{{report_context}}\nREPORT>>> end",
  "a\\`b\\${c}\\\\d",
];

describe("escapeTemplateLiteral", () => {
  it("round-trips every tricky string through a real template literal", () => {
    for (const text of TRICKY) {
      const evaluated = new Function(`return \`${escapeTemplateLiteral(text)}\`;`)() as string;
      expect(evaluated, JSON.stringify(text)).toBe(text);
    }
  });
});

describe("applyLiveAgentText", () => {
  it("rewrites both constants byte-for-byte and leaves the rest of the module untouched", () => {
    for (const text of TRICKY) {
      const next = applyLiveAgentText(SOURCE, { systemPrompt: `PROMPT ${text}`, firstMessage: `FIRST ${text}` });
      expect(evaluate(next, "RHODES_VOICE_SYSTEM_PROMPT")).toBe(`PROMPT ${text}`);
      expect(evaluate(next, "RHODES_VOICE_FIRST_MESSAGE")).toBe(`FIRST ${text}`);
      expect(next).toContain("export const RHODES_VOICE_GOVERNED_CLAUSES");
      expect(next).toContain("export const RHODES_VOICE_VARIABLES");
    }
  });

  it("applying the current constants is a no-op", () => {
    const next = applyLiveAgentText(SOURCE, { systemPrompt: RHODES_VOICE_SYSTEM_PROMPT, firstMessage: RHODES_VOICE_FIRST_MESSAGE });
    expect(evaluate(next, "RHODES_VOICE_SYSTEM_PROMPT")).toBe(RHODES_VOICE_SYSTEM_PROMPT);
    expect(evaluate(next, "RHODES_VOICE_FIRST_MESSAGE")).toBe(RHODES_VOICE_FIRST_MESSAGE);
    expect(evaluate(SOURCE, "RHODES_VOICE_SYSTEM_PROMPT")).toBe(RHODES_VOICE_SYSTEM_PROMPT);
  });

  it("refuses a source without the constants", () => {
    expect(() => applyLiveAgentText("export const OTHER = `x`;", { systemPrompt: "a", firstMessage: "b" })).toThrow(/not found/);
  });
});

describe("readLiveAgentExport", () => {
  const good = { schemaVersion: 1, kind: "rhodes-agent-export", agentId: "vv1j1yrAGF0RdxJOSGIJ", systemPrompt: "p", firstMessage: "f", placeholders: ["song_title", 3] };

  it("accepts a well-formed export and drops non-string placeholders", () => {
    expect(readLiveAgentExport(good)).toEqual({ systemPrompt: "p", firstMessage: "f", agentId: "vv1j1yrAGF0RdxJOSGIJ", placeholders: ["song_title"] });
  });

  it("rejects the wrong kind, an empty prompt or a missing first message", () => {
    expect(() => readLiveAgentExport({ ...good, kind: "server" })).toThrow(/kind/);
    expect(() => readLiveAgentExport({ ...good, systemPrompt: "" })).toThrow(/systemPrompt/);
    expect(() => readLiveAgentExport({ ...good, firstMessage: null })).toThrow(/firstMessage/);
    expect(() => readLiveAgentExport(null)).toThrow(/object/);
  });
});
