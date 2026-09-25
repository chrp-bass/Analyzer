/**
 * "Save my report" saves the song.
 *
 * It used to attach an email to the identity and write nothing else, so once
 * a creator's included report was used, a saved song was gone when they came
 * back. POST /api/scan/save persists the FREE analysis under the caller's
 * identity so it appears in My Songs.
 *
 * Pinned here:
 *   - the identity is the session cookie; no identity → 401, nothing written;
 *   - it persists through the same `ensureAnalysisPersisted` the claim and
 *     paid paths use, and NOTHING else: it cannot reach report preparation,
 *     Rhodes, the included-first grant, entitlements or Stripe — so it cannot
 *     grant paid access;
 *   - the reveal's save handler stores the song BEFORE sending the email;
 *   - a save made just before signing in as an existing identity is finished
 *     under that identity by My Songs.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";

let configured = true;
vi.mock("@/lib/supabase/admin", () => ({
  adminConfigured: () => configured,
  createAdminClient: vi.fn(),
}));
vi.mock("@/lib/commerce/entitlements", () => ({ currentUserId: vi.fn() }));
vi.mock("@/lib/scan/fulfillment.server", () => ({
  ensureAnalysisPersisted: vi.fn(),
}));
vi.mock("@/lib/reports/prepare.server", () => ({
  prepareReportForScan: vi.fn(),
}));
vi.mock("@vercel/functions", () => ({ waitUntil: (promise: Promise<unknown>) => void promise }));

import { currentUserId } from "@/lib/commerce/entitlements";
import { ensureAnalysisPersisted } from "@/lib/scan/fulfillment.server";
import { prepareReportForScan } from "@/lib/reports/prepare.server";
import { POST } from "@/app/api/scan/save/route";
import { encodeIsrcScanId, encodeScanId } from "@/lib/scan-id";
import { TRACK_SLUGS } from "@/lib/fixtures/tracks";
import {
  flushPendingSaves,
  rememberPendingSave,
  saveScanToMySongs,
} from "@/lib/scan/save-scan";

const userMock = vi.mocked(currentUserId);
const persistMock = vi.mocked(ensureAnalysisPersisted);
const prepareMock = vi.mocked(prepareReportForScan);

const REAL_SCAN = encodeIsrcScanId("GBUM71029604")!;
const FIXTURE_SCAN = encodeScanId(TRACK_SLUGS[0]);

const post = (body: unknown) =>
  POST(
    new Request("http://test.local/api/scan/save", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

beforeEach(() => {
  configured = true;
  userMock.mockReset().mockResolvedValue("user-1");
  persistMock
    .mockReset()
    .mockResolvedValue({ ok: true, analysisId: "a-1", songId: "s-1" });
  prepareMock.mockReset().mockResolvedValue({
    status: "ready",
    readiness: {
      scanId: REAL_SCAN,
      reportId: "r-1",
      reportVersion: "chrp-rhodes-v2",
      analysisId: "a-1",
    },
    reused: false,
    timings: [],
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("POST /api/scan/save", () => {
  it("persists the analysis under the cookie identity and returns no content", async () => {
    const res = await post({ scanId: REAL_SCAN, userId: "someone-else" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "saved" });
    expect(persistMock).toHaveBeenCalledTimes(1);
    // The caller cannot name an identity: only the session's is used.
    expect(persistMock).toHaveBeenCalledWith("user-1", REAL_SCAN);
    expect(prepareMock).toHaveBeenCalledWith("user-1", REAL_SCAN);
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("no identity → 401 and nothing is written", async () => {
    userMock.mockResolvedValue(null);
    const res = await post({ scanId: REAL_SCAN });
    expect(res.status).toBe(401);
    expect(persistMock).not.toHaveBeenCalled();
    expect(prepareMock).not.toHaveBeenCalled();
  });

  it("a bundled sample track is not saved", async () => {
    const res = await post({ scanId: FIXTURE_SCAN });
    expect(await res.json()).toEqual({ status: "not_eligible" });
    expect(persistMock).not.toHaveBeenCalled();
    expect(prepareMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed request before touching identity or storage", async () => {
    expect((await post("{not json")).status).toBe(400);
    expect((await post({})).status).toBe(400);
    expect((await post({ scanId: "nope" })).status).toBe(400);
    expect(userMock).not.toHaveBeenCalled();
    expect(persistMock).not.toHaveBeenCalled();
    expect(prepareMock).not.toHaveBeenCalled();
  });

  it("a song that cannot be analysed is an honest 409, with no payment wording", async () => {
    persistMock.mockResolvedValue({ ok: false, reason: "song_unavailable" });
    const res = await post({ scanId: REAL_SCAN });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toEqual({ status: "unavailable", reason: "song_unavailable" });
    expect(JSON.stringify(body).toLowerCase()).not.toContain("payment");
  });

  it("unconfigured → 503", async () => {
    configured = false;
    expect((await post({ scanId: REAL_SCAN })).status).toBe(503);
    expect(persistMock).not.toHaveBeenCalled();
    expect(prepareMock).not.toHaveBeenCalled();
  });

  it("starts report readiness during save so unlock can reuse it", async () => {
    const res = await post({ scanId: REAL_SCAN });
    expect(res.status).toBe(200);
    expect(prepareMock).toHaveBeenCalledWith("user-1", REAL_SCAN);
    expect(await res.json()).toEqual({ status: "saved" });
  });

  it("preserves the saved analysis when report prewarm fails", async () => {
    prepareMock.mockResolvedValue({
      status: "failed",
      reason: "generation_failed",
      message: "unavailable",
      timings: [],
    });
    const res = await post({ scanId: REAL_SCAN });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "saved" });
  });
});

describe("saving prepares fulfillment but cannot grant paid access", () => {
  const route = readFileSync("src/app/api/scan/save/route.ts", "utf8");
  const code = route
    .split("\n")
    .filter((l) => !/^\s*(\*|\/\*|\/\/)/.test(l))
    .join("\n");

  it("imports only identity, scan-id, analysis persistence and report preparation", () => {
    const imports = Array.from(code.matchAll(/from "([^"]+)"/g)).map((m) => m[1]);
    expect(imports.sort()).toEqual(
      [
        "next/server",
        "@/lib/supabase/admin",
        "@/lib/commerce/entitlements",
        "@/lib/scan-id",
        "@/lib/scan/fulfillment.server",
        "@/lib/reports/prepare.server",
        "@/lib/song-where/creator-brief.server",
        "@vercel/functions",
      ].sort(),
    );
  });

  it("reaches no grant, entitlement write or Stripe", () => {
    for (const forbidden of [
      "generatePaidSections",
      "grantFreeFirst",
      "createAdminClient",
      ".insert(",
      'from("entitlements")',
      "stripe",
      "consumeCreditForScan",
    ]) {
      expect(code).not.toContain(forbidden);
    }
  });

  it("the persister it uses writes an analysis and never a report or entitlement", () => {
    const src = readFileSync("src/lib/scan/fulfillment.server.ts", "utf8");
    expect(src).toContain("recordCompletedAnalysis");
    for (const forbidden of ["entitlements", "persistReport", "complete_report"]) {
      expect(src).not.toContain(forbidden);
    }
  });
});

describe("the reveal's save handler", () => {
  const preview = readFileSync("src/components/scan/ScanPreview.tsx", "utf8");
  const handler = preview.slice(
    preview.indexOf("async function save("),
    preview.indexOf("return (", preview.indexOf("async function save(")),
  );

  it("stores the song BEFORE it sends the email, and stops if the song cannot be stored", () => {
    const store = handler.indexOf("saveScanToMySongs(scanId)");
    const email = handler.indexOf("linkEmail(trimmed)");
    expect(store).toBeGreaterThan(-1);
    expect(email).toBeGreaterThan(store);
    expect(handler.slice(store, email)).toMatch(/if \(!stored\.ok\) \{[\s\S]*return;/);
  });

  it("remembers the save when the email belongs to an existing identity", () => {
    expect(handler).toMatch(
      /result\.via === "existing_identity"\) rememberPendingSave\(scanId\)/,
    );
  });

  it("linkEmail reports which path the address took", () => {
    const identity = readFileSync("src/lib/identity.ts", "utf8");
    expect(identity).toContain('return { ok: true, via: "upgraded" }');
    expect(identity).toContain('return { ok: true, via: "existing_identity" }');
  });

  it("My Songs finishes remembered saves before reading the catalog", () => {
    const dash = readFileSync("src/components/dashboard/Dashboard.tsx", "utf8");
    expect(dash.indexOf("await flushPendingSaves()")).toBeGreaterThan(-1);
    expect(dash.indexOf("await flushPendingSaves()")).toBeLessThan(
      dash.indexOf("fetchServerCatalog(),"),
    );
  });
});

describe("save-scan (browser half)", () => {
  let store: Record<string, string>;
  let calls: Array<{ url: string; body: unknown }>;
  let respond: (scanId: string) => { status: number; body: unknown };

  beforeEach(() => {
    store = {};
    calls = [];
    respond = () => ({ status: 200, body: { status: "saved" } });
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => void (store[k] = v),
        removeItem: (k: string) => void delete store[k],
      },
    });
    vi.spyOn(globalThis, "fetch").mockImplementation((async (
      url: unknown,
      init?: { body?: string },
    ) => {
      const body = JSON.parse(init?.body ?? "{}") as { scanId: string };
      calls.push({ url: String(url), body });
      const r = respond(body.scanId);
      return { ok: r.status < 400, status: r.status, json: async () => r.body };
    }) as unknown as typeof fetch);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("posts only the scan id", async () => {
    expect(await saveScanToMySongs(REAL_SCAN)).toEqual({ ok: true });
    expect(calls).toEqual([{ url: "/api/scan/save", body: { scanId: REAL_SCAN } }]);
  });

  it("maps failures without throwing", async () => {
    respond = () => ({ status: 401, body: {} });
    expect(await saveScanToMySongs(REAL_SCAN)).toEqual({ ok: false, reason: "no_identity" });
    respond = () => ({ status: 409, body: {} });
    expect(await saveScanToMySongs(REAL_SCAN)).toEqual({ ok: false, reason: "unavailable" });
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    expect(await saveScanToMySongs(REAL_SCAN)).toEqual({ ok: false, reason: "unavailable" });
  });

  it("flush completes remembered saves once, then forgets them", async () => {
    rememberPendingSave(REAL_SCAN);
    rememberPendingSave(REAL_SCAN); // no duplicate
    await flushPendingSaves();
    expect(calls.map((c) => c.body)).toEqual([{ scanId: REAL_SCAN }]);
    expect(store.chrp_pending_save).toBeUndefined();
    await flushPendingSaves();
    expect(calls).toHaveLength(1);
  });

  it("keeps a save that failed only for want of an identity; drops other failures", async () => {
    const other = encodeIsrcScanId("USRC17607839")!;
    rememberPendingSave(REAL_SCAN);
    rememberPendingSave(other);
    respond = (id) =>
      id === REAL_SCAN ? { status: 401, body: {} } : { status: 409, body: {} };
    await flushPendingSaves();
    expect(JSON.parse(store.chrp_pending_save)).toEqual([REAL_SCAN]);
  });

  it("ignores a forged or malformed marker", async () => {
    store.chrp_pending_save = JSON.stringify(["../../etc", 7, "scn_x"]);
    await flushPendingSaves();
    expect(calls).toHaveLength(0);
    rememberPendingSave("not-a-scan");
    expect(store.chrp_pending_save).toBeUndefined();
  });
});
