/**
 * Claim-link rules and the cron gate. The database side of a claim (copy,
 * entitlement, single use, expiry under a row lock) is in
 * outreach-queue-pg.test.ts.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLAIM_MESSAGES,
  claimState,
  isClaimTokenShape,
  normalizeClaimEmail,
} from "@/lib/outreach/claim";

const runOutreachQueue = vi.fn();
vi.mock("@/lib/outreach/queue.server", () => ({
  runOutreachQueue: (...args: unknown[]) => runOutreachQueue(...args),
}));

import { GET } from "@/app/api/cron/outreach-queue/route";

const DAY = 86_400_000;
const now = new Date("2026-09-26T12:00:00Z");
const at = (days: number) => new Date(now.getTime() - days * DAY).toISOString();

describe("claim state", () => {
  it("is open until claimed or 30 days old", () => {
    expect(claimState({ created_at: at(0), claimed_at: null, analysis_id: "a" }, now)).toBe("open");
    expect(claimState({ created_at: at(29.9), claimed_at: null, analysis_id: "a" }, now)).toBe("open");
    expect(claimState({ created_at: at(30.1), claimed_at: null, analysis_id: "a" }, now)).toBe("expired");
  });

  it("is single use", () => {
    expect(claimState({ created_at: at(1), claimed_at: at(0), analysis_id: "a" }, now)).toBe("used");
  });

  it("an unknown token, or a row with no analysis, is invalid", () => {
    expect(claimState(null, now)).toBe("invalid");
    expect(claimState({ created_at: at(1), claimed_at: null, analysis_id: null }, now)).toBe("invalid");
  });

  it("every refusal has a friendly message", () => {
    for (const s of ["used", "expired", "invalid"] as const) {
      expect(CLAIM_MESSAGES[s].heading.length).toBeGreaterThan(0);
    }
  });

  it("accepts only URL-safe tokens of a sane length, and real-looking emails", () => {
    expect(isClaimTokenShape("Ab3_-Ab3_-Ab3_-Ab3_-Ab3_-Ab3_-Ab")).toBe(true);
    expect(isClaimTokenShape("short")).toBe(false);
    expect(isClaimTokenShape("../../etc/passwd/../../../../x")).toBe(false);
    expect(normalizeClaimEmail("  Artist@Example.COM ")).toBe("artist@example.com");
    expect(normalizeClaimEmail("nope")).toBeNull();
    expect(normalizeClaimEmail(42)).toBeNull();
  });
});

describe("GET /api/cron/outreach-queue", () => {
  const SECRET = "c7on-c7on-c7on-c7on-c7on-c7on-c7on-01";
  const req = (auth?: string) =>
    new Request("http://test.local/api/cron/outreach-queue", {
      headers: auth === undefined ? {} : { authorization: auth },
    });

  beforeEach(() => {
    runOutreachQueue.mockReset();
    runOutreachQueue.mockResolvedValue({ claimed: 0 });
    process.env.CRON_SECRET = SECRET;
  });

  it("answers 404 without the Vercel cron secret, and runs nothing", async () => {
    expect((await GET(req())).status).toBe(404);
    expect((await GET(req(SECRET))).status).toBe(404);
    expect((await GET(req("Bearer wrong-wrong-wrong-wrong-wrong-wrong"))).status).toBe(404);
    delete process.env.CRON_SECRET;
    expect((await GET(req(`Bearer ${SECRET}`))).status).toBe(404);
    expect(runOutreachQueue).not.toHaveBeenCalled();
  });

  it("runs the worker with the secret", async () => {
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(runOutreachQueue).toHaveBeenCalledTimes(1);
  });
});
