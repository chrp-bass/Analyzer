/**
 * What the preview actually paints for each read-path state.
 *
 * Rendered with react-dom/server so the assertions are about real markup:
 * a persisted report renders as the report with no "Building…"/"Preparing…"
 * copy anywhere in the document; the in-flight read and the post-payment
 * confirmation are labelled as what they are; and the unpaid reveal
 * contains no paid prose.
 */

import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { paidSections } from "./support/report-store";
import type { FreeReport, ReportPayload } from "@/lib/fixtures/tracks";
import type { ReadState } from "@/lib/scan/read-path";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/identity", () => ({
  ensureIdentity: vi.fn(),
  linkEmail: vi.fn(),
}));
vi.mock("@elevenlabs/client", () => ({ Conversation: { startSession: vi.fn() } }));

import { ScanPreview, ReportPreparing } from "@/components/scan/ScanPreview";

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

const BUILDING = /Building your Song Intelligence|Preparing your|Composing the CHRP reading|Placing it in context/;

function paint(state: ReadState, paidReturn = false): string {
  return renderToString(
    <ScanPreview scanId={SCAN} state={state} paidReturn={paidReturn} onRetry={() => {}} />,
  );
}

describe("a persisted report", () => {
  const state: ReadState = {
    status: "settled",
    outcome: { kind: "persisted", report: persisted(), includedFirst: false },
  };

  it("renders as the report, with no building or preparing copy anywhere", () => {
    const html = paint(state);
    expect(html).toContain(paidSections().rhodes);
    expect(html).toContain(paidSections().signature);
    expect(html).not.toMatch(BUILDING);
  });

  it("renders identically on the immediate paid return", () => {
    expect(paint(state, true)).toBe(paint(state, false));
  });
});

describe("the read in flight", () => {
  it("is quiet on a direct revisit: no building or preparing copy", () => {
    const html = paint({ status: "working", phase: "opening", free: null });
    expect(html).toContain("Opening your song");
    expect(html).not.toMatch(BUILDING);
    expect(html).not.toContain(paidSections().rhodes);
  });

  it("acknowledges the payment and names confirmation, not building, on the paid return", () => {
    const opening = paint({ status: "working", phase: "opening", free: null }, true);
    expect(opening).toContain("Payment received");
    expect(opening).not.toMatch(BUILDING);

    const confirming = paint(
      { status: "working", phase: "confirming_access", free: null },
      true,
    );
    expect(confirming).toContain("Payment received");
    expect(confirming).toContain("Confirming your access");
    expect(confirming).not.toMatch(BUILDING);
  });

  it("the building copy still exists — only for the unpaid preparation phase", () => {
    // The assertions above are only meaningful if the copy they exclude is
    // real. It is, and it is reached solely from the unpaid flow.
    expect(renderToString(<ReportPreparing report={free()} />)).toMatch(BUILDING);
    const html = paint({ status: "working", phase: "preparing_included", free: free() });
    expect(html).toMatch(BUILDING);
    expect(html).not.toContain(paidSections().rhodes);
  });
});

describe("the unpaid reveal (403)", () => {
  it("shows the free reveal and the checkout boundary, and no paid prose", () => {
    const html = paint({
      status: "settled",
      outcome: { kind: "reveal", free: free() },
    });
    expect(html).toContain(free().free_statement);
    expect(html).toContain("Unlock this song");
    for (const value of [
      paidSections().rhodes,
      paidSections().signature,
      paidSections().throughline,
    ]) {
      expect(html).not.toContain(value);
    }
  });
});

describe("an entitled caller without a complete report (503)", () => {
  it("shows the quiet unavailable state with a retry, and no report content", () => {
    const html = paint({
      status: "settled",
      outcome: { kind: "unavailable", detail: "your report is being prepared" },
    });
    expect(html).toContain("Your purchase is safe");
    expect(html).toContain("Try again");
    expect(html).not.toContain(paidSections().rhodes);
    expect(html).not.toContain("Unlock this song");
  });
});
