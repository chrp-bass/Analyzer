/**
 * The outreach queue worker, as orchestration. Every row goes through the
 * REAL `runBatch` (the admin batch scan's path) with fake upstreams, so what
 * is tested is how batch outcomes become queue states.
 */

import { describe, expect, it } from "vitest";
import { runBatch, type BatchDeps } from "@/lib/outreach/batch-scan";
import {
  runQueue,
  MAX_ATTEMPTS,
  type QueueDeps,
  type QueueOutcome,
  type QueueRow,
} from "@/lib/outreach/queue";
import { paidSections } from "./support/report-store";
import type { SearchOutcome, SongSearchResult } from "@/lib/engine/song-search";

const REPORT = paidSections({
  rhodes: "It settles rather than activates, and it doesn't ask for concentration or forward drive.",
});

function song(over: Partial<SongSearchResult> = {}): SongSearchResult {
  return {
    isrc: "USAR12600001", spotifyTrackId: "abc", spotifyUrl: null, songName: "What Happiness Is",
    artistName: "Arum Rae", albumName: null, artworkUrl: null, releaseDate: null, durationMs: null, ...over,
  };
}

function row(over: Partial<QueueRow> = {}): QueueRow {
  return {
    id: `q${Math.random()}`, batch_id: "outreach-test", artist: "Arum Rae", track: "What Happiness Is",
    instagram: "@arumrae", segment: "indie", attempts: 1, ...over,
  };
}

interface Harness {
  deps: QueueDeps;
  finished: Array<{ row: QueueRow; outcome: QueueOutcome }>;
  released: QueueRow[];
  recorded: Array<{ segment: string | null; status: string }>;
  logs: string[];
  clock: { t: number };
}

function harness(
  rows: QueueRow[],
  opts: {
    search?: (query: string) => Promise<SearchOutcome>;
    prepareFails?: boolean;
    /** ms each scan advances the clock */
    scanMs?: number;
  } = {},
): Harness {
  const h: Harness = { finished: [], released: [], recorded: [], logs: [], clock: { t: 0 }, deps: null as never };
  const batchDeps = (row: QueueRow, setId: (id: string) => void): BatchDeps => ({
    search: opts.search ?? (async () => ({ ok: true, songs: [song()], provider: "spotify" })),
    findExisting: async () => null,
    newScanId: (isrc) => `scn_isrc-${isrc.toLowerCase()}_aaaaaa`,
    prepare: async () =>
      opts.prepareFails
        ? { status: "failed", reason: "generation_failed", message: "", detail: "x", timings: [] }
        : { status: "ready", readiness: { scanId: "s", reportId: "r", reportVersion: "g", analysisId: "an_1" }, reused: false, timings: [] },
    readiness: async () => ({ status: "none" }),
    readPrepared: async () => ({
      analysisId: "an_1", mode: "Recharge", epiScore: 43,
      scores: { focus: 31, calm: 99, motivation: 30, balance: 61 }, reportPayload: REPORT,
    }),
    record: async (r) => {
      h.recorded.push({ segment: row.segment, status: r.status });
      if (r.status === "scored" || r.status === "no_quotable_finding") setId(`item-${row.id}`);
    },
    engineVersion: "e",
    generatorVersion: "g",
    sleep: async () => undefined,
    now: () => h.clock.t,
  });
  h.deps = {
    lease: async () => rows,
    async scan(r, deadlineMs) {
      let itemId: string | null = null;
      const run = await runBatch(
        { ...batchDeps(r, (id) => (itemId = id)), deadlineMs },
        { batch_id: r.batch_id, dry_run: false, items: [{ artist: r.artist, title: r.track, instagram: r.instagram }] },
      );
      h.clock.t += opts.scanMs ?? 0;
      return { run, itemId };
    },
    finish: async (r, outcome) => {
      h.finished.push({ row: r, outcome });
    },
    release: async (r) => {
      h.released.push(r);
    },
    now: () => h.clock.t,
    sleep: async () => undefined,
    log: (line) => h.logs.push(line),
  };
  return h;
}

describe("the queue worker", () => {
  it("scores a row through the batch path and links the recorded item, carrying the segment", async () => {
    const r = row();
    const h = harness([r]);
    const summary = await runQueue(h.deps);
    expect(h.finished).toEqual([{ row: r, outcome: { status: "done", outreach_item_id: `item-${r.id}`, error: null } }]);
    expect(h.recorded).toEqual([{ segment: "indie", status: "scored" }]);
    expect(summary).toMatchObject({ claimed: 1, done: 1, soundcharts_lookups: 1 });
    expect(h.logs).toHaveLength(1);
    expect(h.logs[0]).toMatch(/claimed=1 done=1 skipped=0 failed=0 .*soundcharts_lookups=1/);
  });

  it("an identity mismatch is skipped with the reason, and nothing is scored or recorded", async () => {
    const h = harness([row()], {
      search: async () => ({ ok: true, songs: [song({ artistName: "Fleetwood Mac" })], provider: "spotify" }),
    });
    const summary = await runQueue(h.deps);
    expect(h.finished[0].outcome.status).toBe("skipped");
    expect((h.finished[0].outcome as { error: string }).error).toMatch(/^identity_mismatch: .*Fleetwood Mac/);
    expect(h.recorded).toHaveLength(0);
    expect(summary.skipped).toBe(1);
  });

  it("no catalog match is skipped", async () => {
    const h = harness([row()], { search: async () => ({ ok: true, songs: [], provider: "spotify" }) });
    await runQueue(h.deps);
    expect(h.finished[0].outcome).toEqual({ status: "skipped", error: "not_found: no catalog match" });
  });

  it("an error goes back to pending until the third attempt, then fails with the error", async () => {
    for (const attempts of [1, 2]) {
      const h = harness([row({ attempts })], { prepareFails: true });
      await runQueue(h.deps);
      expect(h.finished[0].outcome).toEqual({ status: "pending", error: "generation_failed" });
    }
    const h = harness([row({ attempts: MAX_ATTEMPTS })], { prepareFails: true });
    const summary = await runQueue(h.deps);
    expect(h.finished[0].outcome).toEqual({ status: "failed", error: "generation_failed" });
    expect(summary.failed).toBe(1);
  });

  it("a thrown error is retried the same way", async () => {
    const h = harness([row({ attempts: 3 })]);
    h.deps.scan = async () => {
      throw new Error("connection reset");
    };
    await runQueue(h.deps);
    expect(h.finished[0].outcome).toEqual({ status: "failed", error: "connection reset" });
  });

  it("an exhausted search budget leaves that row and every later row pending, without spending an attempt", async () => {
    const rows = [row(), row(), row()];
    let calls = 0;
    const h = harness(rows, {
      search: async () => {
        calls += 1;
        return calls === 1
          ? { ok: true, songs: [song()], provider: "spotify" }
          : ({ ok: false, kind: "limited" } as SearchOutcome);
      },
    });
    const summary = await runQueue(h.deps);
    expect(h.finished.map((f) => f.outcome.status)).toEqual(["done"]);
    expect(h.released).toEqual([rows[1], rows[2]]);
    expect(calls).toBe(2);
    expect(summary).toMatchObject({ done: 1, released: 2, budget_exhausted: true });
    expect(h.logs[0]).toContain("budget_exhausted=true");
  });

  it("stops starting rows after 240 seconds and hands the rest back", async () => {
    const rows = [row(), row(), row()];
    const h = harness(rows, { scanMs: 150_000 });
    const summary = await runQueue(h.deps);
    expect(h.finished).toHaveLength(2);
    expect(h.released).toEqual([rows[2]]);
    expect(summary).toMatchObject({ claimed: 3, done: 2, released: 1 });
  });
});
