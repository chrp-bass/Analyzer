/**
 * The preview read path: what the browser asks for, in what order, on every
 * route that knows a scan id (/success → /preview?paid=1, a direct revisit,
 * a refresh).
 *
 * The defect this pins: the preview used to run the free analysis
 * (POST /api/song-api/analyze) BEFORE asking the entitled endpoint
 * (GET /api/report/{scanId}), so a paying creator whose complete report was
 * already persisted watched "Building your Song Intelligence report…" for
 * the length of an analysis that nothing needed. The read path now asks the
 * persisted-report endpoint first and alone; a 200 renders it, a 503 shows
 * a quiet non-generating state, and only a 403 lets the unpaid flow run.
 *
 * Every dependency is recorded, so each assertion below is about the exact
 * sequence of network-shaped calls the browser would make.
 */

import { describe, expect, it, vi } from "vitest";
import {
  resolveScanReadPath,
  PAID_RETURN_CONFIRM_ATTEMPTS,
  type ReadPathDeps,
  type ReadPhase,
} from "@/lib/scan/read-path";
import { beginPurchaseWith, type PurchaseDeps } from "@/lib/scan/begin-purchase";
import type { ReportFetchResult, ClaimOutcome } from "@/lib/data-source";
import type { FreeReport, ReportPayload } from "@/lib/fixtures/tracks";
import { paidSections } from "./support/report-store";

const SCAN = "scn_isrc-gbum71029604_8fexwh";

function free(): FreeReport {
  return {
    report_meta: {
      id: "GBUM71029604",
      version: "v1.0",
      scanned_at: "2026-09-07T00:00:00.000Z",
      scanned_at_display: "2026.09.07  //  00:00",
    },
    track: { title: "Safe", artist: "The Brevet", isrc: "GBUM71029604", artworkUrl: null },
    epi: { score: 62, mode: "Flow", rank_in_mode: "", rank_overall: "" },
    chrp_scores: [
      { name: "Focus", score: 71, rank: "", rank_class: "high", anchor: "" },
      { name: "Balance", score: 62, rank: "", rank_class: "mid", anchor: "" },
      { name: "Motivation", score: 55, rank: "", rank_class: "mid", anchor: "" },
      { name: "Calm", score: 68, rank: "", rank_class: "mid", anchor: "" },
    ],
    hpv: [],
    creator: { name: "The Brevet", tracks_scored: 1, tease: "" },
    free_statement: "Flow mode — focus leads, motivation recedes.",
  };
}

function persisted(): ReportPayload {
  return { ...free(), ...paidSections() };
}

const ok = (): ReportFetchResult => ({
  status: "ok",
  data: { report: persisted(), source: "generated" },
});
const forbidden = (): ReportFetchResult => ({ status: "forbidden" });
const unavailable = (entitled: boolean, detail?: string): ReportFetchResult => ({
  status: "unavailable",
  entitled,
  detail,
});

/**
 * A fake browser: every dependency records itself into one ordered trace,
 * and the "server" answers the entitled read from a queue so a test can
 * script 403-then-200 and the like.
 */
function browser(opts: {
  reads: ReportFetchResult[];
  claim?: ClaimOutcome;
  analysis?: FreeReport | null | Error;
}) {
  const calls: string[] = [];
  const phases: ReadPhase[] = [];
  const reads = [...opts.reads];
  const last = reads[reads.length - 1];
  const deps: ReadPathDeps = {
    fetchEntitledReport: vi.fn(async () => {
      calls.push("GET /api/report");
      return reads.length > 1 ? reads.shift()! : last;
    }),
    loadFreeReport: vi.fn(async () => {
      calls.push("POST /api/song-api/analyze");
      const a = opts.analysis === undefined ? free() : opts.analysis;
      if (a instanceof Error) throw a;
      return a;
    }),
    ensureIdentity: vi.fn(async () => {
      calls.push("ensureIdentity");
      return "user_a";
    }),
    claimFirstReport: vi.fn(async () => {
      calls.push("POST /api/scan/claim");
      return opts.claim ?? "already_used";
    }),
    sleep: vi.fn(async () => {
      calls.push("sleep");
    }),
  };
  const run = (paidReturn: boolean, fixture: FreeReport | null = null) =>
    resolveScanReadPath(SCAN, deps, {
      paidReturn,
      fixture,
      onPhase: (p) => phases.push(p),
    });
  return { deps, calls, phases, run };
}

const GENERATING = ["POST /api/song-api/analyze", "POST /api/scan/claim", "POST /api/scan/prepare"];
const generatingCalls = (calls: string[]) => calls.filter((c) => GENERATING.includes(c));

describe("a persisted, entitled report on a direct revisit", () => {
  it("is read first and alone: zero analyze, zero prepare, zero claim", async () => {
    const b = browser({ reads: [ok()] });
    const outcome = await b.run(false);

    expect(outcome.kind).toBe("persisted");
    expect(b.calls).toEqual(["GET /api/report"]);
    expect(generatingCalls(b.calls)).toEqual([]);
    expect(b.deps.loadFreeReport).not.toHaveBeenCalled();
    expect(b.deps.claimFirstReport).not.toHaveBeenCalled();
    expect(b.deps.ensureIdentity).not.toHaveBeenCalled();
  });

  it("never passes through a building or preparing phase", async () => {
    const b = browser({ reads: [ok()] });
    await b.run(false);
    expect(b.phases).toEqual(["opening"]);
    expect(b.phases).not.toContain("analyzing");
    expect(b.phases).not.toContain("preparing_included");
  });

  it("renders the report the server returned, with its paid sections intact", async () => {
    const b = browser({ reads: [ok()] });
    const outcome = await b.run(false);
    if (outcome.kind !== "persisted") throw new Error(outcome.kind);
    expect(outcome.report.rhodes).toBe(paidSections().rhodes);
    expect(outcome.report.signature).toBe(paidSections().signature);
    expect(outcome.includedFirst).toBe(false);
  });

  it("takes the same single read even when the scan names a bundled fixture", async () => {
    const b = browser({ reads: [ok()] });
    const outcome = await b.run(false, free());
    expect(outcome.kind).toBe("persisted");
    expect(b.calls).toEqual(["GET /api/report"]);
  });
});

describe("the immediate return from Stripe (?paid=1)", () => {
  it("makes zero analyze/prepare calls when the entitlement is already visible", async () => {
    const b = browser({ reads: [ok()] });
    const outcome = await b.run(true);
    expect(outcome.kind).toBe("persisted");
    expect(b.calls).toEqual(["GET /api/report"]);
    expect(b.phases).toEqual(["opening"]);
  });

  it("confirms a trailing entitlement by re-reading, never by building", async () => {
    // Cookie rebind / webhook race: the first read is a 403, the next is 200.
    const b = browser({ reads: [forbidden(), ok()] });
    const outcome = await b.run(true);

    expect(outcome.kind).toBe("persisted");
    expect(b.calls).toEqual(["GET /api/report", "sleep", "GET /api/report"]);
    expect(generatingCalls(b.calls)).toEqual([]);
    expect(b.phases).toEqual(["opening", "confirming_access"]);
    expect(b.phases).not.toContain("analyzing");
    expect(b.phases).not.toContain("preparing_included");
  });

  it("bounds the confirmation, then falls back to the unpaid flow rather than spinning", async () => {
    const b = browser({ reads: [forbidden()] });
    const outcome = await b.run(true);

    const reads = b.calls.filter((c) => c === "GET /api/report");
    // The initial read plus the bounded re-checks, then the ordinary unpaid
    // flow (analysis → claim) — and nothing in between generated anything.
    expect(reads.length).toBe(PAID_RETURN_CONFIRM_ATTEMPTS);
    expect(b.calls.indexOf("POST /api/song-api/analyze")).toBeGreaterThan(
      b.calls.lastIndexOf("sleep"),
    );
    expect(outcome.kind).toBe("reveal");
  });
});

describe("an unpaid scan (403)", () => {
  it("still runs the analysis, then the included-report claim, and lands on the reveal", async () => {
    const b = browser({ reads: [forbidden()], claim: "already_used" });
    const outcome = await b.run(false);

    expect(outcome.kind).toBe("reveal");
    expect(b.calls).toEqual([
      "GET /api/report",
      "POST /api/song-api/analyze",
      "ensureIdentity",
      "POST /api/scan/claim",
    ]);
    expect(b.phases).toEqual(["opening", "analyzing", "preparing_included"]);
  });

  it("asks the entitled endpoint BEFORE the analysis, not after it", async () => {
    const b = browser({ reads: [forbidden()] });
    await b.run(false);
    expect(b.calls.indexOf("GET /api/report")).toBeLessThan(
      b.calls.indexOf("POST /api/song-api/analyze"),
    );
  });

  it("never exposes paid content: the reveal carries only free-tier fields", async () => {
    const b = browser({ reads: [forbidden()] });
    const outcome = await b.run(false);
    if (outcome.kind !== "reveal") throw new Error(outcome.kind);
    const keys = Object.keys(outcome.free);
    for (const paidKey of Object.keys(paidSections())) {
      expect(keys).not.toContain(paidKey);
    }
    expect(JSON.stringify(outcome)).not.toContain(paidSections().rhodes);
  });

  it("reads the persisted report after a granted included claim — a read, not a second generation", async () => {
    const b = browser({ reads: [forbidden(), ok()], claim: "granted" });
    const outcome = await b.run(false);
    expect(outcome.kind).toBe("persisted");
    if (outcome.kind !== "persisted") throw new Error(outcome.kind);
    expect(outcome.includedFirst).toBe(true);
    expect(b.calls).toEqual([
      "GET /api/report",
      "POST /api/song-api/analyze",
      "ensureIdentity",
      "POST /api/scan/claim",
      "GET /api/report",
    ]);
  });

  it("surfaces the analysis's own message when the song cannot be analysed", async () => {
    const err = Object.assign(new Error("x"), { userMessage: "No audio for this one." });
    const b = browser({ reads: [forbidden()], analysis: err });
    const outcome = await b.run(false);
    expect(outcome).toEqual({ kind: "error", message: "No audio for this one." });
    expect(b.deps.claimFirstReport).not.toHaveBeenCalled();
  });

  it("uses the bundled fixture instead of analysing when the scan names one", async () => {
    const b = browser({ reads: [forbidden()] });
    const outcome = await b.run(false, free());
    expect(outcome.kind).toBe("reveal");
    expect(b.deps.loadFreeReport).not.toHaveBeenCalled();
  });
});

describe("an entitled caller whose report is missing or incomplete (503)", () => {
  it("shows the quiet unavailable state and triggers no regeneration", async () => {
    const b = browser({ reads: [unavailable(true, "your report is being prepared")] });
    const outcome = await b.run(false);

    expect(outcome).toEqual({
      kind: "unavailable",
      detail: "your report is being prepared",
    });
    expect(b.calls).toEqual(["GET /api/report"]);
    expect(generatingCalls(b.calls)).toEqual([]);
    expect(b.phases).toEqual(["opening"]);
  });

  it("stays non-generating on the paid return too", async () => {
    const b = browser({ reads: [unavailable(true)] });
    const outcome = await b.run(true);
    expect(outcome.kind).toBe("unavailable");
    expect(b.calls).toEqual(["GET /api/report"]);
  });

  it("a retry is another read and nothing more", async () => {
    const b = browser({ reads: [unavailable(true), unavailable(true), ok()] });
    expect((await b.run(false)).kind).toBe("unavailable");
    expect((await b.run(false)).kind).toBe("unavailable");
    expect((await b.run(false)).kind).toBe("persisted");
    expect(b.calls).toEqual(["GET /api/report", "GET /api/report", "GET /api/report"]);
  });

  it("a non-entitled read failure shows the free reveal without spending the included report", async () => {
    const b = browser({ reads: [unavailable(false)] });
    const outcome = await b.run(false);
    expect(outcome.kind).toBe("reveal");
    expect(b.deps.claimFirstReport).not.toHaveBeenCalled();
  });
});

describe("refresh and revisit", () => {
  it("resolve to the same persisted report through the same single read", async () => {
    const b = browser({ reads: [ok()] });
    const first = await b.run(true); // arriving from Stripe
    const refresh = await b.run(false); // a reload of the same URL
    const revisit = await b.run(false); // a bookmark, days later

    expect(first).toEqual(refresh);
    expect(refresh).toEqual(revisit);
    expect(b.calls).toEqual(["GET /api/report", "GET /api/report", "GET /api/report"]);
    expect(b.phases).toEqual(["opening", "opening", "opening"]);
  });
});

describe("checkout is still gated on preparation", () => {
  function purchase(prepared: Awaited<ReturnType<PurchaseDeps["prepareReport"]>>) {
    const calls: string[] = [];
    const deps: PurchaseDeps = {
      ensureIdentity: async () => {
        calls.push("ensureIdentity");
        return "user_a";
      },
      prepareReport: async () => {
        calls.push("POST /api/scan/prepare");
        return prepared;
      },
      startCheckout: async () => {
        calls.push("POST /api/checkout");
        return { url: "https://checkout.stripe.com/c/x" };
      },
      navigate: (url) => calls.push(`navigate ${url}`),
    };
    return { deps, calls };
  }

  it("prepares the report before opening checkout for Song Intelligence", async () => {
    const p = purchase({
      status: "ready",
      readiness: { reportId: "rep_1", reportVersion: "chrp-rhodes-v2" },
    });
    const errors: string[] = [];
    await beginPurchaseWith(p.deps, "song_intelligence", SCAN, (m) => errors.push(m));
    expect(errors).toEqual([]);
    expect(p.calls).toEqual([
      "ensureIdentity",
      "POST /api/scan/prepare",
      "POST /api/checkout",
      "navigate https://checkout.stripe.com/c/x",
    ]);
  });

  it("never opens checkout when preparation fails", async () => {
    const p = purchase({ status: "failed", message: "Nothing has been charged." });
    const errors: string[] = [];
    await beginPurchaseWith(p.deps, "song_intelligence", SCAN, (m) => errors.push(m));
    expect(errors).toEqual(["Nothing has been charged."]);
    expect(p.calls).toEqual(["ensureIdentity", "POST /api/scan/prepare"]);
  });
});
