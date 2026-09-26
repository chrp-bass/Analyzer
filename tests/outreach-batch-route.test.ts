/**
 * Route-level tests for POST /api/admin/batch-scan: the secret gate answers
 * 404 to everyone it refuses, and the body is validated before any work.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { authorizeAdmin, adminSecretConfigured } from "@/lib/outreach/admin-auth";

const runOutreachBatch = vi.fn();
vi.mock("@/lib/outreach/batch-scan.server", () => ({
  runOutreachBatch: (...args: unknown[]) => runOutreachBatch(...args),
}));

import { POST } from "@/app/api/admin/batch-scan/route";

const SECRET = "s3cr3t-s3cr3t-s3cr3t-s3cr3t-s3cr3t-01";
const ITEMS = [{ artist: "Arum Rae", title: "What Happiness Is" }];

function req(body: unknown, secret?: string, query = ""): Request {
  return new Request(`http://test.local/api/admin/batch-scan${query}`, {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      ...(secret !== undefined ? { "x-admin-secret": secret } : {}),
    },
  });
}

beforeEach(() => {
  runOutreachBatch.mockReset();
  process.env.ADMIN_BATCH_SECRET = SECRET;
  runOutreachBatch.mockResolvedValue({
    batch_id: "b",
    dry_run: false,
    soundcharts_lookups: 1,
    items: [
      {
        artist: "Arum Rae", title: "What Happiness Is", instagram: null, status: "scored", reason: null,
        resolved_artist: "Arum Rae", resolved_title: "What Happiness Is", isrc: "USAR12600001",
        scan_id: "scn_x", analysis_id: "an_1", reused: false, mode: "Recharge", epi_score: 43,
        flow: 31, ready: 30, recharge: 99, recover: 61, finding: "It settles rather than activates.",
        finding_source: "$.rhodes", finding_candidates: [],
      },
    ],
  });
});

describe("the secret", () => {
  it("compares in constant time and needs a real secret to be configured", () => {
    expect(authorizeAdmin(SECRET, SECRET)).toBe(true);
    expect(authorizeAdmin(`${SECRET}x`, SECRET)).toBe(false);
    expect(authorizeAdmin("", SECRET)).toBe(false);
    expect(authorizeAdmin(null, SECRET)).toBe(false);
    expect(authorizeAdmin("short", "short")).toBe(false);
    expect(authorizeAdmin(SECRET, undefined)).toBe(false);
    expect(adminSecretConfigured("placeholder")).toBe(false);
  });

  it("answers 404 — not 401 — to a missing or wrong secret, and runs nothing", async () => {
    expect((await POST(req({ batch_id: "b", items: ITEMS }))).status).toBe(404);
    expect((await POST(req({ batch_id: "b", items: ITEMS }, "wrong-wrong-wrong-wrong-wrong-wrong-1"))).status).toBe(404);
    delete process.env.ADMIN_BATCH_SECRET;
    expect((await POST(req({ batch_id: "b", items: ITEMS }, SECRET))).status).toBe(404);
    expect(runOutreachBatch).not.toHaveBeenCalled();
  });

  it("accepts the correct secret", async () => {
    const res = await POST(req({ batch_id: "b", items: ITEMS }, SECRET));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].finding).toBe("It settles rather than activates.");
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(runOutreachBatch).toHaveBeenCalledWith({ batch_id: "b", dry_run: false, items: [{ ...ITEMS[0], isrc: null, instagram: null }] });
  });
});

describe("the body", () => {
  it("rejects malformed input before any work", async () => {
    expect((await POST(req("not json", SECRET))).status).toBe(400);
    expect((await POST(req({ batch_id: "b", items: [] }, SECRET))).status).toBe(400);
    expect((await POST(req({ items: ITEMS }, SECRET))).status).toBe(400);
    expect(runOutreachBatch).not.toHaveBeenCalled();
  });

  it("a dry run returns the lookup count with the items", async () => {
    runOutreachBatch.mockResolvedValueOnce({ batch_id: "b", dry_run: true, soundcharts_lookups: 3, items: [] });
    const res = await POST(req({ batch_id: "b", dry_run: true, items: ITEMS }, SECRET));
    expect(await res.json()).toEqual({ dry_run: true, soundcharts_lookups: 3, items: [] });
    expect(runOutreachBatch.mock.calls[0][0]).toMatchObject({ dry_run: true });
  });

  it("?format=csv returns a CSV with a header row", async () => {
    const res = await POST(req({ batch_id: "b", items: ITEMS }, SECRET, "?format=csv"));
    expect(res.headers.get("content-type")).toContain("text/csv");
    const text = await res.text();
    expect(text.split("\r\n")[0]).toMatch(/^artist,title,instagram,status/);
    expect(text).toContain("It settles rather than activates.");
  });

  it("a failed run is 503 with no partial data", async () => {
    runOutreachBatch.mockRejectedValueOnce(new Error("Supabase admin client is not configured"));
    const res = await POST(req({ batch_id: "b", items: ITEMS }, SECRET));
    expect(res.status).toBe(503);
  });
});
