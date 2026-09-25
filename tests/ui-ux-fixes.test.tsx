/**
 * The 2026-09-21 UI/UX fixes, pinned.
 *
 * Each of these was a moment where a creator could reasonably wonder whether
 * the product was working, or which song a message was about.
 */

import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToString } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams("q=Landslide"),
}));

import { ScanProcessing } from "@/components/scan/ScanProcessing";
import { ScanInput } from "@/components/ScanInput";
import { PURCHASE_COPY, copyForSong } from "@/lib/email/purchase.server";

describe("the analysis wait", () => {
  it("names the song and artist from the first frame", () => {
    const html = renderToString(
      <ScanProcessing
        report={null}
        scanId="scn_isrc-uswb19903197_ik5we5"
        trackSlug="isrc-uswb19903197"
        pendingTitle="Landslide"
        pendingArtist="Fleetwood Mac"
      />,
    );
    expect(html).toContain("Analyzing Landslide by Fleetwood Mac");
  });

  it("still says something true when the song's name did not travel", () => {
    const html = renderToString(
      <ScanProcessing report={null} scanId="scn_x" trackSlug="x" />,
    );
    expect(html).toContain("Reading your song.");
  });

  it("runs on the dark brand ground, and its type follows", () => {
    const page = readFileSync("src/app/scan/[scanId]/processing/page.tsx", "utf8");
    expect(page).toContain('className="page-shell"');
    expect(page).not.toContain('className="product-shell"');
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toMatch(/\.page-shell \.rd-screen \{[\s\S]*?--on-light:\s*var\(--on-dark\)/);
  });

  it("keeps the in-flight preview dark and every settled state on the product shell", () => {
    const page = readFileSync("src/app/scan/[scanId]/preview/page.tsx", "utf8");
    // Working OR the preparing_included interstitial stays on the dark ground;
    // every other settled state uses the product shell.
    expect(page).toContain('"page-shell"');
    expect(page).toContain('"product-shell"');
    expect(page).toMatch(/state\.status === "working"/);
    expect(page).toMatch(/preparing_included/);
  });
});

describe("search feedback", () => {
  it("a handed-over query opens already searching, and says for what", () => {
    const html = renderToString(<ScanInput />);
    expect(html).toContain('role="status"');
    expect(html).toContain("Searching for");
    expect(html).toContain("Landslide");
    expect(html).toContain('aria-busy="true"');
  });
});

describe("the dashboard carries no demo controls", () => {
  it("has no reset-demo-state action in any environment", () => {
    const dash = readFileSync("src/components/dashboard/Dashboard.tsx", "utf8");
    expect(dash.toLowerCase()).not.toContain("reset demo state");
    expect(dash).not.toContain("clearAllUserData");
  });
});

describe("the Song Intelligence email names its song", () => {
  const base = PURCHASE_COPY.song_intelligence;

  it("puts the title and artist in the subject and the body", () => {
    const c = copyForSong(base, { title: "Landslide", artist: "Fleetwood Mac" });
    expect(c.subject).toBe("Your Song Intelligence — Landslide by Fleetwood Mac");
    expect(c.body).toContain("Landslide by Fleetwood Mac");
    expect(c.cta).toBe(base.cta);
    expect(c.heading).toBe(base.heading);
  });

  it("falls back to the specified copy when no title is on file", () => {
    expect(copyForSong(base, null)).toEqual(base);
    expect(copyForSong(base, { title: "  ", artist: "Someone" })).toEqual(base);
    expect(copyForSong(base, { title: null, artist: null })).toEqual(base);
  });

  it("works without an artist", () => {
    expect(copyForSong(base, { title: "Safe", artist: null }).subject).toBe(
      "Your Song Intelligence — Safe",
    );
  });

  it("treats the title as data: escaped in HTML, one line in the header", () => {
    const c = copyForSong(base, {
      title: 'Rock & <b>Roll</b>\r\nBcc: x@example.com',
      artist: "A\nB",
    });
    expect(c.subject).not.toMatch(/[\r\n]/);
    expect(c.body).toContain("Rock &amp; &lt;b&gt;Roll&lt;/b&gt;");
    expect(c.body).not.toContain("<b>");
  });
});
