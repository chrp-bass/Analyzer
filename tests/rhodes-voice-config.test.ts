/**
 * Rhodes voice configuration: the two server-only variables must be present,
 * trimmed, bare and well-formed. Anything else is a TYPED configuration error
 * naming the variable and the defect — never the value — and there is NO
 * silent fallback to a hard-coded agent id in any environment.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  readRhodesVoiceConfig,
  resolveRhodesVoiceConfig,
  RhodesVoiceConfigError,
  API_KEY_ENV,
  AGENT_ID_ENV,
} from "@/lib/rhodes-voice/config";

const KEY = "sk_0123456789abcdef0123456789abcdef";
const AGENT = "vv1j1yrAGF0RdxJOSGIJ";

function expectError(env: Record<string, string | undefined>, code: string, variable: string) {
  let caught: unknown;
  try {
    readRhodesVoiceConfig(env);
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(RhodesVoiceConfigError);
  const e = caught as RhodesVoiceConfigError;
  expect(e.code).toBe(code);
  expect(e.variable).toBe(variable);
  // Actionable: names the variable and what is wrong with it…
  expect(e.message).toContain(variable);
  expect(e.message).toContain(code);
  // …but never the value.
  for (const v of Object.values(env)) {
    if (v && v.trim().length > 3) expect(e.message).not.toContain(v.trim());
  }
}

describe("readRhodesVoiceConfig", () => {
  it("accepts bare, well-formed values and trims surrounding whitespace", () => {
    const cfg = readRhodesVoiceConfig({
      [API_KEY_ENV]: `  ${KEY}\n`,
      [AGENT_ID_ENV]: `\t${AGENT} `,
    });
    expect(cfg.apiKey).toBe(KEY);
    expect(cfg.agentId).toBe(AGENT);
  });

  it("fails safely when the key is missing, empty or whitespace-only", () => {
    expectError({ [AGENT_ID_ENV]: AGENT }, "missing_api_key", API_KEY_ENV);
    expectError({ [API_KEY_ENV]: "", [AGENT_ID_ENV]: AGENT }, "missing_api_key", API_KEY_ENV);
    expectError({ [API_KEY_ENV]: "   \n", [AGENT_ID_ENV]: AGENT }, "missing_api_key", API_KEY_ENV);
  });

  it("fails safely when the agent id is missing, empty or whitespace-only — no fallback", () => {
    expectError({ [API_KEY_ENV]: KEY }, "missing_agent_id", AGENT_ID_ENV);
    expectError({ [API_KEY_ENV]: KEY, [AGENT_ID_ENV]: "" }, "missing_agent_id", AGENT_ID_ENV);
    expectError({ [API_KEY_ENV]: KEY, [AGENT_ID_ENV]: " \t " }, "missing_agent_id", AGENT_ID_ENV);
  });

  it("rejects quoted values (a pasted .env line, a JSON string)", () => {
    expectError({ [API_KEY_ENV]: `"${KEY}"`, [AGENT_ID_ENV]: AGENT }, "malformed_api_key", API_KEY_ENV);
    expectError({ [API_KEY_ENV]: `'${KEY}'`, [AGENT_ID_ENV]: AGENT }, "malformed_api_key", API_KEY_ENV);
    expectError({ [API_KEY_ENV]: KEY, [AGENT_ID_ENV]: `"${AGENT}"` }, "malformed_agent_id", AGENT_ID_ENV);
  });

  it("rejects internal whitespace, line breaks and placeholders", () => {
    expectError({ [API_KEY_ENV]: `${KEY} extra`, [AGENT_ID_ENV]: AGENT }, "malformed_api_key", API_KEY_ENV);
    expectError({ [API_KEY_ENV]: `sk_abc\ndef0123456789`, [AGENT_ID_ENV]: AGENT }, "malformed_api_key", API_KEY_ENV);
    expectError({ [API_KEY_ENV]: KEY, [AGENT_ID_ENV]: "vv1j 1yrAGF0RdxJOSGIJ" }, "malformed_agent_id", AGENT_ID_ENV);
    expectError({ [API_KEY_ENV]: "undefined", [AGENT_ID_ENV]: AGENT }, "malformed_api_key", API_KEY_ENV);
    expectError({ [API_KEY_ENV]: KEY, [AGENT_ID_ENV]: "null" }, "malformed_agent_id", AGENT_ID_ENV);
  });

  it("rejects malformed shapes (too short, non-ASCII, wrong character set)", () => {
    expectError({ [API_KEY_ENV]: "short", [AGENT_ID_ENV]: AGENT }, "malformed_api_key", API_KEY_ENV);
    expectError({ [API_KEY_ENV]: KEY, [AGENT_ID_ENV]: "abc" }, "malformed_agent_id", AGENT_ID_ENV);
    expectError({ [API_KEY_ENV]: KEY, [AGENT_ID_ENV]: "vv1j1yrAGF0RdxJOSGIJ/x" }, "malformed_agent_id", AGENT_ID_ENV);
    expectError({ [API_KEY_ENV]: KEY, [AGENT_ID_ENV]: "agént_id_with_accent" }, "malformed_agent_id", AGENT_ID_ENV);
  });

  it("resolveRhodesVoiceConfig returns the typed error instead of throwing", () => {
    const r = resolveRhodesVoiceConfig({ [API_KEY_ENV]: KEY });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("missing_agent_id");
    const good = resolveRhodesVoiceConfig({ [API_KEY_ENV]: KEY, [AGENT_ID_ENV]: AGENT });
    expect(good.ok).toBe(true);
  });

  it("the source carries no hard-coded production agent id fallback", () => {
    for (const file of [
      "src/lib/rhodes-voice/config.ts",
      "src/lib/rhodes-voice/signed-url.ts",
      "src/lib/rhodes-voice/elevenlabs.ts",
      "src/app/api/rhodes/session/route.ts",
      "src/components/report/RhodesVoice.tsx",
      "src/lib/rhodes-voice/session-controller.ts",
    ]) {
      const src = readFileSync(file, "utf8");
      expect(src, file).not.toContain("vv1j1yrAGF0RdxJOSGIJ");
      expect(src, file).not.toMatch(/DEFAULT_AGENT_ID/);
    }
  });

  it(".env.example documents both variables with an example agent id and an empty key", () => {
    const env = readFileSync(".env.example", "utf8");
    expect(env).toMatch(/^ELEVENLABS_API_KEY=$/m);
    expect(env).toMatch(/^ELEVENLABS_RHODES_AGENT_ID=[A-Za-z0-9_-]{8,64}$/m);
  });
});
