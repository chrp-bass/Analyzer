import { describe, expect, it } from "vitest";
import { hasCompletePaidReport } from "@/lib/song-where/report-eligibility.server";

const complete = {
  signature: "signature",
  rhodes: "reading",
  throughline: "pitch",
  placements: [{ title: "placement", body: "details" }],
};

describe("Song Where paid report eligibility", () => {
  it("accepts the array relation returned by production", () => {
    expect(hasCompletePaidReport([{ payload: complete }])).toBe(true);
  });

  it("keeps compatibility with a singular relation", () => {
    expect(hasCompletePaidReport({ payload: complete })).toBe(true);
  });

  it("fails closed for missing, empty, and incomplete reports", () => {
    expect(hasCompletePaidReport(null)).toBe(false);
    expect(hasCompletePaidReport([])).toBe(false);
    expect(hasCompletePaidReport([{ payload: { status: "processing" } }])).toBe(false);
  });
});
