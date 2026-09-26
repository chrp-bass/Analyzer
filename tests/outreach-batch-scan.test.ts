/**
 * The admin batch scan, as orchestration: identity is gated, a dry run spends
 * nothing, work already on file is reused through the REAL preparation's
 * fast path, and the finding is always a verbatim sentence the DM may quote.
 */

import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  runBatch,
  pickMatch,
  normalizeName,
  parseBody,
  toCsv,
  MAX_ITEMS,
  type BatchDeps,
  type BatchItemResult,
  type ExistingWork,
} from "@/lib/outreach/batch-scan";
import { selectFinding, isQuotable, splitSentences } from "@/lib/outreach/finding";
import { prepareReport, type PrepareDeps } from "@/lib/reports/prepare";
import { InMemoryReportStore, paidSections } from "./support/report-store";
import type { SongSearchResult } from "@/lib/engine/song-search";

const ENGINE = "chrp-epi-v2";
const GENERATOR = "chrp-rhodes-v2";

function song(over: Partial<SongSearchResult> = {}): SongSearchResult {
  return {
    isrc: "USAR12600001",
    spotifyTrackId: "abc",
    spotifyUrl: null,
    songName: "What Happiness Is",
    artistName: "Arum Rae",
    albumName: null,
    artworkUrl: null,
    releaseDate: null,
    durationMs: null,
    ...over,
  };
}

const REPORT = paidSections({
  signature:
    "Calm at the ceiling with Focus and Motivation near the floor — settledness dominates, the architecture doesn't push.",
  rhodes:
    "Calm sits at 99, the absolute ceiling, while Focus and Motivation both sit near 30. It settles rather than activates, and it doesn't ask for concentration or forward drive. The 46 current chart entries tell you the song has real market presence. This is a Recharge mode song built for the moment after something has already happened.",
  audience:
    "Someone who isn't trying to move, prepare, or focus — they're trying to settle, process, or release.",
  consider:
    "Lead with the settledness rather than the melancholy, and let the placement follow.",
  throughline: "A song built for stillness and emotional release — it doesn't activate.",
});

function fakeDeps(over: Partial<BatchDeps> = {}) {
  const calls = { search: 0, prepare: 0, readPrepared: 0, record: 0, sleep: 0 };
  const records: Array<BatchItemResult & { batch_id: string }> = [];
  const deps: BatchDeps = {
    search: async () => {
      calls.search += 1;
      return { ok: true, songs: [song()], provider: "spotify" };
    },
    findExisting: async () => null,
    newScanId: (isrc) => `scn_isrc-${isrc.toLowerCase()}_aaaaaa`,
    prepare: async () => {
      calls.prepare += 1;
      return {
        status: "ready",
        readiness: { scanId: "s", reportId: "r", reportVersion: GENERATOR, analysisId: "an_1" },
        reused: false,
        timings: [],
      };
    },
    readiness: async () => ({ status: "none" }),
    readPrepared: async () => {
      calls.readPrepared += 1;
      return {
        analysisId: "an_1",
        mode: "Recharge",
        epiScore: 43,
        scores: { focus: 31, calm: 99, motivation: 30, balance: 60.6 },
        reportPayload: REPORT,
      };
    },
    record: async (row) => {
      calls.record += 1;
      records.push(row);
    },
    engineVersion: ENGINE,
    generatorVersion: GENERATOR,
    sleep: async () => {
      calls.sleep += 1;
    },
    now: () => 0,
    ...over,
  };
  return { deps, calls, records };
}

const ITEM = { artist: "Arum Rae", title: "What Happiness Is", instagram: "@arumrae" };

describe("identity", () => {
  it("normalizes case, accents and a leading The", () => {
    expect(normalizeName("The Chicks")).toBe("chicks");
    expect(normalizeName("Beyoncé")).toBe("beyonce");
    expect(normalizeName("  ARUM   RAE ")).toBe("arum rae");
  });

  it("gates on the artist and prefers the exact title among that artist's results", () => {
    const live = song({ songName: "What Happiness Is - Live", isrc: "LIVE" });
    const exact = song();
    expect(pickMatch(ITEM, [live, exact])?.isrc).toBe("USAR12600001");
    expect(pickMatch(ITEM, [song({ artistName: "Someone Else" })])).toBeNull();
  });

  it("an artist mismatch is reported and never scored", async () => {
    const { deps, calls } = fakeDeps({
      search: async () => ({
        ok: true,
        songs: [song({ artistName: "Fleetwood Mac", songName: "What Happiness Is" })],
        provider: "spotify",
      }),
    });
    const run = await runBatch(deps, { batch_id: "b", dry_run: false, items: [ITEM] });
    expect(run.items[0].status).toBe("identity_mismatch");
    expect(run.items[0].resolved_artist).toBe("Fleetwood Mac");
    expect(run.items[0].finding).toBeNull();
    expect(calls.prepare).toBe(0);
    expect(calls.record).toBe(0);
  });

  it("no results is not_found, with no fallback to another song", async () => {
    const { deps, calls } = fakeDeps({
      search: async () => ({ ok: true, songs: [], provider: "spotify" }),
    });
    const run = await runBatch(deps, { batch_id: "b", dry_run: false, items: [ITEM] });
    expect(run.items[0].status).toBe("not_found");
    expect(run.items[0].finding).toBeNull();
    expect(calls.prepare).toBe(0);
  });
});

describe("a dry run", () => {
  it("resolves identity only and counts the lookups a real run would spend", async () => {
    const { deps, calls } = fakeDeps();
    const run = await runBatch(deps, {
      batch_id: "b",
      dry_run: true,
      items: [ITEM, { artist: "Arum Rae", title: "Other" }],
    });
    expect(run.items.map((i) => i.status)).toEqual(["resolved", "resolved"]);
    expect(run.soundcharts_lookups).toBe(2);
    expect(calls.prepare).toBe(0);
    expect(calls.readPrepared).toBe(0);
    expect(calls.record).toBe(0);
  });

  it("counts nothing for a song whose analysis and report are already current", async () => {
    const existing: ExistingWork = {
      scanId: "scn_isrc-usar12600001_old",
      analysisId: "an_old",
      analysisStatus: "complete",
      engineVersion: ENGINE,
      reportPayload: REPORT,
      generatorVersion: GENERATOR,
    };
    const { deps } = fakeDeps({ findExisting: async () => existing });
    const run = await runBatch(deps, { batch_id: "b", dry_run: true, items: [ITEM] });
    expect(run.soundcharts_lookups).toBe(0);
    expect(run.items[0].reused).toBe(true);
    expect(run.items[0].scan_id).toBe("scn_isrc-usar12600001_old");
  });

  it("a stale engine or report version is not reusable", async () => {
    const stale: ExistingWork = {
      scanId: "s",
      analysisId: "a",
      analysisStatus: "complete",
      engineVersion: "chrp-epi-v1",
      reportPayload: REPORT,
      generatorVersion: GENERATOR,
    };
    const { deps } = fakeDeps({ findExisting: async () => stale });
    const run = await runBatch(deps, { batch_id: "b", dry_run: true, items: [ITEM] });
    expect(run.soundcharts_lookups).toBe(1);
    expect(run.items[0].reused).toBe(false);
  });
});

describe("a real run", () => {
  it("scores through the preparation, quotes the report verbatim and records the row", async () => {
    const { deps, calls, records } = fakeDeps();
    const run = await runBatch(deps, { batch_id: "outreach-1", dry_run: false, items: [ITEM] });
    const item = run.items[0];
    expect(item.status).toBe("scored");
    expect(item).toMatchObject({
      mode: "Recharge",
      epi_score: 43,
      flow: 31,
      ready: 30,
      recharge: 99,
      recover: 61,
      instagram: "@arumrae",
      scan_id: "scn_isrc-usar12600001_aaaaaa",
      analysis_id: "an_1",
    });
    expect(item.finding).toBeTruthy();
    const field = item.finding_source!.replace("$.", "") as keyof typeof REPORT;
    expect(String(REPORT[field])).toContain(item.finding!);
    expect(calls.prepare).toBe(1);
    expect(records).toHaveLength(1);
    expect(records[0].batch_id).toBe("outreach-1");
  });

  it("pauses between items but not before the first", async () => {
    const { deps, calls } = fakeDeps();
    await runBatch(deps, { batch_id: "b", dry_run: false, items: [ITEM, ITEM, ITEM] });
    expect(calls.sleep).toBe(2);
  });

  it("defers everything after the search budget is spent, without searching again", async () => {
    let n = 0;
    const { deps, calls } = fakeDeps({
      search: async () => {
        n += 1;
        return n === 1 ? { ok: false, kind: "limited" } : { ok: true, songs: [song()], provider: "spotify" };
      },
    });
    const run = await runBatch(deps, { batch_id: "b", dry_run: false, items: [ITEM, ITEM, ITEM] });
    expect(run.items.map((i) => i.status)).toEqual(["deferred", "deferred", "deferred"]);
    expect(run.items.map((i) => i.reason)).toEqual(["search_budget", "search_budget", "search_budget"]);
    expect(n).toBe(1);
    expect(calls.prepare).toBe(0);
  });

  it("defers what the deadline leaves no time for", async () => {
    let t = 0;
    const { deps } = fakeDeps({
      now: () => t,
      sleep: async () => {
        t += 100_000;
      },
      deadlineMs: 150_000,
    });
    const run = await runBatch(deps, { batch_id: "b", dry_run: false, items: [ITEM, ITEM, ITEM] });
    expect(run.items.map((i) => i.status)).toEqual(["scored", "scored", "deferred"]);
    expect(run.items[2].reason).toBe("deadline");
  });

  it("a failed preparation is an error row with the preparation's reason, never a finding", async () => {
    const { deps, records } = fakeDeps({
      prepare: async () => ({
        status: "failed",
        reason: "audio_unavailable",
        message: "",
        timings: [],
      }),
    });
    const run = await runBatch(deps, { batch_id: "b", dry_run: false, items: [ITEM] });
    expect(run.items[0]).toMatchObject({ status: "error", reason: "audio_unavailable", finding: null });
    expect(records[0].status).toBe("error");
  });

  it("no quotable sentence is its own status, and the row is still recorded", async () => {
    const { deps, records } = fakeDeps({
      readPrepared: async () => ({
        analysisId: "an_1",
        mode: "Flow",
        epiScore: 60,
        scores: { focus: 80, calm: 50, motivation: 60, balance: 55 },
        reportPayload: paidSections({
          signature: "Focus at 80 with Calm at 50.",
          rhodes: "A commercial hit with 46 chart entries.",
          throughline: "Built for sync placements.",
        }),
      }),
    });
    const run = await runBatch(deps, { batch_id: "b", dry_run: false, items: [ITEM] });
    expect(run.items[0].status).toBe("no_quotable_finding");
    expect(run.items[0].finding).toBeNull();
    expect(records).toHaveLength(1);
  });
});

describe("idempotent reuse through the real preparation", () => {
  it("a second run of the same song makes zero analysis, enrichment or generation calls", async () => {
    const store = new InMemoryReportStore();
    const counters = { analysis: 0, enrich: 0, generate: 0 };
    const CREATOR = "outreach";
    const prepareDeps: PrepareDeps = {
      store,
      ensureAnalysis: async () => {
        counters.analysis += 1;
        return { ok: true, analysisId: "an_1", songId: "song_1" };
      },
      enrich: async () => {
        counters.enrich += 1;
        return {
          facts: { title: "What Happiness Is", artist: "Arum Rae", mode: "Recharge", epiScore: 43 },
          song: {},
        };
      },
      christianContext: () => null,
      generate: async () => {
        counters.generate += 1;
        return { ok: true, sections: REPORT, violations: [], attempts: 1 };
      },
      generatorVersion: GENERATOR,
      model: "claude-sonnet-4-5",
      sink: () => {},
      inFlight: new Map(),
    };
    // What the server wiring's findExisting would see: this store's rows.
    const analyses = new Map<string, string>(); // isrc → scanId
    const { deps } = fakeDeps({
      prepare: (scanId) => prepareReport(prepareDeps, CREATOR, scanId),
      findExisting: async (isrc) => {
        const scanId = analyses.get(isrc);
        if (!scanId) return null;
        const report = await store.getReport(CREATOR, scanId);
        return {
          scanId,
          analysisId: "an_1",
          analysisStatus: "complete",
          engineVersion: ENGINE,
          reportPayload: report?.payload ?? null,
          generatorVersion: report?.generatorVersion ?? null,
        };
      },
      newScanId: (isrc) => {
        const id = `scn_isrc-${isrc.toLowerCase()}_fresh1`;
        analyses.set(isrc, id);
        return id;
      },
      readPrepared: async (scanId) => ({
        analysisId: "an_1",
        mode: "Recharge",
        epiScore: 43,
        scores: { focus: 31, calm: 99, motivation: 30, balance: 61 },
        reportPayload: (await store.getReport(CREATOR, scanId))!.payload,
      }),
    });

    const first = await runBatch(deps, { batch_id: "b1", dry_run: false, items: [ITEM] });
    expect(first.items[0].status).toBe("scored");
    expect(first.items[0].reused).toBe(false);
    expect(counters).toEqual({ analysis: 1, enrich: 1, generate: 1 });

    const second = await runBatch(deps, { batch_id: "b2", dry_run: false, items: [ITEM] });
    expect(second.items[0].status).toBe("scored");
    expect(second.items[0].reused).toBe(true);
    expect(second.items[0].scan_id).toBe(first.items[0].scan_id);
    expect(second.items[0].finding).toBe(first.items[0].finding);
    expect(counters).toEqual({ analysis: 1, enrich: 1, generate: 1 });
    expect(second.soundcharts_lookups).toBe(0);
  });
});

describe("the finding", () => {
  const BANNED = /\b(placement|sync-ready|hit|viral|commercial|guaranteed|market)\b/i;

  it("is a verbatim sentence from a quotable field, with alternatives", () => {
    const sel = selectFinding(REPORT);
    expect(sel.finding).not.toBeNull();
    const all = [sel.finding!, ...sel.candidates];
    expect(sel.candidates.length).toBeLessThanOrEqual(3);
    for (const c of all) {
      const field = c.source.replace("$.", "") as keyof typeof REPORT;
      expect(String(REPORT[field])).toContain(c.text);
      expect(c.text).not.toMatch(/\d/);
      expect(c.text).not.toMatch(BANNED);
    }
    // The distinct sentences, not the same one three times.
    expect(new Set(all.map((c) => c.text)).size).toBe(all.length);
  });

  it("prefers the sentence that names the mode over the methodology", () => {
    const sel = selectFinding(REPORT);
    expect(sel.finding!.text).toMatch(/Recharge mode|settledness dominates/);
  });

  it("never quotes placements, buyers or pitch language", () => {
    const sel = selectFinding(
      paidSections({
        signature: "Focus at 80.",
        rhodes: "A 46-entry run.",
        throughline: "Built for 3am.",
        placements: [{ title: "Film", body: "The scene after the confrontation, when the story needs to breathe." }],
      }),
    );
    expect(sel.finding).toBeNull();
    expect(sel.candidates).toEqual([]);
  });

  it("rejects numbers, percentages, prices, fragments and banned claims", () => {
    expect(isQuotable("Calm sits at 99 while Focus sits near 30, a wide gap between them.")).toBe(false);
    expect(isQuotable("Roughly half the profile is settledness, and half of it is drive.")).toBe(true);
    expect(isQuotable("Nearly 40% of the architecture is settledness rather than drive here.")).toBe(false);
    expect(isQuotable("This is a commercial song built for the moment after the event happens.")).toBe(false);
    expect(isQuotable("It settles rather than activates and it doesn't ask for drive")).toBe(false);
    expect(isQuotable("Short.")).toBe(false);
  });

  it("splits prose on sentence boundaries only", () => {
    expect(splitSentences("One thing. Another thing! A third? Dr. Rhodes says so.")).toEqual([
      "One thing.",
      "Another thing!",
      "A third?",
      "Dr. Rhodes says so.",
    ]);
  });

  it("handles a payload that is not a report", () => {
    expect(selectFinding(null)).toEqual({ finding: null, candidates: [] });
    expect(selectFinding("x")).toEqual({ finding: null, candidates: [] });
  });
});

describe("the request body", () => {
  it("accepts the documented shape and normalizes the ISRC", () => {
    const parsed = parseBody({
      batch_id: "outreach-2026-09-26",
      dry_run: true,
      items: [{ artist: " Arum Rae ", title: "What Happiness Is", isrc: "us-ar1 2600001", instagram: "@arumrae" }],
    });
    expect(parsed).toMatchObject({
      ok: true,
      dry_run: true,
      items: [{ artist: "Arum Rae", isrc: "USAR12600001", instagram: "@arumrae" }],
    });
  });

  it("refuses more than the item cap, missing fields and bad ISRCs", () => {
    const many = Array.from({ length: MAX_ITEMS + 1 }, () => ({ artist: "a", title: "b" }));
    expect(parseBody({ batch_id: "b", items: many })).toMatchObject({ ok: false });
    expect(parseBody({ batch_id: "b", items: [{ artist: "a" }] })).toMatchObject({ ok: false });
    expect(parseBody({ batch_id: "b", items: [{ artist: "a", title: "b", isrc: "!!" }] })).toMatchObject({ ok: false });
    expect(parseBody({ items: [{ artist: "a", title: "b" }] })).toMatchObject({ ok: false });
    expect(parseBody(null)).toMatchObject({ ok: false });
  });
});

describe("csv", () => {
  it("has a header row, quotes commas and inner quotes, and defuses formulas", async () => {
    const { deps } = fakeDeps({
      search: async () => ({ ok: true, songs: [song({ songName: '=SUM(A1), "quoted"' })], provider: "spotify" }),
    });
    const run = await runBatch(deps, { batch_id: "b", dry_run: true, items: [ITEM] });
    const csv = toCsv(run.items);
    const [header, row] = csv.split("\r\n");
    expect(header.startsWith("artist,title,instagram,status")).toBe(true);
    expect(row).toContain("\"'=SUM(A1), \"\"quoted\"\"\"");
  });
});

describe("boundaries", () => {
  it("the batch never touches Rhodes Voice, Stripe, or the public scan routes", () => {
    for (const file of [
      "src/lib/outreach/batch-scan.ts",
      "src/lib/outreach/batch-scan.server.ts",
      "src/app/api/admin/batch-scan/route.ts",
    ]) {
      const src = readFileSync(file, "utf8");
      expect(src).not.toMatch(/elevenlabs|rhodes-voice|RhodesVoice|stripe|@\/lib\/accounts/i);
    }
  });

  it("the finding module builds no prompt: it imports nothing and calls no model", () => {
    const src = readFileSync("src/lib/outreach/finding.ts", "utf8");
    expect(src).not.toMatch(/^import /m);
    expect(src).not.toMatch(/anthropic|fetch\(/i);
  });
});

// vi is imported so a future mock in this file is one line away.
void vi;
