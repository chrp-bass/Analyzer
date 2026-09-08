/**
 * Post-open provider failures are classified from the WebSocket close code
 * and reason into a closed category set. The category and the numeric code
 * are what reach structured logs; the raw reason only ever becomes a short,
 * printable console excerpt.
 */

import { describe, expect, it } from "vitest";
import {
  classifyProviderFailure,
  excerptOf,
  warrantsOverrideFreeRetry,
} from "@/lib/rhodes-voice/close-reason";

describe("classifyProviderFailure", () => {
  it.each([
    [1008, "Override for agent.first_message is not allowed", "override_rejected"],
    [1008, "conversation_config_override not enabled for this agent", "override_rejected"],
    [1008, "Missing required dynamic variables: ['song_key']", "dynamic_variables_missing"],
    [3000, "Signature expired", "auth"],
    [3000, "Agent requires authorization", "auth"],
    [1008, "Insufficient credits", "quota"],
    [1011, "Voice not found", "voice_unavailable"],
    [1011, "LLM request failed", "llm"],
    [1000, "", "agent_ended"],
    [1006, "", "network"],
    [1011, "Something odd happened", "unknown"],
  ])("close %i %j is %s", (closeCode, reason, category) => {
    const f = classifyProviderFailure({ closeCode, reason });
    expect(f.category).toBe(category);
    expect(f.closeCode).toBe(closeCode);
  });

  it("classifies SDK error messages the same way", () => {
    expect(classifyProviderFailure({ message: "Server error: max_duration_exceeded" }).category).toBe("max_duration");
    expect(classifyProviderFailure({ message: "Server error: quota exceeded" }).category).toBe("quota");
    expect(classifyProviderFailure({}).category).toBe("network");
  });

  it("excerpts are printable ASCII, whitespace-collapsed and capped", () => {
    const raw = "Override  for\n\n first_message  is not allowed — " + "x".repeat(400);
    const e = excerptOf(raw);
    expect(e.length).toBeLessThanOrEqual(160);
    expect(e).toMatch(/^[\x20-\x7E]*…?$/);
    expect(e.startsWith("Override for first_message is not allowed")).toBe(true);
  });

  it("only an override rejection or a silent reason-less close earns the override-free reconnect", () => {
    expect(
      warrantsOverrideFreeRetry(
        classifyProviderFailure({ closeCode: 1008, reason: "Override for first_message is not allowed" }),
      ),
    ).toBe(true);
    expect(warrantsOverrideFreeRetry(classifyProviderFailure({ closeCode: 1006, reason: "" }))).toBe(true);
    for (const [code, reason] of [
      [3000, "Signature expired"],
      [1008, "Insufficient credits"],
      [1011, "Voice not found"],
      [1011, "LLM request failed"],
      [1011, "Something odd happened"],
      [1000, ""],
    ] as const) {
      expect(
        warrantsOverrideFreeRetry(classifyProviderFailure({ closeCode: code, reason })),
        `${code} ${reason}`,
      ).toBe(false);
    }
  });
});
