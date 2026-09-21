import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { canonicalSignInEmail } from "@/lib/identity";

describe("production sign-in", () => {
  it("resolves only the verified Workspace alias to the canonical creator email", () => {
    expect(canonicalSignInEmail(" jeffs@chrp.ai ")).toBe("jeff@chrp.ai");
    expect(canonicalSignInEmail("jeff@chrp.ai")).toBe("jeff@chrp.ai");
    expect(canonicalSignInEmail("jeff+other@chrp.ai")).toBe("jeff+other@chrp.ai");
  });

  it("uses the production Supabase flow and forbids identity creation", () => {
    const identity = readFileSync("src/lib/identity.ts", "utf8");
    const form = readFileSync("src/components/auth/SignInForm.tsx", "utf8");
    expect(form).toContain("signInWithEmail(trimmed)");
    expect(form).not.toContain("sendMagicLink");
    expect(form).not.toContain("Beta shortcut");
    expect(identity).toMatch(/signInWithOtp\(\{[\s\S]*shouldCreateUser:\s*false/);
    expect(identity).toContain("AUTH_CALLBACK_PATH");
  });
});
